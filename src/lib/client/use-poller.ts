'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { subscribeHeartbeat } from '@/lib/client/heartbeat';

const MAX_BACKOFF_MS = 5 * 60_000;
const MIN_REFOCUS_GAP_MS = 10_000;

/** Resolve `false` (or throw) to report a failed run; repeated failures back off exponentially. */
export type PollTask = (signal: AbortSignal) => Promise<boolean>;

type PollerOptions = {
  enabled: boolean;
  intervalMs: number;
  runInBackground: boolean;
  task: PollTask;
};

/**
 * Runs `task` every `intervalMs` without ever overlapping runs. Requests are aborted when the
 * poller is disabled or unmounted, paused while offline, optionally paused in hidden tabs, and
 * re-run as soon as the tab regains focus or the connection returns.
 */
export function usePoller({ enabled, intervalMs, runInBackground, task }: PollerOptions) {
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const taskRef = useRef(task);
  const state = useRef({
    controller: null as AbortController | null,
    nextRunAt: 0,
    lastRunAt: 0,
    failures: 0,
  });

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  const execute = useCallback(async () => {
    const current = state.current;
    if (current.controller) return;
    const controller = new AbortController();
    current.controller = controller;
    setRunning(true);

    let ok = false;
    try {
      ok = await taskRef.current(controller.signal);
    } catch {
      ok = false;
    }

    if (current.controller !== controller) return;
    current.controller = null;
    current.lastRunAt = Date.now();
    current.failures = ok ? 0 : current.failures + 1;
    const delay = current.failures > 1
      ? Math.min(intervalMs * 2 ** (current.failures - 1), MAX_BACKOFF_MS)
      : intervalMs;
    current.nextRunAt = current.lastRunAt + delay;
    setNextRunAt(current.nextRunAt);
    setRunning(false);
  }, [intervalMs]);

  useEffect(() => {
    const current = state.current;
    if (!enabled) {
      current.controller?.abort();
      current.controller = null;
      // Forget the last run so the next enable checks immediately.
      current.lastRunAt = 0;
      return;
    }

    current.failures = 0;
    current.nextRunAt = current.lastRunAt ? current.lastRunAt + intervalMs : 0;

    const tick = () => {
      if (current.controller || !navigator.onLine) return;
      if (document.hidden && !runInBackground) return;
      if (Date.now() >= current.nextRunAt) void execute();
    };
    const runSoon = () => {
      if (document.hidden || current.controller) return;
      if (Date.now() - current.lastRunAt >= MIN_REFOCUS_GAP_MS) void execute();
    };

    const unsubscribe = subscribeHeartbeat(tick);
    document.addEventListener('visibilitychange', runSoon);
    window.addEventListener('online', runSoon);
    tick();

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', runSoon);
      window.removeEventListener('online', runSoon);
      current.controller?.abort();
      current.controller = null;
      setRunning(false);
    };
  }, [enabled, execute, intervalMs, runInBackground]);

  const runNow = useCallback(() => {
    if (enabled) void execute();
  }, [enabled, execute]);

  return { nextRunAt: enabled ? nextRunAt : null, running, runNow };
}
