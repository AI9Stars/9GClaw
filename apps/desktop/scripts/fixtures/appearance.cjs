// Real Electron/preload/image decoding and disk persistence; isolated test data.
const { app, BrowserWindow, ipcMain, nativeImage, nativeTheme, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeAppearance } = require('../../dist/appearance');
const { saveAppearancePatch, writeAppearanceImage, appearanceImagePath } = require('../../dist/appearanceStorage');
const { createFilePicker } = require('../../dist/filePicker');
const { windowPalette, windowChromeOptions, WINDOWS_CAPTION_HEIGHT } = require('../../dist/windowChrome');
const profile = process.env.NINEGCLAW_APPEARANCE_PROFILE;
if (!profile) throw new Error('An isolated profile is required');
app.setPath('userData', profile);
const read = () => {
  try { return normalizeAppearance(JSON.parse(fs.readFileSync(path.join(profile, 'appearance.json')))); }
  catch { return normalizeAppearance({ language: 'zh-CN', themeMode: 'light' }); }
};
const startupHardware = read().interfacePreferences?.hardwareAcceleration !== false;
if (!startupHardware) app.disableHardwareAcceleration();
let win;
const windowState = () => ({ dark: nativeTheme.shouldUseDarkColors, fullscreen: win?.isFullScreen() || false,
  palette: windowPalette(nativeTheme.shouldUseDarkColors, process.platform, read().lightAppearance) });
function publishWindowState() {
  if (!win || win.isDestroyed()) return;
  const state = windowState();
  win.setBackgroundColor(state.palette.background);
  if ((process.platform === 'win32' || process.platform === 'linux') && !state.fullscreen) {
    globalThis.captionOverlay = { color: state.palette.caption, symbolColor: state.palette.symbol, height: WINDOWS_CAPTION_HEIGHT };
    win.setTitleBarOverlay(globalThis.captionOverlay);
  }
  win.webContents.send('9gclaw:window-state', state);
}
nativeTheme.on('updated', publishWindowState);
ipcMain.on('9gclaw:get-appearance', e => { e.returnValue = read(); });
ipcMain.on('9gclaw:get-window-state', e => { e.returnValue = windowState(); });
ipcMain.handle('9gclaw:set-appearance', (_e, value) => {
  const next = saveAppearancePatch(profile, read(), value, 'zh-CN');
  nativeTheme.themeSource = next.themeMode;
  publishWindowState();
});
ipcMain.handle('9gclaw:save-appearance-image', (_e, bytes) => writeAppearanceImage(profile, bytes, b => nativeImage.createFromBuffer(b).getSize()));
ipcMain.handle('9gclaw:read-appearance-image', (_e, id) => new Uint8Array(fs.readFileSync(appearanceImagePath(profile, id))));
ipcMain.handle('9gclaw:appearance-capabilities', () => ({ hardwareAcceleration: startupHardware }));
ipcMain.handle('9gclaw:delete-appearance-image', (_e, id) => {
  if (read().lightAppearance?.background.imageId !== id) fs.rmSync(appearanceImagePath(profile, id), { force: true });
});
ipcMain.handle('9gclaw:menu-state', () => {});
globalThis.filePickerCalls = [];
globalThis.filePickerErrors = [];
const pickFiles = createFilePicker({
  defaults: { images: app.getPath('pictures'), files: app.getPath('downloads'), directory: app.getPath('home') },
  chinese: () => true,
  showDialog: (owner, options) => {
    globalThis.filePickerCalls.push(options);
    return globalThis.filePickerResults ? Promise.resolve(globalThis.filePickerResults.shift() || { canceled: true, filePaths: [] }) : dialog.showOpenDialog(owner, options);
  },
});
ipcMain.handle('9gclaw:pick-files', async (event, request) => {
  try { return await pickFiles(BrowserWindow.fromWebContents(event.sender), request); }
  catch (error) { globalThis.filePickerErrors.push(String(error)); throw error; }
});
ipcMain.handle('9gclaw:get-runtime-info', () => null);
ipcMain.handle('9gclaw:update-status', () => ({ state: 'idle', progress: 0 }));
ipcMain.handle('9gclaw:update-check', () => ({ current: { version: 'test' }, latest: null, hasUpdate: false }));
app.whenReady().then(async () => {
  nativeTheme.themeSource = read().themeMode;
  win = new BrowserWindow({ ...windowChromeOptions(process.platform, nativeTheme.shouldUseDarkColors, read().lightAppearance), show: false, width: 1320, height: 900,
    autoHideMenuBar: true,
    webPreferences: { preload: path.resolve(__dirname, '../../dist/preload.js'), contextIsolation: true, sandbox: false, nodeIntegration: false },
  });
  win.on('enter-full-screen', () => setImmediate(publishWindowState));
  win.on('leave-full-screen', () => setImmediate(publishWindowState));
  publishWindowState();
  await win.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
