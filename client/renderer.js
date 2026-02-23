const msgDiv = document.getElementById("msg");
const replyBox = document.getElementById("reply");
const sendBtn = document.getElementById("send");

window.electronAPI.onIncomingMessage((_event, data) => {
  msgDiv.textContent = `${data.from || "IT"}: ${data.message}`;
});

sendBtn.onclick = () => {
  const text = replyBox.value.trim();
  if (!text) return;
  window.electronAPI.sendReply(text);
  replyBox.value = "";
};