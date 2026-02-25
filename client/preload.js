const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onIncomingMessage: (callback) => ipcRenderer.on("incoming_message", callback),
  sendReply: (message) => ipcRenderer.send("send_reply", message),
  sendTypingStatus: (isTyping) => ipcRenderer.send("send-typing-status", isTyping),
  openLink: (url) => ipcRenderer.send("open-link", url),
  openSettings: () => ipcRenderer.send("open-settings"),
  onThemeChanged: (callback) => ipcRenderer.on("theme-changed", callback),
  onTypingStatus: (callback) => ipcRenderer.on("typing_status", callback),
  getConfig: () => ipcRenderer.send("get-config"),
  onCurrentConfig: (callback) => ipcRenderer.on("current-config", callback)
});