const { app, BrowserWindow, ipcMain, clipboard } = require("electron");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { Wallet, JsonRpcProvider, Contract, formatUnits, parseUnits, isAddress } = require("ethers");
const { createBridge } = require("./bridge");

const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

const ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const STAKING_ABI = [
  "function staked(address) view returns (uint256)",
  "function stake(uint256 amount)",
  "function unstake(uint256 amount)",
];

let windowRef;
let unlocked;
let acceptsSites = false;
let bridge;
let pendingApproval;
let pendingPrompt;

function fileInUserData(name) {
  return path.join(app.getPath("userData"), name);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function settings() {
  return readJson(fileInUserData("settings.json"), {
    rpc: DEFAULT_RPC,
    contract: "",
    staking: "",
  });
}

function remember(entry) {
  const history = readJson(fileInUserData("history.json"), []);
  history.unshift({ ...entry, time: new Date().toISOString() });
  writeJson(fileInUserData("history.json"), history.slice(0, 50));
}

async function connectUnlocked() {
  if (!unlocked) throw new Error("Unlock the wallet first.");
  const current = settings();
  const provider = new JsonRpcProvider(current.rpc);
  unlocked = unlocked.connect(provider);
  const contract =
    current.contract && isAddress(current.contract)
      ? new Contract(current.contract, ABI, unlocked)
      : null;
  const staking =
    current.staking && isAddress(current.staking)
      ? new Contract(current.staking, STAKING_ABI, unlocked)
      : null;
  return { provider, contract, staking, current };
}

function fail(error) {
  const message = error.shortMessage || error.reason || error.message || "The action failed.";
  throw new Error(message);
}

function finishApproval(id, allowed) {
  if (!pendingApproval || (id !== undefined && pendingApproval.id !== id)) return;
  const current = pendingApproval;
  pendingApproval = null;
  pendingPrompt = null;
  current.resolve(Boolean(allowed));
  if (windowRef && !windowRef.isDestroyed()) {
    try {
      windowRef.webContents.send("bridge:prompt", null);
    } catch {
      // The prompt overlay hides on the next load if the page is not ready.
    }
  }
}

function askApproval(prompt) {
  if (pendingApproval) return Promise.reject(new Error("ECO Wallet is already waiting for another approval."));
  return new Promise((resolve) => {
    const id = Date.now();
    pendingApproval = { id, resolve };
    pendingPrompt = { id, ...prompt };
    if (windowRef && !windowRef.isDestroyed()) {
      if (windowRef.isMinimized()) windowRef.restore();
      windowRef.show();
      windowRef.focus();
      try {
        windowRef.webContents.send("bridge:prompt", pendingPrompt);
      } catch {
        // The page reads the pending prompt when it finishes loading.
      }
    }
    setTimeout(() => finishApproval(id, false), 180000);
  });
}

async function assertSepolia(provider) {
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) {
    throw new Error("This wallet only sends ECO on Sepolia. Change the network address in Settings.");
  }
}

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#1a1a1a",
    autoHideMenuBar: true,
    title: "ECO Wallet",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  windowRef.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  startBridge().catch((error) => console.error(error));
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("wallet:exists", () => fs.existsSync(fileInUserData("keystore.json")));

ipcMain.handle("wallet:create", async (_event, password) => {
  try {
    const fresh = Wallet.createRandom();
    fs.writeFileSync(fileInUserData("keystore.json"), await fresh.encrypt(password));
    unlocked = fresh;
    return { address: fresh.address, mnemonic: fresh.mnemonic.phrase };
  } catch (error) {
    fail(error);
  }
});

ipcMain.handle("wallet:restore", async (_event, { password, phrase }) => {
  try {
    const fresh = Wallet.fromPhrase(phrase.trim());
    fs.writeFileSync(fileInUserData("keystore.json"), await fresh.encrypt(password));
    unlocked = fresh;
    return { address: fresh.address };
  } catch (error) {
    fail(error);
  }
});

ipcMain.handle("wallet:unlock", async (_event, password) => {
  try {
    const json = fs.readFileSync(fileInUserData("keystore.json"), "utf8");
    unlocked = await Wallet.fromEncryptedJson(json, password);
    return { address: unlocked.address };
  } catch (error) {
    fail(error);
  }
});

ipcMain.handle("wallet:lock", () => {
  unlocked = undefined;
  acceptsSites = false;
  finishApproval(undefined, false);
  if (bridge) bridge.disconnect();
});

ipcMain.handle("wallet:opened", () => {
  acceptsSites = Boolean(unlocked);
});

ipcMain.handle("bridge:current", () => pendingPrompt || null);

ipcMain.handle("bridge:decide", (_event, { id, allow }) => {
  finishApproval(id, allow);
});

ipcMain.handle("settings:get", () => settings());

ipcMain.handle("settings:set", (_event, next) => {
  if (next.contract && !isAddress(next.contract)) {
    throw new Error("Enter a valid contract address.");
  }
  if (next.staking && !isAddress(next.staking)) {
    throw new Error("Enter a valid staking contract.");
  }
  if (!next.rpc || !next.rpc.trim()) {
    throw new Error("Enter the network address.");
  }
  writeJson(fileInUserData("settings.json"), {
    rpc: next.rpc.trim(),
    contract: (next.contract || "").trim(),
    staking: (next.staking || "").trim(),
  });
  return settings();
});

