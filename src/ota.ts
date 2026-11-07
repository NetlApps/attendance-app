import { useEffect, useState } from 'react';
import { APP_VERSION } from './constants';

export type OtaStatus =
  | 'idle'
  | 'checking'
  | 'uptodate'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'need_permission'
  | 'error';

export interface OtaState {
  state: OtaStatus;
  currentVersion?: string;
  currentCode?: number;
  versionName?: string;
  versionCode?: number;
  apkUrl?: string;
  sha256?: string;
  size?: number;
  notes?: string;
  progress?: number;
  error?: string;
  checkedAt?: number;
}

export const OTA_LAST_CHECK_KEY = 'attendance-app-ota-last-check';
export const OTA_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const EMPTY_STATE: OtaState = { state: 'idle' };
const listeners = new Set<(state: OtaState) => void>();
let current: OtaState = EMPTY_STATE;

function parseState(raw: string | null | undefined): OtaState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OtaState>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.state !== 'string') return null;
    return {
      ...parsed,
      state: parsed.state as OtaStatus,
      progress:
        typeof parsed.progress === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.progress)))
          : undefined,
    };
  } catch {
    return null;
  }
}

function publish(next: OtaState | null): void {
  if (!next) return;
  current = next;
  for (const listener of listeners) listener(current);
}

export function isAndroidApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.AndroidApp);
}

/** Подключает события нативного загрузчика обновлений к React. */
export function initOtaBridge(): void {
  if (typeof window === 'undefined' || !window.AndroidApp?.getUpdateState) return;
  const initial = parseState(window.AndroidApp.getUpdateState());
  if (initial) current = initial;
  window.__onOtaEvent = (json: string) => publish(parseState(json));
}

export function getOtaState(): OtaState {
  return current;
}

export function useOtaState(): OtaState {
  const [state, setState] = useState<OtaState>(() => current);
  useEffect(() => {
    listeners.add(setState);
    const bridgeState = parseState(window.AndroidApp?.getUpdateState?.());
    if (bridgeState) setState(bridgeState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export function currentAppVersion(): string {
  const raw = window.AndroidApp?.getAppVersion?.();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { versionName?: string };
      if (parsed.versionName) return parsed.versionName;
    } catch {
      // Ниже используем версию из сборки.
    }
  }
  return APP_VERSION;
}

export function checkForUpdate(url: string): boolean {
  if (!window.AndroidApp?.checkUpdate || !url.trim()) return false;
  window.AndroidApp.checkUpdate(url.trim());
  return true;
}

export function downloadUpdate(installAfterDownload: boolean): void {
  window.AndroidApp?.downloadUpdate?.(installAfterDownload);
}

export function installUpdate(): void {
  window.AndroidApp?.installUpdate?.();
}

export function openUpdatePermission(): void {
  window.AndroidApp?.openUpdatePermission?.();
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`;
}
