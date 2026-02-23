const { ipcRenderer } = require('electron');

const serverUrlInput = document.getElementById('serverUrl');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

// 1. When the window loads, request the current config from the main process
document.addEventListener('DOMContentLoaded', () => {
    ipcRenderer.send('get-config');
});

// 2. Listen for the main process to send the current config
ipcRenderer.on('current-config', (event, config) => {
    serverUrlInput.value = config.serverUrl;
});

// 3. When the save button is clicked, send the new data to the main process
saveBtn.addEventListener('click', () => {
    const newUrl = serverUrlInput.value.trim();
    if (newUrl) {
        ipcRenderer.send('save-config', { serverUrl: newUrl });
        statusEl.textContent = 'Settings saved. Restarting connection...';
        // The main process will handle the actual save and restart
        setTimeout(() => {
            statusEl.textContent = '';
        }, 3000);
    } else {
        alert('Server URL cannot be empty.');
    }
});
