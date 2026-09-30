// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { contrast, deriveLightBackgrounds, deriveLightColors, LIGHT_PRESETS, normalizeLightAppearance, selectedPalette, isImageId, mixColor } from './lightAppearance';
import { applyLightAppearance } from './appearanceRuntime';

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
    const c = deriveLightColors(normalizeLightAppearance({ preset, custom: { accent: '#ffffee', background: '#000000' }, panelOpacity: 60 }));
    expect(contrast(c.accent, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.ink, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.muted, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(c.contentOpacity).toBe(.9);
    const darkestComposite = mixColor(c.sidebar, '#000000', .4);
    expect(contrast(c.sidebarInk, darkestComposite)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.sidebarAccent, darkestComposite)).toBeGreaterThanOrEqual(4.5);
  });
  it('removes all custom variables and image layers in dark mode and restores light', () => {
    const v = normalizeLightAppearance({ preset: 'rose', background: { type: 'image' } });
    applyLightAppearance(v, false, 'blob:sample');
    expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(true);
    expect(document.getElementById('pd-light-appearance')!.textContent).toContain('blob:sample');
    applyLightAppearance(v, true, 'blob:sample');
    expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(false);
    expect(document.getElementById('pd-light-appearance')!.textContent).toBe('');
    applyLightAppearance(v, false);
    expect(document.documentElement.hasAttribute('data-light-appearance')).toBe(true);
    applyLightAppearance(normalizeLightAppearance(), false);
    expect(document.getElementById('pd-light-appearance')!.textContent).toBe('');
  });
  it('shows solid colors and both gradient endpoints even with opaque panels', () => {
    const solid = normalizeLightAppearance({ preset: 'custom', custom: { background: '#b9dfce' } });
    const c = deriveLightColors(solid);
    expect(c.sidebar).toBe('#c1e3d4');
    expect(deriveLightBackgrounds(solid).content).toBe(c.sidebar);
    const gradient = { ...solid, background: { ...solid.background, type: 'gradient' as const, gradientEnd: '#e9bee4', angle: 45 } };
    const fills = deriveLightBackgrounds(gradient);
    expect(fills.content).toContain('linear-gradient(45deg, #c1e3d4, #eecdea)');
    expect(fills.content).not.toContain('transparent');
    applyLightAppearance(gradient, false);
    expect(document.getElementById('pd-light-appearance')!.textContent).toContain(`--pd-content-fill:${fills.content}`);
    applyLightAppearance(gradient, true);
    expect(document.getElementById('pd-light-appearance')!.textContent).toBe('');
  });
  it.each(['#000000', '#ffffff', '#ff0000', '#0000ff', '#00ff00'])('keeps gradient labels readable at opacity limits with %s', background => {
    for (const panelOpacity of [60, 100]) {
      const v = normalizeLightAppearance({ preset: 'custom', custom: { background }, background: { type: 'gradient', gradientEnd: '#132243' }, panelOpacity });
      const c = deriveLightColors(v);
      for (let i = 0; i <= 10; i++) {
        const fill = mixColor(c.sidebar, c.panelEnd, i / 10);
        expect(contrast(c.sidebarInk, mixColor(fill, '#000000', 1 - panelOpacity / 100))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.ink, mixColor(fill, '#000000', 1 - c.contentOpacity))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.muted, mixColor(fill, '#000000', 1 - c.contentOpacity))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
