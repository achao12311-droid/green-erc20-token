const gate = document.querySelector("#gate");
const shell = document.querySelector("#shell");
const gateStatus = document.querySelector("#gate-status");

function showGate(name) {
  for (const id of ["gate-home", "gate-create", "gate-open", "gate-restore", "gate-seed"]) {
    document.querySelector("#" + id).hidden = id !== name;
  }
}

function gateError(error) {
  gateStatus.textContent = error.message || "Could not open the wallet.";
}

async function enterApp() {
  gate.hidden = true;
  shell.hidden = false;
  await loadSettings();
  await refreshAll();
  showPage("overview");
}

async function refreshAll() {
  const status = document.querySelector("#status");
  try {
    const state = await window.eco.refresh();
    document.querySelector("#available").textContent = state.available;
    document.querySelector("#staked").textContent = state.staked;
    document.querySelector("#overview-available").textContent = state.available + " ECO";
    document.querySelector("#overview-staked").textContent = state.staked + " ECO";
    document.querySelector("#receive-address").textContent = state.address;
    document.querySelector("#qr").src = await window.eco.qr();
    document.querySelector("#connection").textContent = state.contract
      ? "Connected · block " + state.block
      : "Connected · set the contract in Settings";
    status.textContent = "";
  } catch (error) {
    document.querySelector("#connection").textContent = "Disconnected";
    status.textContent = error.message;
  }
  await renderHistory();
}

async function renderHistory() {
  const list = document.querySelector("#history-list");
  const rows = await window.eco.history();
  list.innerHTML = "";
  if (!rows.length) {
    const item = document.createElement("li");
    item.textContent = "No transactions from this wallet yet.";
    list.append(item);
    return;
  }
  for (const row of rows) {
    const item = document.createElement("li");
    const who = row.to ? " to " + row.to : "";
    item.textContent = row.kind + " " + row.amount + " ECO" + who;
    list.append(item);
  }
}

function showPage(name) {
  for (const page of document.querySelectorAll(".page")) page.hidden = page.id !== "page-" + name;
  for (const button of document.querySelectorAll("nav button")) {
    button.classList.toggle("active", button.dataset.page === name);
  }
  if (name === "history") renderHistory();
  if (name === "receive" || name === "overview") refreshAll();
}

async function loadSettings() {
  const current = await window.eco.settings();
  document.querySelector("#setting-rpc").value = current.rpc;
  document.querySelector("#setting-contract").value = current.contract;
}

document.querySelector("#show-create").addEventListener("click", () => showGate("gate-create"));
document.querySelector("#show-open").addEventListener("click", () => showGate("gate-open"));
document.querySelector("#show-restore").addEventListener("click", () => showGate("gate-restore"));

document.querySelector("#gate-create").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#create-password").value;
  const repeat = document.querySelector("#create-password-2").value;
  if (password.length < 4) return gateError(new Error("Use a password of at least 4 characters."));
  if (password !== repeat) return gateError(new Error("The passwords do not match."));
  try {
    const created = await window.eco.create(password);
    document.querySelector("#seed-words").textContent = created.mnemonic;
    showGate("gate-seed");
    gateStatus.textContent = "";
  } catch (error) {
    gateError(error);
  }
});

document.querySelector("#seed-saved").addEventListener("change", (event) => {
  document.querySelector("#seed-continue").disabled = !event.target.checked;
});

document.querySelector("#seed-continue").addEventListener("click", () => enterApp());

document.querySelector("#gate-open").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await window.eco.unlock(document.querySelector("#open-password").value);
    await enterApp();
  } catch (error) {
    gateError(error);
  }
});

document.querySelector("#gate-restore").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await window.eco.restore(
      document.querySelector("#restore-password").value,
      document.querySelector("#restore-phrase").value
    );
    await enterApp();
  } catch (error) {
    gateError(error);
  }
});

for (const button of document.querySelectorAll("nav button")) {
  button.addEventListener("click", () => showPage(button.dataset.page));
}

async function runTx(action) {
  const status = document.querySelector("#status");
  status.textContent = "Waiting…";
  try {
    await action();
    await refreshAll();
    status.textContent = "Done.";
  } catch (error) {
    status.textContent = error.message;
  }
}

document.querySelector("#send").addEventListener("click", () =>
  runTx(() => window.eco.transfer(document.querySelector("#send-to").value.trim(), document.querySelector("#send-amount").value))
);

document.querySelector("#stake").addEventListener("click", () =>
  runTx(() => window.eco.stake(document.querySelector("#stake-amount").value))
);

document.querySelector("#unstake").addEventListener("click", () =>
  runTx(() => window.eco.unstake(document.querySelector("#stake-amount").value))
);

document.querySelector("#copy-address").addEventListener("click", async () => {
  await window.eco.copy(document.querySelector("#receive-address").textContent);
  document.querySelector("#status").textContent = "Address copied.";
});

document.querySelector("#save-settings").addEventListener("click", async () => {
  try {
    await window.eco.saveSettings({
      rpc: document.querySelector("#setting-rpc").value,
      contract: document.querySelector("#setting-contract").value,
    });
    await refreshAll();
    document.querySelector("#status").textContent = "Settings saved.";
  } catch (error) {
    document.querySelector("#status").textContent = error.message;
  }
});

document.querySelector("#lock").addEventListener("click", async () => {
  await window.eco.lock();
  shell.hidden = true;
  gate.hidden = false;
  showGate("gate-open");
  gateStatus.textContent = "";
});

window.eco.exists().then((exists) => {
  document.querySelector("#show-open").hidden = !exists;
  if (exists) showGate("gate-open");
});
