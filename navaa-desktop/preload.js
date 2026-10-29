const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Android', {
  setState: (phase, breakUsed, mins) => {
    ipcRenderer.send('state', phase, !!breakUsed, Number(mins) || 0);
  }
});

contextBridge.exposeInMainWorld('navaa', {
  act: (action) => ipcRenderer.send('act', action)
});

