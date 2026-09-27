// Isolated native smoke host: no real PilotDeck runtime, profile or user files.
const { app, BrowserWindow, ipcMain, Menu, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { isRendererEditingShortcut, windowChromeOptions, windowPalette } = require('../../dist/windowChrome');
const { buildApplicationMenu } = require('../../dist/applicationMenu');
const { normalizeMenuState, emptyMenuState, commandEnabled } = require('../../dist/desktopCommands');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pilotdeck-chrome-'));
app.setPath('userData', profile);
app.setName('PilotDeck Chrome Test');
let window;
let state = { ...emptyMenuState };
let appearance = { language: 'en', themeMode: 'dark' };
let checks = 0;
function refresh() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildApplicationMenu(process.platform, appearance.language, undefined, {
    state, dispatch: command => { if (commandEnabled(command, state)) window.webContents.send('pilotdeck:command', command); },
  })));
}
function publish() {
  if (!window) return;
  window.setBackgroundColor(windowPalette(nativeTheme.shouldUseDarkColors).background);
  window.webContents.send('pilotdeck:window-state', { fullscreen: window.isFullScreen(), dark: nativeTheme.shouldUseDarkColors });
}
ipcMain.on('pilotdeck:get-appearance', e => { e.returnValue = appearance; });
ipcMain.on('pilotdeck:get-window-state', e => { e.returnValue = { fullscreen: window.isFullScreen(), dark: nativeTheme.shouldUseDarkColors }; });
ipcMain.handle('pilotdeck:set-appearance', (_e, value) => { appearance = value; nativeTheme.themeSource = value.themeMode; publish(); refresh(); });
ipcMain.handle('pilotdeck:menu-state', (_e, value) => { state = normalizeMenuState(value); refresh(); });
ipcMain.handle('pilotdeck:get-runtime-info', () => null);
ipcMain.handle('pilotdeck:update-check', () => { checks++; return { current: { version: '0.1.0-test' }, latest: null, hasUpdate: false, canDownload: false, checkUnavailable: false }; });
ipcMain.handle('pilotdeck:update-status', () => ({ state: 'idle', progress: 0 }));
nativeTheme.on('updated', publish);
global.chromeTest = { state: () => state, checks: () => checks };
app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  window = new BrowserWindow({ ...windowChromeOptions(process.platform, true), width: 1320, height: 900,
    webPreferences: { preload: path.resolve(__dirname, '../../dist/preload.js'), contextIsolation: true, sandbox: false, nodeIntegration: false },
  });
  window.on('enter-full-screen', publish);
  window.on('leave-full-screen', publish);
  window.webContents.on('before-input-event', (_event, input) => {
    window.webContents.setIgnoreMenuShortcuts(isRendererEditingShortcut(process.platform, input));
  });
  refresh();
  await window.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
app.on('quit', () => { fs.rmSync(profile, { recursive: true, force: true }); });
