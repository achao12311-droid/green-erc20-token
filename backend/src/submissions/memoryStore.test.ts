import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStore } from "./memoryStore.ts";

test("the same idempotency key returns the original submission", () => {
  const store = new MemoryStore();
  const first = store.create({
    wallet: "0xABC",
    action: "RECYCLING",
    description: "bottles",
    idempotencyKey: "key-1",
  });
  const second = store.create({
    wallet: "0xabc",
    action: "TREE_PLANTING",
    description: "ignored",
    idempotencyKey: "key-1",
  });
  assert.equal(second.id, first.id);
  assert.equal(second.action, "RECYCLING");
  assert.equal(store.list().length, 1);
});
