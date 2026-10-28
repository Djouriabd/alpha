'use client';

import Link from 'next/link';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { AUTO_REFRESH_SECONDS, useSession, useTracker } from '@/components/alpha-provider';
import { BootScreen, Countdown, formatClock, formatTime, Spinner, Switch } from '@/components/common';
import { LoginScreen } from '@/components/login-screen';
import type { SessionInfo, TrackingEvent } from '@/lib/types';
import styles from './ui.module.css';

const EventCard = memo(function EventCard({ event, latest }: { event: TrackingEvent; latest: boolean }) {
  const isSession = event.type === 'session';
  const isUp = event.type === 'increase';
  const iconClass = isSession ? styles.eventIconAlert : isUp ? styles.eventIconUp : styles.eventIconDown;
  return (
    <li className={`${styles.eventCard} ${latest ? styles.eventCardLatest : ''}`}>
      <div className={`${styles.eventIcon} ${iconClass}`} aria-hidden>
        {isSession ? '!' : isUp ? '↗' : '↘'}
      </div>
      <div className={styles.eventBody}>
        <div className={styles.eventTopline}>
          <p className={styles.eventTitle}>{event.title}</p>
          <time className={styles.eventTime} dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
        </div>
        <p className={styles.eventMessage}>{event.message}</p>
        {event.currentValue !== undefined && (
          <div className={styles.changeRow}>
            <span className={styles.oldValue}>{event.previousValue?.toFixed(2)}%</span>
            <span className={styles.changeArrow}>→</span>
            <span className={`${styles.newValue} ${isUp ? styles.up : styles.down}`}>
              {event.currentValue.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
    </li>
  );
});

function NotificationSetting() {
  const { notifications, enableNotifications } = useTracker();
  const caption = {
    granted: 'Desktop alerts with sound are on for this browser',
    default: 'Allow alerts so changes reach you in other tabs and apps',
    denied: 'Blocked — allow notifications for this site in your browser settings',
    unsupported: 'This browser does not support desktop notifications',
  }[notifications];

  return (
    <div className={styles.settingRow}>
      <div style={{ flex: 1 }}>
        <p className={styles.settingTitle}>desktop notifications</p>
        <p className={styles.settingCaption}>{caption}</p>
      </div>
      {notifications === 'default' ? (
        <button type="button" className={`${styles.settingBadge} ${styles.toneGreen}`} onClick={enableNotifications}>
          enable
        </button>
      ) : (
        <span className={`${styles.settingBadge} ${notifications === 'granted' ? styles.toneGreen : styles.toneIdle}`}>
          {notifications === 'granted' ? 'on' : 'off'}
        </span>
      )}
    </div>
  );
}

function MenuSheet({ session, onClose }: { session: SessionInfo; onClose: () => void }) {
  const { signOut } = useSession();
  const { settings, setBackgroundChecks, clearHistory } = useTracker();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, [onClose]);

  const removeHistory = () => {
    if (!window.confirm('Clear history?\nThis removes notification cards from Alpha.')) return;
    clearHistory();
    onClose();
  };

  const logout = async () => {
    if (!window.confirm('Log out of Alpha?\nTracking will stop until you reconnect.')) return;
    onClose();
    await signOut();
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Tracking settings"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}>
        <div className={styles.sheetHandle} />
        <h2 className={styles.sheetTitle}>tracking settings</h2>
        <p className={styles.sheetAccount}>{session.email}</p>
        <div className={styles.settingRow}>
          <div style={{ flex: 1 }}>
            <p className={styles.settingTitle}>background checks</p>
            <p className={styles.settingCaption}>Keep checking while this tab is hidden or minimized</p>
          </div>
          <Switch checked={settings.backgroundChecks} onChange={setBackgroundChecks} label="Background checks" />
        </div>
        <NotificationSetting />
        <Link href="/status-monitor" className={styles.settingRow} onClick={onClose}>
          <span className={styles.monitorIcon}>◉</span>
          <span>
            <span className={styles.settingTitle} style={{ display: 'block' }}>exchange watch</span>
            <span className={styles.settingCaption}>Monitor five exchange API endpoints</span>
          </span>
          <span className={styles.chevron}>›</span>
        </Link>
        <button type="button" className={styles.sheetAction} onClick={removeHistory}>
          clear notification history
        </button>
        <button type="button" className={`${styles.sheetAction} ${styles.sheetActionDanger}`} onClick={logout}>
          log out
        </button>
        <p className={styles.sheetFootnote}>
          Alpha checks every {AUTO_REFRESH_SECONDS} seconds while a tab is open. Browsers may slow checks in hidden
          tabs to about once a minute; closing every Alpha tab pauses tracking until you return.
        </p>
      </div>
    </div>
  );
}

function AverageCard() {
  const { avg, lastSync, connection, nextRunAt, refreshing, refresh } = useTracker();
  return (
    <section className={styles.averageCard} aria-label="Average percent today">
      <div className={styles.cardGlow} />
      <div className={styles.averageTopline}>
        <div className={styles.trendIcon} aria-hidden>↗</div>
        <div>
          <p className={styles.avgLabel}>AVG % TODAY</p>
          <p className={styles.avgSource}>ALPHA PRIME</p>
        </div>
        <div className={styles.pulsePill}>
          <span className={`${styles.statusDot} ${connection === 'live' ? styles.statusDotLive : ''}`} />
          {connection === 'live' ? 'LIVE' : 'SYNC'}
        </div>
      </div>
      <div className={styles.valueRow} aria-live="polite">
        {avg === null ? <Spinner /> : <p className={styles.avgValue}>{avg.toFixed(2)}%</p>}
      </div>
      <div className={styles.syncRow}>
        <span>{lastSync ? `updated ${formatTime(lastSync)}` : 'waiting for Alpha Prime'}</span>
        <span className={styles.syncAction}>
          <span className={styles.countdown}>
            <Countdown
              target={nextRunAt}
              totalSeconds={AUTO_REFRESH_SECONDS}
              format={(seconds) => `next refresh in ${formatClock(seconds)}`}
            />
          </span>
          <button type="button" className={styles.refreshButton} onClick={refresh} disabled={refreshing}>
            {refreshing ? 'syncing' : 'refresh'}
          </button>
        </span>
      </div>
    </section>
  );
}

function HomeScreen({ session }: { session: SessionInfo }) {
  const { connection, history, settings } = useTracker();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden>{session.userName.slice(0, 1).toUpperCase()}</div>
        <div className={styles.identity}>
          <p className={styles.userName}>{session.userName}</p>
          <p className={styles.liveRow}>
            <span className={`${styles.statusDot} ${connection === 'offline' ? styles.statusDotOff : ''}`} />
            {connection === 'offline' ? 'reconnecting' : 'tracking live'}
          </p>
        </div>
        <button
          type="button"
          className={styles.menuButton}
          aria-label="Open tracking settings"
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}>
          <span /><span /><span />
        </button>
      </header>

      <div className={styles.columns}>
        <div className={styles.sticky}>
          <AverageCard />
          <div className={styles.note}>
            <span className={styles.noteIcon}>◉</span>
            <div style={{ flex: 1 }}>
              <p className={styles.noteTitle}>Background checks are {settings.backgroundChecks ? 'on' : 'off'}</p>
              <p className={styles.noteText}>
                {settings.backgroundChecks
                  ? 'Alpha keeps checking while this tab is hidden, as long as it stays open.'
                  : 'Checks pause while this tab is hidden and resume when you come back.'}
              </p>
            </div>
          </div>
          <Link href="/status-monitor" className={styles.note}>
            <span className={styles.monitorIcon}>◉</span>
            <div style={{ flex: 1 }}>
              <p className={styles.noteTitle}>exchange watch</p>
              <p className={styles.noteText}>OKX, Binance, Bybit, KuCoin and MEXC health</p>
            </div>
            <span className={styles.chevron}>›</span>
          </Link>
        </div>

        <section aria-label="Notifications">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>YOUR FEED</p>
              <h2 className={styles.sectionTitle}>daily notifications</h2>
            </div>
            <span className={styles.countPill}>{history.length}</span>
          </div>

          {history.length ? (
            <ol className={styles.list}>
              {history.map((event, index) => <EventCard event={event} latest={index === 0} key={event.id} />)}
            </ol>
          ) : (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIcon}>↗</div>
              <p className={styles.emptyTitle}>All quiet for now</p>
              <p className={styles.emptyText}>
                When AVG % TODAY moves up or down, the alert and its exact values will appear here.
              </p>
            </div>
          )}
        </section>
      </div>

      {menuOpen && <MenuSheet session={session} onClose={closeMenu} />}
    </main>
  );
}

export function AlphaHome() {
  const { status, session } = useSession();
  if (status === 'loading') return <BootScreen />;
  if (!session) return <LoginScreen />;
  return <HomeScreen session={session} />;
}
