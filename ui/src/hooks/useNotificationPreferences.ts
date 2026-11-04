import { useEffect, useState, useSyncExternalStore } from 'react';
import { defaultNotificationPreferences, normalizeNotificationPreferences, type NotificationPreferences, type DesktopNotificationStatus } from '../../shared/notifications';

const key = '9gclaw-notifications-v1';
const changed = '9gclaw:notification-preferences';
let snapshot: NotificationPreferences | undefined;
let nativeLoaded = false;
function read() {
  if (!snapshot) {
    try { snapshot = normalizeNotificationPreferences({ enabled: Boolean(window.ninegclawDesktop), ...JSON.parse(localStorage.getItem(key) || '{}') }); }
    catch { snapshot = { ...defaultNotificationPreferences, enabled: Boolean(window.ninegclawDesktop) }; }
  }
  return snapshot;
}
function publish(value: NotificationPreferences) {
  snapshot = normalizeNotificationPreferences(value);
  try { localStorage.setItem(key, JSON.stringify(snapshot)); } catch { /* In-memory preferences still work. */ }
  window.dispatchEvent(new Event(changed));
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === key) { snapshot = undefined; listener(); } };
  window.addEventListener(changed, listener);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(changed, listener); window.removeEventListener('storage', storage); };
}
export function getNotificationPreferences() { return read(); }
export async function setNotificationPreferences(patch: Partial<NotificationPreferences>) {
  const next = normalizeNotificationPreferences({ ...read(), ...patch });
  await window.ninegclawDesktop?.setNotificationPreferences?.(next);
  publish(next);
}
export function useNotificationPreferences() {
  const preferences = useSyncExternalStore(subscribe, read);
  const [status, setStatus] = useState<DesktopNotificationStatus>({ supported: false, permission: 'unknown' });
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const desktop = window.ninegclawDesktop;
      if (desktop?.getNotificationStatus) {
        const value = await desktop.getNotificationStatus();
        if (disposed) return;
        setStatus(value);
        if (!nativeLoaded) { nativeLoaded = true; publish(value.preferences); }
      } else {
        const supported = window.isSecureContext && 'Notification' in window;
        if (!disposed) setStatus({ supported, permission: supported ? Notification.permission : 'unknown' });
      }
    };
    const safeRefresh = () => { void refresh().catch(() => { /* The runtime may still be starting. */ }); };
    safeRefresh();
    window.addEventListener('focus', safeRefresh);
    document.addEventListener('visibilitychange', safeRefresh);
    window.addEventListener(changed, safeRefresh);
    return () => { disposed = true; window.removeEventListener('focus', safeRefresh); document.removeEventListener('visibilitychange', safeRefresh); window.removeEventListener(changed, safeRefresh); };
  }, []);
  const enable = async (enabled: boolean) => {
    if (enabled && !window.ninegclawDesktop) {
      if (!status.supported) return;
      const permission = await Notification.requestPermission();
      setStatus({ supported: true, permission });
      if (permission !== 'granted') return;
    }
    await setNotificationPreferences({ enabled });
  };
  return { preferences, status, enable, update: setNotificationPreferences };
}
