import type { BrowserWindowConstructorOptions, Input } from 'electron';

/** Only plain platform Find/Bold shortcuts belong to the focused renderer. */
export function isRendererEditingShortcut(platform: NodeJS.Platform, input: Pick<Input, 'key' | 'control' | 'meta' | 'alt' | 'shift' | 'isComposing'>): boolean {
  const modifier = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
  return modifier && !input.alt && !input.shift && !input.isComposing
    && ['b', 'f'].includes(input.key.toLowerCase());
}

export const WINDOWS_CAPTION_HEIGHT = 40;
export const MAC_CAPTION_HEIGHT = 48;
export function windowPalette(dark: boolean) {
  return { background: dark ? '#0a0a0a' : '#ffffff', caption: dark ? '#0a0a0a' : '#fbfaff', symbol: dark ? '#e5e5e5' : '#262626' };
}
export function windowChromeOptions(platform: NodeJS.Platform, dark: boolean): BrowserWindowConstructorOptions {
  const palette = windowPalette(dark);
  return {
    backgroundColor: palette.background,
    ...(platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 18 } } : {}),
    ...(platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: {
      height: WINDOWS_CAPTION_HEIGHT, color: palette.caption, symbolColor: palette.symbol,
    } } : {}),
  };
}
