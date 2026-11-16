const test = require("node:test");
const assert = require("node:assert/strict");
const { Wallet, verifyMessage } = require("ethers");
const { createBridge, SEPOLIA_CHAIN_ID } = require("./bridge");

function handlers(overrides = {}) {
  const wallet = Wallet.createRandom();
  const calls = [];
  return {
    wallet,
    calls,
    isUnlocked: () => true,
    getAddress: () => wallet.address,
    approve: async (prompt) => {
      calls.push(prompt);
      return overrides.approve ? overrides.approve(prompt) : true;
    },
    signMessage: (message) => wallet.signMessage(message),
    signTypedData: async () => "0x" + "11".repeat(65),
    sendTransaction: async (tx) => {
      calls.push({ kind: "send", to: tx.to });
      return "0x" + "ab".repeat(32);
    },
    forward: async (method) => {
      calls.push({ kind: "forward", method });
      return "0x1";
    },
    ...overrides,
  };
}

async function rpc(port, method, params = [], origin = "http://localhost:3000") {
  const response = await fetch("http://127.0.0.1:" + port, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method, params }),
  });
  return response.json();
}

test("connects on Sepolia and signs a message the site can verify", async () => {
  const bridgeHandlers = handlers();
  const bridge = createBridge(bridgeHandlers);
  const port = await bridge.listen();
  try {
    const chain = await rpc(port, "eth_chainId");
    assert.equal(chain.result, "0x" + SEPOLIA_CHAIN_ID.toString(16));
    const accounts = await rpc(port, "eth_requestAccounts");
    assert.deepEqual(accounts.result, [bridgeHandlers.wallet.address]);
    assert.equal(bridgeHandlers.calls[0].kind, "connect");
    const again = await rpc(port, "eth_accounts");
    assert.deepEqual(again.result, [bridgeHandlers.wallet.address]);
    const otherSite = await rpc(port, "eth_accounts", [], "http://evil.example");
    assert.deepEqual(otherSite.result, []);

    const message = "localhost wants you to sign in with your Ethereum account:\n" + bridgeHandlers.wallet.address;
    const signed = await rpc(port, "personal_sign", [message]);
    assert.equal(verifyMessage(message, signed.result), bridgeHandlers.wallet.address);
  } finally {
    await bridge.close();
  }
});

test("a rejected transfer is not sent, and an approved transfer can go to any address", async () => {
  const recipient = Wallet.createRandom().address;
  const bridgeHandlers = handlers({
    approve: (prompt) => prompt.kind !== "transaction",
  });
  const bridge = createBridge(bridgeHandlers);
  const port = await bridge.listen();
  try {
    await rpc(port, "eth_requestAccounts");
    const data = new (require("ethers").Interface)(["function transfer(address to, uint256 amount)"]).encodeFunctionData(
      "transfer",
      [recipient, 10n ** 18n]
    );
    const denied = await rpc(port, "eth_sendTransaction", [{ from: bridgeHandlers.wallet.address, to: "0x0000000000000000000000000000000000000001", data }]);
    assert.equal(denied.error.code, 4001);
    assert.equal(bridgeHandlers.calls.some((call) => call.kind === "send"), false);

    bridgeHandlers.approve = async (prompt) => {
      bridgeHandlers.calls.push(prompt);
      assert.match(prompt.detail, new RegExp(recipient));
      assert.match(prompt.detail, /轉出 1 ECO/);
      return true;
    };
    const sent = await rpc(port, "eth_sendTransaction", [{ to: "0x0000000000000000000000000000000000000001", data }]);
    assert.equal(sent.result, "0x" + "ab".repeat(32));
    assert.equal(bridgeHandlers.calls.at(-1).to, "0x0000000000000000000000000000000000000001");
  } finally {
    await bridge.close();
  }
});

test("refuses another chain and forwards only reads", async () => {
  const bridgeHandlers = handlers();
  const bridge = createBridge(bridgeHandlers);
  const port = await bridge.listen();
  try {
    const mainnet = await rpc(port, "wallet_switchEthereumChain", [{ chainId: "0x1" }]);
    assert.equal(mainnet.error.code, 4902);
    await rpc(port, "eth_requestAccounts");
    const gas = await rpc(port, "eth_estimateGas", [{}]);
    assert.equal(gas.result, "0x1");
    const blocked = await rpc(port, "eth_sendRawTransaction", ["0x00"]);
    assert.match(blocked.error.message, /does not support/);
  } finally {
    await bridge.close();
  }
});
