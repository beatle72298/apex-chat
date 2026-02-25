const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

let config = { port: 3000, adminName: "IT" };
const historyFile = path.join(__dirname, 'history.json');

try {
    const rawConfig = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
    config = { ...config, ...JSON.parse(rawConfig) };
} catch (err) {
    console.log("No config.json found or it's invalid. Using default settings.");
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let knownClients = {}; // clientId -> { ws, info, status, messages, lastSeen }
const admins = new Set(); // Set of admin WebSockets

// Load history on startup
try {
    if (fs.existsSync(historyFile)) {
        const rawHistory = fs.readFileSync(historyFile, 'utf8');
        knownClients = JSON.parse(rawHistory);
        // Reset online status for all clients on restart
        Object.values(knownClients).forEach(client => {
            client.status = 'offline';
            delete client.ws;
        });
    }
} catch (err) {
    console.error("Error loading history:", err);
}

function saveHistory() {
    try {
        const historyToSave = {};
        for (const [id, client] of Object.entries(knownClients)) {
            const { ws, ...clientData } = client;
            historyToSave[id] = clientData;
        }
        fs.writeFileSync(historyFile, JSON.stringify(historyToSave, null, 2));
    } catch (err) {
        console.error("Error saving history:", err);
    }
}

function broadcastClientList() {
  const clientListForAdmins = Object.values(knownClients).map(
    ({ ws, ...clientData }) => clientData
  );

  const payload = JSON.stringify({
    type: "client_list",
    clients: clientListForAdmins,
  });

  for (const adminWs of admins) {
    if (adminWs.readyState === WebSocket.OPEN) {
      adminWs.send(payload);
    }
  }
}

wss.on("connection", (ws) => {
  let clientId = null;
  let isAdmin = false;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "register") {
        if (data.role === "admin") {
          isAdmin = true;
          admins.add(ws);
          console.log("Admin registered");
          broadcastClientList();
          return;
        }

        clientId = data.clientId;
        const clientInfo = {
            clientId,
            hostname: data.hostname,
            username: data.username,
            platform: data.platform,
        };

        if (knownClients[clientId]) {
          knownClients[clientId].ws = ws;
          knownClients[clientId].status = 'online';
          knownClients[clientId].info = clientInfo;
          knownClients[clientId].lastSeen = new Date().toISOString();
        } else {
          knownClients[clientId] = {
            ws,
            info: clientInfo,
            status: 'online',
            lastSeen: new Date().toISOString(),
            messages: [],
          };
        }
        
        console.log(`Client registered: ${clientId} - ${knownClients[clientId].status}`);
        saveHistory();
        broadcastClientList();

      } else if (data.type === "chat_message") {
        console.log(`Message from ${clientId}: ${data.message}`);
        
        const messageData = {
          from: clientId,
          message: data.message,
          timestamp: new Date().toISOString(),
        };
        
        if (knownClients[clientId]) {
            knownClients[clientId].messages.push(messageData);
            saveHistory();
        }

        // Forward client message to all admins
        const payload = JSON.stringify({
          type: "incoming_message",
          ...messageData
        });
        for (const adminWs of admins) {
          if (adminWs.readyState === WebSocket.OPEN) {
            adminWs.send(payload);
          }
        }
      } else if (data.type === "typing") {
        // Forward typing status
        const payload = JSON.stringify({
          type: "typing",
          from: isAdmin ? "IT" : clientId,
          isTyping: data.isTyping,
          to: data.to // Only used if sent by admin
        });

        if (isAdmin) {
          // Forward to specific client
          const client = knownClients[data.to];
          if (client && client.ws && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(payload);
          }
        } else {
          // Forward to all admins
          for (const adminWs of admins) {
            if (adminWs.readyState === WebSocket.OPEN) {
              adminWs.send(payload);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error handling message", err);
    }
  });

  ws.on("close", () => {
    if (isAdmin) {
      admins.delete(ws);
      console.log("Admin disconnected");
    } else if (clientId && knownClients[clientId]) {
      console.log(`Client disconnected: ${clientId}`);
      knownClients[clientId].status = 'offline';
      delete knownClients[clientId].ws; // Remove the dead socket
      broadcastClientList();
    }
  });
});

// REST endpoint to send a message to a client
app.post("/api/send", (req, res) => {
  const { clientId, message } = req.body;
  const client = knownClients[clientId];

  if (!client || client.status !== 'online') {
    return res.status(404).json({ error: "Client not connected or offline" });
  }

  const messageData = {
    from: config.adminName || "IT",
    to: clientId,
    message,
    timestamp: new Date().toISOString(),
  };

  if (client) {
    client.messages.push(messageData);
    saveHistory();
  }

  const payload = JSON.stringify({
    type: "incoming_message",
    message,
    from: config.adminName || "IT",
    timestamp: messageData.timestamp,
  });
  client.ws.send(payload);

  // Broadcast the outgoing message to all admins so they see it in their UI
  const adminPayload = JSON.stringify({
    type: "incoming_message",
    ...messageData
  });
  for (const adminWs of admins) {
    if (adminWs.readyState === WebSocket.OPEN) {
      adminWs.send(adminPayload);
    }
  }

  res.json({ ok: true });
});

app.get("/api/history/:clientId", (req, res) => {
    const { clientId } = req.params;
    const client = knownClients[clientId];

    if (!client) {
        return res.status(404).json({ error: "Client not found" });
    }

    res.json(client.messages);
});

// REST endpoint to list clients
app.get("/api/clients", (req, res) => {
    const clientListForAdmins = Object.values(knownClients).map(
        ({ ws, ...clientData }) => clientData
    );
    res.json(clientListForAdmins);
});

// REST endpoint to get server configuration
app.get("/api/config", (req, res) => {
    res.json(config);
});

// REST endpoint to update server configuration
app.post("/api/config", (req, res) => {
    const newConfig = req.body;
    if (!newConfig || typeof newConfig.port !== 'number' || newConfig.port <= 0) {
        return res.status(400).json({ error: "Invalid port number provided." });
    }

    try {
        config = { ...config, ...newConfig };
        fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
        res.json({ message: "Configuration updated successfully. Restart server for port changes to take effect." });
    } catch (err) {
        console.error("Error writing server config:", err);
        res.status(500).json({ error: "Failed to write server configuration" });
    }
});

const PORT = process.env.PORT || config.port;
server.listen(PORT, () => {
  console.log(`IT chat server listening on port ${PORT}`);
});
