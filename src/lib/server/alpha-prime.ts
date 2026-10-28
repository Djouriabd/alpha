import 'server-only';

const API_ROOT = 'https://api.mrweb.app/api';
const REQUEST_TIMEOUT_MS = 15_000;

type AlphaPrimeResponse = {
  success?: boolean;
  jwt?: string;
  wallet?: string;
  user?: Record<string, unknown>;
  requires_2fa?: boolean;
  status?: string;
  error?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export type LoginResult =
  | { kind: 'success'; jwt: string; wallet?: string; userName: string }
  | { kind: 'two-factor'; message: string }
  | { kind: 'error'; message: string };

export type AlphaSnapshot = {
  avgPercentToday: number;
  capturedAt: string;
};

export class SessionExpiredError extends Error {}

// Alpha Prime can refuse a request with 403 BROWSER_REQUEST_REQUIRED. That refusal says nothing
// about the session, so it must be reported as a temporary failure, never as a sign-out.
const REFUSED_REQUEST_ERROR = 'BROWSER_REQUEST_REQUIRED';

function request(url: string, init: RequestInit) {
  return fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** True only when Alpha Prime rejects the token itself, not when it refuses or fails the call. */
function rejectsToken(response: Response, data: AlphaPrimeResponse | null) {
  if (response.status === 401) return true;
  return response.status === 403 && data?.error !== REFUSED_REQUEST_ERROR;
}

async function readJson(response: Response): Promise<AlphaPrimeResponse | null> {
  try {
    return (await response.json()) as AlphaPrimeResponse;
  } catch {
    return null;
  }
}

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function userDisplayName(user?: Record<string, unknown>) {
  const value = user?.username ?? user?.first_name ?? user?.name ?? user?.email;
  return typeof value === 'string' && value.trim() ? value.trim() : 'Alpha user';
}

export async function loginWithEmail(
  email: string,
  password: string,
  fingerprint: string,
  totpCode?: string,
): Promise<LoginResult> {
  try {
    const body: Record<string, string> = { email: email.trim().toLowerCase(), password };
    if (totpCode) body.totp_code = totpCode;

    const response = await request(`${API_ROOT}/auth/email/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-fp': fingerprint },
      body: JSON.stringify(body),
    });
    const data = (await readJson(response)) ?? {};

    if (data.requires_2fa) {
      return { kind: 'two-factor', message: data.error || 'Enter your 6-digit authenticator code.' };
    }
    if (data.error === REFUSED_REQUEST_ERROR) {
      return { kind: 'error', message: 'Alpha Prime refused the connection for a moment. Try again.' };
    }
    if (!response.ok || !data.success || !data.jwt) {
      const defaultMessage = data.status === 'pending_review'
        ? 'This Alpha Prime account is still pending review.'
        : data.status === 'blocked'
          ? 'This Alpha Prime account is suspended.'
          : 'Invalid email or password.';
      return { kind: 'error', message: data.error || data.message || defaultMessage };
    }
    return {
      kind: 'success',
      jwt: data.jwt,
      wallet: data.wallet,
      userName: userDisplayName(data.user),
    };
  } catch (error) {
    return { kind: 'error', message: unreachable(error).message };
  }
}

function unreachable(error: unknown) {
  return new Error(isTimeout(error)
    ? 'Alpha Prime took too long to respond. Try again.'
    : 'Could not reach Alpha Prime. Check your connection.');
}

export async function validateToken(jwt: string) {
  const response = await request(`${API_ROOT}/check-status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
  }).catch((error: unknown) => {
    throw unreachable(error);
  });
  const data = await readJson(response);
  if (rejectsToken(response, data) || (response.ok && data?.success === false)) {
    throw new SessionExpiredError('The Alpha Prime session is invalid.');
  }
  if (!response.ok || !data?.success) throw new Error('Alpha Prime is busy right now. Try again in a moment.');
  if (data.status === 'blocked') throw new Error('This Alpha Prime account is suspended.');
  return {
    wallet: data.wallet,
    userName: userDisplayName(data.user),
  };
}

export async function fetchAlphaSnapshot(
  jwt: string,
  fingerprint: string,
  wallet?: string,
): Promise<AlphaSnapshot> {
  const response = await request(`${API_ROOT}/userinfo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-device-fp': fingerprint,
    },
    body: JSON.stringify({ wallet: wallet || '' }),
  }).catch((error: unknown) => {
    throw unreachable(error);
  });

  // The status code below still gives the most useful error when the body is not JSON.
  const payload = await readJson(response);
  if (rejectsToken(response, payload)) {
    // Ask Alpha Prime a second time before signing anyone out, so a single glitchy answer cannot.
    const confirmed = await validateToken(jwt).then(() => false, (error: unknown) => error instanceof SessionExpiredError);
    if (confirmed) throw new SessionExpiredError('Your Alpha Prime session has ended.');
    throw new Error('Alpha Prime briefly refused the request.');
  }
  if (!response.ok || !payload?.success) {
    throw new Error('Alpha Prime did not return account data.');
  }

  const value = Number(payload.data?.apyPercent);
  if (!Number.isFinite(value)) throw new Error('AVG % TODAY was missing from the response.');
  return { avgPercentToday: Number(value.toFixed(2)), capturedAt: new Date().toISOString() };
}
