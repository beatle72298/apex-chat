let selectedClientId = null;
let ws = null;
const clients = {}; // Store client data, including unread counts

// New DOM Elements
const clientListEl = document.getElementById("client-list");
const chatHeaderEl = document.getElementById("chat-header-text");
const chatMessagesEl = document.getElementById("chat-messages-inner");
const chatMessagesContainerEl = document.getElementById("chat-messages");
const messageInputEl = document.getElementById("message-input");
const sendButtonEl = document.getElementById("send-button");
const closeChatButton = document.getElementById("close-chat-button");

// Settings Modal Elements
const settingsButton = document.getElementById('settings-button');
const settingsModal = document.getElementById('settings-modal');
const closeButton = settingsModal.querySelector('.close-button');
const serverPortInput = document.getElementById('server-port-input');
const adminNameInput = document.getElementById('admin-name-input');
const themeSelect = document.getElementById('theme-select');
const saveServerSettingsButton = document.getElementById('save-server-settings');
const serverSettingsStatus = document.getElementById('server-settings-status');

let currentTheme = 'system';

function applyTheme(theme) {
    currentTheme = theme;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'system') {
        applyTheme('system');
    }
});

// --- Settings Modal Logic ---
settingsButton.addEventListener('click', async () => {
    // Removed restriction: Can't change settings when client is selected
    
    settingsModal.style.display = 'flex'; // Show modal
    // Fetch current config
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        serverPortInput.value = config.port;
        adminNameInput.value = config.adminName || "IT";
        themeSelect.value = config.theme || "system";
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
    const newAdminName = adminNameInput.value.trim();
    const newTheme = themeSelect.value;

    if (isNaN(newPort) || newPort <= 0) {
        serverSettingsStatus.textContent = "Please enter a valid port number.";
        serverSettingsStatus.style.color = 'red';
        return;
    }

    if (!newAdminName) {
        serverSettingsStatus.textContent = "Please enter an admin display name.";
        serverSettingsStatus.style.color = 'red';
        return;
    }

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port: newPort, adminName: newAdminName, theme: newTheme })
        });
        if (res.ok) {
            serverSettingsStatus.textContent = "Settings saved! Restart server for port changes to take effect.";
            serverSettingsStatus.style.color = 'green';
            applyTheme(newTheme);
        } else {
            const { error } = await res.json();
            serverSettingsStatus.textContent = `Error saving settings: ${error}`;
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
    chatMessagesContainerEl.scrollTop = chatMessagesContainerEl.scrollHeight; // Scroll to bottom after loading all
}

function formatMessage(text) {
    if (!text) return "";
    // Escape HTML to prevent XSS
    let formatted = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    
    // Regex for URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    formatted = formatted.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

    // Replace newlines with <br>
    return formatted.replace(/\n/g, "<br>");
}

function appendMessage(data, scroll = true) {
    // If it's not from the selected client, it's from IT/Me
    const isFromMe = data.from !== selectedClientId;

    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${isFromMe ? 'message-from-it' : 'message-from-client'}`;
    
    const date = new Date(data.timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
    
    const sender = document.createElement("div");
    sender.className = "sender-name";
    sender.textContent = isFromMe ? "Me" : data.from;

    const content = document.createElement("div");
    content.innerHTML = formatMessage(data.message);
    
    const meta = document.createElement("div");
    meta.className = "message-timestamp";
    meta.textContent = `${dateStr} ${timeStr}`;
    
    messageDiv.appendChild(sender);
    messageDiv.appendChild(content);
    messageDiv.appendChild(meta);
    
    chatMessagesEl.appendChild(messageDiv);
    if (scroll) {
        chatMessagesContainerEl.scrollTop = chatMessagesContainerEl.scrollHeight;
    }
}

function deselectClient() {
    selectedClientId = null;
    document.querySelectorAll(".client-item").forEach(el => el.classList.remove("selected"));
    chatHeaderEl.textContent = "Select a client to begin chatting";
    chatMessagesEl.innerHTML = "";
    messageInputEl.value = "";
    messageInputEl.disabled = true;
    sendButtonEl.disabled = true;
    closeChatButton.style.display = "none";
    
    // Re-enable settings button style (it's never actually disabled in code anymore)
    settingsButton.disabled = false;
    settingsButton.classList.remove("disabled");
}

closeChatButton.onclick = deselectClient;

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

    // Show close button
    closeChatButton.style.display = "block";

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

function getOSIcon(platform) {
    if (platform === "win32") return "🪟";
    if (platform === "darwin") return "🍎";
    if (platform === "linux") return "🐧";
    return "💻";
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

        const osIcon = getOSIcon(client.info.platform);

        item.innerHTML = `
            <div class="status-indicator ${client.status === 'online' ? 'status-online' : 'status-offline'}"></div>
            <div class="client-info">
                <span class="client-id">${osIcon} ${client.info.clientId}</span>
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
            // Determine which client conversation this belongs to
            // If data.to is present, it's a message from an admin TO a client
            const conversationId = data.to ? data.to : data.from;

            // If it's a message for the selected client, append it
            if (conversationId === selectedClientId) {
                appendMessage(data);
            } else {
                // Otherwise, increment unread and update list (only if it's from a client)
                if (clients[conversationId] && !data.to) {
                    clients[conversationId].unread = (clients[conversationId].unread || 0) + 1;
                    // Re-render the specific client item to show badge
                    const clientItem = document.querySelector(`[data-client-id="${conversationId}"]`);
                    if(clientItem) {
                        const badge = clientItem.querySelector('.unread-badge');
                        if (badge) {
                            badge.textContent = clients[conversationId].unread;
                        } else {
                            const newBadge = document.createElement('div');
                            newBadge.className = 'unread-badge';
                            newBadge.textContent = clients[conversationId].unread;
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

messageInputEl.addEventListener('input', () => {
    messageInputEl.style.height = 'auto';
    messageInputEl.style.height = (messageInputEl.scrollHeight) + 'px';
});

messageInputEl.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
        messageInputEl.style.height = 'auto'; // Reset height after sending
    }
};

connect();

// Load initial theme
fetch('/api/config')
    .then(res => res.json())
    .then(config => {
        applyTheme(config.theme || 'system');
    })
    .catch(err => console.error("Error loading initial theme:", err));
