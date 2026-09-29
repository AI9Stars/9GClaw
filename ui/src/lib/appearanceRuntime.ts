import { deriveLightColors, hexToHsl, LIGHT_APPEARANCE_KEY, normalizeLightAppearance, type LightAppearance } from './lightAppearance';

export function readLightAppearance(): LightAppearance {
  try {
    const desktop = window.pilotdeckDesktop?.getAppearance?.();
    if (desktop) return normalizeLightAppearance(desktop.lightAppearance);
    return normalizeLightAppearance(JSON.parse(localStorage.getItem(LIGHT_APPEARANCE_KEY) || 'null'));
  } catch { return normalizeLightAppearance(); }
}
// A dedicated stylesheet gives light overrides lower priority than dark mode,
// without leaving inline custom properties on the document after switching.
export function applyLightAppearance(value: LightAppearance, dark: boolean, imageUrl: string | null = null) {
  let style = document.getElementById('pd-light-appearance') as HTMLStyleElement | null;
  if (!style) { style = document.createElement('style'); style.id = 'pd-light-appearance'; document.head.append(style); }
  const root = document.documentElement;
  const active = !dark && (value.preset !== 'default' || value.background.type !== 'solid' || value.panelOpacity !== 100);
  root.toggleAttribute('data-light-appearance', active);

  if (!active) { style.textContent = ''; return; }
  const c = deriveLightColors(value);
  const vars: Record<string, string> = {
    '--pd-canvas': c.background, '--pd-surface': c.surface, '--pd-sidebar': c.sidebar,
    '--pd-ink': c.ink, '--pd-muted': c.muted, '--pd-border': c.border,
    '--pd-accent': c.accent, '--pd-accent-strong': c.strong, '--pd-accent-soft': c.soft,
    '--pd-panel-alpha': `${value.panelOpacity}%`, '--pd-content-alpha': `${c.contentOpacity * 100}%`,
    '--pd-image-opacity': String(value.background.intensity / 100), '--pd-image-blur': `${value.background.blur}px`,
    '--pd-image-fit': value.background.fit,
    '--pd-backdrop': value.background.type === 'gradient' ? `linear-gradient(${value.background.angle}deg, ${c.background}, ${value.background.gradientEnd})` : c.background,
    '--pd-wallpaper': imageUrl && value.background.type === 'image' ? `url(${JSON.stringify(imageUrl)})` : 'none',
    '--brand': c.accent, '--brand-strong': c.strong, '--brand-soft': c.soft, '--ink': c.ink, '--app-muted': c.muted, '--line': c.border,
    '--desktop-bg': c.background,
  };
  const hsl: Record<string, string> = { background: c.surface, foreground: c.ink, card: c.surface, 'card-foreground': c.ink, popover: c.surface, 'popover-foreground': c.ink,
    primary: c.accent, 'primary-foreground': '#ffffff', secondary: c.sidebar, 'secondary-foreground': c.ink,
    muted: c.sidebar, 'muted-foreground': c.muted, accent: c.soft, 'accent-foreground': c.accent, border: c.border, input: c.border, ring: c.accent };
  for (const [key, color] of Object.entries(hsl)) vars[`--${key}`] = hexToHsl(color);
  style.textContent = `:root[data-light-appearance]:not(.dark){${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.background);
}

// Invoked by a separate head entry before mounting the application.
export function bootAppearance() {
  try {
    const desktop = window.pilotdeckDesktop?.getAppearance?.();
    const mode = desktop?.themeMode || localStorage.getItem('themeMode') || localStorage.getItem('theme') || 'system';
    const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    applyLightAppearance(readLightAppearance(), dark);
  } catch { /* Storage may be disabled; default stylesheet remains usable. */ }
}
