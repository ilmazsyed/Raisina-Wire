# Raisina Wire — Cloudflare-first platform starter

A premium, mobile-first editorial and geopolitical briefing platform with a live-data homepage, installable PWA, Cloudflare Worker API layer, optional D1-backed accounts/editorial tools, and a clear path to production deployment.

## What is live now

- **Stories CMS (editions and articles):** every story lives in D1 and is edited in the control room (Stories & editions). The 13 LinkedIn editions bundled in `src/editions.js` / `src/edition-bodies.json` are copied into D1 once, on first use, as `kind='edition'`, and are then edited like any article; the bundled copy stays in the app for offline reading. Each story has a type (edition or article), a writer, a kicker, a category, a publication date, a cover image, an optional hero image with caption, an optional original link, and the text. Editions live at `/edition/<slug>`, articles at `/article/<slug>`.
- **Writers:** Ilmaz Syed and the Raisina Wire desk (app icon as its picture), defined in `src/writers.js`. Each has a page at `/author/<key>` listing their stories; bylines link to it.
- **Images uploaded by writers:** the CMS uploads JPEG, PNG, WebP, AVIF or GIF, resized to at most 2000 px and compressed to WebP in the browser, stored in D1 (`images` table, up to 1.8 MB each) and served from `/media/<id>.webp` with year-long caching. Uploads can be reused from "Choose from uploads"; any `https://` image link also works.
- **For readers:** "Listen" reads any story aloud with the device's own voice (Indian English when available), highlighting each paragraph. Share buttons for WhatsApp, X, LinkedIn, Telegram, email and copy-link; selecting text in a story offers "Share quote" with a link that jumps to that passage. Light and dark mode (follows the device; the sun/moon button switches it and is remembered). Topics: every story has tags with their own pages (`/tag/<topic>`) and related stories at the end.
- **My Raisina (`/my`, members):** follow categories and topics to get your own front page; saved stories sync to the account and show on every device.
- **Alerts (on by default):** every published story (and every scheduled story when it goes live), every new briefing or event, live coverage when it starts, a morning brief at 9 am and an evening wrap at 9 pm India time, and major alerts sent from the control room's Alerts page. Each item's "Send an alert" box is ticked by default; the daily briefs can be switched off on the Alerts page. Every reader sees alerts in the site's bell inbox (with a count of new ones) and as a banner when one arrives while they are reading, with no permission needed. Phone and desktop notifications need the reader's one-time "Allow" (browsers require it): the site asks automatically on the first visit (again after three days if they chose "Not now"), and re-subscribes silently when permission was already given. Technically: standard Web Push with VAPID; the key pair is generated automatically and kept in D1; pushes carry no payload and the service worker shows the latest alert from `/api/alerts/latest`; a per-minute cron sends large lists in batches, releases scheduled-story alerts and sends the 9 am / 9 pm briefs exactly once. iPhone users must add the app to the Home Screen first (an Apple rule).
- **Calibrex:** "Powered by Calibrex" with the Calibrex mark at the foot of every page (site, control room, privacy, terms), linking to calibrex.org; an OSINT Studio advertisement above the footer and a smaller one in the community section and community page, linking to app.calibrex.org and calibrex.org/osint-studio/ (links carry utm_source=raisinawire). Assets: `public/partners/`.
- **CMS extras:** scheduled publishing (choose Publish with a future time), autosave of your typing on the device, Write/Preview tabs, headline and standfirst length guides, tags, story view counts (per story, last 30 days, no cookies; automated browsers and bots are not counted) and "Most read" on the overview. The control room works on phones: stories show as cards, and the save bar stays at the bottom.
- **Search engines (SEO):** clean URLs. The Worker renders every public page with its own title, description, canonical link, Open Graph/Twitter card, and schema.org data (NewsArticle/AnalysisNewsArticle, ProfilePage, DiscussionForumPosting, LiveBlogPosting, Event, BreadcrumbList, WebSite with search, NewsMediaOrganization). The story text is in the HTML. Also served: `/sitemap.xml` (with images), `/news-sitemap.xml` (Google News, last 48 hours), `/robots.txt`, and an RSS feed at `/feed.xml`. Missing stories return HTTP 404. Old `#/…` links redirect to the clean URLs in the browser.
- **Live wire:** `/api/wire` merges public RSS feeds from The Hindu, Indian Express, NDTV, Mint, BBC News, Al Jazeera and The Diplomat, newest first, de-duplicated and tagged India / Security / Diplomacy / Markets / Energy / World. Items older than 72 hours are dropped. A feed that fails is listed as unavailable; the others still show.
- **Reader view:** `/api/read?url=` fetches a story and extracts its headline, byline and paragraphs for in-app reading, with the publisher credited and a link to the original. Paywalled, script-only or blocked pages fall back to a "Read original" screen with the feed summary.
- **Markets:** `/api/markets` returns 39 instruments in eight groups (India indices, India stocks, defence stocks, global indices, currencies, commodities, US bond yields, crypto) with intraday sparklines, from public Yahoo Finance chart data. Delayed or last available; failed quotes are shown as unavailable, never estimated.
- **Live coverage (live blogs):** coverage opened in the control room's Live publishing view appears on the home page as a LIVE banner, in the top ticker and on its own page (`/coverage/<slug>`), which refreshes every 30 seconds. Closed coverage stays readable, marked as ended.
- **Editorial furniture:** a rolling headline ticker (with a pause button; it keeps moving even when the device asks for reduced motion) with world clocks, blinking live markers, The Briefing (one top story per desk), From the Editor (a line from the latest edition), drop caps, pull quotes and an author box in editions.
- **Articles from the control room:** articles published in the control room (Editorial) appear with the editions, newest first, on the home page lead, The Briefing, the archive and search. Each has its own page (`/article/<slug>`), an optional image (otherwise category artwork) and an optional original link. Articles can be edited, unpublished or archived. Body formatting: a blank line starts a new paragraph, `## ` starts a heading, `- ` a bullet, `1. ` a numbered point.
- **Community:** the front page has a "Join the community" section with the member perks and the latest discussions and briefings; every story ends with "Discuss this story". Members register and sign in, start discussions and reply in threads (`/community`, `/discussion/<id>`). Moderators hide, restore or remove posts and replies in the control room.
- **Events:** published events are listed at `/events` with an "Add to calendar" (.ics) download. Times are entered in local time and stored in UTC.
- **Watch:** published multimedia (YouTube, audio, video, images) plays inside the app at `/watch`.
- **Account:** members change their display name and password at `/account`; a password change signs out other devices. Sign-in is throttled after repeated failures (HTTP 429).
- **Search:** the search button searches editions, articles and the live wire.
- **Admin control room** (`/admin.html`): overview, editorial, live coverage (open, update, end, resume), multimedia, community moderation, events, leads from the contact form, and users. The built-in admin is `ADMIN_EMAIL` with the `ADMIN_PASSWORD` secret. D1 tables and later migrations are applied automatically on first use.
- **Installable app (PWA):** installs to the home screen on Android, iPhone and desktop, with shortcuts (Live wire, Editions, Markets, Saved) and store-style screenshots. Works offline: the build precaches the app and every edition's text and artwork (`vite.config.js` fills the list into `sw.js`); the live wire, markets and coverage fall back to the last copy, labelled "Offline copy"; saved stories are kept for offline reading. New deploys show an "Update" bar instead of silently replacing the running version.

