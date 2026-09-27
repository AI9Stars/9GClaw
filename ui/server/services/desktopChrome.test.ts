// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const ipc = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  sendSync: vi.fn().mockReturnValue({ dark: true, fullscreen: false }),
}));
import { installWindowChrome } from '../../../apps/desktop/src/preloadChrome';
import { isRendererEditingShortcut, windowChromeOptions } from '../../../apps/desktop/src/windowChrome';

it('reserves only plain editing shortcuts for the renderer, leaving macOS fullscreen native', () => {
  const input = { key: 'f', meta: true, control: false, shift: false, alt: false, isComposing: false };
  expect(isRendererEditingShortcut('darwin', input)).toBe(true);
  expect(isRendererEditingShortcut('darwin', { ...input, key: 'B' })).toBe(true);
  expect(isRendererEditingShortcut('darwin', { ...input, control: true })).toBe(false);
  for (const flag of ['shift', 'alt', 'isComposing'] as const) {
    expect(isRendererEditingShortcut('darwin', { ...input, [flag]: true })).toBe(false);
  }
  expect(isRendererEditingShortcut('darwin', { ...input, meta: false, control: true })).toBe(false);
  expect(isRendererEditingShortcut('win32', { ...input, meta: false, control: true })).toBe(true);
  expect(isRendererEditingShortcut('win32', { ...input, control: true })).toBe(false);
});

it('uses native caption controls with an opaque matching background on each platform', () => {
  expect(windowChromeOptions('darwin', true)).toMatchObject({ titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 18 }, backgroundColor: '#0a0a0a' });
  expect(windowChromeOptions('win32', false)).toMatchObject({ titleBarStyle: 'hidden', titleBarOverlay: { height: 40, color: '#fbfaff', symbolColor: '#262626' } });
  expect(windowChromeOptions('linux', false).titleBarStyle).toBeUndefined();
});
it('Windows caption opens one native menu, supports F10 and follows fullscreen state', async () => {
  installWindowChrome('win32', ipc as any);
  window.dispatchEvent(new Event('DOMContentLoaded'));
  const host = document.getElementById('pilotdeck-window-caption')!;
  const button = host.shadowRoot!.querySelector('button')!;
  expect(document.documentElement.dataset.desktopPlatform).toBe('win32');
  expect(document.documentElement.hasAttribute('data-desktop-dark')).toBe(true);
  button.click(); button.click();
  expect(ipc.invoke).toHaveBeenCalledTimes(1);
  expect(ipc.invoke).toHaveBeenLastCalledWith('pilotdeck:show-menu');
  await Promise.resolve();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10' }));
  expect(ipc.invoke).toHaveBeenCalledTimes(2);
  const callback = ipc.on.mock.calls.find(call => call[0] === 'pilotdeck:window-state')![1];
  callback({}, { dark: false, fullscreen: true });
  expect(host.hidden).toBe(true);
  expect(document.documentElement.hasAttribute('data-desktop-dark')).toBe(false);
  callback({}, { dark: false, fullscreen: false });
  expect(host.hidden).toBe(false);
});
