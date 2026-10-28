import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

import type { SessionInfo } from '@/lib/types';

export type AlphaSession = SessionInfo & {
  jwt: string;
  wallet?: string;
  fingerprint: string;
};

const SESSION_COOKIE = 'alpha_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

let warnedAboutSecret = false;

function encryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return createHash('sha256').update(secret).digest();

  // A per-process random key would sign people out whenever a request reached another server
  // instance or a restarted one, so fall back to the key baked into this build instead.
  if (!warnedAboutSecret && process.env.NODE_ENV === 'production') {
    warnedAboutSecret = true;
    console.warn('SESSION_SECRET is missing or shorter than 32 characters. Sessions will reset on each deploy.');
  }
  return createHash('sha256').update(process.env.BUILD_SESSION_KEY ?? 'alpha-dev-session-key').digest();
}

function seal(session: AlphaSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function unseal(value: string): AlphaSession | null {
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(json) as Partial<AlphaSession>;
    if (typeof parsed.jwt !== 'string' || typeof parsed.fingerprint !== 'string') return null;
    return parsed as AlphaSession;
  } catch {
    return null;
  }
}

export function createFingerprint() {
  return `alpha-web-${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export function publicSession(session: AlphaSession): SessionInfo {
  return { email: session.email, userName: session.userName };
}

export async function getSession() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? unseal(value) : null;
}

export async function saveSession(session: AlphaSession) {
  (await cookies()).set(SESSION_COOKIE, seal(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
