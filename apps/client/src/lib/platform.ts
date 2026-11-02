export const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();

/** Kalıcı ayar okuma/yazma (WebView ve tarayıcıda localStorage). */
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem('ka:' + key);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem('ka:' + key, JSON.stringify(value)); } catch { /* depolama kapalı olabilir */ }
  },
};