## Adding a new Raisina Wire edition

In the control room, open **Stories & editions**, choose **Type: Raisina Wire edition**, paste the text, upload a cover (and optionally a hero) image, add the LinkedIn link as the original, and publish.

## Listen: the natural Indian English voice

Stories are read aloud by a natural Indian English woman's voice (Google Cloud Text-to-Speech, Chirp 3 HD, `TTS_VOICE` in `wrangler.toml`, default `en-IN-Chirp3-HD-Sulafat`; other female options: Aoede, Kore, Leda, Achernar, Vindemiatrix, Despina). Each paragraph is generated once, stored in D1 (`tts_audio`) and reused for every listener, so the cost follows what you publish, not how many people listen. Google's free allowance for these voices is 1 million characters a month (the 13 editions are about 60,000). Playback goes paragraph by paragraph with the text highlighted, and keeps going with the screen locked, with lock-screen controls.

To switch it on:
1. In Google Cloud (console.cloud.google.com), create or pick a project, enable **Cloud Text-to-Speech API**, and make sure billing is enabled (required by Google even inside the free allowance).
2. Under **APIs & Services → Credentials**, create an **API key** and restrict it to the Cloud Text-to-Speech API.
3. In Cloudflare (Worker → Settings → Variables and Secrets), add a secret named `GOOGLE_TTS_API_KEY` with that key.

Without the key, Listen uses the device's own voice, choosing a female Indian English voice when the device has one, read sentence by sentence with pauses. Wire stories from other publishers always use the device voice.

## Getting found on Google

1. The live address is `https://raisinawire.calibrex.org`, set as `SITE_URL` in `wrangler.toml`. Canonical links, sitemaps, the feed and social cards use it, and page visits to the `workers.dev` address are redirected to it (the API keeps working on both).
2. In Google Search Console, add the domain as a property, verify it with the DNS record Search Console gives you (in Cloudflare DNS), and submit `https://<domain>/sitemap.xml` and `https://<domain>/news-sitemap.xml`.
3. For Google News, apply in the Google News Publisher Center with the same domain.
4. Bing Webmaster Tools can import the property from Search Console.

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

White and glass on `#f8f8fa`, with Newsreader for headlines and reading, Manrope for interface text, DM Mono for labels and Bodoni Moda for the wordmark.

**Brand mark:** the Rashtrapati Bhavan dome as white line art on a crimson tile (`#b8141f`), with tricolour bars beneath, next to the wordmark "Raisina *Wire*" (Wire in crimson italic). There is no seal, emblem or Ashoka Chakra. The mark is drawn once in `src/brand.js` (`MARK_DOME`, `brandMark()`), and the app icons (`icon-192/512.png`, `maskable-512.png`, `apple-touch-icon.png`, `favicon.png`, `favicon.svg`) and `og-image.jpg` are rendered from the same drawing.

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
