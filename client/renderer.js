const chatLog = document.getElementById("chat-log");
const replyBox = document.getElementById("reply");
const sendBtn = document.getElementById("send");

function appendMessage(from, message, isMe = false) {
  const div = document.createElement("div");
  div.className = "msg " + (isMe ? "msg-me" : "msg-it");
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Replace newlines with <br> for HTML display
  const formattedMessage = message.replace(/\n/g, '<br>');
  
  div.innerHTML = `<span class="timestamp">[${time}]</span> <strong>${from}:</strong> ${formattedMessage}`;
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
