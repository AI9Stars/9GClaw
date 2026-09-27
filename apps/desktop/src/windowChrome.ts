import type { BrowserWindowConstructorOptions } from 'electron';

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
