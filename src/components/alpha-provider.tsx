'use client';

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { EXCHANGE_ENDPOINTS } from '@/lib/exchange-endpoints';
import { notificationAccess, notify, requestNotificationAccess, type NotificationAccess } from '@/lib/client/notify';
import * as store from '@/lib/client/storage';
import { usePoller } from '@/lib/client/use-poller';
import type {
  ExchangeAlertEvent,
  ExchangeCheckResponseBody,
  ExchangeMonitorConfig,
  ExchangeSnapshot,
  SessionInfo,
  SnapshotResponseBody,
  TrackingEvent,
} from '@/lib/types';

export const AUTO_REFRESH_SECONDS = 30;

type SessionValue = {
  status: 'loading' | 'signed-out' | 'signed-in';
  session: SessionInfo | null;
  signIn: (session: SessionInfo) => void;
  signOut: () => Promise<void>;
};

type TrackerValue = {
  avg: number | null;
  lastSync: string | null;
  connection: 'connecting' | 'live' | 'offline';
  history: TrackingEvent[];
  nextRunAt: number | null;
  refreshing: boolean;
  refresh: () => void;
  clearHistory: () => void;
  settings: store.WebSettings;
  setBackgroundChecks: (enabled: boolean) => void;
  notifications: NotificationAccess;
  enableNotifications: () => Promise<void>;
};

type ExchangeValue = {
  config: ExchangeMonitorConfig;
  snapshots: ExchangeSnapshot[];
  history: ExchangeAlertEvent[];
  checking: boolean;
  error: string;
  nextRunAt: number | null;
  checkNow: () => void;
  updateConfig: (config: ExchangeMonitorConfig) => void;
  clearAlerts: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);
