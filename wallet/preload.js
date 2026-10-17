const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eco", {
  exists: () => ipcRenderer.invoke("wallet:exists"),
  create: (password) => ipcRenderer.invoke("wallet:create", password),
  restore: (password, phrase) => ipcRenderer.invoke("wallet:restore", { password, phrase }),
  unlock: (password) => ipcRenderer.invoke("wallet:unlock", password),
  lock: () => ipcRenderer.invoke("wallet:lock"),
  settings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:set", settings),
  refresh: () => ipcRenderer.invoke("chain:refresh"),
  transfer: (to, amount) => ipcRenderer.invoke("tx:transfer", { to, amount }),
  stake: (amount) => ipcRenderer.invoke("tx:stake", amount),
  unstake: (amount) => ipcRenderer.invoke("tx:unstake", amount),
  history: () => ipcRenderer.invoke("history:list"),
  qr: () => ipcRenderer.invoke("wallet:qr"),
  copy: (text) => ipcRenderer.invoke("wallet:copy", text),
});
