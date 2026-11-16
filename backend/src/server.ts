import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { SiweMessage } from "siwe";
import { z } from "zod";
import { verifyVideoFile, videoDirectory, type ModelVerdict } from "./ai/verifyVideo.ts";
import { NonceStore } from "./auth/nonce.ts";
import { RewardLedger } from "./rewards/ledger.ts";
import { DEVELOPMENT_POLICY, ACTIONS, pointsFor, rewardWei, type RewardPolicy } from "./rewards/policy.ts";
import { MemoryStore, type Submission } from "./submissions/memoryStore.ts";
import { reviewBlockers } from "./submissions/review.ts";

type Session = { address: string; expiresAt: number };
type Audit = { id: string; actor: string; action: string; target: string; reason: string | null; at: string };

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const videoBody = z.object({
  contentType: z.enum(["video/mp4", "video/webm"]),
  byteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const submissionBody = z.object({
  action: z.enum(ACTIONS),
  description: z.string().trim().min(1).max(2000),
});

export async function buildServer(options?: {
  store?: MemoryStore;
  nonces?: NonceStore;
  policy?: RewardPolicy;
  verifier?: (input: { filePath: string; action: string; priors: string[] }) => Promise<ModelVerdict>;
}) {
  const store = options?.store ?? new MemoryStore();
  const nonces = options?.nonces ?? new NonceStore();
  const policy = options?.policy ?? DEVELOPMENT_POLICY;
  const sessions = new Map<string, Session>();
  const audits: Audit[] = [];
  const rewards = new RewardLedger();
  const secret = process.env.SESSION_SECRET || "dev-only-change-me";
  if (process.env.NODE_ENV === "production" && secret === "dev-only-change-me") {
    throw new Error("SESSION_SECRET is required in production");
  }

  const app = Fastify({ logger: false, bodyLimit: MAX_VIDEO_BYTES });
  app.addContentTypeParser(/^video\/(mp4|webm)$/i, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    return reply.code(500).send({ error: "internal_error" });
  });
  await app.register(cookie, { secret });
  await app.register(cors, { origin: process.env.APP_ORIGIN || true, credentials: true });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  function session(request: FastifyRequest): Session | null {
    const raw = request.cookies.eco_session;
    if (!raw) return null;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return null;
    const found = sessions.get(unsigned.value);
    if (!found || found.expiresAt <= Date.now()) return null;
    return found;
  }

  function requireUser(request: FastifyRequest, reply: FastifyReply): Session | null {
    const found = session(request);
    if (!found) {
      reply.code(401).send({ error: "unauthorized" });
      return null;
    }
    return found;
  }

  app.get("/api/v1/health", async () => ({
    ok: true,
    store: "memory",
    persistence: false,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    aiConfigured: Boolean(process.env.AI_SERVICE_URL),
    storageConfigured: Boolean(process.env.S3_BUCKET),
    queueConfigured: false,
    conversionConfirmed: policy.conversionConfirmed,
    chainId: 11155111,
  }));

  app.get("/api/v1/actions", async () => ({
    version: policy.version,
    conversionConfirmed: policy.conversionConfirmed,
    actions: ACTIONS.map((code) => ({ code, points: pointsFor(policy, code) })),
  }));

  app.post("/api/v1/auth/nonce", async (request, reply) => {
    const body = z.object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(request.body);
    const issued = nonces.issue(body.address);
    return reply.send({ nonce: issued.nonce, expiresAt: new Date(issued.expiresAt).toISOString() });
  });

  app.post("/api/v1/auth/verify", async (request, reply) => {
    const body = z.object({ message: z.string().min(1), signature: z.string().min(1) }).parse(request.body);
    const message = new SiweMessage(body.message);
    if (process.env.APP_DOMAIN && message.domain !== process.env.APP_DOMAIN) {
      return reply.code(401).send({ error: "domain_mismatch" });
    }
    if (Number(message.chainId) !== 11155111) {
      return reply.code(401).send({ error: "wrong_chain" });
    }
    if (!nonces.consume(message.address, message.nonce)) {
      return reply.code(401).send({ error: "nonce_rejected" });
    }
    try {
      await message.verify({ signature: body.signature, nonce: message.nonce });
    } catch {
      return reply.code(401).send({ error: "signature_rejected" });
    }
    const id = randomUUID();
    sessions.set(id, { address: message.address.toLowerCase(), expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    reply.setCookie("eco_session", id, { signed: true, httpOnly: true, sameSite: "strict", path: "/" });
    return { address: message.address.toLowerCase() };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const raw = request.cookies.eco_session;
    if (raw) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) sessions.delete(unsigned.value);
    }
    reply.clearCookie("eco_session", { path: "/" });
    return { ok: true };
  });

  app.get("/api/v1/auth/me", async (request) => {
    const found = session(request);
    return { address: found?.address ?? null };
  });

  app.post("/api/v1/submissions", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 8) {
      return reply.code(400).send({ error: "idempotency_key_required" });
    }
    const body = submissionBody.parse(request.body);
    const created = store.create({ ...body, wallet: user.address, idempotencyKey: key });
    return reply.code(201).send(created);
  });

  app.get("/api/v1/submissions", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return store.list(user.address);
  });

  app.get("/api/v1/submissions/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const found = owned(store, id, user.address);
    if (!found) return reply.code(404).send({ error: "not_found" });
    return found;
  });

  app.post("/api/v1/submissions/:id/video-upload", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const found = owned(store, (request.params as { id: string }).id, user.address);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const contentType = String(request.headers["content-type"] || "");
    if (contentType.startsWith("video/")) {
      const bytes = request.body as Buffer;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) return reply.code(400).send({ error: "empty_video" });
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      mkdirSync(videoDirectory, { recursive: true });
      const extension = contentType.includes("webm") ? "webm" : "mp4";
      const stored = path.join(videoDirectory, found.id + "." + extension);
      writeFileSync(stored, bytes);
      store.videoFiles.set(found.id, stored);
      found.video = { contentType: contentType.split(";")[0], size: bytes.length, sha256, complete: true };
      if (found.status === "draft") found.status = "uploaded";
      return { storage: "local_file", bytesStored: true, signedUrl: null, submission: found };
    }
    const body = videoBody.parse(request.body);
    found.video = { contentType: body.contentType, size: body.byteSize, sha256: body.sha256, complete: true };
    if (found.status === "draft") found.status = "uploaded";
    return {
      storage: "metadata_only",
      bytesStored: false,
      signedUrl: null,
      submission: found,
    };
  });

  app.post("/api/v1/submissions/:id/complete", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const found = owned(store, (request.params as { id: string }).id, user.address);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!found.video?.complete) return reply.code(409).send({ error: "video_missing" });
    return found;
  });

  app.post("/api/v1/ai/verify/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const found = owned(store, (request.params as { id: string }).id, user.address);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!found.video?.complete) return reply.code(409).send({ error: "video_missing" });
    if (store.hasExactSha256Duplicate(found)) {
      return reply.send(applyVerdict(store, found, {
        decision: "rejected",
        reason: "exact_duplicate",
        predictedAction: null,
        modelsConfigured: false,
        exactDuplicate: true,
        nearDuplicate: false,
        perceptual: "not_configured",
        observedLabels: [],
        frameHashes: [],
        model: null,
      }));
    }
    const filePath = store.videoFiles.get(found.id);
    if (!filePath) {
      return reply.send(applyVerdict(store, found, {
        decision: "rejected",
        reason: "video_bytes_missing",
        predictedAction: null,
        modelsConfigured: false,
        exactDuplicate: false,
        nearDuplicate: false,
        perceptual: "not_configured",
        observedLabels: [],
        frameHashes: [],
        model: null,
      }));
    }
    const priors = [...store.frameHashes.entries()].filter(([id]) => id !== found.id).flatMap(([, hashes]) => hashes);
    let verdict: ModelVerdict;
    try {
      verdict = await (options?.verifier ?? ((input) => verifyVideoFile(input.filePath, input.action, input.priors)))({
        filePath,
        action: found.action,
        priors,
      });
    } catch {
      verdict = {
        decision: "rejected",
        reason: "model_failed",
        predictedAction: null,
        modelsConfigured: false,
        exactDuplicate: false,
        nearDuplicate: false,
        perceptual: "average_hash",
        observedLabels: [],
        frameHashes: [],
        model: null,
      };
    }
    if (verdict.decision !== "approved") verdict.decision = "rejected";
    return reply.send(applyVerdict(store, found, verdict));
  });

  app.get("/api/v1/ai/results/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const found = owned(store, (request.params as { id: string }).id, user.address);
    if (!found) return reply.code(404).send({ error: "not_found" });
    return {
      submissionId: found.id,
      decision: found.verification?.decision ?? found.status,
      reason: found.verification?.reason ?? null,
      fraudRisk: found.verification?.exactDuplicate ? "high" : "unknown",
      modelsConfigured: false,
    };
  });

  app.post("/api/v1/ai/retry/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    return reply.code(503).send({ error: "queue_not_configured" });
  });

  app.get("/api/v1/rewards/balance", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const mine = rewards.listFor(user.address);
    const confirmedEcoWei = mine.reduce((sum, row) => sum + BigInt(row.wei), 0n).toString();
    return { points: mine.reduce((sum, row) => sum + row.points, 0), confirmedEcoWei: mine.length ? confirmedEcoWei : null, conversionConfirmed: policy.conversionConfirmed };
  });

  app.get("/api/v1/rewards/pending", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return rewards.listFor(user.address);
  });

  app.get("/api/v1/rewards/history", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return rewards.listFor(user.address);
  });

  app.post("/api/v1/rewards/claim/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const found = owned(store, (request.params as { id: string }).id, user.address);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (found.status !== "approved") return reply.code(409).send({ error: "not_approved" });
    const reward = rewardWei(policy, found.action);
    if (!reward.ok) return reply.code(409).send({ error: reward.reason });
    const authorized = rewards.authorize({
      id: randomUUID(),
      submissionId: found.id,
      wallet: user.address,
      points: pointsFor(policy, found.action),
      wei: reward.wei,
      policyVersion: policy.version,
      status: "ready_for_attestation",
      signature: null,
    });
    return reply.code(authorized.created ? 201 : 200).send(authorized.record);
  });

  app.get("/api/v1/rewards/transaction/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const record = rewards.getById((request.params as { id: string }).id);
    if (!record || record.wallet !== user.address) return reply.code(404).send({ error: "not_found" });
    return record;
  });

  app.get("/api/v1/giveaways", async () => ({ configured: false, items: [], note: "No giveaway contract is configured, and CS2 skins are not delivered on-chain." }));
  app.get("/api/v1/giveaways/:id", async (_request, reply) => reply.code(404).send({ error: "not_configured" }));
  app.post("/api/v1/giveaways/:id/entries", async (_request, reply) => reply.code(503).send({ error: "not_configured" }));
  app.get("/api/v1/giveaways/:id/entries", async (_request, reply) => reply.code(404).send({ error: "not_configured" }));
  app.get("/api/v1/giveaways/:id/results", async (_request, reply) => reply.code(404).send({ error: "not_configured" }));

  app.post("/api/v1/admin/reviews/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const admins = (process.env.ADMIN_ADDRESSES || "").toLowerCase().split(",").filter(Boolean);
    if (!admins.includes(user.address)) return reply.code(403).send({ error: "forbidden" });
    const body = z.object({ decision: z.enum(["approved", "rejected"]), reason: z.string().max(1000).optional() }).parse(request.body);
    const found = store.get((request.params as { id: string }).id);
    if (!found) return reply.code(404).send({ error: "not_found" });
    const blockers = reviewBlockers(found, body.decision);
    if (blockers.length > 0) return reply.code(409).send({ error: "review_not_eligible", blockers });
    const at = new Date().toISOString();
    const review = { reviewer: user.address, decision: body.decision, reason: body.reason ?? null, at };
    found.reviews.push(review);
    found.status = body.decision;
    audits.push({ id: randomUUID(), actor: review.reviewer, action: review.decision, target: found.id, reason: review.reason, at });
    return { submission: found, review };
  });

  app.get("/api/v1/admin/audit", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const admins = (process.env.ADMIN_ADDRESSES || "").toLowerCase().split(",").filter(Boolean);
    if (!admins.includes(user.address)) return reply.code(403).send({ error: "forbidden" });
    return audits;
  });

  return app;
}

