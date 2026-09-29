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
    if (p === '/api/projects') body = [];
    else if (p.includes('onboarding-status')) body = { hasCompletedOnboarding: true };
    else if (p.includes('/config')) body = { config: { models: {}, agents: {}, tools: {} } };
    else if (p.includes('models')) body = { models: [] };
    else if (p.includes('/skills')) body = { skills: [] };
    else if (p.includes('/plugins')) body = { plugins: [] };
    else if (p.includes('/tasks')) body = { tasks: [] };
    else if (p.includes('/cron')) body = { jobs: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.routeWebSocket('**/ws**', socket => socket.onMessage(() => {}));
  await page.route('**/sw.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
}
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await mockServer(page);
  await page.goto('http://127.0.0.1:5187/settings/appearance');
  await expect(page.locator('.appearance-settings')).toBeVisible({ timeout: 60000 });
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
  }
  const config = JSON.parse(await fs.readFile(path.join(profile, 'appearance.json')));
  expect(config.lightAppearance.background.imageId).toMatch(/\.png$/);
  expect((await fs.readdir(path.join(profile, 'appearance-images'))).length).toBe(1);
  await page.reload();
  await expect(page.locator('.appearance-image-upload img')).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, 'desktop.png') });
  expect(errors).toEqual([]);
  console.log('PASS: actual Electron PNG/JPEG/WebP upload, replacement, disk persistence, reload and independent settings scrolling');
} finally { await app.close(); }
