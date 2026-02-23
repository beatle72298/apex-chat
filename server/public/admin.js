let selectedClientId = null;
let ws = null;

const chatLog = document.getElementById("chat-log");
const clientsContainer = document.getElementById("clients");
const messageInput = document.getElementById("message");
const sendBtn = document.getElementById("send");

function appendMessage(data) {
  const div = document.createElement("div");
  div.className = "msg " + (data.from === "IT" ? "msg-it" : "msg-client");
  
  const time = new Date(data.timestamp).toLocaleTimeString();
  const fromLabel = data.from === "IT" ? `IT -> ${data.to || 'Client'}` : `${data.from} -> IT`;
  
  div.innerHTML = `<span class="timestamp">[${time}]</span> <strong>${fromLabel}:</strong> ${data.message}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateClientList(clients) {
  clientsContainer.innerHTML = "";
  clients.forEach(c => {
    const div = document.createElement("div");
    div.className = "client" + (selectedClientId === c.clientId ? " selected" : "");
    div.textContent = `${c.hostname} (${c.username}) - ${c.platform}`;
    div.onclick = () => {
      selectedClientId = c.clientId;
      document.querySelectorAll(".client").forEach(el => el.classList.remove("selected"));
      div.classList.add("selected");
    };
    clientsContainer.appendChild(div);
  });
}

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    console.log("Connected to server as admin");
    ws.send(JSON.stringify({ type: "register", role: "admin" }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "client_list") {
        updateClientList(data.clients);
      } else if (data.type === "incoming_message") {
        appendMessage(data);
      }
    } catch (err) {
      console.error("Error parsing message", err);
    }
  };

  ws.onclose = () => {
    console.log("Disconnected, retrying...");
    setTimeout(connect, 3000);
  };
}

sendBtn.onclick = async () => {
  const msg = messageInput.value.trim();
  if (!selectedClientId || !msg) {
    if (!selectedClientId) alert("Please select a client first.");
    return;
  }
  
  const res = await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: selectedClientId, message: msg })
  });
  
  if (res.ok) {
    messageInput.value = "";
  } else {
    const errorData = await res.json();
    alert("Error: " + (errorData.error || "Failed to send message"));
  }
};

// Enter key to send
messageInput.onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
};

connect();
