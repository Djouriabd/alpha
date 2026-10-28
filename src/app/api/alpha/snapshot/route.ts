import { fetchAlphaSnapshot, SessionExpiredError } from '@/lib/server/alpha-prime';
import { noStoreJson } from '@/lib/server/respond';
import { clearSession, getSession } from '@/lib/server/session';
import type { SnapshotResponseBody } from '@/lib/types';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return noStoreJson<SnapshotResponseBody>({ kind: 'expired', message: 'No Alpha Prime session.' }, 401);
  }

  try {
    const snapshot = await fetchAlphaSnapshot(session.jwt, session.fingerprint, session.wallet);
    return noStoreJson<SnapshotResponseBody>({ kind: 'ok', ...snapshot });
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      await clearSession();
      return noStoreJson<SnapshotResponseBody>({ kind: 'expired', message: error.message }, 401);
    }
    const message = error instanceof Error ? error.message : 'Alpha Prime is unavailable.';
    return noStoreJson<SnapshotResponseBody>({ kind: 'error', message }, 502);
  }
}
