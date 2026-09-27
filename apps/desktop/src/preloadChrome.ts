import type { IpcRenderer } from 'electron';
import { MAC_CAPTION_HEIGHT, WINDOWS_CAPTION_HEIGHT } from './windowChrome';

/** Desktop-owned caption exists on loading, sign-in, settings and error pages too. */
export function installWindowChrome(
  platform: NodeJS.Platform,
  ipc: Pick<IpcRenderer, 'on' | 'invoke' | 'sendSync'>,
): void {
  if (platform !== 'darwin' && platform !== 'win32') return;
  const install = () => {
    const root = document.documentElement;
    root.dataset.desktopPlatform = platform;
    const host = document.createElement('div');
    host.id = 'pilotdeck-window-caption';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { position:fixed; top:0; left:0; height:var(--desktop-caption-height); z-index:10000;
        width:100%; display:block; background:var(--desktop-caption-bg); color:var(--desktop-caption-fg);
        -webkit-app-region:drag; user-select:none; }
      :host([hidden]) { display:none; }
      :host([data-platform="win32"]) { left:env(titlebar-area-x,0px); width:env(titlebar-area-width,calc(100% - 150px)); }
      :host([data-integrated]) { width:var(--desktop-sidebar-width); box-sizing:border-box; border-right:1px solid var(--desktop-caption-border); }
      button { -webkit-app-region:no-drag; margin:4px 0 4px 12px; padding:0 12px; height:32px;
        display:flex; align-items:center; gap:12px; border:0; border-radius:6px;
        color:inherit; background:transparent; font:13px system-ui; cursor:default; }
      button:hover,button[aria-expanded="true"] { background:color-mix(in srgb,currentColor 10%,transparent); }
      button:focus-visible { outline:2px solid #818cf8; outline-offset:-2px; }
      span { font-size:18px; line-height:1; }
    `;
    shadow.append(style);
    host.dataset.platform = platform;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = 'PilotDeck <span aria-hidden="true">⋯</span>';
    if (platform === 'win32') shadow.append(button);
    const openMenu = async () => {
      if (button.getAttribute('aria-expanded') === 'true') return;
      button.setAttribute('aria-expanded', 'true');
      try {
        await ipc.invoke('pilotdeck:show-menu');
      } catch (error) { console.warn('Could not open application menu', error); }
      finally { button.setAttribute('aria-expanded', 'false'); }
    };
    // Preserve the input selection for native editing actions from the popup.
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => { void openMenu(); });
    window.addEventListener('keydown', event => {
      if (platform === 'win32' && event.key === 'F10' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); void openMenu();
      }
    });
    const sheet = document.createElement('style');
    sheet.textContent = `
      html[data-desktop-platform] { --desktop-caption-height:${platform === 'darwin' ? MAC_CAPTION_HEIGHT : WINDOWS_CAPTION_HEIGHT}px;
        --desktop-caption-bg:#fbfaff; --desktop-caption-fg:#262626; --desktop-bg:#fff; --desktop-caption-border:#e2dff3;
        --desktop-top-inset:var(--desktop-caption-height); }
      html[data-desktop-dark] { --desktop-caption-bg:#0a0a0a; --desktop-caption-fg:#e5e5e5; --desktop-bg:#0a0a0a; --desktop-caption-border:#262626; }
      html[data-desktop-fullscreen] { --desktop-caption-height:0px; }
      html[data-desktop-integrated] { --desktop-top-inset:0px; }
      html[data-desktop-platform] body { background:var(--desktop-bg); }
    `;
    document.head.append(sheet);
    document.body.append(host);
    const update = () => {
      const integrated = root.hasAttribute('data-desktop-integrated');
      host.toggleAttribute('data-integrated', integrated);
      host.hidden = root.hasAttribute('data-desktop-fullscreen');
      const zh = root.lang.startsWith('zh');
      button.setAttribute('aria-label', zh ? 'PilotDeck 应用菜单' : 'PilotDeck application menu');
      button.title = zh ? '应用菜单 (F10)' : 'Application menu (F10)';
    };
    new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['data-desktop-integrated', 'data-desktop-fullscreen', 'lang'] });
    const applyState = (state: { fullscreen: boolean; dark: boolean }) => {
      root.toggleAttribute('data-desktop-fullscreen', state.fullscreen);
      root.toggleAttribute('data-desktop-dark', state.dark);
      update();
    };
    ipc.on('pilotdeck:window-state', (_event, state) => applyState(state));
    applyState(ipc.sendSync('pilotdeck:get-window-state'));
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}
