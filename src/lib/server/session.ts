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

let fallbackKey: Buffer | null = null;

function encryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return createHash('sha256').update(secret).digest();

  // Without a configured secret, sessions only survive until the server restarts.
  if (!fallbackKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('SESSION_SECRET is missing or shorter than 32 characters. Sessions will reset on restart.');
    }
    fallbackKey = randomBytes(32);
  }
  return fallbackKey;
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
