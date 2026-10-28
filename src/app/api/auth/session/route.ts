import { noStoreJson } from '@/lib/server/respond';
import { clearSession, getSession, publicSession } from '@/lib/server/session';

export async function GET() {
  const session = await getSession();
  return noStoreJson({ session: session ? publicSession(session) : null });
}

export async function DELETE() {
  await clearSession();
  return noStoreJson({ session: null });
}
