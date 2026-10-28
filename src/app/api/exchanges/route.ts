import { runExchangeCheck } from '@/lib/server/exchange-check';
import { noStoreJson } from '@/lib/server/respond';
import { getSession } from '@/lib/server/session';

export async function GET() {
  // Reading the session cookie also keeps this handler out of build-time prerendering.
  if (!(await getSession())) return noStoreJson({ message: 'Sign in to use exchange watch.' }, 401);
  return noStoreJson(await runExchangeCheck());
}
