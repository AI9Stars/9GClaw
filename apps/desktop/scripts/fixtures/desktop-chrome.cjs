// Isolated native smoke host: no real PilotDeck runtime, profile or user files.
const { app, BrowserWindow, ipcMain, Menu, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { isRendererEditingShortcut, windowChromeOptions, windowPalette, WINDOWS_CAPTION_HEIGHT } = require('../../dist/windowChrome');
const { buildApplicationMenu } = require('../../dist/applicationMenu');
const { normalizeMenuState, emptyMenuState, commandEnabled } = require('../../dist/desktopCommands');
const profile = process.env.PILOTDECK_CHROME_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'pilotdeck-chrome-'));
app.setPath('userData', profile);
app.setName('PilotDeck Chrome Test');
let window;
let state = { ...emptyMenuState };
let appearance = { language: 'en', themeMode: 'dark' };
let checks = 0;
let menuRequests = [];
let popupMenu;
function menuTemplate() {
  return buildApplicationMenu(process.platform, appearance.language, undefined, {
    state, dispatch: command => { if (commandEnabled(command, state)) window.webContents.send('pilotdeck:command', command); },
  });
}
function refresh() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate()));
  if (process.platform === 'win32' && window) window.setMenuBarVisibility(false);
}
function publish() {
  if (!window) return;
  const fullscreen = window.isFullScreen();
  window.setBackgroundColor(windowPalette(nativeTheme.shouldUseDarkColors).background);
  if (process.platform === 'win32' && !fullscreen) window.setTitleBarOverlay({
    color: windowPalette(nativeTheme.shouldUseDarkColors).caption,
    symbolColor: windowPalette(nativeTheme.shouldUseDarkColors).symbol, height: WINDOWS_CAPTION_HEIGHT,
  });
  window.webContents.send('pilotdeck:window-state', { fullscreen, dark: nativeTheme.shouldUseDarkColors });
}
ipcMain.on('pilotdeck:get-appearance', e => { e.returnValue = appearance; });
ipcMain.on('pilotdeck:get-window-state', e => { e.returnValue = { fullscreen: window.isFullScreen(), dark: nativeTheme.shouldUseDarkColors }; });
ipcMain.handle('pilotdeck:set-appearance', (_e, value) => { appearance = value; nativeTheme.themeSource = value.themeMode; publish(); refresh(); });
ipcMain.handle('pilotdeck:menu-state', (_e, value) => { state = normalizeMenuState(value); refresh(); });
ipcMain.handle('pilotdeck:get-runtime-info', () => null);
ipcMain.handle('pilotdeck:update-check', () => { checks++; return { current: { version: '0.1.0-test' }, latest: null, hasUpdate: false, canDownload: false, checkUnavailable: false }; });
ipcMain.handle('pilotdeck:update-status', () => ({ state: 'idle', progress: 0 }));
ipcMain.handle('pilotdeck:show-menu', (_e, request) => {
  menuRequests.push(request || { id: 'all' });
  const template = menuTemplate();
  const menu = Menu.buildFromTemplate(request?.id ? template.find(item => item.id === request.id).submenu : template);
  popupMenu = menu;
  return new Promise(resolve => menu.popup({ window, x: Math.round((request?.x || 12) * window.webContents.getZoomFactor()), y: window.isFullScreen() ? 0 : WINDOWS_CAPTION_HEIGHT, callback: resolve }));
});
nativeTheme.on('updated', publish);
global.chromeTest = { state: () => state, checks: () => checks, menuRequests: () => menuRequests, closeMenu: () => popupMenu?.closePopup(window), refreshMenu: refresh };
app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  window = new BrowserWindow({ ...windowChromeOptions(process.platform, true), show: false, width: 1320, height: 900,
    webPreferences: { preload: path.resolve(__dirname, '../../dist/preload.js'), contextIsolation: true, sandbox: false, nodeIntegration: false },
  });
  window.once('ready-to-show', () => window.show());
  window.on('enter-full-screen', () => setImmediate(publish));
  window.on('leave-full-screen', () => setImmediate(publish));
  window.webContents.on('before-input-event', (_event, input) => {
    window.webContents.setIgnoreMenuShortcuts(isRendererEditingShortcut(process.platform, input));
  });
  refresh();
  await window.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
// The parent removes its temporary profile after Chromium releases Windows locks.
