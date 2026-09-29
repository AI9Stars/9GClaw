import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../../contexts/ThemeContext';
import { deriveLightColors, isHexColor, LIGHT_PRESETS, selectedPalette, type LightAppearance, type LightPalette, type LightPreset, type ThemeMode } from '../../../../lib/lightAppearance';
import { deleteBackgroundImage, saveBackgroundImage } from '../../../../lib/appearanceImages';
import './appearance.css';

type ThemeState = {
  themeMode: ThemeMode; setThemeMode: (mode: ThemeMode) => void; isDarkMode: boolean;
  lightAppearance: LightAppearance;
  updateLightAppearance: (update: (current: LightAppearance) => LightAppearance) => Promise<boolean>;
  resetLightAppearance: () => Promise<boolean>;
  appearanceError: string | null; imageMissing: boolean; imageUrl: string | null;
};
function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const [draft, setDraft] = useState(value);
  const id = useId();
  useEffect(() => setDraft(value), [value]);
  return <div className="appearance-row">
    <label htmlFor={id}>{label}</label>
    <div className="appearance-color-control">
      <input aria-label={label} type="color" value={value} onChange={event => onChange(event.target.value)} />
      <input id={id} aria-label={`${label} HEX`} value={draft} maxLength={7} spellCheck={false} aria-invalid={!isHexColor(draft)}
        onChange={event => { setDraft(event.target.value); if (isHexColor(event.target.value)) onChange(event.target.value); }}
        onBlur={() => { if (!isHexColor(draft)) setDraft(value); }} />
    </div>
  </div>;
}
function Slider({ label, value, min = 0, max, unit, onChange }: { label: string; value: number; min?: number; max: number; unit: string; onChange: (n: number) => void }) {
  const id = useId();
  return <div className="appearance-row">
    <label htmlFor={id}>{label}</label>
    <div className="appearance-slider"><input id={id} type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} /><output htmlFor={id}>{value}{unit}</output></div>
  </div>;
}
function Preview({ accent, background, dark = false, split = false }: { accent: string; background: string; dark?: boolean; split?: boolean }) {
  return <span className={`appearance-miniature ${dark ? 'is-dark' : ''} ${split ? 'is-system' : ''}`} style={{ '--preview-accent': accent, '--preview-bg': background } as CSSProperties} aria-hidden="true">
    <span className="mini-sidebar"><i /><i /><i /></span><span className="mini-main"><i /><i /><b /><i /></span>
  </span>;
}
export default function AppearanceSettings() {
  const { t } = useTranslation('settings');
  const theme = useTheme() as unknown as ThemeState;
  const { themeMode, setThemeMode, isDarkMode, lightAppearance: value, updateLightAppearance, resetLightAppearance, imageMissing, imageUrl, appearanceError } = theme;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const palette = selectedPalette(value);
  const colors = deriveLightColors(value);
  const label = (key: string) => t(`lightAppearance.${key}`);
  const setColor = (key: keyof LightPalette, color: string) => void updateLightAppearance(current => ({ ...current, preset: 'custom', custom: { ...selectedPalette(current), [key]: color } }));
  const setBackground = (patch: Partial<LightAppearance['background']>) => void updateLightAppearance(current => ({ ...current, background: { ...current.background, ...patch } }));
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true); setError(null);
    let id: string | null = null;
    try {
      id = await saveBackgroundImage(file);
      const committed = await updateLightAppearance(current => ({ ...current, background: { ...current.background, type: 'image', imageId: id } }));
      if (!committed) { await deleteBackgroundImage(id); setError('saveFailed'); }
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'invalidImage' ? 'invalidImage' : 'imageSaveFailed');
    } finally { setUploading(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  return <div className="appearance-settings">
    <section className="appearance-card">
      <h2>{label('mode')}</h2>
      <div className="appearance-modes">
        {(['system', 'light', 'dark'] as const).map(mode => <button key={mode} className="appearance-mode" type="button" aria-pressed={themeMode === mode} onClick={() => setThemeMode(mode)}>
          <Preview accent={mode === 'dark' ? LIGHT_PRESETS.default.accent : colors.accent} background={colors.background} dark={mode === 'dark'} split={mode === 'system'} />
          <span>{t(`settingsHome.appearanceMode.${mode}`)}</span><span className="appearance-radio" aria-hidden="true" />
        </button>)}
      </div>
    </section>

    {isDarkMode && <div className="appearance-notice"><span>{label('lightOnly')}</span><button type="button" onClick={() => setThemeMode('light')}>{label('editLight')}</button></div>}
    {(error || appearanceError) && <p className="appearance-error" role="alert">{label(error || appearanceError || 'saveFailed')}</p>}
    <fieldset disabled={isDarkMode || uploading} className="appearance-fields">
      <section className="appearance-card">
        <div className="appearance-section-heading"><h2>{label('presets')}</h2><span>{label('autoSave')}</span></div>
        <div className="appearance-presets">
          {(Object.entries(LIGHT_PRESETS) as [Exclude<LightPreset, 'custom'>, LightPalette][]).map(([key, p]) => <button key={key} type="button" className="appearance-preset" aria-pressed={value.preset === key} onClick={() => void updateLightAppearance(current => ({ ...current, preset: key }))}>
            <Preview {...p} /><span>{label(`preset.${key}`)}</span>
          </button>)}
          <button type="button" className="appearance-preset" aria-pressed={value.preset === 'custom'} onClick={() => void updateLightAppearance(current => ({ ...current, preset: 'custom' }))}>
            <Preview {...value.custom} /><span>{label('preset.custom')}</span>
          </button>
        </div>
        <ColorControl label={label('accent')} value={palette.accent} onChange={color => setColor('accent', color)} />
        <ColorControl label={label('backgroundColor')} value={palette.background} onChange={color => setColor('background', color)} />
        <p className="appearance-help">{label('colorHint')}</p>
      </section>

      <section className="appearance-card">
        <h2>{label('background')}</h2>
        <div className="appearance-segments" aria-label={label('background')}>
          {(['solid', 'gradient', 'image'] as const).map(type => <button type="button" key={type} aria-pressed={value.background.type === type} onClick={() => setBackground({ type })}>{label(type)}</button>)}
        </div>
        {value.background.type === 'gradient' && <>
          <ColorControl label={label('gradientStart')} value={palette.background} onChange={color => setColor('background', color)} />
          <ColorControl label={label('gradientEnd')} value={value.background.gradientEnd} onChange={gradientEnd => setBackground({ gradientEnd })} />
          <Slider label={label('angle')} value={value.background.angle} max={360} unit="°" onChange={angle => setBackground({ angle })} />
        </>}
        {value.background.type === 'image' && <>
          <div className="appearance-image-upload">
            {imageUrl && !imageMissing ? <img src={imageUrl} alt={label('imagePreview')} /> : <span className="appearance-image-placeholder" aria-hidden="true">▧</span>}
            <div><strong>{label(uploading ? 'uploading' : 'localImage')}</strong><p>{label('imageHint')}</p>
              <div className="appearance-image-actions"><button className="appearance-button" type="button" onClick={() => fileInput.current?.click()}>{label(value.background.imageId ? 'replaceImage' : 'chooseImage')}</button>
                {value.background.imageId && <button className="appearance-button" type="button" onClick={() => setBackground({ imageId: null })}>{label('removeImage')}</button>}</div>
            </div>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label={label('chooseImage')} hidden onChange={event => void upload(event.target.files?.[0])} />
          </div>
          {imageMissing && <p role="status" className="appearance-error">{label('imageMissing')}</p>}
          <div className="appearance-row"><label htmlFor="appearance-image-fit">{label('fit')}</label><select id="appearance-image-fit" value={value.background.fit} onChange={event => setBackground({ fit: event.target.value as 'cover' | 'contain' })}><option value="cover">{label('cover')}</option><option value="contain">{label('contain')}</option></select></div>
          <Slider label={label('intensity')} value={value.background.intensity} max={100} unit="%" onChange={intensity => setBackground({ intensity })} />
          <Slider label={label('blur')} value={value.background.blur} max={30} unit=" px" onChange={blur => setBackground({ blur })} />
        </>}
        <div className="appearance-live-preview" style={{ background: value.background.type === 'gradient' ? `linear-gradient(${value.background.angle}deg, ${palette.background}, ${value.background.gradientEnd})` : palette.background }} aria-label={label('preview')}>
          {value.background.type === 'image' && imageUrl && <span className="appearance-preview-image" style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})`, backgroundSize: value.background.fit, opacity: value.background.intensity / 100, filter: `blur(${value.background.blur}px)` }} />}
          <span className="appearance-preview-panel" style={{ background: `color-mix(in srgb, ${colors.sidebar} ${value.panelOpacity}%, transparent)`, color: colors.sidebarInk }}><span className="appearance-preview-dot" style={{ background: colors.sidebarAccent }} />{label('previewSidebar')}</span>
          <span className="appearance-preview-content" style={{ background: `color-mix(in srgb, ${colors.surface} ${colors.contentOpacity * 100}%, transparent)`, color: colors.ink }}><strong>{label('previewTitle')}</strong><span>{label('previewText')}</span><i style={{ background: colors.accent }} /></span>
        </div>
      </section>

      <section className="appearance-card">
        <h2>{label('transparency')}</h2>
        <Slider label={label('panelOpacity')} value={value.panelOpacity} min={60} max={100} unit="%" onChange={panelOpacity => void updateLightAppearance(current => ({ ...current, panelOpacity }))} />
        <p className="appearance-help">{label('opacityHint')}</p>
      </section>
      <div className="appearance-footer"><span>{label('deviceOnly')}</span><button type="button" className="appearance-button" onClick={() => { setError(null); void resetLightAppearance(); }}>{label('reset')}</button></div>
    </fieldset>
  </div>;
}
