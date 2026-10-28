'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useEffect, useMemo } from 'react';

import { useExchangeWatch, useSession } from '@/components/alpha-provider';
import { BootScreen, Countdown, formatTime, Spinner, Switch } from '@/components/common';
import { EXCHANGE_ENDPOINTS, EXCHANGE_INTERVAL_OPTIONS, type ExchangeEndpoint } from '@/lib/exchange-endpoints';
import type { ExchangeAlertEvent, ExchangeSnapshot } from '@/lib/types';
import styles from './ui.module.css';

function intervalLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${seconds / 60}m`;
}

function stateDetails(snapshot?: ExchangeSnapshot) {
  if (!snapshot) return { label: 'Waiting', tone: styles.toneIdle };
  switch (snapshot.state) {
    case 'healthy':
      return { label: 'Responding', tone: styles.toneGreen };
    case 'timeout':
      return { label: 'Timed out', tone: styles.toneRed };
    case 'bad-gateway':
      return { label: '502 Bad Gateway', tone: styles.toneRed };
    case 'unavailable':
      return { label: '503 Unavailable', tone: styles.toneRed };
    case 'blocked':
      return { label: 'Region blocked', tone: styles.toneAmber };
    case 'checking':
      return { label: 'Checking', tone: styles.toneAmber };
    default:
      return { label: 'Request failed', tone: styles.toneAmber };
  }
}

const EndpointCard = memo(function EndpointCard({ endpoint, snapshot }: {
  endpoint: ExchangeEndpoint;
  snapshot?: ExchangeSnapshot;
}) {
  const details = stateDetails(snapshot);
  return (
    <li className={styles.endpointCard}>
      <div className={`${styles.exchangeMark} ${details.tone}`} aria-hidden>{endpoint.shortName}</div>
      <div className={styles.eventBody}>
        <div className={styles.eventTopline} style={{ alignItems: 'center' }}>
          <p className={styles.exchangeName}>{endpoint.name}</p>
          <span className={`${styles.statePill} ${details.tone}`}>
            <span className={styles.stateDot} />
            {details.label}
          </span>
        </div>
        <p className={styles.endpointUrl}>{(snapshot?.checkedUrl ?? endpoint.url).replace('https://', '')}</p>
        <div className={styles.endpointMeta}>
          <span>{snapshot?.httpStatus ? `HTTP ${snapshot.httpStatus}` : 'No response yet'}</span>
          {snapshot?.latencyMs !== undefined && <span>{snapshot.latencyMs} ms</span>}
          {snapshot?.observedStatus !== undefined && (
            <span className={styles.observedStatus}>status: {snapshot.observedStatus}</span>
          )}
          {snapshot?.checkedUrl && <span className={styles.observedStatus}>backup domain</span>}
        </div>
        {snapshot?.state === 'blocked' && (
          <p className={styles.endpointHint}>
            {endpoint.name} refuses requests from the Alpha server&apos;s country. Host the server in another
            region (see README) to monitor it.
          </p>
        )}
      </div>
    </li>
  );
});

const AlertCard = memo(function AlertCard({ event }: { event: ExchangeAlertEvent }) {
  return (
    <li className={styles.eventCard}>
      <div className={`${styles.eventIcon} ${styles.eventIconAlert}`} aria-hidden>!</div>
      <div className={styles.eventBody}>
        <div className={styles.eventTopline}>
          <p className={styles.eventTitle}>{event.title}</p>
          <time className={styles.eventTime} dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
        </div>
        <p className={styles.eventMessage}>{event.message}</p>
      </div>
    </li>
  );
});

function ControlCard() {
  const { config, snapshots, checking, nextRunAt, checkNow, updateConfig } = useExchangeWatch();
  const respondingCount = snapshots.filter((snapshot) => snapshot.state === 'healthy').length;
  const lastCheckedAt = snapshots.reduce<string | null>(
    (latest, snapshot) => !latest || snapshot.checkedAt > latest ? snapshot.checkedAt : latest,
    null,
  );

  return (
    <section className={styles.controlCard} aria-label="Monitor controls">
      <div className={styles.controlTopline}>
        <div style={{ flex: 1 }}>
          <p className={styles.controlEyebrow}>LIVE MONITOR</p>
          <h2 className={styles.controlTitle}>Continuous checks</h2>
          <p className={styles.controlSubtitle}>Timeout · 502 · 503 · status changes</p>
        </div>
        <Switch
          dark
          checked={config.enabled}
          onChange={(enabled) => updateConfig({ ...config, enabled })}
          label="Continuous checks"
        />
      </div>

      <div className={styles.summaryRow}>
        <div>
          <p className={styles.summaryValue}>{respondingCount}/{EXCHANGE_ENDPOINTS.length}</p>
          <p className={styles.summaryLabel}>RESPONDING</p>
        </div>
        <div className={styles.summaryDivider} />
        <div>
          <p className={styles.summaryTime}>{lastCheckedAt ? formatTime(lastCheckedAt) : 'Not checked'}</p>
          <p className={styles.summaryLabel}>LAST RUN</p>
        </div>
        <button type="button" onClick={checkNow} disabled={checking || !config.enabled} className={styles.checkButton}>
          {checking ? <Spinner tone="dark" small /> : 'check now'}
        </button>
      </div>

      <p className={styles.intervalHeading}>CHECK EVERY</p>
      <div className={styles.intervalRow} role="radiogroup" aria-label="Check interval">
        {EXCHANGE_INTERVAL_OPTIONS.map((seconds) => {
          const selected = seconds === config.intervalSeconds;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              key={seconds}
              onClick={() => updateConfig({ ...config, intervalSeconds: seconds })}
              className={`${styles.intervalButton} ${selected ? styles.intervalButtonSelected : ''}`}>
              {intervalLabel(seconds)}
            </button>
          );
        })}
      </div>
      <p className={styles.nextCheck}>
        {!config.enabled ? 'Monitoring is paused' : checking ? 'Checking now…' : (
          <Countdown
            target={nextRunAt}
            totalSeconds={config.intervalSeconds}
            format={(seconds) => `Next check in ${seconds}s`}
          />
        )}
      </p>
    </section>
  );
}

export function ExchangeWatch() {
  const router = useRouter();
  const { status } = useSession();
  const { config, snapshots, history, error, clearAlerts } = useExchangeWatch();
  const snapshotMap = useMemo(
    () => new Map(snapshots.map((snapshot) => [snapshot.endpointId, snapshot])),
    [snapshots],
  );

  useEffect(() => {
    if (status === 'signed-out') router.replace('/');
  }, [router, status]);

  if (status !== 'signed-in') return <BootScreen />;

  const confirmClear = () => {
    if (window.confirm('Clear exchange alerts?\nThis removes the incident history from this browser.')) clearAlerts();
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.backButton} aria-label="Back to dashboard">‹</Link>
        <div style={{ flex: 1 }}>
          <p className={styles.eyebrow}>INFRASTRUCTURE</p>
          <h1 className={styles.title}>exchange watch</h1>
        </div>
        <div className={`${styles.headerPulse} ${config.enabled ? '' : styles.headerPulseOff}`}>
          <span className={`${styles.statusDot} ${config.enabled ? styles.statusDotLive : ''}`} />
          {config.enabled ? 'ON' : 'OFF'}
        </div>
      </header>

      <div className={styles.columns}>
        <div className={styles.sticky}>
          <ControlCard />
          {!!error && <p className={styles.errorBanner} role="alert">{error}</p>}
          <div className={styles.note}>
            <span className={styles.noteIcon}>◉</span>
            <p className={styles.noteText}>
              Checks run from the Alpha server at your selected interval while any Alpha tab is open, including the
              dashboard. Browsers may slow hidden tabs to about one check per minute.
            </p>
          </div>
        </div>

        <div>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>ENDPOINTS</p>
              <h2 className={styles.sectionTitle}>service health</h2>
            </div>
            <span className={styles.countPill}>{EXCHANGE_ENDPOINTS.length}</span>
          </div>
          <ul className={styles.list}>
            {EXCHANGE_ENDPOINTS.map((endpoint) => (
              <EndpointCard key={endpoint.id} endpoint={endpoint} snapshot={snapshotMap.get(endpoint.id)} />
            ))}
          </ul>

          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>ALERT LOG</p>
              <h2 className={styles.sectionTitle}>recent incidents</h2>
            </div>
            {!!history.length && (
              <button type="button" className={styles.clearButton} onClick={confirmClear}>clear</button>
            )}
          </div>
          {history.length ? (
            <ol className={styles.list}>
              {history.map((event) => <AlertCard event={event} key={event.id} />)}
            </ol>
          ) : (
            <div className={styles.emptyCard}>
              <div className={`${styles.emptyIcon} ${styles.emptyIconSoft}`}>✓</div>
              <p className={styles.emptyTitle}>No incidents detected</p>
              <p className={styles.emptyText}>
                Timeouts, gateway failures, outages, and status changes will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
