// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { clearWebNotificationBadge } from './systemNotifications';

afterEach(() => { window.ninegclawDesktop = undefined; vi.restoreAllMocks(); document.title = '九格智能体平台'; });
it('removes legacy web title counts and clears PWA badges without publishing a new count', async () => {
  document.title = '(9) 9GClaw';
  const clear = vi.fn(async () => {});
  const set = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clearAppBadge', { value: clear, configurable: true });
  Object.defineProperty(navigator, 'setAppBadge', { value: set, configurable: true });
  await clearWebNotificationBadge();
  expect(document.title).toBe('九格智能体平台');
  expect(clear).toHaveBeenCalledOnce();
  expect(set).not.toHaveBeenCalled();
  delete (navigator as any).clearAppBadge;
  delete (navigator as any).setAppBadge;
  await expect(clearWebNotificationBadge()).resolves.toBeUndefined();
});
it('leaves desktop badge ownership with the main process', async () => {
  window.ninegclawDesktop = { platform: 'linux' } as NonNullable<Window['ninegclawDesktop']>;
  const clear = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clearAppBadge', { value: clear, configurable: true });
  await clearWebNotificationBadge();
  expect(clear).not.toHaveBeenCalled();
  delete (navigator as any).clearAppBadge;
});
