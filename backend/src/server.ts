import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { SiweMessage } from "siwe";
import { z } from "zod";
import { NonceStore } from "./auth/nonce.ts";
import { DEVELOPMENT_POLICY, ACTIONS, pointsFor, rewardWei, type RewardPolicy } from "./rewards/policy.ts";
import { MemoryStore, type Submission } from "./submissions/memoryStore.ts";

type Session = { address: string; expiresAt: number };
type Audit = { id: string; actor: string; action: string; target: string; at: string };

const submissionBody = z.object({
  action: z.enum(ACTIONS),
  description: z.string().trim().min(1).max(2000),
});

export async function buildServer(options?: { store?: MemoryStore; nonces?: NonceStore; policy?: RewardPolicy }) {
  const store = options?.store ?? new MemoryStore();
  const nonces = options?.nonces ?? new NonceStore();
  const policy = options?.policy ?? DEVELOPMENT_POLICY;
  const sessions = new Map<string, Session>();
  const audits: Audit[] = [];
  const rewards = new Map<string, { id: string; submissionId: string; wallet: string; points: number; wei: string | null; status: string }>();
  const secret = process.env.SESSION_SECRET || "dev-only-change-me";
  if (process.env.NODE_ENV === "production" && secret === "dev-only-change-me") {
    throw new Error("SESSION_SECRET is required in production");
  }

  const app = Fastify({ logger: false });
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
    if (!process.env.S3_BUCKET) {
      return reply.code(503).send({ error: "storage_not_configured" });
    }
    return reply.code(501).send({ error: "signed_upload_not_configured" });
  });

  app.post("/api/v1/submissions/:id/complete", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const found = owned(store, (request.params as { id: string }).id, user.address);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (!found.video) return reply.code(409).send({ error: "video_missing" });
    found.status = "pending_review";
    return found;
  });

  app.post("/api/v1/ai/verify/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const found = owned(store, (request.params as { id: string }).id, user.address);
    if (!found) return reply.code(404).send({ error: "not_found" });
    found.status = "pending_review";
    return {
      submissionId: found.id,
      predictedAction: null,
      models: { action: { status: "not_configured" } },
      duplicateDetection: { status: process.env.AI_SERVICE_URL ? "deferred_to_ai_service" : "not_run" },
      fraudRisk: "unknown",
      decision: "pending_review",
      reason: "ai_not_configured",
    };
  });

  app.get("/api/v1/ai/results/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const found = owned(store, (request.params as { id: string }).id, user.address);
    if (!found) return reply.code(404).send({ error: "not_found" });
    return { submissionId: found.id, decision: found.status, fraudRisk: "unknown" };
  });

  app.post("/api/v1/ai/retry/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    return reply.code(503).send({ error: "queue_not_configured" });
  });

  app.get("/api/v1/rewards/balance", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const mine = [...rewards.values()].filter((row) => row.wallet === user.address);
    return { points: mine.reduce((sum, row) => sum + row.points, 0), confirmedEcoWei: null, conversionConfirmed: policy.conversionConfirmed };
  });

  app.get("/api/v1/rewards/pending", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return [...rewards.values()].filter((row) => row.wallet === user.address && row.status !== "attested");
  });

  app.get("/api/v1/rewards/history", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return [...rewards.values()].filter((row) => row.wallet === user.address);
  });

  app.post("/api/v1/rewards/claim/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const found = owned(store, (request.params as { id: string }).id, user.address);
    if (!found) return reply.code(404).send({ error: "not_found" });
    if (found.status !== "approved") return reply.code(409).send({ error: "not_approved" });
    const reward = rewardWei(policy, found.action);
    if (!reward.ok) return reply.code(409).send({ error: reward.reason });
    const record = { id: randomUUID(), submissionId: found.id, wallet: user.address, points: pointsFor(policy, found.action), wei: reward.wei, status: "ready_for_attestation" };
    rewards.set(record.id, record);
    return record;
  });

  app.get("/api/v1/rewards/transaction/:id", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const record = rewards.get((request.params as { id: string }).id);
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
    found.status = body.decision;
    audits.push({ id: randomUUID(), actor: user.address, action: body.decision, target: found.id, at: new Date().toISOString() });
    return { submission: found, reason: body.reason ?? null };
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
