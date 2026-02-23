let selectedClientId = null;
let ws = null;
const clients = {}; // Store client data, including unread counts

// New DOM Elements
const clientListEl = document.getElementById("client-list");
const chatHeaderEl = document.getElementById("chat-header");
const chatMessagesEl = document.getElementById("chat-messages");
const messageInputEl = document.getElementById("message-input");
const sendButtonEl = document.getElementById("send-button");

// Settings Modal Elements
const settingsButton = document.getElementById('settings-button');
const settingsModal = document.getElementById('settings-modal');
const closeButton = settingsModal.querySelector('.close-button');
const serverPortInput = document.getElementById('server-port-input');
const saveServerSettingsButton = document.getElementById('save-server-settings');
const serverSettingsStatus = document.getElementById('server-settings-status');

// --- Settings Modal Logic ---
settingsButton.addEventListener('click', async () => {
    settingsModal.style.display = 'flex'; // Show modal
    // Fetch current config
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        serverPortInput.value = config.port;
    } catch (err) {
        console.error("Error fetching server config:", err);
        serverSettingsStatus.textContent = "Error fetching config.";
        serverSettingsStatus.style.color = 'red';
    }
});

closeButton.addEventListener('click', () => {
    settingsModal.style.display = 'none'; // Hide modal
    serverSettingsStatus.textContent = ''; // Clear status
});

window.addEventListener('click', (event) => {
    if (event.target === settingsModal) {
        settingsModal.style.display = 'none'; // Hide modal if clicked outside
        serverSettingsStatus.textContent = ''; // Clear status
    }
});

saveServerSettingsButton.addEventListener('click', async () => {
    const newPort = parseInt(serverPortInput.value, 10);
    if (isNaN(newPort) || newPort <= 0) {
        serverSettingsStatus.textContent = "Please enter a valid port number.";
        serverSettingsStatus.style.color = 'red';
        return;
    }

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port: newPort })
        });
        if (res.ok) {
            serverSettingsStatus.textContent = "Port saved! Please restart the server for changes to take effect.";
            serverSettingsStatus.style.color = 'green';
        } else {
            const { error } = await res.json();
            serverSettingsStatus.textContent = `Error saving port: ${error}`;
            serverSettingsStatus.style.color = 'red';
        }
    } catch (err) {
        console.error("Error saving server config:", err);
        serverSettingsStatus.textContent = "Failed to save config.";
        serverSettingsStatus.style.color = 'red';
    }
});


function renderMessages(messages) {
    chatMessagesEl.innerHTML = "";
    messages.forEach(msg => {
        appendMessage(msg, false); // Don't scroll for each message in history
    });
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight; // Scroll to bottom after loading all
}

function appendMessage(data, scroll = true) {
    const isFromIT = data.from === "IT";
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${isFromIT ? 'message-from-it' : 'message-from-client'}`;
    
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div>${data.message}</div>
        <div class="message-timestamp">${time}</div>
    `;
    
    chatMessagesEl.appendChild(messageDiv);
    if (scroll) {
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
}

async function selectClient(clientId) {
    if (selectedClientId === clientId) return;

    selectedClientId = clientId;
    
    // Update UI
    document.querySelectorAll(".client-item").forEach(el => el.classList.remove("selected"));
    const selectedEl = document.querySelector(`[data-client-id="${clientId}"]`);
    if (selectedEl) {
        selectedEl.classList.add("selected");
        const unreadBadge = selectedEl.querySelector('.unread-badge');
        if (unreadBadge) unreadBadge.remove();
    }

    const client = clients[clientId];
    if (client) {
        chatHeaderEl.textContent = `Chat with ${client.info.clientId}`;
        clients[clientId].unread = 0; // Reset unread count
    }

    // Enable inputs
    messageInputEl.disabled = false;
    sendButtonEl.disabled = false;

    // Fetch and render history
    try {
        const res = await fetch(`/api/history/${clientId}`);
        const history = await res.json();
        renderMessages(history);
    } catch (err) {
        console.error("Error fetching history:", err);
        chatMessagesEl.innerHTML = "<div>Error loading messages.</div>";
    }
}

function renderClientList(clientData) {
    clientListEl.innerHTML = "";
    clientData.forEach(c => {
        // Update local store
        if (!clients[c.info.clientId]) {
            clients[c.info.clientId] = { ...c, unread: 0 };
        } else {
            Object.assign(clients[c.info.clientId], c);
        }

        const client = clients[c.info.clientId];
        const item = document.createElement("li");
        item.className = "client-item";
        if (client.info.clientId === selectedClientId) {
            item.classList.add("selected");
        }
        item.setAttribute("data-client-id", client.info.clientId);

        item.innerHTML = `
            <div class="status-indicator ${client.status === 'online' ? 'status-online' : 'status-offline'}"></div>
            <div class="client-info">
                <span class="client-id">${client.info.clientId}</span>
                <span class="client-details">${client.info.username} on ${client.info.hostname}</span>
            </div>
            ${client.unread > 0 ? `<div class="unread-badge">${client.unread}</div>` : ''}
        `;

        item.onclick = () => selectClient(client.info.clientId);
        clientListEl.appendChild(item);
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
        const data = JSON.parse(event.data);
        if (data.type === "client_list") {
            renderClientList(data.clients);
        } else if (data.type === "incoming_message") {
            const fromId = data.from === 'IT' ? data.to : data.from;

            // If it's a message for the selected client, append it
            if (fromId === selectedClientId) {
                appendMessage(data);
            } else {
                // Otherwise, increment unread and update list
                if (clients[fromId] && data.from !== 'IT') {
                    clients[fromId].unread = (clients[fromId].unread || 0) + 1;
                    // Re-render the specific client item to show badge
                    const clientItem = document.querySelector(`[data-client-id="${fromId}"]`);
                    if(clientItem) {
                        const badge = clientItem.querySelector('.unread-badge');
                        if (badge) {
                            badge.textContent = clients[fromId].unread;
                        } else {
                            const newBadge = document.createElement('div');
                            newBadge.className = 'unread-badge';
                            newBadge.textContent = clients[fromId].unread;
                            clientItem.appendChild(newBadge);
                        }
                    }
                }
            }
        }
    };

    ws.onclose = () => {
        console.log("Disconnected, retrying...");
        setTimeout(connect, 3000);
    };
}

async function sendMessage() {
    const msg = messageInputEl.value.trim();
    if (!selectedClientId || !msg) return;

    try {
        const res = await fetch("/api/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId: selectedClientId, message: msg })
        });
        if (res.ok) {
            messageInputEl.value = "";
        } else {
            const { error } = await res.json();
            alert("Error: " + error);
        }
    } catch (err) {
        alert("Failed to send message.");
    }
}

sendButtonEl.onclick = sendMessage;
messageInputEl.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};

connect();
