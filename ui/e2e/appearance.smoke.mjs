// Start Vite on 5187. Uses real Electron image IPC and actual settings routes.
import { _electron as electron, chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'pd-appearance-smoke-'));
const artifacts = path.join(root, 'artifacts/appearance-regression');
await fs.mkdir(artifacts, { recursive: true });
const app = await electron.launch({
  executablePath: createRequire(import.meta.url)(path.join(root, 'apps/desktop/node_modules/electron')),
  args: [path.join(root, 'apps/desktop/scripts/fixtures/appearance.cjs')],
  env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')), PILOTDECK_APPEARANCE_PROFILE: profile },
});
async function mockServer(page) {
  await page.route('**/api/**', async route => {
    const p = new URL(route.request().url()).pathname;
    let body = {};
    if (p === '/api/projects') body = [{ name: 'demo', displayName: 'Appearance test', kind: 'workspace', fullPath: '/fixture/demo', sessions: [], capabilities: { files: true } }];
    else if (p.includes('onboarding-status')) body = { hasCompletedOnboarding: true };
    else if (p.includes('/config')) body = { config: { models: {}, agents: {}, tools: {} } };
    else if (p.includes('models')) body = { models: [] };
    else if (p.includes('/skills')) body = { skills: [] };
    else if (p.includes('/plugins')) body = { plugins: [] };
    else if (p.includes('/tasks')) body = { tasks: [] };
    else if (p.includes('/cron')) body = { jobs: [] };
    else if (p.includes('/sessions')) body = { sessions: [], hasMore: false, total: 0 };
    else if (p.includes('/files')) body = [];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.routeWebSocket('**/ws**', socket => socket.onMessage(() => {}));
  await page.route('**/sw.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/memory-dashboard/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const name = pathname.slice('/memory-dashboard/'.length);
    if (!['index.html', 'app.css', 'app.js', 'trace-i18n.js', 'assets/brand/logo.png'].includes(name)) return route.fulfill({ status: 404, body: '' });
    const body = await fs.readFile(path.join(root, 'src/context/memory/edgeclaw-memory-core/ui-source', name));
    await route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'application/javascript' : name.endsWith('.png') ? 'image/png' : 'text/html', body });
  });
}
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await mockServer(page);
  await page.goto('http://127.0.0.1:5187/settings/appearance');
  await expect(page.locator('.appearance-settings')).toBeVisible({ timeout: 60000 });
  console.log('Desktop settings mounted');
  const pane = page.locator('.settings-content');
  expect(await pane.evaluate(e => getComputedStyle(e).overflowY)).toBe('auto');
  await pane.evaluate(e => { e.scrollTop = 500; });
  expect(await pane.evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  await page.locator('.nav-item').filter({ hasText: '通用' }).click();
  await expect(page.locator('.general-settings-page')).toBeVisible();
  expect(await page.locator('.settings-content').evaluate(e => e.scrollTop)).toBe(0);
  await page.locator('.nav-item').filter({ hasText: '外观' }).click();
  await expect(page.locator('.appearance-settings')).toBeVisible();
  expect(await pane.evaluate(e => e.scrollTop)).toBe(0);
  await page.getByRole('button', { name: '本地图片', exact: true }).click();
  for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
    const data = await page.evaluate(mime => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 220;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#789ac4'; ctx.fillRect(0, 0, 400, 220);
      ctx.fillStyle = '#c789b5'; ctx.fillRect(150, 0, 250, 220);
      return c.toDataURL(mime).split(',')[1];
    }, mime);
    await page.locator('.appearance-settings input[type=file]').setInputFiles({ name: `test.${mime.split('/')[1]}`, mimeType: mime, buffer: Buffer.from(data, 'base64') });
    await expect(page.locator('.appearance-image-upload img')).toBeVisible();
    await expect(page.locator('.appearance-image-upload strong')).not.toContainText('正在');
    await expect(page.locator('.appearance-error')).toHaveCount(0);
    console.log(`Desktop upload passed: ${mime}`);
  }
  const config = JSON.parse(await fs.readFile(path.join(profile, 'appearance.json')));
  expect(config.lightAppearance.background.imageId).toMatch(/\.png$/);
  expect((await fs.readdir(path.join(profile, 'appearance-images'))).length).toBe(1);
  await page.reload();
  await expect(page.locator('.appearance-image-upload img')).toBeVisible();
  await page.getByRole('button', { name: '透出背景', exact: true }).click();
  await page.getByText('面板透色细调', { exact: true }).click();
  await page.getByRole('spinbutton', { name: '侧栏不透明度 (%)' }).fill('60');
  await page.getByText('图片色彩与构图', { exact: true }).click();
  await page.getByRole('spinbutton', { name: '图片亮度 (%)' }).fill('125');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pd-image-brightness'))).toBe('125%');
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-light-appearance');
  await page.getByRole('button', { name: '切换浅色并编辑', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-light-appearance');
  await page.locator('.appearance-advanced > summary').click();
  await page.getByLabel('减少动态效果', { exact: true }).selectOption('on');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion');
  await page.getByRole('switch', { name: '使用硬件（3D）加速' }).uncheck();
  await expect(page.getByText('设置已保存。完全退出并重新打开客户端后生效。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '薄荷', exact: true }).click();
  await pane.evaluate(e => { e.scrollTop = 0; });
  await page.screenshot({ path: path.join(artifacts, 'desktop.png') });
  await page.goto('http://127.0.0.1:5187/p/demo');
  await expect(page.locator('.workspace-header')).toBeVisible();
  await page.locator('.workspace-header button[aria-haspopup=menu]').click();
  await page.getByRole('menuitem', { name: /记忆|Memory/ }).click();
  const memory = page.frameLocator('iframe[title="Memory 面板"]');
  await expect(memory.locator('#pilotdeck-memory-appearance')).toBeAttached();
  expect(await memory.locator('html').evaluate(e => getComputedStyle(e).getPropertyValue('--accent').trim())).toBe('#187c65');
  expect(await memory.locator('html').evaluate(e => getComputedStyle(e).getPropertyValue('--status-project').trim())).toBe('#2563eb');
  await page.screenshot({ path: path.join(artifacts, 'memory.png') });
  expect(errors).toEqual([]);
  console.log('PASS: actual Electron PNG/JPEG/WebP upload, replacement, disk persistence, reload and independent settings scrolling');
} finally { await app.close(); }

const restarted = await electron.launch({
  executablePath: createRequire(import.meta.url)(path.join(root, 'apps/desktop/node_modules/electron')),
  args: [path.join(root, 'apps/desktop/scripts/fixtures/appearance.cjs')],
  env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')), PILOTDECK_APPEARANCE_PROFILE: profile },
});
try {
  const page = await restarted.firstWindow(); await mockServer(page);
  await page.goto('http://127.0.0.1:5187/settings/appearance');
  await expect(page.locator('.appearance-image-upload img')).toBeVisible({ timeout: 60000 });
  expect(await page.evaluate(() => window.pilotdeckDesktop.getAppearanceCapabilities())).toEqual({ hardwareAcceleration: false });
  expect((await restarted.evaluate(({ app }) => app.getGPUFeatureStatus())).gpu_compositing).toMatch(/disabled/);
  const config = JSON.parse(await fs.readFile(path.join(profile, 'appearance.json')));
  await fs.unlink(path.join(profile, 'appearance-images', config.lightAppearance.background.imageId));
  await page.reload();
  await expect(page.getByText('找不到已保存的背景图片，当前使用背景底色。请选择新图片。')).toBeVisible();
  await page.locator('.appearance-settings input[type=file]').setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('broken image') });
  await expect(page.getByRole('alert')).toContainText('有效 PNG');
  await page.locator('.appearance-settings input[type=file]').setInputFiles(path.join(root, 'apps/desktop/resources/icons/icon.png'));
  await expect(page.locator('.appearance-image-upload img')).toBeVisible();
  await expect(page.locator('.appearance-error')).toHaveCount(0);
  console.log('PASS: desktop process restart, GPU disabled at startup, missing/corrupt image recovery');
} finally { await restarted.close(); }

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await mockServer(page);
  await page.addInitScript(() => { if (!localStorage.getItem('userLanguage')) localStorage.setItem('userLanguage', 'zh-CN'); });
  await page.goto('http://127.0.0.1:5187/settings/appearance');
  await expect(page.locator('.appearance-settings')).toBeVisible({ timeout: 60000 });
  // Locale is selected by the application; set its supported persistence key.
  const labels = ['默认', '雾蓝', '薄荷', '暖杏', '淡紫', '玫瑰'];
  for (const name of labels) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: '渐变', exact: true }).click();
  await page.getByRole('spinbutton', { name: '渐变角度 (°)' }).fill('45');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: '渐变角度 (°)' })).toHaveValue('45');
  await page.getByRole('button', { name: '本地图片', exact: true }).click();
  await page.locator('.appearance-settings input[type=file]').setInputFiles(path.join(root, 'apps/desktop/resources/icons/icon.png'));
  await expect(page.locator('.appearance-image-upload img')).toBeVisible();
  await page.reload();
  await expect(page.locator('.appearance-image-upload img')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const pane = page.locator('.settings-content');
  await pane.evaluate(e => { e.scrollTop = e.scrollHeight; });
  await expect(page.getByRole('button', { name: '恢复默认', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(artifacts, 'mobile.png') });
  await page.getByRole('button', { name: '恢复默认', exact: true }).click();
  await expect(page.getByRole('button', { name: '默认', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: '默认', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => localStorage.setItem('userLanguage', 'en'));
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.locator('html')).not.toHaveAttribute('data-reduced-motion');
  await page.screenshot({ path: path.join(artifacts, 'web-english.png') });
  console.log('PASS: browser six presets, gradient, IndexedDB upload/reload, reset and 390px responsive scroll');
} finally { await browser.close(); }
