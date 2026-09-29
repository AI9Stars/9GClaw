// Real Electron/preload/image decoding and disk persistence; isolated test data.
const { app, BrowserWindow, ipcMain, nativeImage, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeAppearance } = require('../../dist/appearance');
const { saveAppearancePatch, writeAppearanceImage, appearanceImagePath } = require('../../dist/appearanceStorage');
const profile = process.env.PILOTDECK_APPEARANCE_PROFILE;
if (!profile) throw new Error('An isolated profile is required');
app.setPath('userData', profile);
const read = () => {
  try { return normalizeAppearance(JSON.parse(fs.readFileSync(path.join(profile, 'appearance.json')))); }
  catch { return normalizeAppearance({ language: 'zh-CN', themeMode: 'light' }); }
};
ipcMain.on('pilotdeck:get-appearance', e => { e.returnValue = read(); });
ipcMain.on('pilotdeck:get-window-state', e => { e.returnValue = { dark: nativeTheme.shouldUseDarkColors, fullscreen: false }; });
ipcMain.handle('pilotdeck:set-appearance', (_e, value) => {
  const next = saveAppearancePatch(profile, read(), value, 'zh-CN');
  nativeTheme.themeSource = next.themeMode;
});
ipcMain.handle('pilotdeck:save-appearance-image', (_e, bytes) => writeAppearanceImage(profile, bytes, b => nativeImage.createFromBuffer(b).getSize()));
ipcMain.handle('pilotdeck:read-appearance-image', (_e, id) => `data:image/${id.endsWith('.png') ? 'png' : 'webp'};base64,${fs.readFileSync(appearanceImagePath(profile, id)).toString('base64')}`);
ipcMain.handle('pilotdeck:delete-appearance-image', (_e, id) => {
  if (read().lightAppearance?.background.imageId !== id) fs.rmSync(appearanceImagePath(profile, id), { force: true });
});
ipcMain.handle('pilotdeck:menu-state', () => {});
ipcMain.handle('pilotdeck:get-runtime-info', () => null);
ipcMain.handle('pilotdeck:update-status', () => ({ state: 'idle', progress: 0 }));
ipcMain.handle('pilotdeck:update-check', () => ({ current: { version: 'test' }, latest: null, hasUpdate: false }));
app.whenReady().then(async () => {
  nativeTheme.themeSource = read().themeMode;
  const win = new BrowserWindow({ show: false, width: 1320, height: 900,
    webPreferences: { preload: path.resolve(__dirname, '../../dist/preload.js'), contextIsolation: true, sandbox: false, nodeIntegration: false },
  });
  await win.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
