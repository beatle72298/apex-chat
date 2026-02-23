const { contextBridge, ipcMain, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onIncomingMessage: (callback) => ipcRenderer.on("incoming_message", callback),
  sendReply: (message) => ipcRenderer.send("send_reply", message)
});

// handle reply from renderer in main process
ipcRenderer?.on?.("send_reply", () => {});