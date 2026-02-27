const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require("electron");
const { ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const WebSocket = require("ws");

let tray = null;
let chatWindow = null;
let ws = null;
let messageQueue = [];

// Persistent storage setup
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');

let config = { serverUrl: "http://localhost:3000", theme: "system" };

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const rawConfig = fs.readFileSync(configPath, 'utf8');
            config = { ...config, ...JSON.parse(rawConfig) };
        } else {
            // Check for legacy config in app directory (during dev or first run after update)
            const legacyPath = path.join(__dirname, 'config.json');
            if (fs.existsSync(legacyPath)) {
                const rawConfig = fs.readFileSync(legacyPath, 'utf8');
                config = { ...config, ...JSON.parse(rawConfig) };
                saveConfig(config); // Migrate to userData
            }
        }
    } catch (err) {
        console.error("Error loading config:", err);
    }
}

function saveConfig(newConfig) {
    try {
        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 4));
    } catch (err) {
        console.error("Error saving config:", err);
    }
}

loadConfig();

let SERVER_URL = config.serverUrl;
let allowReconnect = true;
let settingsWindow = null;

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }
    const iconPath = path.join(__dirname, "icon.png");
    settingsWindow = new BrowserWindow({
        width: 450,
        height: 380,
        title: "Settings",
        alwaysOnTop: true,
        resizable: false,
        icon: iconPath,
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

  const iconPath = path.join(__dirname, "icon.png");
  chatWindow = new BrowserWindow({
    width: 400,
    height: 450,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    icon: iconPath,
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
        // If window doesn't exist, create it and queue the message
        if (!chatWindow) {
          messageQueue.push(data);
          createChatWindow();
          chatWindow.webContents.once("did-finish-load", () => {
            // Send all queued messages once loaded
            messageQueue.forEach(m => chatWindow.webContents.send("incoming_message", m));
            messageQueue = [];
          });
        } else {
          // Window exists, but might still be loading if it was just created by another message
          if (chatWindow.webContents.isLoading()) {
            messageQueue.push(data);
          } else {
            createChatWindow(); // This will just show/focus it
            chatWindow.webContents.send("incoming_message", data);
          }
        }
      } else if (data.type === "typing") {
        if (chatWindow && !chatWindow.webContents.isLoading()) {
          chatWindow.webContents.send("typing_status", data.isTyping);
        }
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

ipcMain.on("send-typing-status", (event, isTyping) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "typing",
        isTyping
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
    
    saveConfig(newConfig);
    
    // Notify chat window about theme change
    if (chatWindow) {
        chatWindow.webContents.send('theme-changed', config.theme);
    }

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
  const iconPath = path.join(__dirname, "icon.png");
  let trayIcon = nativeImage.createFromPath(iconPath);
  
  if (process.platform === 'darwin') {
    // macOS tray icons should be 22x22 or smaller
    trayIcon = trayIcon.resize({ width: 18, height: 18 });
    trayIcon.setTemplateImage(true);
  }

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
  tray.setToolTip("Apex Chat Agent");
  tray.setContextMenu(contextMenu);

  // Add double-click to show chat (primarily for Windows)
  tray.on('double-click', () => {
    createChatWindow();
  });
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