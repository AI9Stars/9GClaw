// Keep production chrome in use; fixture-only controls travel over ordinary IPC.
require('../../dist/preload.js');
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ninegclawChromeFixture', {
  closeMenu: () => ipcRenderer.invoke('9gclaw:chrome-close-menu'),
});
