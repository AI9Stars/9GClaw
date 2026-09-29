// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AppearanceSettings from './index';
import { ThemeProvider } from '../../../../contexts/ThemeContext';
import { LIGHT_APPEARANCE_KEY, normalizeLightAppearance } from '../../../../lib/lightAppearance';
import { saveBackgroundImage, deleteBackgroundImage } from '../../../../lib/appearanceImages';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../../lib/appearanceImages', () => ({ saveBackgroundImage: vi.fn(), deleteBackgroundImage: vi.fn(async () => {}), loadBackgroundImage: vi.fn(async () => 'data:image/webp;base64,test') }));
beforeEach(() => {
  localStorage.clear();
  window.pilotdeckDesktop = undefined;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = () => render(<ThemeProvider><AppearanceSettings /></ThemeProvider>);
const saved = () => JSON.parse(localStorage.getItem(LIGHT_APPEARANCE_KEY) || 'null');
it('saves presets, keeps custom colors and restores them after switching back', async () => {
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: 'lightAppearance.accent HEX' }), { target: { value: '#126d71' } });
  await waitFor(() => expect(saved()?.custom.accent).toBe('#126d71'));
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.preset.rose' }));
  await waitFor(() => expect(saved()?.preset).toBe('rose'));
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.preset.custom' }));
  expect((screen.getByRole('textbox', { name: 'lightAppearance.accent HEX' }) as HTMLInputElement).value).toBe('#126d71');
});
it('edits gradient, opacity, and restores all defaults', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.gradient' }));
  fireEvent.change(screen.getByRole('slider', { name: 'lightAppearance.angle' }), { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.translucent' }));
  fireEvent.click(screen.getByText('lightAppearance.panelAdjustments'));
  fireEvent.change(screen.getByRole('slider', { name: 'lightAppearance.panelOpacity' }), { target: { value: '60' } });
  await waitFor(() => expect(saved()?.background.angle).toBe(45));
  await waitFor(() => expect(saved()?.panelOpacity).toBe(60));
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.reset' }));
  await waitFor(() => expect(saved()).toEqual(normalizeLightAppearance()));
});
it('keeps dark mode untouched, then restores the saved light palette', async () => {
  localStorage.setItem('themeMode', 'dark');
  localStorage.setItem(LIGHT_APPEARANCE_KEY, JSON.stringify(normalizeLightAppearance({ preset: 'mint' })));
  mount();
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(false);
  expect(screen.getByText('lightAppearance.lightOnly')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.editLight' }));
  await waitFor(() => expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(true));
  expect(screen.getByRole('button', { name: 'lightAppearance.preset.mint' }).getAttribute('aria-pressed')).toBe('true');
});
it('rolls back a failed storage write and reports the failure', async () => {
  mount();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.preset.blue' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('lightAppearance.saveFailed'));
  expect(screen.getByRole('button', { name: 'lightAppearance.preset.default' }).getAttribute('aria-pressed')).toBe('true');
});
it('commits an uploaded image, replaces it and removes the old managed asset', async () => {
  const first = '12345678-1234-1234-1234-123456789012.webp';
  const second = '22345678-1234-1234-1234-123456789012.webp';
  vi.mocked(saveBackgroundImage).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.image' }));
  fireEvent.change(screen.getByLabelText('lightAppearance.chooseImage'), { target: { files: [new File(['test'], 'test.png', { type: 'image/png' })] } });
  await waitFor(() => expect(saved()?.background.imageId).toBe(first));
  await waitFor(() => expect(screen.getByRole('button', { name: 'lightAppearance.replaceImage' }).hasAttribute('disabled')).toBe(false));
  fireEvent.change(screen.getByLabelText('lightAppearance.chooseImage'), { target: { files: [new File(['test2'], 'test2.png', { type: 'image/png' })] } });
  await waitFor(() => expect(saved()?.background.imageId).toBe(second));
  expect(deleteBackgroundImage).toHaveBeenCalledWith(first);
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.removeImage' }));
  await waitFor(() => expect(saved()?.background.imageId).toBe(null));
});
it('follows system changes without losing the selected light appearance', async () => {
  let change: (event: { matches: boolean }) => void = () => {};
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: (_: string, listener: typeof change) => { change = listener; }, removeEventListener: vi.fn() });
  localStorage.setItem(LIGHT_APPEARANCE_KEY, JSON.stringify(normalizeLightAppearance({ preset: 'blue' })));
  mount();
  act(() => change({ matches: true }));
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(false);
  act(() => change({ matches: false }));
  expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(true);
  expect(screen.getByRole('button', { name: 'lightAppearance.preset.blue' }).getAttribute('aria-pressed')).toBe('true');
});
it('serializes desktop edits and keeps a newer successful edit after an earlier failure', async () => {
  let failFirst: (reason?: unknown) => void = () => {};
  const persist = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { failFirst = reject; })).mockResolvedValue(undefined);
  window.pilotdeckDesktop = { getAppearance: () => ({ language: 'en', themeMode: 'light' }), setAppearance: persist } as unknown as NonNullable<Window['pilotdeckDesktop']>;
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.preset.blue' }));
  await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.preset.rose' }));
  expect(persist).toHaveBeenCalledTimes(1);
  await act(async () => failFirst(new Error('disk full')));
  await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
  expect(persist.mock.calls[1][0].lightAppearance.preset).toBe('rose');
  expect(screen.queryByRole('alert')).toBe(null);
  expect(screen.getByRole('button', { name: 'lightAppearance.preset.rose' }).getAttribute('aria-pressed')).toBe('true');
});

