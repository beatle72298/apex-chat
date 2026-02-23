const chatLog = document.getElementById("chat-log");
const replyBox = document.getElementById("reply");
const sendBtn = document.getElementById("send");

function appendMessage(from, message, isMe = false) {
  const div = document.createElement("div");
  div.className = "msg " + (isMe ? "msg-me" : "msg-it");
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const meta = document.createElement("span");
  meta.innerHTML = `<span class="timestamp">[${time}]</span> <strong>${from}:</strong> `;
  
  const text = document.createElement("span");
  text.textContent = message;
  
  div.appendChild(meta);
  div.appendChild(text);
  
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
}

sendBtn.onclick = sendMessage;

// Enter to send, Shift+Enter for new line
replyBox.onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};
