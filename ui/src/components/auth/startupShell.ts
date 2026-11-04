import type { StartupTiming } from '../../../../apps/desktop/src/startupPresentation';

export function hasStartupShell() {
  return Boolean(window.__ninegclawStartupUpdate && document.getElementById('startup'));
}

export function updateStartupShell(state: StartupTiming, language: string, leaving: boolean) {
  const element = document.getElementById('startup');
  if (!element || !window.__ninegclawStartupUpdate) return;
  element.style.visibility = 'visible';
  window.__ninegclawStartupUpdate({ ...state, language, leaving });
}

export function hideStartupShell() {
  const element = document.getElementById('startup');
  if (element) element.style.visibility = 'hidden';
}

export function releaseStartupShell() {
  window.__ninegclawStartupCleanup?.();
  document.getElementById('9gclaw-startup-shell')?.remove();
  delete window.__ninegclawStartupCleanup;
  delete window.__ninegclawStartupUpdate;
}
