const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require("electron");
const { ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const WebSocket = require("ws");

let tray = null;
let chatWindow = null;
let ws = null;

let config = { serverUrl: "http://localhost:3000" };
try {
    const rawConfig = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
    config = JSON.parse(rawConfig);
} catch (err) {
    console.log("No config.json found or it's invalid. Using default server URL.");
}

let SERVER_URL = config.serverUrl;
let allowReconnect = true;
let settingsWindow = null;

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }
    settingsWindow = new BrowserWindow({
        width: 450,
        height: 300,
        title: "Settings",
        alwaysOnTop: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // Required for ipcRenderer in settings.js
        }
    });
    settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

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
  if (ws) {
    ws.close();
  }
  
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const platform = process.platform;

  ws = new WebSocket(SERVER_URL.replace(/^http/, "ws"));

  ws.on("open", () => {
    console.log(`Connected to ${SERVER_URL}`);
    allowReconnect = true; // Re-enable reconnect on successful connection
    ws.send(
      JSON.stringify({
        type: "register",
        clientId: `${username}@${hostname}`,
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
    if (allowReconnect) {
        setTimeout(connectWebSocket, 5000); // auto-reconnect
    }
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

ipcMain.on("open-link", (event, url) => {
  shell.openExternal(url);
});

ipcMain.on("open-settings", () => {
  createSettingsWindow();
});

ipcMain.on('get-config', (event) => {
    event.sender.send('current-config', config);
});

ipcMain.on('save-config', (event, newConfig) => {
    config = newConfig;
    SERVER_URL = newConfig.serverUrl;
    
    fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(newConfig, null, 4));
    
    // Restart connection
    allowReconnect = false; // Prevent auto-reconnect from firing while we intentionally restart
    if (ws) {
        ws.close();
    }
    connectWebSocket();

    if (settingsWindow) {
        settingsWindow.close();
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
      label: "Settings",
      click: () => createSettingsWindow()
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
  Menu.setApplicationMenu(null);
  createTray();
  connectWebSocket();

  // no main window, just tray + chat popup
});

app.on("window-all-closed", (e) => {
  // Prevent Electron from quitting when chatWindow closes;
  // app quits via tray menu only.
  e.preventDefault();
});