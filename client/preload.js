const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onIncomingMessage: (callback) => ipcRenderer.on("incoming_message", callback),
  sendReply: (message) => ipcRenderer.send("send_reply", message),
  openLink: (url) => ipcRenderer.send("open-link", url),
  openSettings: () => ipcRenderer.send("open-settings"),
  onThemeChanged: (callback) => ipcRenderer.on("theme-changed", callback),
  getConfig: () => ipcRenderer.send("get-config"),
  onCurrentConfig: (callback) => ipcRenderer.on("current-config", callback)
});