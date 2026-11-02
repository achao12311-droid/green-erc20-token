import assert from "node:assert/strict";
import test from "node:test";
import { NonceStore } from "./nonce.ts";

test("a nonce can be used once and then expires", () => {
  const store = new NonceStore();
  const issued = store.issue("0xABC", 1_000, 500);
  assert.equal(store.consume("0xabc", issued.nonce, 1_200), true);
  assert.equal(store.consume("0xabc", issued.nonce, 1_200), false);
});

test("an expired nonce is rejected", () => {
  const store = new NonceStore();
  const issued = store.issue("0xABC", 1_000, 500);
  assert.equal(store.consume("0xabc", issued.nonce, 1_500), false);
});