ipcMain.handle("history:list", () => readJson(fileInUserData("history.json"), []));

ipcMain.handle("wallet:copy", (_event, text) => {
  clipboard.writeText(text);
});

ipcMain.handle("wallet:qr", async () => {
  if (!unlocked) throw new Error("Unlock the wallet first.");
  return QRCode.toDataURL(unlocked.address, { margin: 1, width: 220, color: { dark: "#000000", light: "#ffffff" } });
});

ipcMain.handle("chain:refresh", async () => {
  try {
    const { provider, contract, staking } = await connectUnlocked();
    const block = await provider.getBlockNumber();
    let available = "0";
    let staked = "0";
    let incoming = [];
    if (contract) {
      const decimals = Number(await contract.decimals());
      available = formatUnits(await contract.balanceOf(unlocked.address), decimals);
      if (staking) {
        staked = formatUnits(await staking.staked(unlocked.address), decimals);
      }
      try {
        const fromBlock = Math.max(0, block - 4000);
        const logs = await contract.queryFilter(contract.filters.Transfer(null, unlocked.address), fromBlock, block);
        incoming = logs.slice(-8).reverse().map((log) => ({
          from: log.args[0],
          amount: formatUnits(log.args[1], decimals),
          hash: log.transactionHash,
        }));
      } catch {
        incoming = [];
      }
    }
    return {
      address: unlocked.address,
      block,
      available,
      staked,
      incoming,
      contract: settings().contract,
      rpc: settings().rpc,
    };
  } catch (error) {
    fail(error);
  }
});

async function sendToken(method, amountText, to) {
  const { provider, contract } = await connectUnlocked();
  await assertSepolia(provider);
  if (!contract) throw new Error("Set the ECO contract address in Settings.");
  const decimals = Number(await contract.decimals());
  const amount = parseUnits(String(amountText).trim(), decimals);
  if (amount <= 0n) throw new Error("Enter an amount greater than 0.");
  const tx = to ? await contract[method](to, amount) : await contract[method](amount);
  const receipt = await tx.wait();
  remember({ kind: method, amount: String(amountText).trim(), to: to || "", hash: receipt.hash });
  return receipt.hash;
}

ipcMain.handle("tx:transfer", async (_event, { to, amount }) => {
  try {
    if (!isAddress(to)) throw new Error("Enter the recipient address.");
    return await sendToken("transfer", amount, to);
  } catch (error) {
    fail(error);
  }
});

async function stakingAmount(amountText) {
  const { provider, contract, staking } = await connectUnlocked();
  await assertSepolia(provider);
  if (!contract || !staking) throw new Error("Set the ECO token and staking contract in Settings.");
  const decimals = Number(await contract.decimals());
  const amount = parseUnits(String(amountText).trim(), decimals);
  if (amount <= 0n) throw new Error("Enter an amount greater than 0.");
  return { contract, staking, amount };
}

ipcMain.handle("tx:stake", async (_event, amountText) => {
  try {
    const { contract, staking, amount } = await stakingAmount(amountText);
    const spender = await staking.getAddress();
    const allowance = await contract.allowance(unlocked.address, spender);
    if (allowance < amount) {
      const approval = await contract.approve(spender, amount);
      await approval.wait();
    }
    const tx = await staking.stake(amount);
    const receipt = await tx.wait();
    remember({ kind: "stake", amount: String(amountText).trim(), to: spender, hash: receipt.hash });
    return receipt.hash;
  } catch (error) {
    fail(error);
  }
});

ipcMain.handle("tx:unstake", async (_event, amountText) => {
  try {
    const { staking, amount } = await stakingAmount(amountText);
    const tx = await staking.unstake(amount);
    const receipt = await tx.wait();
    remember({ kind: "unstake", amount: String(amountText).trim(), to: "", hash: receipt.hash });
    return receipt.hash;
  } catch (error) {
    fail(error);
  }
});

async function forwardRpc(method, params) {
  const current = settings();
  let response;
  try {
    response = await fetch(current.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  } catch {
    throw new Error("ECO Wallet cannot reach the network in Settings.");
  }
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || "The network rejected the request.");
  return body.result;
}

function startBridge() {
  bridge = createBridge({
    isUnlocked: () => acceptsSites && Boolean(unlocked),
    getAddress: () => {
      if (!unlocked) throw new Error("Unlock the wallet first.");
      return unlocked.address;
    },
    approve: askApproval,
    signMessage: async (message) => {
      if (!unlocked) throw new Error("Unlock the wallet first.");
      return unlocked.signMessage(message);
    },
    signTypedData: async (typed) => {
      if (!unlocked) throw new Error("Unlock the wallet first.");
      const types = { ...typed.types };
      delete types.EIP712Domain;
      return unlocked.signTypedData(typed.domain, types, typed.message);
    },
    sendTransaction: async (tx) => {
      const { provider } = await connectUnlocked();
      await assertSepolia(provider);
      const sent = await unlocked.sendTransaction({
        to: tx.to,
        data: tx.data && tx.data !== "0x" ? tx.data : undefined,
        value: tx.value ? BigInt(tx.value) : 0n,
        chainId: 11155111n,
      });
      remember({ kind: "website", amount: "", to: tx.to || "", hash: sent.hash });
      return sent.hash;
    },
    forward: forwardRpc,
  });
  return bridge.listen(3939);
}
