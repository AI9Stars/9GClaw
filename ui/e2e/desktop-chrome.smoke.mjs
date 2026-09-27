// Run with Vite on 127.0.0.1:5187 and compiled apps/desktop/dist.
// All app network traffic is synthetic; no real runtime or model is contacted.
import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactDir = process.env.PILOTDECK_CHROME_ARTIFACTS || path.join(root, 'outputs/desktop-chrome-review');
await fs.mkdir(artifactDir, { recursive: true });
const app = await electron.launch({
  executablePath: createRequire(import.meta.url)(path.join(root, 'apps/desktop/node_modules/electron')),
  args: [path.join(root, 'apps/desktop/scripts/fixtures/desktop-chrome.cjs')],
});
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
  await expect(page.locator('html')).toHaveAttribute('data-desktop-platform', 'darwin');
  await expect(page.locator('html')).toHaveAttribute('data-desktop-integrated', '');
  const geometry = await page.locator('.app-shell').evaluate(el => ({
    x: el.getBoundingClientRect().x, border: getComputedStyle(el).borderTopWidth,
    radius: getComputedStyle(el).borderTopLeftRadius,
  }));
  expect(geometry).toEqual({ x: 0, border: '0px', radius: '0px' });
  await page.screenshot({ path: path.join(artifactDir, 'mac-dark.png') });
  const command = id => app.evaluate(({ Menu }, id) => {
    const item = Menu.getApplicationMenu().getMenuItemById(id);
    if (!item?.enabled) throw new Error(`Disabled command: ${id}`);
    item.click();
  }, id);
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
  await expect(page.locator('html')).toHaveAttribute('data-desktop-integrated', '');
  await command('check-updates');
  await expect(page).toHaveURL(/\/settings\/about$/);
  await expect(page.locator('.pilotdeck-settings-app')).toBeVisible();
  await expect.poll(() => app.evaluate(() => global.chromeTest.checks())).toBeGreaterThan(0);
  await expect(page.locator('.pilotdeck-settings-app')).toHaveCSS('border-top-left-radius', '0px');
  const previousChecks = await app.evaluate(() => global.chromeTest.checks());
  await command('check-updates');
  await expect.poll(() => app.evaluate(() => global.chromeTest.checks())).toBeGreaterThan(previousChecks);
  await page.screenshot({ path: path.join(artifactDir, 'mac-settings.png') });
  await command('chat');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.evaluate(() => window.pilotdeckDesktop.setAppearance({ language: 'en', themeMode: 'light' }));
  await expect(page.locator('html')).not.toHaveAttribute('data-desktop-dark');
  // ThemeContext consumes the persisted desktop appearance on reload.
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.screenshot({ path: path.join(artifactDir, 'mac-light.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
  await expect(page.locator('html')).toHaveAttribute('data-desktop-fullscreen', '');
  await expect(page.locator('#pilotdeck-window-caption')).toBeHidden();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
  await expect(page.locator('html')).not.toHaveAttribute('data-desktop-fullscreen');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getWindowButtonPosition())).toEqual({ x: 16, y: 18 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
  await expect(page.locator('.app-shell')).toBeVisible();
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, geometry, unmappedFixtureEndpoints: [...missing], artifactDir }));
} finally { await app.close(); }