const TrackerContext = createContext<TrackerValue | null>(null);
const ExchangeContext = createContext<ExchangeValue | null>(null);

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} must be used inside <AlphaProvider>.`);
  return value;
}

export const useSession = () => required(use(SessionContext), 'useSession');
export const useTracker = () => required(use(TrackerContext), 'useTracker');
export const useExchangeWatch = () => required(use(ExchangeContext), 'useExchangeWatch');

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T | null }> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  let body: T | null = null;
  try {
    body = (await response.json()) as T;
  } catch {
    // Leave body empty; callers handle it by status.
  }
  return { status: response.status, body };
}

type ChannelMessage = { type: 'signed-in'; session: SessionInfo } | { type: 'signed-out' };

function openChannel() {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('alpha-web');
}

function exchangeIncidents(
  snapshots: ExchangeSnapshot[],
  previousStatuses: Record<string, string>,
): { events: ExchangeAlertEvent[]; statuses: Record<string, string> } {
  const statuses = { ...previousStatuses };
  const events: ExchangeAlertEvent[] = [];

  snapshots.forEach((snapshot) => {
    const endpoint = EXCHANGE_ENDPOINTS.find(({ id }) => id === snapshot.endpointId);
    if (!endpoint) return;
    const incident = (
      type: ExchangeAlertEvent['type'],
      title: string,
      message: string,
      extra?: Pick<ExchangeAlertEvent, 'previousStatus' | 'currentStatus'>,
    ) => events.push({
      // Shared server results carry the same timestamp, so other tabs produce the same id.
      id: `${snapshot.checkedAt}-${endpoint.id}-${type}`,
      endpointId: endpoint.id,
      exchangeName: endpoint.name,
      type,
      title,
      message,
      createdAt: snapshot.checkedAt,
      ...extra,
    });

    if (snapshot.state === 'timeout') incident('timeout', `${endpoint.name}: request timed out`, endpoint.url);
    else if (snapshot.state === 'bad-gateway') incident('http-502', `${endpoint.name}: 502 Bad Gateway`, endpoint.url);
    else if (snapshot.state === 'unavailable') incident('http-503', `${endpoint.name}: service unavailable`, endpoint.url);

    if (snapshot.observedStatus !== undefined) {
      const previousStatus = previousStatuses[endpoint.id];
      if (previousStatus !== undefined && previousStatus !== snapshot.observedStatus) {
        incident(
          'status-change',
          `${endpoint.name}: status changed`,
          `${previousStatus} → ${snapshot.observedStatus}`,
          { previousStatus, currentStatus: snapshot.observedStatus },
        );
      }
      statuses[endpoint.id] = snapshot.observedStatus;
    }
  });
  return { events, statuses };
}

export function AlphaProvider({ children }: { children: React.ReactNode }) {
  const [sessionStatus, setSessionStatus] = useState<SessionValue['status']>('loading');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [connection, setConnection] = useState<TrackerValue['connection']>('connecting');
  const [history, setHistory] = useState<TrackingEvent[]>([]);
  const [settings, setSettings] = useState<store.WebSettings>({ backgroundChecks: true });
  const [notifications, setNotifications] = useState<NotificationAccess>('default');
  const [exchangeConfig, setExchangeConfig] = useState(store.DEFAULT_EXCHANGE_MONITOR_CONFIG);
  const [snapshots, setSnapshots] = useState<ExchangeSnapshot[]>([]);
  const [exchangeHistory, setExchangeHistory] = useState<ExchangeAlertEvent[]>([]);
  const [exchangeError, setExchangeError] = useState('');
  const channel = useRef<BroadcastChannel | null>(null);

  const applySignedIn = useCallback((next: SessionInfo) => {
    setSession(next);
    setSessionStatus('signed-in');
    setConnection('connecting');
  }, []);

  const applySignedOut = useCallback(() => {
    store.clearLastValue();
    setSession(null);
    setSessionStatus('signed-out');
    setAvg(null);
    setLastSync(null);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    // A network blip while loading must not look like "signed out", so keep retrying until the
    // server gives a real answer.
    const loadSession = async (): Promise<SessionInfo | null> => {
      for (let attempt = 0; ; attempt++) {
        try {
          const { status, body } = await fetchJson<{ session: SessionInfo | null }>(
            '/api/auth/session',
            { signal: controller.signal },
          );
          if (status === 200 && body && 'session' in body) return body.session;
        } catch {
          // Retry below unless the provider unmounted.
        }
        if (!active) throw new Error('Unmounted');
        await new Promise((resolve) => setTimeout(resolve, Math.min(1_000 * 2 ** attempt, 10_000)));
      }
    };

    loadSession()
      .then((stored) => {
        if (!active) return;
        setHistory(store.getHistory());
        setSettings(store.getSettings());
        setNotifications(notificationAccess());
        setExchangeConfig(store.getExchangeMonitorConfig());
        setSnapshots(store.getExchangeSnapshots());
        setExchangeHistory(store.getExchangeAlertHistory());
        if (stored) applySignedIn(stored);
        else applySignedOut();
      })
      .catch(() => undefined);

    // Keep every open Alpha tab in step: sign-in state over a channel, feeds through storage events.
    channel.current = openChannel();
    if (channel.current) {
      channel.current.onmessage = (event: MessageEvent<ChannelMessage>) => {
        if (event.data.type === 'signed-in') applySignedIn(event.data.session);
        else applySignedOut();
      };
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === store.STORAGE_KEYS.history || event.key === null) setHistory(store.getHistory());
      if (event.key === store.STORAGE_KEYS.exchangeHistory || event.key === null) {
        setExchangeHistory(store.getExchangeAlertHistory());
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      active = false;
      controller.abort();
      window.removeEventListener('storage', onStorage);
      channel.current?.close();
      channel.current = null;
    };
  }, [applySignedIn, applySignedOut]);

  const signIn = useCallback((next: SessionInfo) => {
    applySignedIn(next);
    channel.current?.postMessage({ type: 'signed-in', session: next } satisfies ChannelMessage);
  }, [applySignedIn]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => undefined);
    applySignedOut();
    channel.current?.postMessage({ type: 'signed-out' } satisfies ChannelMessage);
  }, [applySignedOut]);

  const signedIn = sessionStatus === 'signed-in';

  const trackAverage = useCallback(async (signal: AbortSignal) => {
    let result: Awaited<ReturnType<typeof fetchJson<SnapshotResponseBody>>>;
    try {
      result = await fetchJson<SnapshotResponseBody>('/api/alpha/snapshot', { signal });
    } catch (error) {
      if (!signal.aborted) setConnection('offline');
      throw error;
    }
    const body = result.body;

    if (body?.kind === 'expired' || result.status === 401) {
      const event: TrackingEvent = {
        id: `${Date.now()}-session`,
        type: 'session',
        title: 'Alpha Prime signed out',
        message: 'Your session ended. Sign in again to continue tracking.',
        createdAt: new Date().toISOString(),
      };
      setHistory(store.addHistory(event));
      notify(event.title, 'Open Alpha and reconnect your Alpha Prime account.', { sound: 'alert', tag: 'alpha-session' });
      applySignedOut();
      channel.current?.postMessage({ type: 'signed-out' } satisfies ChannelMessage);
      return true;
    }
    if (body?.kind !== 'ok') {
      setConnection('offline');
      return false;
    }

    const value = body.avgPercentToday;
    const previous = store.getLastValue();
    store.setLastValue(value);
    setAvg(value);
    setLastSync(body.capturedAt);
    setConnection('live');

    if (previous !== null && previous !== value) {
      const increased = value > previous;
      const event: TrackingEvent = {
        id: `${Date.now()}-${value}`,
        type: increased ? 'increase' : 'decrease',
        title: increased ? 'AVG % increased' : 'AVG % decreased',
        message: `${previous.toFixed(2)}% to ${value.toFixed(2)}%`,
        previousValue: previous,
        currentValue: value,
        createdAt: body.capturedAt,
      };
      setHistory(store.addHistory(event));
      notify(event.title, `${previous.toFixed(2)}%  →  ${value.toFixed(2)}%`, {
        sound: 'rate',
        tag: `alpha-avg-${previous}-${value}`,
      });
    }
    return true;
  }, [applySignedOut]);

  const tracker = usePoller({
    enabled: signedIn,
    intervalMs: AUTO_REFRESH_SECONDS * 1_000,
    runInBackground: settings.backgroundChecks,
    task: trackAverage,
  });

  const watchExchanges = useCallback(async (signal: AbortSignal) => {
    setExchangeError('');
    try {
      const { status, body } = await fetchJson<ExchangeCheckResponseBody>('/api/exchanges', { signal });
      if (status !== 200 || !body?.snapshots) throw new Error('Exchange check failed.');

      const { events, statuses } = exchangeIncidents(body.snapshots, store.getExchangeStatusValues());
      store.saveExchangeSnapshots(body.snapshots);
      store.saveExchangeStatusValues(statuses);
      const fresh = store.addExchangeAlertEvents(events);
      setSnapshots(body.snapshots);
      setExchangeHistory(store.getExchangeAlertHistory());
      fresh.forEach((event) => notify(event.title, event.message, { sound: 'alert', tag: event.id }));
      return true;
    } catch (error) {
      if (!signal.aborted) setExchangeError('The monitor could not complete this check. Try again.');
      throw error;
    }
  }, []);

  const exchange = usePoller({
    enabled: signedIn && exchangeConfig.enabled,
    intervalMs: exchangeConfig.intervalSeconds * 1_000,
    runInBackground: settings.backgroundChecks,
    task: watchExchanges,
  });

  const sessionValue = useMemo<SessionValue>(() => ({
    status: sessionStatus,
    session,
    signIn,
    signOut,
  }), [session, sessionStatus, signIn, signOut]);

  const trackerValue = useMemo<TrackerValue>(() => ({
    avg,
    lastSync,
    connection,
    history,
    nextRunAt: tracker.nextRunAt,
    refreshing: tracker.running,
    refresh: tracker.runNow,
    clearHistory: () => {
      store.clearHistory();
      setHistory([]);
    },
    settings,
    setBackgroundChecks: (backgroundChecks) => {
      const next = { ...settings, backgroundChecks };
      store.saveSettings(next);
      setSettings(next);
    },
    notifications,
    enableNotifications: async () => setNotifications(await requestNotificationAccess()),
  }), [avg, connection, history, lastSync, notifications, settings, tracker.nextRunAt, tracker.runNow, tracker.running]);

  const exchangeValue = useMemo<ExchangeValue>(() => ({
    config: exchangeConfig,
    snapshots,
    history: exchangeHistory,
    checking: exchange.running,
    error: exchangeError,
    nextRunAt: exchange.nextRunAt,
    checkNow: exchange.runNow,
    updateConfig: (next) => {
      store.saveExchangeMonitorConfig(next);
      setExchangeConfig(next);
    },
    clearAlerts: () => {
      store.clearExchangeAlertHistory();
      setExchangeHistory([]);
    },
  }), [exchange.nextRunAt, exchange.runNow, exchange.running, exchangeConfig, exchangeError, exchangeHistory, snapshots]);

  return (
    <SessionContext value={sessionValue}>
      <TrackerContext value={trackerValue}>
        <ExchangeContext value={exchangeValue}>{children}</ExchangeContext>
      </TrackerContext>
    </SessionContext>
  );
}
