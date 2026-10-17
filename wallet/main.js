const { app, BrowserWindow, ipcMain, clipboard } = require("electron");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { Wallet, JsonRpcProvider, Contract, formatUnits, parseUnits, isAddress } = require("ethers");

const ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function staked(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function stake(uint256 amount)",
  "function unstake(uint256 amount)",
];

let windowRef;
let unlocked;

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
    rpc: "http://127.0.0.1:8545",
    contract: "",
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
  return { provider, contract, current };
}

function fail(error) {
  const message = error.shortMessage || error.reason || error.message || "The action failed.";
  throw new Error(message);
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

app.whenReady().then(createWindow);
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
});

ipcMain.handle("settings:get", () => settings());

ipcMain.handle("settings:set", (_event, next) => {
  if (next.contract && !isAddress(next.contract)) {
    throw new Error("Enter a valid contract address.");
  }
  if (!next.rpc || !next.rpc.trim()) {
    throw new Error("Enter the network address.");
  }
  writeJson(fileInUserData("settings.json"), {
    rpc: next.rpc.trim(),
    contract: (next.contract || "").trim(),
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
    const { provider, contract } = await connectUnlocked();
    const block = await provider.getBlockNumber();
    let available = "0";
    let staked = "0";
    if (contract) {
      const decimals = Number(await contract.decimals());
      available = formatUnits(await contract.balanceOf(unlocked.address), decimals);
      staked = formatUnits(await contract.staked(unlocked.address), decimals);
    }
    return {
      address: unlocked.address,
      block,
      available,
      staked,
      contract: settings().contract,
      rpc: settings().rpc,
    };
  } catch (error) {
    fail(error);
  }
});

async function sendToken(method, amountText, to) {
  const { contract } = await connectUnlocked();
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

ipcMain.handle("tx:stake", async (_event, amount) => {
  try {
    return await sendToken("stake", amount);
  } catch (error) {
    fail(error);
  }
});

ipcMain.handle("tx:unstake", async (_event, amount) => {
  try {
    return await sendToken("unstake", amount);
  } catch (error) {
    fail(error);
  }
});
