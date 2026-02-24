const chatLog = document.getElementById("chat-log");
const replyBox = document.getElementById("reply");
const sendBtn = document.getElementById("send");
const settingsBtn = document.getElementById("open-settings");

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

function appendMessage(from, message, isMe = false) {
  const div = document.createElement("div");
  div.className = "msg " + (isMe ? "msg-me" : "msg-it");
  
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear().toString().slice(-2)}`;
  
  const sender = document.createElement("div");
  sender.className = "sender-name";
  sender.textContent = isMe ? "Me" : from;

  const content = document.createElement("div");
  content.innerHTML = formatMessage(message);
  
  const meta = document.createElement("span");
  meta.className = "timestamp";
  meta.textContent = `${dateStr} ${timeStr}`;
  
  div.appendChild(sender);
  div.appendChild(content);
  div.appendChild(meta);
  
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

window.electronAPI.onIncomingMessage((_event, data) => {
  appendMessage(data.from || "IT", data.message);
});

function sendMessage() {
  const text = replyBox.value.trim();
  if (!text) return;
  
  window.electronAPI.sendReply(text);
  appendMessage("Me", text, true);
  replyBox.value = "";
  replyBox.style.height = 'auto';
}

sendBtn.onclick = sendMessage;

settingsBtn.onclick = () => {
  window.electronAPI.openSettings();
};

// Auto-resize textarea
replyBox.addEventListener('input', () => {
  replyBox.style.height = 'auto';
  replyBox.style.height = (replyBox.scrollHeight) + 'px';
});

// Enter to send, Shift+Enter for new line
replyBox.onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};
