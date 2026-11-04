import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from "electron";

import { installWindowChrome } from "./preloadChrome";
import type { DesktopCommand, DesktopMenuState } from "./desktopCommands";
import type { DesktopAppearance } from './appearance';
import type { FilePickerRequest, FilePickerResult } from './filePicker';
import type { NotificationPreferences, SystemNotification } from '../../../ui/shared/notifications';

installWindowChrome(process.platform, ipcRenderer);

type RuntimeStatus = {
  phase: string;
  message: string;
  logPath?: string;
  error?: string;
  progress?: number;
  startedAt?: number;
  phaseStartedAt?: number;
};

contextBridge.exposeInMainWorld("ninegclawDesktop", {
  platform: process.platform,
  getUninstallStatus: () => ipcRenderer.invoke('9gclaw:uninstall-status') as Promise<{ supported: boolean }>,
  uninstall: () => ipcRenderer.invoke('9gclaw:uninstall') as Promise<{ canceled: boolean }>,
  getNotificationStatus: () => ipcRenderer.invoke('9gclaw:notification-status'),
  setNotificationPreferences: (value: NotificationPreferences) => ipcRenderer.invoke('9gclaw:notification-preferences', value),
  showNotification: (value: SystemNotification) => ipcRenderer.invoke('9gclaw:notification-show', value),
  recordTaskReminder: (value: SystemNotification) => ipcRenderer.invoke('9gclaw:notification-reminder', value),
  setNotificationScope: (scope: string | null) => ipcRenderer.invoke('9gclaw:notification-scope', scope),
  openNotificationSettings: () => ipcRenderer.invoke('9gclaw:notification-settings'),
  onNotificationNavigate: (callback: (data: SystemNotification['data']) => void) => {
    const listener = (_event: IpcRendererEvent, data: SystemNotification['data']) => callback(data);
    ipcRenderer.on('9gclaw:notification-navigate', listener);
    return () => ipcRenderer.off('9gclaw:notification-navigate', listener);
  },
  // Zoom roles in the application menu drive these; the renderer polls the
  // factor on window resize to show transient feedback (webFrame has no events).
  getZoomFactor: () => webFrame.getZoomFactor(),
  resetZoom: () => {
    webFrame.setZoomLevel(0);
  },
  setMenuState: (state: DesktopMenuState) => ipcRenderer.invoke("9gclaw:menu-state", state),
  onCommand: (callback: (command: DesktopCommand) => void) => {
    const listener = (_event: IpcRendererEvent, command: DesktopCommand) => callback(command);
    ipcRenderer.on("9gclaw:command", listener);
    return () => ipcRenderer.off("9gclaw:command", listener);
  },
  getAppearance: () => ipcRenderer.sendSync("9gclaw:get-appearance") as DesktopAppearance | null,
  getAppearanceCapabilities: () => ipcRenderer.invoke('9gclaw:appearance-capabilities') as Promise<{ hardwareAcceleration: boolean }>,
  setAppearance: (value: Partial<DesktopAppearance>) => ipcRenderer.invoke("9gclaw:set-appearance", value),
  saveAppearanceImage: (bytes: Uint8Array) => ipcRenderer.invoke('9gclaw:save-appearance-image', bytes),
  readAppearanceImage: (id: string) => ipcRenderer.invoke('9gclaw:read-appearance-image', id),
  deleteAppearanceImage: (id: string) => ipcRenderer.invoke('9gclaw:delete-appearance-image', id),
  checkUpdates: () => ipcRenderer.invoke("9gclaw:update-check"),
  getUpdateStatus: () => ipcRenderer.invoke("9gclaw:update-status"),
  startUpdate: () => ipcRenderer.invoke("9gclaw:update-start"),
  cancelUpdate: () => ipcRenderer.invoke("9gclaw:update-cancel"),
  pauseUpdate: () => ipcRenderer.invoke("9gclaw:update-pause"),
  resumeUpdate: () => ipcRenderer.invoke("9gclaw:update-resume"),
  getRuntimeInfo: () => ipcRenderer.invoke("9gclaw:get-runtime-info"),
  getRuntimeStatus: () => ipcRenderer.sendSync('9gclaw:get-runtime-status') as RuntimeStatus | null,
  saveRuntimeLogs: () => ipcRenderer.invoke('9gclaw:save-runtime-logs') as Promise<{ canceled: boolean }>,
  getAboutInfo: () => ipcRenderer.invoke("9gclaw:about-info"),
  onRuntimeStatus: (callback: (status: RuntimeStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: RuntimeStatus) => callback(status);
    ipcRenderer.on("9gclaw:runtime-status", listener);
    return () => ipcRenderer.off("9gclaw:runtime-status", listener);
  },
  retryRuntime: () => ipcRenderer.invoke("9gclaw:retry-runtime"),
  openRuntimeLog: () => ipcRenderer.invoke("9gclaw:open-runtime-log"),
  pickFolder: () => ipcRenderer.invoke("9gclaw:pick-folder"),
  openDirectory: (directory: string) => ipcRenderer.invoke('9gclaw:open-directory', directory) as Promise<boolean>,
  pickFiles: (request: FilePickerRequest) => ipcRenderer.invoke('9gclaw:pick-files', request) as Promise<FilePickerResult>,
});
