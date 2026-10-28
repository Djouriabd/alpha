import 'server-only';

import { EXCHANGE_ENDPOINTS, type ExchangeEndpoint } from '@/lib/exchange-endpoints';
import type { ExchangeCheckResponseBody, ExchangeMonitorState, ExchangeSnapshot } from '@/lib/types';

const REQUEST_TIMEOUT_MS = 8_000;
// Viewers whose checks land within this window share one upstream run, so many open
// tabs never multiply the traffic sent to the exchanges or trip their rate limits.
const SHARED_RESULT_TTL_MS = 10_000;
// 451 (legal) and 403 (CDN country block) are how Binance and Bybit refuse restricted regions.
const GEO_BLOCK_STATUSES = new Set([403, 451]);
// Some exchange CDNs reject requests that do not look like they come from a browser.
const REQUEST_HEADERS = {
  Accept: 'application/json',
  'Cache-Control': 'no-cache',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};

function findStatusField(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const queue: Record<string, unknown>[] = [value as Record<string, unknown>];

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    if (Object.prototype.hasOwnProperty.call(current, 'status')) return current.status;
    Object.values(current).forEach((child) => {
      if (child && typeof child === 'object') queue.push(child as Record<string, unknown>);
    });
  }
  return undefined;
}

function displayStatus(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

async function checkEndpoint(endpoint: ExchangeEndpoint): Promise<ExchangeSnapshot> {
  const checkedAt = new Date().toISOString();
  const urls = [endpoint.url, ...(endpoint.fallbackUrls ?? [])];
  let startedAt = Date.now();

  try {
    let response!: Response;
    let checkedUrl = endpoint.url;
    for (const [index, url] of urls.entries()) {
      startedAt = Date.now();
      checkedUrl = url;
      response = await fetch(url, {
        method: 'GET',
        headers: REQUEST_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // Geo-blocks answer instantly, so trying the next domain costs almost nothing.
      if (!GEO_BLOCK_STATUSES.has(response.status) || index === urls.length - 1) break;
      await response.body?.cancel().catch(() => undefined);
    }
    const latencyMs = Date.now() - startedAt;
    let state: ExchangeMonitorState = response.ok ? 'healthy' : 'error';
    if (response.status === 502) state = 'bad-gateway';
    else if (response.status === 503) state = 'unavailable';
    else if (GEO_BLOCK_STATUSES.has(response.status)) state = 'blocked';

    let observedStatus: string | undefined;
    if (response.ok) {
      try {
        const rawStatus = findStatusField(await response.json());
        if (rawStatus !== undefined) observedStatus = displayStatus(rawStatus);
      } catch {
        // A valid HTTP response without JSON is still reachable; only literal status fields are compared.
      }
    } else {
      await response.body?.cancel().catch(() => undefined);
    }

    return {
      endpointId: endpoint.id,
      checkedAt,
      state,
      httpStatus: response.status,
      latencyMs,
      observedStatus,
      checkedUrl: checkedUrl === endpoint.url || state === 'blocked' ? undefined : checkedUrl,
    };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      endpointId: endpoint.id,
      checkedAt,
      state: timedOut ? 'timeout' : 'error',
      latencyMs: Date.now() - startedAt,
    };
  }
}

let activeCheck: Promise<ExchangeCheckResponseBody> | null = null;
let lastResult: { body: ExchangeCheckResponseBody; at: number } | null = null;

async function performCheck(): Promise<ExchangeCheckResponseBody> {
  // checkEndpoint never rejects, so one slow or failing exchange cannot hold back the others.
  const snapshots = await Promise.all(EXCHANGE_ENDPOINTS.map(checkEndpoint));
  const body = { snapshots, checkedAt: new Date().toISOString() };
  lastResult = { body, at: Date.now() };
  return body;
}

export function runExchangeCheck() {
  if (lastResult && Date.now() - lastResult.at < SHARED_RESULT_TTL_MS) return Promise.resolve(lastResult.body);
  if (!activeCheck) {
    activeCheck = performCheck().finally(() => {
      activeCheck = null;
    });
  }
  return activeCheck;
}
