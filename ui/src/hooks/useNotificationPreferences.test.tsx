// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { window.ninegclawDesktop = undefined; localStorage.clear(); vi.resetModules(); });
it('new desktop installs start enabled before native settings load', async () => {
  window.ninegclawDesktop = { platform: 'win32' } as any;
  const { getNotificationPreferences } = await import('./useNotificationPreferences');
  expect(getNotificationPreferences().enabled).toBe(true);
});
it('preserves explicit desktop opt-out and leaves browser permission opt-in intact', async () => {
  window.ninegclawDesktop = { platform: 'win32' } as any;
  localStorage.setItem('9gclaw-notifications-v1', JSON.stringify({ enabled: false }));
  expect((await import('./useNotificationPreferences')).getNotificationPreferences().enabled).toBe(false);
  vi.resetModules(); localStorage.clear(); window.ninegclawDesktop = undefined;
  expect((await import('./useNotificationPreferences')).getNotificationPreferences().enabled).toBe(false);
});
