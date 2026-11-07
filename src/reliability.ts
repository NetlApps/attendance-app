export interface ReliabilityState {
  notifications: 'granted' | 'denied' | 'default';
  exactAlarms: boolean;
  batteryOptimized: boolean;
  manufacturer: string;
  sdk: number;
}

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.AndroidApp);
}

function parseState(raw: string | undefined): ReliabilityState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReliabilityState>;
    const notifications =
      value.notifications === 'granted' ||
      value.notifications === 'denied' ||
      value.notifications === 'default'
        ? value.notifications
        : 'default';
    return {
      notifications,
      exactAlarms: value.exactAlarms !== false,
      batteryOptimized: value.batteryOptimized === true,
      manufacturer: typeof value.manufacturer === 'string' ? value.manufacturer : '',
      sdk: typeof value.sdk === 'number' ? value.sdk : 0,
    };
  } catch {
    return null;
  }
}

/** Читает состояние разрешений из нативного моста APK. */
export function readReliabilityState(): ReliabilityState | null {
  if (typeof window === 'undefined' || !window.AndroidApp?.getReliabilityState) return null;
  try {
    return parseState(window.AndroidApp.getReliabilityState());
  } catch {
    return null;
  }
}

export function subscribeReliability(listener: (state: ReliabilityState) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (json: string) => {
    const state = parseState(json);
    if (state) listener(state);
  };
  window.__onReliabilityEvent = handler;
  return () => {
    if (window.__onReliabilityEvent === handler) window.__onReliabilityEvent = undefined;
  };
}

export function isXiaomiLike(state: ReliabilityState | null): boolean {
  if (!state) return false;
  const manufacturer = state.manufacturer.toLowerCase();
  return (
    manufacturer.includes('xiaomi') ||
    manufacturer.includes('redmi') ||
    manufacturer.includes('poco')
  );
}

export function requestExactAlarms(): void {
  window.AndroidApp?.requestExactAlarms?.();
}

export function requestBatteryExemption(): void {
  window.AndroidApp?.requestBatteryExemption?.();
}

export function openBatterySettings(): void {
  window.AndroidApp?.openBatterySettings?.();
}

export function openAutostartSettings(): void {
  window.AndroidApp?.openAutostartSettings?.();
}

export function openAppSettings(): void {
  window.AndroidApp?.openAppSettings?.();
}

export function testNotificationNow(): boolean {
  if (!window.AndroidApp?.testNotificationNow) return false;
  window.AndroidApp.testNotificationNow();
  return true;
}

export function testNotificationDelayed(seconds: number): boolean {
  if (!window.AndroidApp?.testNotificationDelayed) return false;
  window.AndroidApp.testNotificationDelayed(seconds);
  return true;
}
