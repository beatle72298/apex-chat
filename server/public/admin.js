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
const attachButtonEl = document.getElementById("attach-button");
const fileInputEl = document.getElementById("file-input");
const closeChatButton = document.getElementById("close-chat-button");
const clientSearchInput = document.getElementById("client-search");
const chatHeaderMetadata = document.getElementById("chat-header-metadata");
const clientNicknameInput = document.getElementById("client-nickname-input");
const clientTagsInput = document.getElementById("client-tags-input");
const saveMetadataButton = document.getElementById("save-metadata-button");
const filterDropdownToggle = document.getElementById("filter-dropdown-toggle");
const filterMenu = document.getElementById("filter-menu");
const tagFilterSection = document.getElementById("tag-filter-section");
const clearFiltersButton = document.getElementById("clear-filters-button");

// Settings Modal Elements
const settingsButton = document.getElementById('settings-button');
const settingsModal = document.getElementById('settings-modal');
const closeButton = settingsModal.querySelector('.close-button');
const serverPortInput = document.getElementById('server-port-input');
const adminNameInput = document.getElementById('admin-name-input');
const secretKeyInput = document.getElementById('secret-key-input');
const themeSelect = document.getElementById('theme-select');
const saveServerSettingsButton = document.getElementById('save-server-settings');
const serverSettingsStatus = document.getElementById('server-settings-status');
const soundToggle = document.getElementById('sound-toggle');
const notificationSound = document.getElementById('notification-sound');
const testSoundButton = document.getElementById('test-sound-button');

let currentTheme = 'system';
let secretKey = '';
let cryptoKey = null;
let soundEnabled = true;

if (testSoundButton) {
    testSoundButton.onclick = (e) => {
        e.preventDefault();
        if (notificationSound) {
            notificationSound.currentTime = 0;
            notificationSound.play().catch(err => console.log("Sound test error:", err));
        }
    };
}

let typingTimeout;
let isTyping = false;
let searchTerm = '';
let allClients = [];
let osFilters = [];
let tagFilters = [];

async function deriveKey(secret) {
    if (!secret) return null;
    const encoder = new TextEncoder();
    const data = encoder.encode(secret);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return await crypto.subtle.importKey(
        'raw', 
        hash, 
        { name: 'AES-GCM' }, 
        false, 
        ['encrypt', 'decrypt']
    );
}

