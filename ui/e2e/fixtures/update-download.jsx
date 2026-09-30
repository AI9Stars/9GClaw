import React from 'react';
import { createRoot } from 'react-dom/client';
import DesktopAboutSections from '../../src/components/settings/view/about/DesktopAboutSections';
import { applyLightAppearance } from '../../src/lib/appearanceRuntime';
import { normalizeLightAppearance } from '../../src/lib/lightAppearance';
import i18n from '../../src/i18n/config';
import '../../src/index.css';
import '../../src/components/settings/settings-page.css';
import '../../src/light-appearance.css';

await i18n.changeLanguage(new URLSearchParams(location.search).get('language') || 'zh-CN');
let state = { state: 'downloading', progress: .42, transferred: 84 * 1024 * 1024, total: 200 * 1024 * 1024, bytesPerSecond: 2.4 * 1024 * 1024 };
window.updateTest = {
  set: value => { state = { ...state, ...value }; },
  theme: (preset = 'default', dark = false) => {
    document.documentElement.classList.toggle('dark', dark);
    applyLightAppearance(normalizeLightAppearance({ preset }), dark);
  },
};
window.pilotdeckDesktop = {
  platform: 'linux',
  checkUpdates: async () => ({ hasUpdate: true, canDownload: true, checkUnavailable: false }),
  getUpdateStatus: async () => ({ ...state }),
  startUpdate: async () => { state = { ...state, state: 'downloading', progress: 0, transferred: 0 }; return { ...state }; },
  pauseUpdate: async () => { state = { ...state, state: 'paused', bytesPerSecond: 0 }; return { ...state }; },
  resumeUpdate: async () => { state = { ...state, state: 'downloading', bytesPerSecond: 2.4 * 1024 * 1024 }; return { ...state }; },
  cancelUpdate: async () => { state = { ...state, state: 'cancelled', reason: 'cancelled', bytesPerSecond: 0 }; return { ...state }; },
};
window.updateTest.theme();
createRoot(document.getElementById('root')).render(
  <main className="app-root" style={{ minHeight: '100vh', padding: 24 }}>
    <div className="pilotdeck-settings-app" style={{ display: 'block', maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 20 }}>PilotDeck</h1>
      <DesktopAboutSections title="About" checkingVersion={false} versionInfo={{ mode: 'desktop', currentVersion: '2026.1001.0', latestVersion: '2026.1002.0', latestPublishedAt: '2026-10-02', hasUpdate: true, canDownload: true, checkUnavailable: false, buildTime: null }} />
    </div>
  </main>,
);