function applyVerdict(store: MemoryStore, found: Submission, verdict: ModelVerdict) {
  const at = new Date().toISOString();
  found.verification = {
    completed: true,
    decision: verdict.decision,
    reason: verdict.reason,
    exactDuplicate: verdict.exactDuplicate,
    nearDuplicate: verdict.nearDuplicate,
    perceptual: verdict.perceptual,
    modelsConfigured: verdict.modelsConfigured,
    predictedAction: verdict.predictedAction,
    at,
  };
  found.status = verdict.decision;
  if (verdict.frameHashes.length > 0) store.frameHashes.set(found.id, verdict.frameHashes);
  return {
    submissionId: found.id,
    predictedAction: verdict.predictedAction,
    models: { action: { status: verdict.modelsConfigured ? "configured" : "not_configured", model: verdict.model } },
    duplicateDetection: {
      sha256: { exact: verdict.exactDuplicate, scope: "identical_bytes_only" },
      perceptual: { status: verdict.perceptual },
    },
    observedLabels: verdict.observedLabels,
    fraudRisk: verdict.exactDuplicate || verdict.nearDuplicate ? "high" : "unknown",
    decision: verdict.decision,
    reason: verdict.reason,
  };
}

function owned(store: MemoryStore, id: string, wallet: string): Submission | undefined {
  const found = store.get(id);
  if (!found || found.wallet !== wallet) return undefined;
  return found;
}

if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  const app = await buildServer();
  const port = Number(process.env.PORT || 4000);
  await app.listen({ port, host: "0.0.0.0" });
}
