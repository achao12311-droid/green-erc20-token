const http = require("http");
const { Interface, formatUnits, getBytes } = require("ethers");

const SEPOLIA_CHAIN_ID = 11155111;
const READ_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
]);

const tokenInterface = new Interface([
  "function transfer(address to, uint256 amount)",
  "function approve(address spender, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
]);

function rpcError(message, code = -32000) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function chainHex() {
  return "0x" + SEPOLIA_CHAIN_ID.toString(16);
}

function textFromPersonalSign(value) {
  if (typeof value !== "string") throw rpcError("Missing message.");
  if (!value.startsWith("0x")) return value;
  const bytes = getBytes(value);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return bytes;
  }
}

function formatAmount(value) {
  return formatUnits(value, 18).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function describeTransaction(tx) {
  const data = tx.data || "0x";
  try {
    const parsed = tokenInterface.parseTransaction({ data, value: tx.value || "0x0" });
    if (parsed?.name === "transfer") {
      return `轉出 ${formatAmount(parsed.args.amount)} ECO 到 ${parsed.args.to}`;
    }
    if (parsed?.name === "approve") {
      return `授權 ${parsed.args.spender} 使用 ${formatAmount(parsed.args.amount)} ECO`;
    }
    if (parsed?.name === "transferFrom") {
      return `從 ${parsed.args.from} 轉出 ${formatAmount(parsed.args.amount)} ECO 到 ${parsed.args.to}`;
    }
  } catch {
    // Not an ECO transfer. The approval still shows the raw destination.
  }
  return `送出交易到 ${tx.to}`;
}

function createBridge(handlers) {
  let session = null;

  async function handle(method, params, origin) {
    if (method === "eth_chainId") return chainHex();
    if (method === "net_version") return String(SEPOLIA_CHAIN_ID);
    if (method === "eth_accounts") {
      if (!handlers.isUnlocked() || !session || session.origin !== origin) return [];
      return [handlers.getAddress()];
    }
    if (method === "eth_requestAccounts") {
      if (!handlers.isUnlocked()) throw rpcError("Unlock the wallet first.");
      if (session && session.origin === origin) return [handlers.getAddress()];
      const allowed = await handlers.approve({
        origin,
        kind: "connect",
        title: "這個網站想連接 ECO Wallet",
        detail: "連接之後網站看得到這個地址。轉帳和簽名仍會再問一次。",
      });
      if (!allowed) throw rpcError("User rejected the request.", 4001);
      session = { origin, address: handlers.getAddress() };
      return [session.address];
    }
    if (method === "eco_disconnect" || method === "wallet_revokePermissions") {
      session = null;
      return null;
    }
    if (method === "wallet_switchEthereumChain") {
      const requested = params[0]?.chainId;
      const chainId = typeof requested === "string" ? Number(BigInt(requested)) : Number(requested);
      if (chainId !== SEPOLIA_CHAIN_ID) throw rpcError("ECO Wallet only uses Sepolia.", 4902);
      return null;
    }
    if (!session || session.origin !== origin) throw rpcError("Connect ECO Wallet from the website first.");
    if (!handlers.isUnlocked()) throw rpcError("Unlock the wallet first.");

    if (method === "personal_sign") {
      const message = textFromPersonalSign(params[0]);
      const preview = typeof message === "string" ? message : "二進位訊息";
      const allowed = await handlers.approve({
        origin,
        kind: "sign",
        title: "這個網站想用你的地址簽名",
        detail: preview.slice(0, 500),
      });
      if (!allowed) throw rpcError("User rejected the request.", 4001);
      return handlers.signMessage(message);
    }
    if (method === "eth_signTypedData_v4" || method === "eth_signTypedData") {
      const typed = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
      const allowed = await handlers.approve({
        origin,
        kind: "sign",
        title: "這個網站想用你的地址簽名",
        detail: typed.primaryType || "typed data",
      });
      if (!allowed) throw rpcError("User rejected the request.", 4001);
      return handlers.signTypedData(typed);
    }
    if (method === "eth_sendTransaction") {
      const tx = params[0] || {};
      if (!tx.to) throw rpcError("ECO Wallet does not deploy contracts from the website.");
      if (tx.chainId && Number(BigInt(tx.chainId)) !== SEPOLIA_CHAIN_ID) {
        throw rpcError("ECO Wallet only sends on Sepolia.");
      }
      const detail = describeTransaction(tx);
      const allowed = await handlers.approve({
        origin,
        kind: "transaction",
        title: "這個網站想送出交易",
        detail,
      });
      if (!allowed) throw rpcError("User rejected the request.", 4001);
      return handlers.sendTransaction(tx);
    }
    if (READ_METHODS.has(method)) return handlers.forward(method, params);
    throw rpcError("ECO Wallet does not support " + method);
  }

  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin || "local";
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin || "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    response.setHeader("Content-Type", "application/json");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "GET") {
      response.end(JSON.stringify({ ok: true, unlocked: handlers.isUnlocked(), connected: Boolean(session) }));
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(404);
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    if (raw.length > 1_000_000) {
      response.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Request is too large." } }));
      return;
    }
    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8") || "{}");
    } catch {
      response.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON." } }));
      return;
    }
    try {
      const result = await handle(payload.method, payload.params || [], origin);
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id ?? null, result }));
    } catch (error) {
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: payload.id ?? null,
        error: { code: error.code || -32000, message: error.message },
      }));
    }
  });

  return {
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          const address = server.address();
          resolve(typeof address === "object" && address ? address.port : port);
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
    disconnect() {
      session = null;
    },
  };
}

module.exports = { createBridge, SEPOLIA_CHAIN_ID };
