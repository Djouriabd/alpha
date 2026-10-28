'use client';

import Image from 'next/image';
import { useSyncExternalStore } from 'react';

import { subscribeHeartbeat } from '@/lib/client/heartbeat';
import styles from './ui.module.css';

let now = 0;

function subscribeNow(onChange: () => void) {
  now = Date.now();
  return subscribeHeartbeat(() => {
    now = Date.now();
    onChange();
  });
}

/** Renders the seconds left until `target`; only this element re-renders every second. */
export function Countdown({
  target,
  totalSeconds,
  format,
}: {
  target: number | null;
  totalSeconds: number;
  format: (secondsLeft: number) => string;
}) {
  const current = useSyncExternalStore(subscribeNow, () => now, () => 0);
  if (target === null || current === 0) return null;
  const secondsLeft = Math.min(totalSeconds, Math.max(0, Math.ceil((target - current) / 1_000)));
  return <>{format(secondsLeft)}</>;
}

export function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function Switch({
  checked,
  onChange,
  label,
  dark,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${styles.switch} ${dark ? styles.switchDark : ''}`}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Spinner({ tone, small }: { tone?: 'dark' | 'light'; small?: boolean }) {
  const toneClass = tone === 'dark' ? styles.spinnerDark : tone === 'light' ? styles.spinnerLight : '';
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`${styles.spinner} ${toneClass} ${small ? styles.spinnerSmall : ''}`}
    />
  );
}

export function BootScreen() {
  return (
    <main className={styles.boot}>
      <Image src="/logo.png" alt="Alpha" width={116} height={116} priority className={styles.bootLogo} />
      <Spinner />
    </main>
  );
}
