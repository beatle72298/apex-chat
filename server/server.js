const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map(); // clientId -> { ws, info }
const admins = new Set(); // Set of admin WebSockets

function broadcastClientList() {
  const payload = JSON.stringify({
    type: "client_list",
    clients: Array.from(clients.values()).map(c => c.info),
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
        clients.set(clientId, {
          ws,
          info: {
            clientId,
            hostname: data.hostname,
            username: data.username,
            platform: data.platform,
            lastSeen: new Date().toISOString(),
          },
        });
        console.log(`Client registered: ${clientId}`);
        broadcastClientList();
      } else if (data.type === "chat_message") {
        console.log(`Message from ${clientId}: ${data.message}`);
        // Forward client message to all admins
        const payload = JSON.stringify({
          type: "incoming_message",
          from: clientId,
          message: data.message,
          timestamp: new Date().toISOString(),
        });
        for (const adminWs of admins) {
          if (adminWs.readyState === WebSocket.OPEN) {
            adminWs.send(payload);
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
    } else if (clientId && clients.has(clientId)) {
      console.log(`Client disconnected: ${clientId}`);
      clients.delete(clientId);
      broadcastClientList();
    }
  });
});

// REST endpoint to send a message to a client
app.post("/api/send", (req, res) => {
  const { clientId, message } = req.body;
  const client = clients.get(clientId);
  if (!client) {
    return res.status(404).json({ error: "Client not connected" });
  }
  const payload = JSON.stringify({
    type: "incoming_message",
    message,
    from: "IT",
    timestamp: new Date().toISOString(),
  });
  client.ws.send(payload);

  // Broadcast the outgoing message to all admins so they see it in their UI
  const adminPayload = JSON.stringify({
    type: "incoming_message",
    from: "IT",
    to: clientId,
    message,
    timestamp: new Date().toISOString(),
  });
  for (const adminWs of admins) {
    if (adminWs.readyState === WebSocket.OPEN) {
      adminWs.send(adminPayload);
    }
  }

  res.json({ ok: true });
});

// REST endpoint to list clients
app.get("/api/clients", (req, res) => {
  res.json(
    Array.from(clients.values()).map((c) => c.info)
  );
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`IT chat server listening on port ${PORT}`);
});