it('saves image effects and reduced motion, then restores them on remount', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'lightAppearance.image' }));
  fireEvent.click(screen.getByText('lightAppearance.imageAdjustments'));
  fireEvent.change(screen.getByRole('slider', { name: 'lightAppearance.brightness' }), { target: { value: '125' } });
  await waitFor(() => expect(saved()?.background.brightness).toBe(125));
  fireEvent.click(screen.getByText('lightAppearance.advanced'));
  fireEvent.change(screen.getByLabelText('lightAppearance.reducedMotion'), { target: { value: 'on' } });
  await waitFor(() => expect(document.documentElement.hasAttribute('data-reduced-motion')).toBe(true));
  cleanup(); mount();
  expect(document.documentElement.hasAttribute('data-reduced-motion')).toBe(true);
  fireEvent.click(screen.getByText('lightAppearance.imageAdjustments'));
  expect((screen.getByRole('slider', { name: 'lightAppearance.brightness' }) as HTMLInputElement).value).toBe('125');
});

it('preserves the current image and settings when image replacement fails', async () => {
  const id = '12345678-1234-1234-1234-123456789012.png';
  localStorage.setItem(LIGHT_APPEARANCE_KEY, JSON.stringify(normalizeLightAppearance({ background: { type: 'image', imageId: id } })));
  vi.mocked(saveBackgroundImage).mockRejectedValueOnce(new Error('disk full'));
  mount();
  fireEvent.change(screen.getByLabelText('lightAppearance.chooseImage'), { target: { files: [new File(['broken'], 'test.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('lightAppearance.imageSaveFailed'));
  expect(saved()?.background.imageId).toBe(id);
});

it('rolls back an advanced preference when persistence fails', async () => {
  mount();
  fireEvent.click(screen.getByText('lightAppearance.advanced'));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  fireEvent.change(screen.getByLabelText('lightAppearance.reducedMotion'), { target: { value: 'on' } });
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('lightAppearance.saveFailed'));
  expect((screen.getByLabelText('lightAppearance.reducedMotion') as HTMLSelectElement).value).toBe('system');
  expect(document.documentElement.hasAttribute('data-reduced-motion')).toBe(false);
});
