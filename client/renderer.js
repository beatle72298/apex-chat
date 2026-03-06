const chatLog = document.getElementById("chat-log");
const replyBox = document.getElementById("reply");
const sendBtn = document.getElementById("send");
const settingsBtn = document.getElementById("open-settings");
const attachBtn = document.getElementById("attach-btn");
const typingIndicator = document.getElementById("typing-indicator");
const notificationSound = document.getElementById("notification-sound");

let typingTimeout;
let isTyping = false;
let secretKey = '';
let cryptoKey = null;
let soundEnabled = true;
let serverUrl = '';

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

function applyTheme(theme) {
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

// Handle initial theme and key
window.electronAPI.onCurrentConfig(async (_event, config) => {
  applyTheme(config.theme || 'system');
  serverUrl = config.serverUrl || 'http://localhost:3000';
  secretKey = config.secretKey || "";
  soundEnabled = config.soundEnabled !== false;
  cryptoKey = await deriveKey(secretKey);
});
window.electronAPI.getConfig();

// Handle theme changes
window.electronAPI.onThemeChanged((_event, theme) => {
  applyTheme(theme);
});

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  // Only re-apply if we are in system mode
  window.electronAPI.onCurrentConfig((_event, config) => {
    if ((config.theme || 'system') === 'system') {
      applyTheme('system');
    }
  });
  window.electronAPI.getConfig();
});

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
    return `<a href="${url}" class="chat-link">${url}</a>`;
  });

  // Replace newlines with <br>
  return formatted.replace(/\n/g, "<br>");
}

// Global click handler to intercept links and open via Electron shell
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('chat-link') || e.target.tagName === 'A' && e.target.closest('.msg')) {
    e.preventDefault();
    const url = e.target.href || e.target.textContent;
    window.electronAPI.openLink(url);
  }
});

async function appendMessage(from, message, isMe = false, encrypted = false, iv = null, fileUrl = null, fileName = null, fileType = null) {
  const div = document.createElement("div");
  div.className = "msg " + (isMe ? "msg-me" : "msg-it");
  
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear().toString().slice(-2)}`;
  
  const sender = document.createElement("div");
  sender.className = "sender-name";
  sender.textContent = isMe ? "Me" : from;

  const content = document.createElement("div");
  let messageText = message;
  if (encrypted && iv) {
      messageText = await decrypt(message, iv);
  }
  
  if (messageText) {
    const textSpan = document.createElement("div");
    textSpan.innerHTML = formatMessage(messageText);
    content.appendChild(textSpan);
  }

  if (fileUrl) {
    const fileContainer = document.createElement("div");
    fileContainer.className = "attachment-container";
    fileContainer.style.marginTop = "8px";

    const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${serverUrl}${fileUrl}`;

    if (fileType && fileType.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = fullUrl;
        img.className = "chat-image";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "8px";
        img.style.cursor = "pointer";
        img.onclick = () => window.electronAPI.openLink(fullUrl);
        fileContainer.appendChild(img);
    }

    const fileLink = document.createElement("a");
    fileLink.href = "#"; // Prevent default
    fileLink.className = "file-download-link";
    fileLink.style.display = "block";
    fileLink.style.marginTop = "4px";
    fileLink.style.fontSize = "0.85em";
    fileLink.style.color = isMe ? "#fff" : "inherit";
    fileLink.innerHTML = `📎 ${fileName || 'Download File'}`;
    fileLink.onclick = (e) => {
        e.preventDefault();
        window.electronAPI.openLink(fullUrl);
    };
    fileContainer.appendChild(fileLink);
    
    content.appendChild(fileContainer);
  }
  
  const meta = document.createElement("span");
  meta.className = "timestamp";
  meta.textContent = `${dateStr} ${timeStr}`;
  
  div.appendChild(sender);
  div.appendChild(content);
  div.appendChild(meta);
  
  chatLog.insertBefore(div, typingIndicator);
  chatLog.scrollTop = chatLog.scrollHeight;
}

window.electronAPI.onIncomingMessage(async (_event, data) => {
  await appendMessage(data.from || "IT", data.message, false, data.encrypted, data.iv, data.fileUrl, data.fileName, data.fileType);
  typingIndicator.style.display = 'none';
  
  if (soundEnabled && notificationSound) {
      notificationSound.currentTime = 0;
      notificationSound.play().catch(e => console.log("Sound play error:", e));
  }
});

// Handle incoming typing status
window.electronAPI.onTypingStatus((_event, isTyping) => {
    typingIndicator.style.display = isTyping ? 'flex' : 'none';
    if (isTyping) {
        chatLog.scrollTop = chatLog.scrollHeight;
    }
});

async function sendMessage() {
  const text = replyBox.value.trim();
  if (!text) return;
  
  const encryptedData = await encrypt(text);
  window.electronAPI.sendReply({
      message: encryptedData.message,
      encrypted: encryptedData.encrypted,
      iv: encryptedData.iv
  });
  
  await appendMessage("Me", text, true);
  replyBox.value = "";
  replyBox.style.height = 'auto';

  // Stop typing status
  isTyping = false;
  window.electronAPI.sendTypingStatus(false);
  clearTimeout(typingTimeout);
}

attachBtn.onclick = async () => {
    const fileResult = await window.electronAPI.selectFile();
    if (!fileResult) return;

    const { name, data } = fileResult;
    const blob = new Blob([data]);
    const formData = new FormData();
    formData.append("file", blob, name);

    try {
        const res = await fetch(`${serverUrl}/api/upload`, {
            method: "POST",
            body: formData
        });
        if (res.ok) {
            const fileData = await res.json();
            // Send as a message with file info
            window.electronAPI.sendReply({
                message: "",
                encrypted: false,
                fileUrl: fileData.url,
                fileName: fileData.fileName,
                fileType: fileData.fileType
            });
            await appendMessage("Me", "", true, false, null, fileData.url, fileData.fileName, fileData.fileType);
        }
    } catch (err) {
        console.error("File upload failed:", err);
        alert("File upload failed.");
    }
};

sendBtn.onclick = sendMessage;

settingsBtn.onclick = () => {
  window.electronAPI.openSettings();
};

// Auto-resize textarea and handle typing status
replyBox.addEventListener('input', () => {
  replyBox.style.height = 'auto';
  replyBox.style.height = (replyBox.scrollHeight) + 'px';

  if (!isTyping) {
      isTyping = true;
      window.electronAPI.sendTypingStatus(true);
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
      isTyping = false;
      window.electronAPI.sendTypingStatus(false);
  }, 3000);
});

// Enter to send, Shift+Enter for new line
replyBox.onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};
