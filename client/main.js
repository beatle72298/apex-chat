const { app, BrowserWindow, Tray, Menu, nativeImage } = require("electron");
const { ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const WebSocket = require("ws");

let tray = null;
let chatWindow = null;
let ws = null;

const SERVER_URL = "http://localhost:3000"; // <-- change this

function createChatWindow() {
  if (chatWindow) {
    chatWindow.show();
    chatWindow.focus();
    return;
  }

  chatWindow = new BrowserWindow({
    width: 400,
    height: 450,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  chatWindow.loadFile("renderer.html");

  chatWindow.on("closed", () => {
    chatWindow = null;
  });
}

function connectWebSocket() {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const platform = process.platform;

  ws = new WebSocket(SERVER_URL.replace(/^http/, "ws"));

  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        type: "register",
        clientId: `${hostname}-${username}`,
        hostname,
        username,
        platform
      })
    );
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "incoming_message") {
        // show chat window with message
        createChatWindow();
        chatWindow.webContents.send("incoming_message", data);
      }
    } catch (err) {
      console.error("Error parsing message", err);
    }
  });

  ws.on("close", () => {
    setTimeout(connectWebSocket, 5000); // auto-reconnect
  });

  ws.on("error", (err) => {
    console.error("WebSocket error", err);
  });
}

ipcMain.on("send_reply", (event, message) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "chat_message",
        message
      })
    );
  }
});

function createTray() {
  const iconPath = path.join(__dirname, "icon.png"); // optional tray icon
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon.isEmpty() ? undefined : trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Chat Window",
      click: () => createChatWindow()
    },
    {
      label: "Quit",
      click: () => app.quit()
    }
  ]);
  tray.setToolTip("IT Chat Agent");
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createTray();
  connectWebSocket();

  // no main window, just tray + chat popup
});

app.on("window-all-closed", (e) => {
  // Prevent Electron from quitting when chatWindow closes;
  // app quits via tray menu only.
  e.preventDefault();
});