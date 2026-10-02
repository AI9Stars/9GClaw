import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Accessibility, ChevronDown, Image as ImageIcon, Maximize2, Monitor, PaintBucket, Palette, SlidersHorizontal } from 'lucide-react';
import { useTheme } from '../../../../contexts/ThemeContext';
import { deriveLightBackgrounds, deriveLightColors, isHexColor, LIGHT_PRESETS, MAX_PANEL_OPACITY, selectedPalette, type LightAppearance, type LightPalette, type LightPreset, type ThemeMode } from '../../../../lib/lightAppearance';
import { deleteBackgroundImage, saveBackgroundImage } from '../../../../lib/appearanceImages';
import { normalizeInterfacePreferences, type InterfacePreferences } from '../../../../lib/interfacePreferences';
import { GeneralCardHeader, GeneralSelectControl, GeneralSettingRow, GeneralSettingsIcon } from '../../shared/view/GeneralSettingsPrimitives';
import SettingsToggle from '../../shared/view/SettingsToggle';
import './appearance.css';

type ThemeState = {
  themeMode: ThemeMode; setThemeMode: (mode: ThemeMode) => void; isDarkMode: boolean;
  lightAppearance: LightAppearance;
  updateLightAppearance: (update: (current: LightAppearance) => LightAppearance) => Promise<boolean>;
  resetLightAppearance: () => Promise<boolean>;
  appearanceError: string | null; imageMissing: boolean; imageUrl: string | null;
  preferences: InterfacePreferences; updatePreferences: (patch: Partial<InterfacePreferences>) => Promise<boolean>; preferencesError: boolean;
};
function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const [draft, setDraft] = useState(value);
  const id = useId();
  useEffect(() => setDraft(value), [value]);
  return <GeneralSettingRow icon={<GeneralSettingsIcon icon={Palette} />} title={label} htmlFor={id}>
    <div className="appearance-color-control">
      <input aria-label={label} type="color" value={value} onChange={event => onChange(event.target.value)} />
      <input id={id} aria-label={`${label} HEX`} value={draft} maxLength={7} spellCheck={false} aria-invalid={!isHexColor(draft)}
        onChange={event => { setDraft(event.target.value); if (isHexColor(event.target.value)) onChange(event.target.value); }}
        onBlur={() => { if (!isHexColor(draft)) setDraft(value); }} />
    </div>
  </GeneralSettingRow>;
}
function Slider({ label, value, min = 0, max, unit, onChange }: { label: string; value: number; min?: number; max: number; unit: string; onChange: (n: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <GeneralSettingRow icon={<GeneralSettingsIcon icon={SlidersHorizontal} />} title={label} htmlFor={id}>
    <div className="appearance-slider"><input id={id} type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} /><input aria-label={`${label} (${unit})`} type="number" min={min} max={max} value={draft} onChange={event => { setDraft(event.target.value); if (event.target.value !== '' && event.target.validity.valid) onChange(Number(event.target.value)); }} onBlur={() => { const n = Number(draft); if (draft === '' || !Number.isFinite(n)) setDraft(String(value)); else { const bounded = Math.round(Math.min(max, Math.max(min, n))); setDraft(String(bounded)); onChange(bounded); } }} /><span aria-hidden="true">{unit}</span></div>
  </GeneralSettingRow>;
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
  const [hardwareActive, setHardwareActive] = useState<boolean | null>(null);
  useEffect(() => { let active = true; window.pilotdeckDesktop?.getAppearanceCapabilities?.().then(result => { if (active) setHardwareActive(result.hardwareAcceleration); }).catch(() => {}); return () => { active = false; }; }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const palette = selectedPalette(value);
  const colors = deriveLightColors(value);
  const backgrounds = deriveLightBackgrounds(value, colors);
  const label = (key: string) => t(`lightAppearance.${key}`);
  const setColor = (key: keyof LightPalette, color: string) => void updateLightAppearance(current => ({ ...current, preset: 'custom', custom: { ...selectedPalette(current), [key]: color } }));
  const setBackground = (patch: Partial<LightAppearance['background']>) => { setError(null); void updateLightAppearance(current => ({ ...current, background: { ...current.background, ...patch } })); };
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
    <section className="general-card appearance-card">
      <GeneralCardHeader icon={<GeneralSettingsIcon icon={Monitor} />} title={label('mode')} />
      <div className="appearance-card-body appearance-modes">
        {(['system', 'light', 'dark'] as const).map(mode => <button key={mode} className="appearance-mode" type="button" aria-pressed={themeMode === mode} onClick={() => setThemeMode(mode)}>
          <Preview accent={mode === 'dark' ? LIGHT_PRESETS.default.accent : colors.accent} background={colors.background} dark={mode === 'dark'} split={mode === 'system'} />
          <span>{t(`settingsHome.appearanceMode.${mode}`)}</span><span className="appearance-radio" aria-hidden="true" />
        </button>)}
      </div>
    </section>

    {isDarkMode && <div className="appearance-notice"><span>{label('lightOnly')}</span><button type="button" onClick={() => setThemeMode('light')}>{label('editLight')}</button></div>}
    {(error || appearanceError || theme.preferencesError) && <p className="appearance-error" role="alert">{label(error || appearanceError || 'saveFailed')}</p>}
    <fieldset disabled={isDarkMode || uploading} className="appearance-fields">
      <section className="general-card appearance-card">
        <GeneralCardHeader icon={<GeneralSettingsIcon icon={Palette} />} title={label('presets')} extra={label('autoSave')} />
        <div className="appearance-card-body appearance-presets">
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

      <section className="general-card appearance-card">
        <GeneralCardHeader icon={<GeneralSettingsIcon icon={ImageIcon} />} title={label('background')} />
        <GeneralSettingRow icon={<GeneralSettingsIcon icon={PaintBucket} />} title={label('backgroundType')}>
        <div className="appearance-segments" aria-label={label('backgroundType')}>
          {(['solid', 'image'] as const).map(type => <button type="button" key={type} aria-pressed={value.background.type === type} onClick={() => setBackground({ type })}>{label(type)}</button>)}
        </div>
        </GeneralSettingRow>
        {value.background.type === 'image' && <>
          <div className="appearance-card-body appearance-image-upload" aria-busy={uploading} onDragOver={event => { if (!isDarkMode && !uploading) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!isDarkMode && !uploading) void upload(event.dataTransfer.files[0]); }}>
            {imageUrl && !imageMissing ? <img src={imageUrl} alt={label('imagePreview')} /> : <span className="appearance-image-placeholder" aria-hidden="true">▧</span>}
            <div className="general-setting-copy"><strong className="general-setting-title">{label(uploading ? 'uploading' : 'localImage')}</strong><p>{label('imageHint')}</p>
              <div className="appearance-image-actions"><button className="appearance-button" type="button" onClick={() => fileInput.current?.click()}>{label(value.background.imageId ? 'replaceImage' : 'chooseImage')}</button>
                {value.background.imageId && <button className="appearance-button" type="button" onClick={() => setBackground({ imageId: null })}>{label('removeImage')}</button>}</div>
            </div>
            <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.webp" aria-label={label('chooseImage')} hidden onChange={event => void upload(event.target.files?.[0])} />
          </div>
          {imageMissing && <p role="status" className="appearance-error">{label('imageMissing')}</p>}
          <GeneralSettingRow icon={<GeneralSettingsIcon icon={Maximize2} />} title={label('fit')} htmlFor="appearance-image-fit">
            <GeneralSelectControl id="appearance-image-fit" value={value.background.fit} onChange={fit => setBackground({ fit: fit as 'cover' | 'contain' })} options={['cover', 'contain'].map(fit => ({ value: fit, label: label(fit) }))} />
          </GeneralSettingRow>
          <Slider label={label('intensity')} value={value.background.intensity} max={100} unit="%" onChange={intensity => setBackground({ intensity })} />
          <Slider label={label('blur')} value={value.background.blur} max={30} unit=" px" onChange={blur => setBackground({ blur })} />
          <details className="appearance-details">
            <summary>{label('imageAdjustments')}</summary>
            <Slider label={label('brightness')} value={value.background.brightness} min={50} max={150} unit="%" onChange={brightness => setBackground({ brightness })} />
            <Slider label={label('saturation')} value={value.background.saturation} max={150} unit="%" onChange={saturation => setBackground({ saturation })} />
            <Slider label={label('positionX')} value={value.background.positionX} max={100} unit="%" onChange={positionX => setBackground({ positionX })} />
            <Slider label={label('positionY')} value={value.background.positionY} max={100} unit="%" onChange={positionY => setBackground({ positionY })} />
            <button className="appearance-button" type="button" onClick={() => setBackground({ intensity: 65, blur: 0, brightness: 100, saturation: 100, positionX: 50, positionY: 50, fit: 'cover' })}>{label('resetImageEffects')}</button>
          </details>
        </>}
        <div className="appearance-live-preview" style={{ background: backgrounds.backdrop }} aria-label={label('preview')}>
          {value.background.type === 'image' && imageUrl && <span className="appearance-preview-image" style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})`, backgroundSize: value.background.fit, backgroundPosition: `${value.background.positionX}% ${value.background.positionY}%`, opacity: value.background.intensity / 100, filter: `blur(${value.background.blur}px) brightness(${value.background.brightness}%) saturate(${value.background.saturation}%)` }} />}
          <span className="appearance-preview-fill appearance-preview-sidebar-fill" style={{ background: backgrounds.sidebar }} aria-hidden="true" />
          <span className="appearance-preview-fill appearance-preview-content-fill" style={{ background: backgrounds.content }} aria-hidden="true" />
          <span className="appearance-preview-panel" style={{ color: colors.sidebarInk }}><span className="appearance-preview-dot" style={{ background: colors.sidebarAccent }} />{label('previewSidebar')}</span>
          <span className="appearance-preview-content" style={{ color: colors.ink }}><strong>{label('previewTitle')}</strong><span>{label('previewText')}</span><i style={{ background: colors.accent }} /></span>
        </div>
        <details className="appearance-details"><summary>{label('panelAdjustments')}</summary>
          <Slider label={label('panelOpacity')} value={value.panelOpacity} min={60} max={MAX_PANEL_OPACITY} unit="%" onChange={panelOpacity => void updateLightAppearance(current => ({ ...current, panelOpacity }))} />
          <Slider label={label('contentOpacity')} value={value.contentOpacity} min={60} max={MAX_PANEL_OPACITY} unit="%" onChange={contentOpacity => void updateLightAppearance(current => ({ ...current, contentOpacity }))} />
          <p className="appearance-help">{label('opacityHint')}</p>
        </details>
      </section>
    </fieldset>
    <details className="general-card appearance-card appearance-details appearance-advanced">
      <summary className="general-card-header"><span className="general-card-header-icon" aria-hidden="true"><GeneralSettingsIcon icon={SlidersHorizontal} /></span><h2>{label('advanced')}</h2><GeneralSettingsIcon icon={ChevronDown} className="appearance-disclosure-icon" /></summary>
      <GeneralSettingRow icon={<GeneralSettingsIcon icon={Accessibility} />} title={label('reducedMotion')} detail={label('motionHint')} htmlFor="appearance-motion">
        <GeneralSelectControl id="appearance-motion" value={theme.preferences.reducedMotion} onChange={reducedMotion => void theme.updatePreferences({ reducedMotion: reducedMotion as InterfacePreferences['reducedMotion'] })}
          options={[{ value: 'system', label: t('settingsHome.appearanceMode.system') }, { value: 'on', label: label('on') }, { value: 'off', label: label('off') }]} />
      </GeneralSettingRow>
      <GeneralSettingRow title={label('hardwareAcceleration')} detail={label(window.pilotdeckDesktop ? 'hardwareHint' : 'browserHardwareHint')}>
        <SettingsToggle checked={theme.preferences.hardwareAcceleration} disabled={hardwareActive === null} ariaLabel={label('hardwareAcceleration')} showSuccessToast={false} onChange={hardwareAcceleration => void theme.updatePreferences({ hardwareAcceleration })} />
      </GeneralSettingRow>
      {hardwareActive !== null && hardwareActive !== theme.preferences.hardwareAcceleration && <p className="appearance-notice" role="status">{label('restartRequired')}</p>}
    </details>
    <div className="appearance-footer"><span>{label('deviceOnly')}</span><button type="button" disabled={uploading} className="appearance-button" onClick={async () => { setError(null); await resetLightAppearance(); await theme.updatePreferences(normalizeInterfacePreferences()); }}>{label('reset')}</button></div>
  </div>;
}
