import type {
  ExchangeAlertEvent,
  ExchangeMonitorConfig,
  ExchangeSnapshot,
  TrackingEvent,
} from '@/lib/types';

export type WebSettings = {
  backgroundChecks: boolean;
};

const HISTORY_KEY = 'alpha_tracking_history';
const LAST_VALUE_KEY = 'alpha_last_avg_percent';
const SETTINGS_KEY = 'alpha_web_settings_v1';
const EXCHANGE_CONFIG_KEY = 'alpha_exchange_monitor_config_v1';
const EXCHANGE_SNAPSHOTS_KEY = 'alpha_exchange_monitor_snapshots_v1';
const EXCHANGE_HISTORY_KEY = 'alpha_exchange_monitor_history_v1';
const EXCHANGE_STATUSES_KEY = 'alpha_exchange_monitor_status_values_v1';

export const STORAGE_KEYS = { history: HISTORY_KEY, exchangeHistory: EXCHANGE_HISTORY_KEY } as const;

export const DEFAULT_EXCHANGE_MONITOR_CONFIG: ExchangeMonitorConfig = {
  enabled: true,
  intervalSeconds: 30,
};

const DEFAULT_SETTINGS: WebSettings = { backgroundChecks: true };

// Storage can be unavailable (private windows, blocked site data) or full; tracking keeps working in memory.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota and privacy-mode failures.
  }
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore privacy-mode failures.
  }
}

export function getLastValue() {
  const value = read<number | null>(LAST_VALUE_KEY, null);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function setLastValue(value: number) {
  write(LAST_VALUE_KEY, Number(value.toFixed(2)));
}

export function clearLastValue() {
  remove(LAST_VALUE_KEY);
}

export function getHistory(): TrackingEvent[] {
  const value = read<TrackingEvent[]>(HISTORY_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function addHistory(event: TrackingEvent) {
  const current = getHistory();
  if (current.some((existing) => existing.id === event.id)) return current;
  const next = [event, ...current].slice(0, 60);
  write(HISTORY_KEY, next);
  return next;
}

export function clearHistory() {
  remove(HISTORY_KEY);
}

export function getSettings(): WebSettings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<WebSettings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(settings: WebSettings) {
  write(SETTINGS_KEY, settings);
}

export function getExchangeMonitorConfig(): ExchangeMonitorConfig {
  const parsed = read<Partial<ExchangeMonitorConfig>>(EXCHANGE_CONFIG_KEY, {});
  return {
    enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_EXCHANGE_MONITOR_CONFIG.enabled,
    intervalSeconds: typeof parsed.intervalSeconds === 'number'
      ? Math.max(15, parsed.intervalSeconds)
      : DEFAULT_EXCHANGE_MONITOR_CONFIG.intervalSeconds,
  };
}

export function saveExchangeMonitorConfig(config: ExchangeMonitorConfig) {
  write(EXCHANGE_CONFIG_KEY, config);
}

export function getExchangeSnapshots(): ExchangeSnapshot[] {
  const value = read<ExchangeSnapshot[]>(EXCHANGE_SNAPSHOTS_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function saveExchangeSnapshots(snapshots: ExchangeSnapshot[]) {
  write(EXCHANGE_SNAPSHOTS_KEY, snapshots);
}

export function getExchangeAlertHistory(): ExchangeAlertEvent[] {
  const value = read<ExchangeAlertEvent[]>(EXCHANGE_HISTORY_KEY, []);
  return Array.isArray(value) ? value : [];
}

/** Adds events not already recorded (another open tab may have saved them) and returns the ones that were new. */
export function addExchangeAlertEvents(events: ExchangeAlertEvent[]) {
  const current = getExchangeAlertHistory();
  const known = new Set(current.map((event) => event.id));
  const fresh = events.filter((event) => !known.has(event.id));
  if (fresh.length) write(EXCHANGE_HISTORY_KEY, [...fresh].reverse().concat(current).slice(0, 100));
  return fresh;
}

export function clearExchangeAlertHistory() {
  remove(EXCHANGE_HISTORY_KEY);
}

export function getExchangeStatusValues(): Record<string, string> {
  return read<Record<string, string>>(EXCHANGE_STATUSES_KEY, {});
}

export function saveExchangeStatusValues(values: Record<string, string>) {
  write(EXCHANGE_STATUSES_KEY, values);
}
