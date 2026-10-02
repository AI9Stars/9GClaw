// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { contrast, DEFAULT_PANEL_OPACITY, deriveLightBackgrounds, deriveLightColors, LIGHT_PRESETS, MAX_PANEL_OPACITY, normalizeLightAppearance, selectedPalette, isImageId, mixColor, hasBackgroundImage, isCustomizedLightAppearance, withoutMissingImage } from './lightAppearance';
import { applyLightAppearance } from './appearanceRuntime';

const IMAGE = { type: 'image', imageId: '12345678-1234-1234-1234-123456789012.png' };
describe('light appearance', () => {
  it('migrates missing settings and rejects malformed colors, paths and ranges', () => {
    expect(normalizeLightAppearance().preset).toBe('default');
    const result = normalizeLightAppearance({ preset: '__proto__', custom: { accent: 'red;display:none' }, panelOpacity: 2, background: { imageId: '../../secret', blur: 500, intensity: NaN } });
    expect(result.preset).toBe('default');
    expect(result.custom.accent).toBe(LIGHT_PRESETS.default.accent);
    expect(result.panelOpacity).toBe(60);
    expect(result.background).toMatchObject({ imageId: null, blur: 30, intensity: 65 });
    expect(isImageId('12345678-1234-1234-1234-123456789012.webp')).toBe(true);
  });
  it('preserves the custom palette while selecting other presets', () => {
    const custom = { accent: '#ac1256', background: '#fbf2ed' };
    const v = normalizeLightAppearance({ preset: 'blue', custom });
    expect(selectedPalette(v)).toEqual(LIGHT_PRESETS.blue);
    expect(selectedPalette({ ...v, preset: 'custom' })).toEqual(custom);
  });
  it.each([...Object.keys(LIGHT_PRESETS), 'custom'])('provides readable UI colors for %s', preset => {
    const custom = { accent: '#ffffee', background: '#000000' };
    const solid = deriveLightColors(normalizeLightAppearance({ preset, custom, panelOpacity: 60 }));
    expect(solid.surface).toBe('#ffffff');
    expect(contrast(solid.accent, solid.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(solid.ink, solid.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(solid.muted, solid.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(solid.sidebarInk, solid.sidebar)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(solid.sidebarAccent, solid.sidebar)).toBeGreaterThanOrEqual(4.5);
    const c = deriveLightColors(normalizeLightAppearance({ preset, custom, panelOpacity: 60, background: IMAGE }));
    const darkestComposite = mixColor(c.sidebar, '#000000', .4);
    expect(contrast(c.sidebarInk, darkestComposite)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.sidebarAccent, darkestComposite)).toBeGreaterThanOrEqual(4.5);
  });
  it.each([...Object.keys(LIGHT_PRESETS), 'custom'])('keeps reading surfaces white and only tints the chrome for solid %s', preset => {
    const v = normalizeLightAppearance({ preset, custom: { accent: '#ac1256', background: '#b9dfce' }, panelOpacity: 60, contentOpacity: 60 });
    const c = deriveLightColors(v);
    const fills = deriveLightBackgrounds(v, c);
    expect(fills.content).toBe('#ffffff');
    expect(fills.sidebar).toBe(c.sidebar);
    expect(fills.backdrop).toBe(selectedPalette(v).background);
    applyLightAppearance(v, false);
    const css = document.getElementById('pd-light-appearance')!.textContent!;
    if (preset === 'default') { expect(css).toBe(''); return; }
    expect(document.documentElement.getAttribute('data-light-background')).toBe('solid');
    for (const token of ['background', 'card', 'popover']) expect(css).toContain(`--${token}:0 0% 100%`);
    for (const token of ['muted', 'secondary', 'accent', 'border', 'input']) expect(css).not.toMatch(new RegExp(`--${token}:`));
  });
  it('removes all custom variables and image layers in dark mode and restores light', () => {
    const v = normalizeLightAppearance({ preset: 'rose', background: IMAGE });
    applyLightAppearance(v, false, 'blob:sample');
    expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(true);
    expect(document.documentElement.getAttribute('data-light-background')).toBe('image');
    expect(document.getElementById('pd-light-appearance')!.textContent).toContain('blob:sample');
    applyLightAppearance(v, true, 'blob:sample');
    expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(false);
    expect(document.documentElement.hasAttribute('data-light-background')).toBe(false);
    expect(document.getElementById('pd-light-appearance')!.textContent).toBe('');
    applyLightAppearance(v, false);
    expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(true);
    applyLightAppearance(normalizeLightAppearance(), false);
    expect(document.getElementById('pd-light-appearance')!.textContent).toBe('');
    expect(document.documentElement.hasAttribute('data-light-background')).toBe(false);
  });
  it('shows backgrounds automatically and migrates previously opaque panels', () => {
    const image = normalizeLightAppearance({ panelOpacity: 100, background: { type: 'image', imageId: '12345678-1234-1234-1234-123456789012.png' } });
    expect(image.panelOpacity).toBe(DEFAULT_PANEL_OPACITY);
    expect(normalizeLightAppearance().panelOpacity).toBe(DEFAULT_PANEL_OPACITY);
    expect(normalizeLightAppearance({ panelOpacity: 99 }).panelOpacity).toBe(MAX_PANEL_OPACITY);
    expect(normalizeLightAppearance({ panelOpacity: 72 }).panelOpacity).toBe(72);
    applyLightAppearance(image, false, 'blob:previously-hidden');
    const style = document.getElementById('pd-light-appearance')!;
    expect(style.textContent).toContain('--pd-wallpaper:url("blob:previously-hidden")');
    expect(style.textContent).toContain('--pd-panel-alpha:85%');
    expect(style.textContent).toContain('--pd-content-alpha:90%');
    expect(deriveLightBackgrounds(image).content).toContain('90%, transparent');
    applyLightAppearance(image, true);
    expect(style.textContent).toBe('');
    applyLightAppearance(normalizeLightAppearance({ panelOpacity: 100 }), false);
    expect(style.textContent).toBe('');
  });
  it('renders the solid background until an image is chosen or when it is missing', () => {
    const empty = normalizeLightAppearance({ background: { type: 'image' } });
    expect(hasBackgroundImage(empty)).toBe(false);
    expect(isCustomizedLightAppearance(empty)).toBe(false);
    applyLightAppearance(empty, false);
    expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(false);
    const rose = normalizeLightAppearance({ preset: 'rose', background: { type: 'image' } });
    applyLightAppearance(rose, false);
    expect(document.documentElement.getAttribute('data-light-background')).toBe('solid');
    expect(deriveLightBackgrounds(rose).content).toBe('#ffffff');
    const saved = normalizeLightAppearance({ preset: 'rose', background: IMAGE });
    expect(hasBackgroundImage(saved)).toBe(true);
    expect(withoutMissingImage(saved, false)).toBe(saved);
    const missing = withoutMissingImage(saved, true);
    expect(hasBackgroundImage(missing)).toBe(false);
    expect(saved.background.imageId).toBe(IMAGE.imageId);
    applyLightAppearance(missing, false, 'blob:stale');
    expect(document.documentElement.getAttribute('data-light-background')).toBe('solid');
    expect(document.getElementById('pd-light-appearance')!.textContent).toContain('--pd-wallpaper:none');
  });
  it('folds the removed gradient option into the solid background', () => {
    const legacy = normalizeLightAppearance({ preset: 'custom', custom: { background: '#b9dfce' }, background: { type: 'gradient', gradientEnd: '#e9bee4', angle: 45 } });
    expect(legacy.background.type).toBe('solid');
    expect(legacy.background).not.toHaveProperty('gradientEnd');
    expect(legacy.background).not.toHaveProperty('angle');
    expect(selectedPalette(legacy).background).toBe('#b9dfce');
    expect(deriveLightBackgrounds(legacy).backdrop).toBe('#b9dfce');
    applyLightAppearance(legacy, false);
    expect(document.documentElement.getAttribute('data-light-background')).toBe('solid');
    expect(document.getElementById('pd-light-appearance')!.textContent).not.toContain('linear-gradient');
    applyLightAppearance(legacy, true);
    expect(document.getElementById('pd-light-appearance')!.textContent).toBe('');
  });
  it('migrates the old reading fill and edits panel opacities independently', () => {
    expect(normalizeLightAppearance({ panelOpacity: 95 }).contentOpacity).toBe(95);
    expect(normalizeLightAppearance({ panelOpacity: 60 }).contentOpacity).toBe(90);
    const value = normalizeLightAppearance({ panelOpacity: 95, contentOpacity: 60, background: IMAGE });
    expect(deriveLightBackgrounds(value).sidebar).toContain('95%, transparent');
    expect(deriveLightBackgrounds(value).content).toContain('60%, transparent');
    expect(normalizeLightAppearance({ contentOpacity: NaN }).contentOpacity).toBe(90);
    expect(normalizeLightAppearance({ contentOpacity: 0 }).contentOpacity).toBe(60);
    expect(normalizeLightAppearance({ contentOpacity: 100 }).contentOpacity).toBe(95);
    applyLightAppearance(value, false);
    expect(document.getElementById('pd-light-appearance')!.textContent).toContain('--pd-content-alpha:60%');
    applyLightAppearance(value, true);
    expect(document.getElementById('pd-light-appearance')!.textContent).toBe('');
  });
  it.each(['#000000', '#ffffff', '#ff0000', '#0000ff', '#00ff00'])('keeps panel labels readable at opacity limits with %s', background => {
    for (const panelOpacity of [60, 85, MAX_PANEL_OPACITY, 100]) {
      for (const contentOpacity of [60, 90, MAX_PANEL_OPACITY]) {
        const v = normalizeLightAppearance({ preset: 'custom', custom: { background }, panelOpacity, contentOpacity, background: IMAGE });
        const c = deriveLightColors(v);
        expect(contrast(c.sidebarInk, mixColor(c.sidebar, '#000000', 1 - v.panelOpacity / 100))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.ink, mixColor(c.surface, '#000000', 1 - c.contentOpacity))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.muted, mixColor(c.surface, '#000000', 1 - c.contentOpacity))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
