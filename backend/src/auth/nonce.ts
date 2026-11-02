import { randomBytes } from "node:crypto";

export type NonceRecord = { nonce: string; expiresAt: number };

export class NonceStore {
  private records = new Map<string, NonceRecord>();

  issue(address: string, now = Date.now(), ttlMs = 10 * 60 * 1000): NonceRecord {
    const record = { nonce: randomBytes(16).toString("hex"), expiresAt: now + ttlMs };
    this.records.set(address.toLowerCase(), record);
    return record;
  }

  consume(address: string, nonce: string, now = Date.now()): boolean {
    const key = address.toLowerCase();
    const record = this.records.get(key);
    this.records.delete(key);
    if (!record || record.nonce !== nonce || record.expiresAt <= now) {
      return false;
    }
    return true;
  }
}
