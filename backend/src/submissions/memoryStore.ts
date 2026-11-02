import { randomUUID } from "node:crypto";

export type SubmissionStatus = "draft" | "uploaded" | "pending_review" | "rejected" | "approved";

export type Submission = {
  id: string;
  wallet: string;
  action: string;
  description: string;
  status: SubmissionStatus;
  idempotencyKey: string;
  video: { contentType: string; size: number; sha256: string | null } | null;
  createdAt: string;
};

export class MemoryStore {
  submissions = new Map<string, Submission>();
  byKey = new Map<string, string>();

  create(input: { wallet: string; action: string; description: string; idempotencyKey: string }): Submission {
    const existingId = this.byKey.get(input.wallet + ":" + input.idempotencyKey);
    if (existingId) {
      return this.submissions.get(existingId)!;
    }
    const submission: Submission = {
      id: randomUUID(),
      wallet: input.wallet.toLowerCase(),
      action: input.action,
      description: input.description,
      status: "draft",
      idempotencyKey: input.idempotencyKey,
      video: null,
      createdAt: new Date().toISOString(),
    };
    this.submissions.set(submission.id, submission);
    this.byKey.set(submission.wallet + ":" + input.idempotencyKey, submission.id);
    return submission;
  }

  get(id: string): Submission | undefined {
    return this.submissions.get(id);
  }

  list(wallet?: string): Submission[] {
    const rows = [...this.submissions.values()];
    return wallet ? rows.filter((row) => row.wallet === wallet.toLowerCase()) : rows;
  }
}
