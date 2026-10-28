# Alpha Web

Alpha Web is the Next.js website version of the Alpha mobile app. It connects to an Alpha Prime
account, tracks `AVG % TODAY` live, raises an alert whenever the value changes or the Alpha Prime
session expires, and runs **exchange watch** — a health monitor for the OKX, Binance, Bybit, KuCoin,
MEXC, and Gate.io public APIs.

## Features

- **Sign in** with email + password (with 6-digit 2FA when Alpha Prime asks for it) or with an
  Alpha Prime access token.
- **AVG % TODAY** refreshed every 30 seconds, with a live countdown and a manual refresh button.
- **Daily notifications feed** of every increase, decrease, and sign-out, with exact before/after
  values (last 60 kept).
- **Desktop notifications with sound** for changes and incidents (after you allow them in settings).
- **Exchange watch** at 30 s / 1 m / 5 m / 15 m: alerts on a request taking longer than 8 seconds,
  HTTP 502 or 503, or a change in the endpoint's `status` field after its first saved baseline
  (last 100 incidents kept).
- **Background checks** setting: keep tracking while the tab is hidden, or pause until you return.

## How it stays fast and stable

- **Server-side proxy.** The browser never calls Alpha Prime or the exchanges directly. Next.js
  route handlers do it with hard timeouts (15 s for Alpha Prime, 8 s per exchange), so CORS rules
  and slow upstreams can't break the page.
- **Isolated failures.** Each exchange is checked independently; one slow or failing exchange never
  holds back the others.
- **Shared exchange checks.** Requests arriving within 10 seconds share a single upstream run, so
  many open tabs or visitors don't multiply traffic or trip exchange rate limits.
- **No overlapping polls.** A check never starts while the previous one is still running. Requests
  are cancelled on sign-out, paused while offline, re-run when the connection or tab focus returns,
  and back off exponentially (up to 5 minutes) after repeated failures.
- **Background-tab friendly.** A single one-second clock runs in a Web Worker, which browsers
  throttle much less than normal timers in hidden tabs.
- **Minimal re-rendering.** Session, AVG tracking, and exchange watch live in separate React
  contexts, and only the countdown text re-renders every second.
- **Tabs stay in sync.** Sign-in/out is shared across tabs, feeds sync through storage events, and
  duplicate alerts are collapsed.
- **Crash containment.** An error boundary keeps the tracker running if a view fails to render, and
  storage failures (private mode, full quota) are ignored instead of thrown.

## Security

- Passwords go straight to Alpha Prime and are never stored.
- The Alpha Prime token is kept in an **AES-256-GCM encrypted, HTTP-only, SameSite cookie**. Page
  scripts cannot read it.
- The feed, settings, and exchange history are stored in the browser's `localStorage` only.

## Run locally

```bash
npm install
cp .env.example .env.local   # then set SESSION_SECRET
npm run dev
```

Open http://localhost:3000.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Deploying

Any Node.js host that runs Next.js works (Vercel, Netlify, Render, Railway, a VPS with `npm run build && npm start`).

1. Import this repository into your host.
2. Set the `SESSION_SECRET` environment variable (at least 32 random characters, see `.env.example`).
   Without it, everyone is signed out whenever the server restarts.
3. Deploy.

> **Region note:** Binance (HTTP 451) and Bybit (HTTP 403) refuse requests from some countries,
> including US-based servers, which is where Vercel runs by default. `vercel.json` pins the server
> to Frankfurt (`fra1`) to avoid this. When a block still happens, Alpha retries automatically on
> each exchange's official backup domain (`data-api.binance.vision`, `api.bytick.com`); if every
> domain is blocked, the card shows **Region blocked** instead of a failure. On other hosts, choose
> a server region outside the US.

## Limits of a website

A website can only track while at least one Alpha tab is open. Browsers may slow hidden tabs to
about one check per minute, and closing every tab pauses tracking until you return. For guaranteed
alerts with everything closed, polling must run on an always-on backend that sends push notifications.

## Project structure

```
src/
  app/
    page.tsx                  dashboard / sign-in
    status-monitor/page.tsx   exchange watch
    api/auth/*                login, token login, session, logout
    api/alpha/snapshot        AVG % TODAY via Alpha Prime
    api/exchanges             shared exchange health check
  components/
    alpha-provider.tsx        session, AVG tracker, exchange watch state
    alpha-home.tsx            dashboard, feed, settings sheet
    exchange-watch.tsx        exchange watch screen
    login-screen.tsx
  lib/
    server/                   Alpha Prime client, encrypted session, exchange checker
    client/                   poller, worker heartbeat, storage, notifications
```
