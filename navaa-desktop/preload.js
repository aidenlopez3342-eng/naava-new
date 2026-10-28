const { contextBridge, ipcRenderer } = require('electron');

// Lets the NAVAA website tell this app what the focus timer is doing.
contextBridge.exposeInMainWorld('Android', {
  setState: (phase, breakUsed, mins) => ipcRenderer.send('state', phase, !!breakUsed, mins | 0)
});

// Used by the popup buttons.
contextBridge.exposeInMainWorld('navaa', {
  act: (a) => ipcRenderer.send('act', a)
});