async function encrypt(text) {
    if (!cryptoKey) return { encrypted: false, message: text };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        cryptoKey,
        encoder.encode(text)
    );
    return {
        encrypted: true,
        message: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

async function decrypt(encryptedData, ivStr) {
    if (!cryptoKey || !encryptedData || !ivStr) return encryptedData;
    try {
        const iv = new Uint8Array(atob(ivStr).split('').map(c => c.charCodeAt(0)));
        const data = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            cryptoKey,
            data
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error("Decryption failed:", e);
        return "[Decryption failed]";
    }
}

function getTypingIndicator() {
    return document.getElementById("typing-indicator");
}

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
        secretKeyInput.value = config.secretKey || "";
        themeSelect.value = config.theme || "system";
        soundToggle.checked = config.soundEnabled !== false;
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
    const newSecretKey = secretKeyInput.value.trim();
    const newTheme = themeSelect.value;
    const newSoundEnabled = soundToggle.checked;

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
            body: JSON.stringify({ 
                port: newPort, 
                adminName: newAdminName, 
                secretKey: newSecretKey,
                theme: newTheme,
                soundEnabled: newSoundEnabled
            })
        });
        if (res.ok) {
            serverSettingsStatus.textContent = "Settings saved! Restart server for port changes to take effect.";
            serverSettingsStatus.style.color = 'green';
            applyTheme(newTheme);
            
            // Update local state
            soundEnabled = newSoundEnabled;
            secretKey = newSecretKey;
            cryptoKey = await deriveKey(secretKey);
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


async function renderMessages(messages) {
    // Clear everything but keep/recreate typing indicator at the end
    chatMessagesEl.innerHTML = `
        <div id="typing-indicator" class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    const indicator = document.getElementById("typing-indicator");
    indicator.style.display = "none";

    for (const msg of messages) {
        // We append BEFORE the indicator
        await appendMessage(msg, false, indicator);
    }
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

async function appendMessage(data, scroll = true, beforeElement = null) {
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
    let messageText = data.message;
    if (data.encrypted) {
        messageText = await decrypt(data.message, data.iv);
    }
    
    // Add text content
    if (messageText) {
        const textSpan = document.createElement("div");
        textSpan.innerHTML = formatMessage(messageText);
        content.appendChild(textSpan);
    }

    // Add file attachment if present
    if (data.fileUrl) {
        const fileContainer = document.createElement("div");
        fileContainer.className = "attachment-container";
        fileContainer.style.marginTop = "8px";

        if (data.fileType && data.fileType.startsWith("image/")) {
            const img = document.createElement("img");
            img.src = data.fileUrl;
            img.className = "chat-image";
            img.style.maxWidth = "100%";
            img.style.borderRadius = "8px";
            img.style.cursor = "pointer";
            img.onclick = () => window.open(data.fileUrl, '_blank');
            fileContainer.appendChild(img);
        }

        const fileLink = document.createElement("a");
        fileLink.href = data.fileUrl;
        fileLink.download = data.fileName || "attachment";
        fileLink.className = "file-download-link";
        fileLink.style.display = "block";
        fileLink.style.marginTop = "4px";
        fileLink.style.fontSize = "0.85em";
        fileLink.innerHTML = `📎 ${data.fileName || 'Download File'}`;
        fileContainer.appendChild(fileLink);
        
        content.appendChild(fileContainer);
    }
    
    const meta = document.createElement("div");
    meta.className = "message-timestamp";
    meta.textContent = `${dateStr} ${timeStr}`;
    
    messageDiv.appendChild(sender);
    messageDiv.appendChild(content);
    messageDiv.appendChild(meta);
    
    const indicator = beforeElement || document.getElementById("typing-indicator");
    if (indicator) {
        chatMessagesEl.insertBefore(messageDiv, indicator);
    } else {
        chatMessagesEl.appendChild(messageDiv);
    }

    if (scroll) {
        chatMessagesContainerEl.scrollTop = chatMessagesContainerEl.scrollHeight;
    }
}

attachButtonEl.onclick = () => {
    if (selectedClientId) fileInputEl.click();
};

fileInputEl.onchange = async () => {
    if (!fileInputEl.files.length || !selectedClientId) return;
    const file = fileInputEl.files[0];
    
    const formData = new FormData();
    formData.append("file", file);

    try {
        console.log("Uploading file:", file.name);
        const res = await fetch("/api/upload", {
            method: "POST",
            body: formData
        });
        
        if (res.ok) {
            const fileData = await res.json();
            console.log("Upload successful:", fileData.url);
            
            // Send file message via WebSocket for consistency and to bypass REST auth issues
            if (ws && ws.readyState === WebSocket.OPEN) {
                const payload = {
                    type: "chat_message",
                    message: "",
                    to: selectedClientId,
                    encrypted: false,
                    fileUrl: fileData.url,
                    fileName: fileData.fileName,
                    fileType: fileData.fileType
                };
                ws.send(JSON.stringify(payload));
                
                // Locally append the message so the sender sees it immediately
                await appendMessage({
                    from: "Me",
                    ...payload,
                    timestamp: new Date().toISOString()
                });
            }
            fileInputEl.value = ""; // Clear for next use
        } else {
            const errorData = await res.json();
            throw new Error(errorData.error || "Upload failed");
        }
    } catch (err) {
        console.error("File upload failed:", err);
        alert("File upload failed: " + err.message);
    }
};

function deselectClient() {
    selectedClientId = null;
    document.querySelectorAll(".client-item").forEach(el => el.classList.remove("selected"));
    chatHeaderEl.textContent = "Select a client to begin chatting";
    chatHeaderMetadata.style.display = "none";
    chatMessagesEl.innerHTML = `
        <div id="typing-indicator" class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
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
        
        // Show and populate metadata
        chatHeaderMetadata.style.display = "flex";
        clientNicknameInput.value = client.nickname || "";
        clientTagsInput.value = (client.tags || []).join(", ");
    }

    // Show close button
    closeChatButton.style.display = "block";

    // Enable inputs
    messageInputEl.disabled = false;
    sendButtonEl.disabled = false;

    // Fetch and render history
    try {
        const res = await fetch(`/api/history/${encodeURIComponent(clientId)}`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const history = await res.json();
        if (!Array.isArray(history)) throw new Error('History data is not an array');
        renderMessages(history);
    } catch (err) {
        console.error("Error fetching history:", err);
        chatMessagesEl.innerHTML = `<div style="padding: 20px; color: red;">Error loading messages: ${err.message}</div>`;
    }
}

function getOSIcon(platform) {
    if (platform === "win32") return "🪟";
    if (platform === "darwin") return "🍎";
    if (platform === "linux") return "🐧";
    return "💻";
}

function renderClientList(clientData) {
    if (clientData) allClients = clientData;
    clientListEl.innerHTML = "";

    // Update dynamic tag filters in the menu
    updateTagFilterMenu();

    const filtered = allClients.filter(c => {
        const query = searchTerm.toLowerCase();
        const nickname = (c.nickname || "").toLowerCase();
        const id = c.info.clientId.toLowerCase();
        const hostname = c.info.hostname.toLowerCase();
        const clientTags = (c.tags || []);
        const clientTagsStr = clientTags.join(" ").toLowerCase();
        
        // Text Search
        const matchesSearch = id.includes(query) || nickname.includes(query) || hostname.includes(query) || clientTagsStr.includes(query);
        
        // OS Filter
        const matchesOS = osFilters.length === 0 || osFilters.includes(c.info.platform);
        
        // Tags Filter (AND logic - must have all selected tags)
        const matchesTags = tagFilters.length === 0 || tagFilters.every(t => clientTags.includes(t));

        return matchesSearch && matchesOS && matchesTags;
    });

    // Show/Hide Clear button
    clearFiltersButton.style.display = (searchTerm || osFilters.length > 0 || tagFilters.length > 0) ? "block" : "none";

    filtered.forEach(c => {
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
        const tagsHtml = (client.tags || []).map(t => `<span class="tag-pill">${t}</span>`).join("");

        item.innerHTML = `
            <div class="status-indicator ${client.status === 'online' ? 'status-online' : 'status-offline'}"></div>
            <div class="client-info">
                ${client.nickname ? `<div class="client-nickname">${client.nickname}</div>` : ''}
                <span class="client-id">${osIcon} ${client.info.clientId}</span>
                <span class="client-details">${client.info.username} on ${client.info.hostname}</span>
                <div class="client-tags-display">${tagsHtml}</div>
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

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "client_list") {
            renderClientList(data.clients);
        } else if (data.type === "incoming_message") {
            // Determine which client conversation this belongs to
            // If data.to is present, it's a message from an admin TO a client
            const conversationId = data.to ? data.to : data.from;

            // If it's a message for the selected client, append it
            if (conversationId === selectedClientId) {
                await appendMessage(data);
                const indicator = getTypingIndicator();
                if (indicator) indicator.style.display = 'none';
            }

            // Play sound for incoming client message
            if (!data.to && soundEnabled && notificationSound) {
                notificationSound.currentTime = 0;
                notificationSound.play().catch(e => console.log("Sound play error:", e));
            }

            // If it's NOT the selected client, increment unread and update list
            if (conversationId !== selectedClientId) {
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
        } else if (data.type === "typing") {
            if (data.from === selectedClientId) {
                const indicator = getTypingIndicator();
                if (indicator) {
                    indicator.style.display = data.isTyping ? 'flex' : 'none';
                    if (data.isTyping) {
                        chatMessagesContainerEl.scrollTop = chatMessagesContainerEl.scrollHeight;
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
        const encryptedData = await encrypt(msg);
        
        // Use WebSocket for consistency and to bypass REST auth issues
        if (ws && ws.readyState === WebSocket.OPEN) {
            const payload = {
                type: "chat_message",
                to: selectedClientId,
                message: encryptedData.message,
                encrypted: encryptedData.encrypted,
                iv: encryptedData.iv
            };
            ws.send(JSON.stringify(payload));
            
            // Locally append the message so the sender sees it immediately
            await appendMessage({
                from: "Me",
                ...payload,
                timestamp: new Date().toISOString()
            });

            messageInputEl.value = "";
            isTyping = false;
            ws.send(JSON.stringify({ type: "typing", isTyping: false, to: selectedClientId }));
            clearTimeout(typingTimeout);
        } else {
            alert("Connection lost. Reconnecting...");
        }
    } catch (err) {
        console.error("Failed to send message:", err);
        alert("Failed to send message.");
    }
}

sendButtonEl.onclick = sendMessage;

messageInputEl.addEventListener('input', () => {
    messageInputEl.style.height = 'auto';
    messageInputEl.style.height = (messageInputEl.scrollHeight) + 'px';

    if (selectedClientId && !isTyping) {
        isTyping = true;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "typing", isTyping: true, to: selectedClientId }));
        }
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "typing", isTyping: false, to: selectedClientId }));
        }
    }, 3000);
});

messageInputEl.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
        messageInputEl.style.height = 'auto'; // Reset height after sending
    }
};

connect();

function updateTagFilterMenu() {
    const allAvailableTags = [...new Set(allClients.flatMap(c => c.tags || []))].sort();
    
    // Preserve current content but update labels/checks
    tagFilterSection.innerHTML = "<strong>Tags</strong>";
    if (allAvailableTags.length === 0) {
        tagFilterSection.innerHTML += '<div style="font-size: 0.7em; color: #888; padding: 5px;">No tags available</div>';
        return;
    }

    allAvailableTags.forEach(tag => {
        const label = document.createElement("label");
        const isChecked = tagFilters.includes(tag);
        label.innerHTML = `<input type="checkbox" class="tag-filter" value="${tag}" ${isChecked ? 'checked' : ''}> ${tag}`;
        tagFilterSection.appendChild(label);
    });
}

// Global click handler to close dropdown when clicking outside
window.addEventListener('click', (event) => {
    if (!event.target.matches('#filter-dropdown-toggle') && !filterMenu.contains(event.target)) {
        filterMenu.classList.remove('show');
    }
});

filterDropdownToggle.onclick = () => {
    filterMenu.classList.toggle('show');
};

// Handle filter changes via delegation
filterMenu.addEventListener('change', (e) => {
    if (e.target.classList.contains('os-filter')) {
        osFilters = Array.from(document.querySelectorAll('.os-filter:checked')).map(cb => cb.value);
    }
    if (e.target.classList.contains('tag-filter')) {
        tagFilters = Array.from(document.querySelectorAll('.tag-filter:checked')).map(cb => cb.value);
    }
    renderClientList();
});

clearFiltersButton.onclick = () => {
    searchTerm = '';
    clientSearchInput.value = '';
    osFilters = [];
    tagFilters = [];
    document.querySelectorAll('.os-filter, .tag-filter').forEach(cb => cb.checked = false);
    renderClientList();
};

clientSearchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderClientList();
});

saveMetadataButton.onclick = async () => {
    if (!selectedClientId) return;
    
    const nickname = clientNicknameInput.value.trim();
    const tags = clientTagsInput.value.split(',').map(t => t.trim()).filter(t => t !== "");

    try {
        const res = await fetch(`/api/clients/${encodeURIComponent(selectedClientId)}/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, tags })
        });
        if (res.ok) {
            // Update local state and re-render list
            if (clients[selectedClientId]) {
                clients[selectedClientId].nickname = nickname;
                clients[selectedClientId].tags = tags;
            }
            // Update allClients as well for persistence in this session
            const clientIdx = allClients.findIndex(c => c.info.clientId === selectedClientId);
            if (clientIdx !== -1) {
                allClients[clientIdx].nickname = nickname;
                allClients[clientIdx].tags = tags;
            }
            renderClientList();
        }
    } catch (err) {
        console.error("Error saving metadata:", err);
    }
};

// Load initial theme and secret key
fetch('/api/config')
    .then(res => res.json())
    .then(async config => {
        applyTheme(config.theme || 'system');
        secretKey = config.secretKey || "";
        soundEnabled = config.soundEnabled !== false;
        cryptoKey = await deriveKey(secretKey);
    })
    .catch(err => console.error("Error loading initial config:", err));
