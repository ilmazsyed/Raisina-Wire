# Raisina Wire — Cloudflare-first platform starter

A premium, mobile-first editorial and geopolitical briefing platform with a live-data homepage, installable PWA, Cloudflare Worker API layer, optional D1-backed accounts/editorial tools, and a clear path to production deployment.

## What is live now

- **Raisina Wire editions, in the app:** all published editions of the LinkedIn newsletter, with full text, read inside the site (newest first on the home page, in the archive and in "More from Raisina Wire"). Each links to its original on LinkedIn. Data: `src/editions.js` (metadata) and `src/edition-bodies.json` (text, loaded only when an edition is opened). Artwork: `public/editions/<slug>.webp`.
- **Live wire:** `/api/wire` merges public RSS feeds from The Hindu, Indian Express, NDTV, Mint, BBC News, Al Jazeera and The Diplomat, newest first, de-duplicated and tagged India / Security / Diplomacy / Markets / Energy / World. Items older than 72 hours are dropped. A feed that fails is listed as unavailable; the others still show.
- **Reader view:** `/api/read?url=` fetches a story and extracts its headline, byline and paragraphs for in-app reading, with the publisher credited and a link to the original. Paywalled, script-only or blocked pages fall back to a "Read original" screen with the feed summary.
- **Markets:** `/api/markets` returns 39 instruments in eight groups (India indices, India stocks, defence stocks, global indices, currencies, commodities, US bond yields, crypto) with intraday sparklines, from public Yahoo Finance chart data. Delayed or last available; failed quotes are shown as unavailable, never estimated.
- **Accounts, community, events, contact form, admin control room** as before (D1 tables are created automatically on first use). The built-in admin is `ADMIN_EMAIL` with the `ADMIN_PASSWORD` secret.
- **Installable PWA:** manifest, service worker and install prompt.

## Adding a new Raisina Wire edition

1. Add its entry at the top of `src/editions.js` (slug, date, topic, title, dek, LinkedIn URL, image path, read minutes).
2. Add its text to `src/edition-bodies.json` under the same slug, as blocks of `{"t":"p"|"h"|"li","x":"text"}`.
3. Add artwork at `public/editions/<slug>.webp` (1600×1000).

## Data-source notes

1. GDELT is a broad global news-monitoring source. Results are not a substitute for editorial verification. Each story links to its publisher.
2. Market pulse uses public Yahoo Finance chart endpoints without a key. Coverage, delays, endpoint access and public-display rights can vary; this is not a guaranteed real-time exchange feed.
3. If Yahoo Finance is unavailable, USD/INR may fall back to Frankfurter, which provides a daily reference rate rather than real-time FX. Other unavailable instruments are shown as unavailable, never fabricated.

## Project layout

- `index.html`, `admin.html`, `privacy.html`, `terms.html` — Vite page entries (see `vite.config.js`)
- `src/main.js`, `src/style.css` — public site; `src/worker.js` — Cloudflare Worker API
- `admin.js`, `admin.css` — control room
- `public/` — copied as-is into `dist/` (favicon, manifest, service worker, `_headers`)
- `migrations/` — D1 schema migrations

## Visual system

The interface follows the Calibrex website style: Manrope for text and headlines, DM Mono for labels, Michroma for the wordmark, gold-gradient accents and glass panels on deep navy (`#070a12`).

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
