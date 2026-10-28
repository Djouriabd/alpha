'use client';

import styles from '@/components/ui.module.css';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.center}>
      <div className={styles.emptyCard}>
        <div className={`${styles.emptyIcon} ${styles.emptyIconAlert}`}>!</div>
        <h1 className={styles.emptyTitle}>Something went wrong</h1>
        <p className={styles.emptyText}>Tracking continues in the background. Reload this view to carry on.</p>
        <button className={styles.primaryButtonSmall} onClick={reset}>try again</button>
      </div>
    </main>
  );
}
