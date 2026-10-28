import { validateToken } from '@/lib/server/alpha-prime';
import { noStoreJson, readBody, stringField } from '@/lib/server/respond';
import { createFingerprint, publicSession, saveSession, type AlphaSession } from '@/lib/server/session';
import type { LoginResponseBody } from '@/lib/types';

export async function POST(request: Request) {
  const token = stringField(await readBody(request), 'token').trim();
  if (token.length < 20) {
    return noStoreJson<LoginResponseBody>({ kind: 'error', message: 'Paste a valid Alpha Prime access token.' }, 400);
  }

  try {
    const account = await validateToken(token);
    const session: AlphaSession = {
      email: 'Connected with token',
      jwt: token,
      userName: account.userName,
      wallet: account.wallet,
      fingerprint: createFingerprint(),
    };
    await saveSession(session);
    return noStoreJson<LoginResponseBody>({ kind: 'success', session: publicSession(session) });
  } catch (error) {
    // validateToken only throws errors whose messages are written for the user.
    const message = error instanceof Error ? error.message : 'Could not connect this account.';
    return noStoreJson<LoginResponseBody>({ kind: 'error', message });
  }
}
