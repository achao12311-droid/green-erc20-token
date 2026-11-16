import { randomUUID } from "node:crypto";

export type SubmissionStatus = "draft" | "uploaded" | "pending_review" | "rejected" | "approved";

export type VideoEvidence = {
  contentType: string;
  size: number;
  sha256: string;
  complete: boolean;
};

export type VerificationResult = {
  completed: boolean;
  decision: "approved" | "rejected";
  reason: string;
  exactDuplicate: boolean;
  nearDuplicate: boolean;
  perceptual: "average_hash" | "not_configured";
  modelsConfigured: boolean;
  predictedAction: string | null;
  at: string;
};

export type ReviewRecord = {
  reviewer: string;
  decision: "approved" | "rejected";
  reason: string | null;
  at: string;
};

export type Submission = {
  id: string;
  wallet: string;
  action: string;
  description: string;
  status: SubmissionStatus;
  idempotencyKey: string;
  video: VideoEvidence | null;
  verification: VerificationResult | null;
  reviews: ReviewRecord[];
  createdAt: string;
};

export class MemoryStore {
  submissions = new Map<string, Submission>();
  byKey = new Map<string, string>();
  videoFiles = new Map<string, string>();
  frameHashes = new Map<string, string[]>();

  create(input: { wallet: string; action: string; description: string; idempotencyKey: string }): Submission {
    const wallet = input.wallet.toLowerCase();
    const existingId = this.byKey.get(wallet + ":" + input.idempotencyKey);
    if (existingId) {
      return this.submissions.get(existingId)!;
    }
    const submission: Submission = {
      id: randomUUID(),
      wallet,
      action: input.action,
      description: input.description,
      status: "draft",
      idempotencyKey: input.idempotencyKey,
      video: null,
      verification: null,
      reviews: [],
      createdAt: new Date().toISOString(),
    };
    this.submissions.set(submission.id, submission);
    this.byKey.set(wallet + ":" + input.idempotencyKey, submission.id);
    return submission;
  }

  get(id: string): Submission | undefined {
    return this.submissions.get(id);
  }

  list(wallet?: string): Submission[] {
    const rows = [...this.submissions.values()];
    return wallet ? rows.filter((row) => row.wallet === wallet.toLowerCase()) : rows;
  }

  hasExactSha256Duplicate(submission: Submission): boolean {
    const digest = submission.video?.sha256;
    if (!digest) return false;
    return this.list().some((other) => other.id !== submission.id && other.video?.sha256 === digest);
  }
}
