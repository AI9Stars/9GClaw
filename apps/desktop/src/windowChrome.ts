import type { BrowserWindowConstructorOptions, Input } from 'electron';

/** Only plain platform Find/Bold shortcuts belong to the focused renderer. */
export function isRendererEditingShortcut(platform: NodeJS.Platform, input: Pick<Input, 'key' | 'control' | 'meta' | 'alt' | 'shift' | 'isComposing'>): boolean {
  const modifier = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
  return modifier && !input.alt && !input.shift && !input.isComposing
    && ['b', 'f'].includes(input.key.toLowerCase());
}

export const WINDOWS_CAPTION_HEIGHT = 40;
export const MAC_CAPTION_HEIGHT = 48;
export const WINDOWS_MENUS = [
  { id: 'menu-file', en: 'File', zh: '文件', key: 'f' },
  { id: 'menu-edit', en: 'Edit', zh: '编辑', key: 'e' },
  { id: 'menu-view', en: 'View', zh: '查看', key: 'v' },
  { id: 'menu-go', en: 'Go', zh: '前往', key: 'g' },
  { id: 'menu-help', en: 'Help', zh: '帮助', key: 'h' },
] as const;

export function windowPalette(dark: boolean, platform: NodeJS.Platform = process.platform) {
  return { background: dark ? '#0a0a0a' : '#ffffff', caption: platform === 'win32' ? (dark ? '#171717' : '#f4f4f5') : (dark ? '#0a0a0a' : '#fbfaff'), symbol: dark ? '#e5e5e5' : '#262626' };
}
export function windowChromeOptions(platform: NodeJS.Platform, dark: boolean): BrowserWindowConstructorOptions {
  const palette = windowPalette(dark, platform);
  return {
    backgroundColor: palette.background,
    ...(platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 18 } } : {}),
    ...(platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: {
      height: WINDOWS_CAPTION_HEIGHT, color: palette.caption, symbolColor: palette.symbol,
    } } : {}),
  };
}
