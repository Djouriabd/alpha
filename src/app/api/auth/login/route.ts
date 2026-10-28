import { loginWithEmail } from '@/lib/server/alpha-prime';
import { noStoreJson, readBody, stringField } from '@/lib/server/respond';
import { createFingerprint, getSession, publicSession, saveSession, type AlphaSession } from '@/lib/server/session';
import type { LoginResponseBody } from '@/lib/types';

export async function POST(request: Request) {
  const body = await readBody(request);
  const email = stringField(body, 'email').trim().toLowerCase();
  const password = stringField(body, 'password');
  const totp = stringField(body, 'totp');

  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6 || (totp && !/^\d{6}$/.test(totp))) {
    return noStoreJson<LoginResponseBody>({ kind: 'error', message: 'Check your email, password, and code.' }, 400);
  }

  const fingerprint = (await getSession())?.fingerprint ?? createFingerprint();
  const result = await loginWithEmail(email, password, fingerprint, totp || undefined);
  if (result.kind !== 'success') return noStoreJson<LoginResponseBody>(result);

  const session: AlphaSession = {
    email,
    jwt: result.jwt,
    userName: result.userName,
    wallet: result.wallet,
    fingerprint,
  };
  await saveSession(session);
  return noStoreJson<LoginResponseBody>({ kind: 'success', session: publicSession(session) });
}
