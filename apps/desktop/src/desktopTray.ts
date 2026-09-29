import type { Menu, MenuItemConstructorOptions, Tray } from 'electron';

type Options = {
  platform: NodeJS.Platform;
  createTray: () => Tray;
  buildMenu: (items: MenuItemConstructorOptions[]) => Menu;
  isChinese: () => boolean;
  open: () => Promise<void>;
  requestQuit: () => Promise<void>;
  reportError: (error: unknown) => void;
};

/** Keep the native tray/status item referenced until the application really exits. */
export function createDesktopTray(options: Options) {
  let tray: Tray | null = null;
  const available = () => tray !== null && !tray.isDestroyed();
  const invoke = (action: () => Promise<void>) => { void action().catch(options.reportError); };
  function refreshMenu() {
    if (!available()) return;
    const zh = options.isChinese();
    tray!.setContextMenu(options.buildMenu([
      { label: zh ? '打开主界面' : 'Open main window', click: () => invoke(options.open) },
      { type: 'separator' },
      { label: zh ? '退出程序' : 'Quit', click: () => invoke(options.requestQuit) },
    ]));
  }
  function dispose() {
    if (available()) tray!.destroy();
    tray = null;
  }
  try {
    tray = options.createTray();
    tray.setToolTip('PilotDeck');
    // macOS opens its native status menu on click. Do not also activate a window.
    if (options.platform === 'win32' || options.platform === 'linux') {
      tray.on('click', () => invoke(options.open));
    }
    if (options.platform === 'win32') {
      tray.on('double-click', () => invoke(options.open));
    }
    refreshMenu();
  } catch (error) {
    dispose();
    options.reportError(error);
  }
  return { available, refreshMenu, dispose };
}
