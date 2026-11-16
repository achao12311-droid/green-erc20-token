import { DatabaseSync } from "node:sqlite";

export type RewardAuthorization = {
  id: string;
  submissionId: string;
  wallet: string;
  points: number;
  wei: string;
  policyVersion: number;
  status: "ready_for_attestation";
  signature: null;
};

type StoredRow = { payload: string };

/// One submission can produce one attestation request.
/// The insert runs inside a SQLite transaction. This is not the PostgreSQL database.
export class RewardLedger {
  private readonly db = new DatabaseSync(":memory:");

  constructor() {
    this.db.exec(`
      CREATE TABLE reward_authorization (
        submission_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      )
    `);
  }

  authorize(record: RewardAuthorization): { record: RewardAuthorization; created: boolean } {
    const existing = this.read(record.submissionId);
    if (existing) return { record: existing, created: false };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const raced = this.read(record.submissionId);
      if (raced) {
        this.db.exec("COMMIT");
        return { record: raced, created: false };
      }
      this.db
        .prepare("INSERT INTO reward_authorization (submission_id, payload) VALUES (?, ?)")
        .run(record.submissionId, JSON.stringify(record));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      const saved = this.read(record.submissionId);
      if (saved) return { record: saved, created: false };
      throw error;
    }
    const stored = this.read(record.submissionId);
    if (!stored || stored.signature !== null) {
      throw new Error("reward_transaction_failed");
    }
    return { record: stored, created: true };
  }

  listFor(wallet: string): RewardAuthorization[] {
    return this.all().filter((row) => row.wallet === wallet);
  }

  getById(id: string): RewardAuthorization | undefined {
    return this.all().find((row) => row.id === id);
  }

  private read(submissionId: string): RewardAuthorization | undefined {
    const row = this.db.prepare("SELECT payload FROM reward_authorization WHERE submission_id = ?").get(submissionId) as
      | StoredRow
      | undefined;
    return row ? (JSON.parse(row.payload) as RewardAuthorization) : undefined;
  }

  private all(): RewardAuthorization[] {
    const rows = this.db.prepare("SELECT payload FROM reward_authorization").all() as StoredRow[];
    return rows.map((row) => JSON.parse(row.payload) as RewardAuthorization);
  }
}
