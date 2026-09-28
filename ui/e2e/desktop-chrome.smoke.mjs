// Run with Vite on 127.0.0.1:5187 and compiled apps/desktop/dist.
// All app network traffic is synthetic; no real runtime or model is contacted.
import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mac = process.platform === 'darwin';
const platformName = mac ? 'mac' : 'windows';
const artifactDir = process.env.PILOTDECK_CHROME_ARTIFACTS || path.join(root, 'outputs/desktop-chrome-review');
await fs.mkdir(artifactDir, { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'pilotdeck-chrome-'));
const app = await electron.launch({
  executablePath: createRequire(import.meta.url)(path.join(root, 'apps/desktop/node_modules/electron')),
  args: [path.join(root, 'apps/desktop/scripts/fixtures/desktop-chrome.cjs'), ...(process.env.PILOTDECK_CHROME_SCALE ? [`--force-device-scale-factor=${process.env.PILOTDECK_CHROME_SCALE}`] : [])],
  env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')), PILOTDECK_CHROME_PROFILE: profile },
});
app.process().on('exit', (code, signal) => { if (code) console.error('Electron exited', { code, signal }); });
try {
  const page = await app.firstWindow();
  const projects = [
    { name: 'general', displayName: 'General conversation', kind: 'general', fullPath: '/fixture/general', sessions: [], capabilities: { files: false } },
    { name: 'demo', displayName: 'Desktop design review', kind: 'workspace', fullPath: '/fixture/demo', sessions: [{ id: 'chrome-review', title: 'Native title review', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], capabilities: { files: true } },
  ];
  const missing = new Set();
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let body = {};
    if (url.pathname === '/api/projects') body = projects;
    else if (url.pathname.includes('onboarding-status')) body = { hasCompletedOnboarding: true };
    else if (url.pathname === '/api/settings/permissions') body = { success: true, permissions: { skipPermissions: false, allowedTools: [], deniedTools: [] } };
    else if (url.pathname.includes('/messages')) body = { messages: [], hasMore: false, total: 0 };
    else if (url.pathname.includes('/sessions')) body = { sessions: projects[1].sessions, hasMore: false, total: 1 };
    else if (url.pathname.includes('/files')) body = [];
    else if (url.pathname.includes('models')) body = { models: [] };
    else if (url.pathname.includes('/skills')) body = { skills: [] };
    else if (url.pathname.includes('/plugins')) body = { plugins: [] };
    else if (url.pathname.includes('/config')) body = { config: { models: {}, agents: {}, tools: {} } };
    else if (url.pathname.includes('/tasks')) body = { tasks: [] };
    else if (url.pathname.includes('/cron')) body = { jobs: [] };
    else missing.add(url.pathname);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/sw.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.routeWebSocket('**/ws**', socket => {
    socket.onMessage(message => {
      try {
        const parsed = JSON.parse(String(message));
        if (parsed.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      } catch {}
    });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5187');
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 60000 });
  await expect.poll(() => app.evaluate(() => global.chromeTest.state().ready)).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-desktop-platform', process.platform);
  if (mac) await expect(page.locator('html')).toHaveAttribute('data-desktop-integrated', '');
  const geometry = await page.locator('.app-shell').evaluate(el => ({
    x: el.getBoundingClientRect().x, border: getComputedStyle(el).borderTopWidth,
    radius: getComputedStyle(el).borderTopLeftRadius,
  }));
  if (mac) expect(geometry).toEqual({ x: 0, border: '0px', radius: '0px' });
  else {
    expect(geometry.x).toBeCloseTo(6);
    expect(parseFloat(geometry.border)).toBeGreaterThan(0);
    expect(geometry.radius).toBe('14px');
  }
  const verifyOriginalContentStyle = async () => {
    const styles = await page.evaluate(() => {
      const root = document.documentElement;
      const platform = root.dataset.desktopPlatform;
      const read = () => ['.app-root', '.app-shell', '.project-sidebar', '.workspace-header', '.sidebar-brand-row'].map(selector => {
        const style = getComputedStyle(document.querySelector(selector));
        return [selector, style.backgroundImage, style.backgroundColor, style.borderTopWidth, style.borderRightWidth,
          style.borderColor, style.borderRadius, style.boxShadow, style.gridTemplateColumns, style.paddingLeft, style.paddingRight];
      });
      const desktop = read();
      delete root.dataset.desktopPlatform;
      const original = read();
      root.dataset.desktopPlatform = platform;
      return { desktop, original };
    });
    expect(styles.desktop).toEqual(styles.original);
  };
  if (!mac) await verifyOriginalContentStyle();
  await page.screenshot({ path: path.join(artifactDir, `${platformName}-dark.png`) });
  if (!mac) {
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible())).toBe(false);
    const caption = page.locator('#pilotdeck-window-caption');
    await expect(caption.locator('button')).toHaveCount(5);
    await expect(caption).toHaveCSS('background-color', 'rgb(23, 23, 23)');
    await expect(page.locator('.project-sidebar')).toHaveCSS('background-color', 'rgb(10, 10, 10)');
    // CDP keyboard events cannot dismiss a Win32 popup; close it via Electron.
    await caption.getByRole('button', { name: 'File', exact: true }).click();
    await expect.poll(() => app.evaluate(() => global.chromeTest.menuRequests().at(-1)?.id)).toBe('menu-file');
    // Product state can rebuild the application menu while its popup is open.
    await app.evaluate(() => global.chromeTest.refreshMenu());
    await app.evaluate(() => global.chromeTest.closeMenu());
    await expect(caption.getByRole('button', { name: 'File', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('F10');
    await expect.poll(() => app.evaluate(() => global.chromeTest.menuRequests().at(-1)?.id)).toBe('all');
    await app.evaluate(() => global.chromeTest.closeMenu());
  }
  const command = async id => {
    await expect.poll(() => app.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id)?.enabled, id)).toBe(true);
    await app.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).click(), id);
  };
  if (process.env.PILOTDECK_CHROME_MANUAL === '1') {
    await page.goto('http://127.0.0.1:5187/p/demo/c/chrome-review');
    await expect(page.locator('.workspace-header h1')).toHaveAttribute('data-desktop-no-drag', '');
    console.log('Native review window ready; waiting up to two minutes for manual inspection.');
    await new Promise(resolve => setTimeout(resolve, 120000));
  }
  await command('new-project');
  await expect(page.locator('.create-workspace-dialog')).toBeVisible();
  await expect.poll(() => app.evaluate(() => global.chromeTest.state().blocked)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.create-workspace-dialog')).toHaveCount(0);
  await expect.poll(() => app.evaluate(() => global.chromeTest.state().blocked)).toBe(false);
  await page.goto('http://127.0.0.1:5187/p/demo/c/chrome-review');
  const title = page.locator('.workspace-header h1');
  await expect(title).toHaveAttribute('data-desktop-no-drag', '');
  // DOM dblclick alone cannot detect Electron's native hit-test interception.
  expect(await title.evaluate(el => getComputedStyle(el).getPropertyValue('-webkit-app-region'))).toBe('no-drag');
  expect(await page.locator('.workspace-header').evaluate(el => getComputedStyle(el).getPropertyValue('-webkit-app-region'))).toBe('drag');
  await title.dblclick();
  await expect(page.getByRole('textbox', { name: 'Rename Session' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('http://127.0.0.1:5187/p/demo');
  await expect.poll(() => app.evaluate(() => global.chromeTest.state().hasProject)).toBe(true);
  await command('new-conversation');
  await expect(page).toHaveURL(/\/p\/demo$/);
  await command('toggle-sidebar');
  await expect(page.locator('.app-shell')).toHaveClass(/sidebar-hidden/);
  await expect(page.locator('html')).not.toHaveAttribute('data-desktop-integrated');
  await command('toggle-sidebar');
  if (mac) await expect(page.locator('html')).toHaveAttribute('data-desktop-integrated', '');
  await command('check-updates');
  await expect(page).toHaveURL(/\/settings\/about$/);
  await expect(page.locator('.pilotdeck-settings-app')).toBeVisible();
  await expect.poll(() => app.evaluate(() => global.chromeTest.checks())).toBeGreaterThan(0);
  if (mac) await expect(page.locator('.pilotdeck-settings-app')).toHaveCSS('border-top-left-radius', '0px');
  const previousChecks = await app.evaluate(() => global.chromeTest.checks());
  await command('check-updates');
  await expect.poll(() => app.evaluate(() => global.chromeTest.checks())).toBeGreaterThan(previousChecks);
  await page.screenshot({ path: path.join(artifactDir, `${platformName}-settings.png`) });
  await command('chat');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.evaluate(() => window.pilotdeckDesktop.setAppearance({ language: 'en', themeMode: 'light' }));
  await expect(page.locator('html')).not.toHaveAttribute('data-desktop-dark');
  // ThemeContext consumes the persisted desktop appearance on reload.
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.screenshot({ path: path.join(artifactDir, `${platformName}-light.png`) });
  if (!mac) {
    await expect(page.locator('#pilotdeck-window-caption')).toHaveCSS('background-color', 'rgb(244, 244, 245)');
    await verifyOriginalContentStyle();
    await expect(page.locator('.project-sidebar')).toHaveCSS('background-image', 'linear-gradient(rgb(251, 250, 255), rgb(244, 243, 255) 58%, rgb(240, 244, 255))');
    // Exercise the actual i18n instance, including persistence across reload.
    await page.evaluate(async () => { const { default: i18n } = await import('/src/i18n/config.js'); await i18n.changeLanguage('zh-CN'); });
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('#pilotdeck-window-caption button')).toHaveText(['文件', '编辑', '查看', '前往', '帮助']);
    await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('menu-file').label)).toBe('文件');
    await page.reload();
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('#pilotdeck-window-caption button')).toHaveText(['文件', '编辑', '查看', '前往', '帮助']);
    await page.screenshot({ path: path.join(artifactDir, 'windows-light-zh.png') });
    await page.evaluate(async () => { const { default: i18n } = await import('/src/i18n/config.js'); await i18n.changeLanguage('en'); });
    await expect(page.locator('#pilotdeck-window-caption button')).toHaveText(['File', 'Edit', 'View', 'Go', 'Help']);
    await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('menu-file').label)).toBe('&File');
    const safeArea = await page.locator('#pilotdeck-window-caption').evaluate(el => ({ right: el.getBoundingClientRect().right, width: innerWidth }));
    expect(safeArea.right).toBeLessThan(safeArea.width - 100);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false);
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
  await expect(page.locator('html')).toHaveAttribute('data-desktop-fullscreen', '');
  await expect(page.locator('#pilotdeck-window-caption')).toBeHidden();
  await expect(page.locator('.app-root')).toHaveCSS('padding-top', mac ? '0px' : '6px');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
  await expect(page.locator('html')).not.toHaveAttribute('data-desktop-fullscreen');
  if (!mac) await expect(page.locator('.app-root')).toHaveCSS('padding-top', '46px');
  if (mac) expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getWindowButtonPosition())).toEqual({ x: 16, y: 18 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
  await expect(page.locator('.app-shell')).toBeVisible();
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, geometry, unmappedFixtureEndpoints: [...missing], artifactDir }));
} finally {
  await app.close();
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
