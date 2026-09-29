/** Shared, environment-independent contract used by Electron and the Web UI. */
export type ThemeMode = 'system' | 'light' | 'dark';
export type LightPalette = { accent: string; background: string };
export const LIGHT_PRESETS = {
  default: { accent: '#5b5ce2', background: '#eef0f8' },
  blue: { accent: '#386ab4', background: '#eaf1fb' },
  mint: { accent: '#187c65', background: '#eaf5ef' },
  apricot: { accent: '#a56028', background: '#fbf0e5' },
  lavender: { accent: '#7955b3', background: '#f1ecfa' },
  rose: { accent: '#b24d72', background: '#faedf2' },
} satisfies Record<string, LightPalette>;
export type LightPreset = keyof typeof LIGHT_PRESETS | 'custom';
export type LightAppearance = {
  version: 1;
  preset: LightPreset;
  custom: LightPalette;
  background: {
    type: 'solid' | 'gradient' | 'image';
    gradientEnd: string;
    angle: number;
    imageId: string | null;
    fit: 'cover' | 'contain';
    intensity: number;
    blur: number;
  };
  panelOpacity: number;

};
export const LIGHT_APPEARANCE_KEY = 'pilotdeck-light-appearance-v1';
export const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export const isImageId = (value: unknown): value is string => typeof value === 'string' && /^[\da-f-]{36}\.webp$/i.test(value);
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const bounded = (v: unknown, min: number, max: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback;
const hex = (v: unknown, fallback: string) => isHexColor(v) ? v.toLowerCase() : fallback;
export function normalizeLightAppearance(value?: unknown): LightAppearance {
  const v = record(value);
  const c = record(v.custom);
  const b = record(v.background);
  return {
    version: 1,
    preset: v.preset === 'custom' || (typeof v.preset === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_PRESETS, v.preset)) ? v.preset as LightPreset : 'default',
    custom: { accent: hex(c.accent, LIGHT_PRESETS.default.accent), background: hex(c.background, LIGHT_PRESETS.default.background) },
    background: {
      type: b.type === 'gradient' || b.type === 'image' ? b.type : 'solid',
      gradientEnd: hex(b.gradientEnd, '#f8eafa'), angle: bounded(b.angle, 0, 360, 135),
      imageId: isImageId(b.imageId) ? b.imageId : null,
      fit: b.fit === 'contain' ? 'contain' : 'cover',
      intensity: bounded(b.intensity, 0, 100, 65), blur: bounded(b.blur, 0, 30, 0),
    },
    panelOpacity: bounded(v.panelOpacity, 60, 100, 100),

  };
}
export function selectedPalette(value: LightAppearance): LightPalette {
  return value.preset === 'custom' ? value.custom : LIGHT_PRESETS[value.preset];
}
export function mixColor(a: string, b: string, amount: number): string {
  const channels = [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount));
  return '#' + channels.map(v => v.toString(16).padStart(2, '0')).join('');
}
export function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b;
}
export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
function readable(color: string, surface: string, ratio = 4.5): string {
  let result = color;
  for (let i = 0; i < 32 && contrast(result, surface) < ratio; i++) result = mixColor(result, '#10121b', .12);
  return result;
}
export function hexToHsl(color: string): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; }
  return `${+(h * 60).toFixed(2)} ${+(s * 100).toFixed(2)}% ${+(l * 100).toFixed(2)}%`;
}
export function deriveLightColors(value: LightAppearance) {
  const palette = selectedPalette(value);
  const surface = mixColor(palette.background, '#ffffff', .94);
  const sidebar = mixColor(palette.background, '#ffffff', .94);
  const ink = '#252737';
  const accent = readable(palette.accent, surface);
  // At 60% opacity even a black image behind the sidebar must leave its
  // navigation labels readable. Use this conservative composite for text.
  const sidebarWorstCase = mixColor(sidebar, '#000000', 1 - value.panelOpacity / 100);
  return { ...palette, accent, surface, sidebar, ink,
    sidebarInk: readable('#252737', sidebarWorstCase),
    sidebarAccent: readable(accent, sidebarWorstCase),
    muted: readable('#858998', surface),
    strong: mixColor(accent, '#10121b', .15),
    soft: mixColor(accent, surface, .90),
    border: mixColor(palette.background, '#252737', .15),
    contentOpacity: Math.max(.9, value.panelOpacity / 100),
  };
}
