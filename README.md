# Raisina Wire — Cloudflare-first platform starter

A premium, mobile-first editorial and geopolitical briefing platform with a live-data homepage, installable PWA, Cloudflare Worker API layer, optional D1-backed accounts/editorial tools, and a clear path to production deployment.

## What is live now

- **News and coverage clusters:** GDELT DOC 2.0 article search. The homepage refreshes on a timer and labels the actual last successful sync.
- **Market pulse:** Keyless market pulse: the Worker queries public Yahoo Finance chart endpoints for S&P 500, Apple, Reliance, TCS, USD/INR, EUR/USD, gold futures and WTI crude futures. Each quote carries source, timestamp/status, currency and percentage change when available. If both Yahoo endpoints fail for USD/INR, the UI may show Frankfurter’s daily reference rate. Other failed symbols are marked unavailable; no prices are fabricated. These public feeds are not guaranteed uptime or licensed real-time exchange feeds, and delay/coverage vary by instrument.
- **Fallback mode:** Without the key, Stooq daily closes and Frankfurter daily FX reference rates may appear, explicitly labelled as daily/delayed—not live intraday prices. Unavailable values remain blank rather than being fabricated.
- **Dynamic globe:** WebGL-free animated canvas globe with thematic coverage markers. Their visual emphasis can be connected to current article-category counts; the displayed locations are illustrative regional anchors, **not geolocated events or operational tracks**.
- **Installable PWA:** manifest, service worker, install prompt and responsive layout.
- **Member / admin foundation:** Worker routes and D1 schema for registration/login, session cookies, saved topics, articles, community discussions and moderation, events, leads, social metrics, member roles and audit log. The `/admin.html` control room separates Editorial CMS, Members, Community, Events, Sales & Leads, and Social Metrics. D1 and secrets must be configured before these endpoints become persistent/usable in production.
- **LinkedIn:** A follow button can link to the official Raisina Wire LinkedIn page once the exact public URL is configured. No scraping or automated extraction of private LinkedIn content is included.

## Data-source notes

1. GDELT is a broad global news-monitoring source. Results are not a substitute for editorial verification. Each story links to its publisher.
2. Market pulse uses public Yahoo Finance chart endpoints without a key. Coverage, delays, endpoint access and public-display rights can vary; this is not a guaranteed real-time exchange feed.
3. If Yahoo Finance is unavailable, USD/INR may fall back to Frankfurter, which provides a daily reference rate rather than real-time FX. Other unavailable instruments are shown as unavailable, never fabricated.

## Local preview

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

The Vite preview runs the static front-end. For live `/api/*` routes locally, use Wrangler:

```bash
npm run dev:worker
```

## Cloudflare deployment

1. Create a Cloudflare D1 database.
2. Update `database_id` in `wrangler.toml`.
3. Apply schema: `npx wrangler d1 migrations apply raisina-wire-db --remote`
4. Apply both migrations in order (the migration command applies pending migrations):
   ```bash
   npx wrangler d1 migrations apply raisina-wire-db --remote
   ```
5. Set secrets:
   - `SESSION_SECRET` — long random secret (32+ chars)
   - `ADMIN_EMAIL` — admin email address
   - `LINKEDIN_URL` — official public LinkedIn URL (optional)
   - Market data requires **no API key or signup**. No market-data secret is required.
6. Deploy:
   ```bash
   npm install
   npm run build
   npx wrangler deploy
   ```
7. In Cloudflare, confirm D1 binding `DB` is attached and the static asset directory points at `./dist`.

## First admin user

Register the intended admin email through the app. Then run the D1 statement shown in `migrations/0001_init.sql`'s comments or use the SQL below after checking the user's ID:
```sql
UPDATE users SET role='admin' WHERE email='your-admin@example.com';
```
Do not leave public self-registration with admin privileges enabled.

## Important production checklist

- Add email verification and password reset (currently not implemented).
- Add rate limiting / Turnstile on registration and login.
- Add a proper editorial approval workflow and expand the included article API into a full newsroom CMS before allowing broad newsroom publishing.
- Configure a real LinkedIn company/profile URL and only use authorised LinkedIn APIs for content publishing/import.
- Review GDELT and Yahoo Finance provider terms, source attribution, public-display permissions, uptime and rate limits. Market data is polled about once per minute and uses public endpoints that may change or throttle. It is not a guaranteed real-time exchange feed.
- Add a paid membership / payment provider before charging subscribers.
- Use HTTPS on your production domain and rotate all secrets.
- Review the included privacy notice and terms with counsel before public launch.

This package is a deployable MVP foundation. The public homepage, live news/market integrations, PWA shell and initial account/article API are included. Full discussion replies, event registration/ticketing, paid membership/billing, email recovery, advanced editorial workflow, verified analyst credentials, enterprise SSO and automated social platform analytics are not yet implemented and must not be represented as operational. The admin console includes initial article creation, event creation, member role management, discussion hide/remove actions, lead stage tracking, and source-labelled metric entry.
