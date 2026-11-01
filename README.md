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
- **Community:** the front page has a "Join the community" section with the member perks and the latest discussions and briefings; every story ends with "Discuss this story". Members register and sign in, start discussions and reply in threads (`/community`, `/discussion/<id>`). The boards show topic colours, upvotes, reply counts, who has joined each thread and when it was last active, with Latest/Top sorting and topic filters. Moderators hide, restore or remove posts and replies in the control room.
- **Events:** published events are listed at `/events` with an "Add to calendar" (.ics) download. Times are entered in local time and stored in UTC.
- **Watch:** published multimedia (YouTube, audio, video, images) plays inside the app at `/watch`.
- **Account:** members change their display name and password at `/account`; a password change signs out other devices. Sign-in is throttled after repeated failures (HTTP 429).
- **Search:** the search button searches editions, articles and the live wire.
- **Mobile behaviour:** form fields are 16px on touch screens, so iOS no longer zooms while typing; each new page opens at the top (back restores where you were), and the server-rendered page is hidden behind a short splash until the app takes over, so there is no flash of the footer.
- **Admin control room** (`/admin.html`): overview, editorial, live coverage (open, update, end, resume), multimedia, community moderation, events, leads from the contact form, and users. The built-in admin is `ADMIN_EMAIL` with the `ADMIN_PASSWORD` secret. D1 tables and later migrations are applied automatically on first use.
- **Installable app (PWA):** installs to the home screen on Android, iPhone and desktop, with shortcuts (Live wire, Editions, Markets, Saved) and store-style screenshots. Works offline: the build precaches the app and every edition's text and artwork (`vite.config.js` fills the list into `sw.js`); the live wire, markets and coverage fall back to the last copy, labelled "Offline copy"; saved stories are kept for offline reading. New deploys show an "Update" bar instead of silently replacing the running version.

## Adding a new Raisina Wire edition

In the control room, open **Stories & editions**, choose **Type: Raisina Wire edition**, paste the text, upload a cover (and optionally a hero) image, add the LinkedIn link as the original, and publish.

## Autopublisher (Claude)

Claude can write and publish every kind of item (articles, editions, live coverage and updates, multimedia, events and briefings, alerts) from a link you give it. The workflow is the `/publish` skill in `.claude/skills/publish/SKILL.md`; the Publishing Desk artifact on claude.ai is its queue, where you add requests and approve drafts. Nothing is published without your approval.

It publishes through the control-room API with `npm run publish -- <command>` (`scripts/publish.mjs`), signed in with a publishing key instead of a password:
1. Make a long random key (at least 24 characters, e.g. `openssl rand -hex 32`).
2. In Cloudflare (Worker → Settings → Variables and Secrets), add it as a secret named `PUBLISH_TOKEN`.
3. In the Claude Code cloud environment, add the same value as the environment variable `RW_PUBLISH_TOKEN`, and allow the domain `raisinawire.calibrex.org` under Network access.

A request with `Authorization: Bearer <PUBLISH_TOKEN>` acts as the built-in admin. To revoke it, change or delete the secret.

## Listen: the natural Indian English voice

Stories are read aloud by a natural Indian English woman's voice (Google Cloud Text-to-Speech, Chirp 3 HD, `TTS_VOICE` in `wrangler.toml`, default `en-IN-Chirp3-HD-Sulafat`; other female options: Aoede, Kore, Leda, Achernar, Vindemiatrix, Despina). Each paragraph is generated once, stored in D1 (`tts_audio`) and reused for every listener, so the cost follows what you publish, not how many people listen. Google's free allowance for these voices is 1 million characters a month (the 13 editions are about 60,000). Playback goes paragraph by paragraph with the text highlighted, and keeps going with the screen locked, with lock-screen controls.

To switch it on:
1. In Google Cloud (console.cloud.google.com), create or pick a project, enable **Cloud Text-to-Speech API**, and make sure billing is enabled (required by Google even inside the free allowance).
2. Under **APIs & Services → Credentials**, create an **API key** and restrict it to the Cloud Text-to-Speech API.
3. In Cloudflare (Worker → Settings → Variables and Secrets), add a secret named `GOOGLE_TTS_API_KEY` with that key.

Without the key, Listen uses the device's own voice, choosing a female Indian English voice when the device has one, read sentence by sentence with pauses. Wire stories from other publishers always use the device voice.

## English, Hindi and Bengali

The whole site is available in English, हिन्दी and বাংলা. Each language has its own addresses (`/hi/…`, `/bn/…`), so shared links open in the reader's language and Google indexes each version (with `hreflang` links and sitemap alternates). The globe button at the top, and the links at the foot of every page, switch language on the same page; the choice is remembered. Readers whose phone is set to Hindi or Bengali are offered their language once.

- **Menus, buttons and messages** are translated by hand in `src/i18n/hi.js` and `src/i18n/bn.js` (the English text is the key; add an entry when you add English text to the site). Dates use Hindi and Bengali month names, and Bengali pages use Bengali digits.
- **Stories** have a Hindi and a Bengali version written next to the English: in the story editor's **हिन्दी** and **বাংলা** tabs (saved with the story, with a free "Draft with Google Translate" button for a first draft), or by Claude when it publishes through the autopublisher (`translation` command, below). Readers who switch language see that version; where there is none they see the English with a note. Translated stories link to the English original. There is no paid translation service and no API key: nothing is translated per visit, each version is written once and kept in D1 (`translations`).
- **The 13 existing editions, About and the legal pages** were translated in a Claude session (Hindi in the style of Sanmarg and Dainik Bhaskar, Bengali in Anandabazar Patrika's colloquial style) and are bundled in `src/translations/hi.json` and `bn.json`; the Worker copies them into D1 once and never overwrites a version saved in the control room. Translated legal pages say the English version prevails.
- **Control room → Translations** shows which stories and pages have each language, flags versions whose English has changed since, and opens the editor. About and the legal pages are edited there.
- **Discussions** can be started in English, हिन्दी or বাংলা; the community page filters by language.
- **Listen** reads Hindi and Bengali stories in the same warm female voice in that language (`hi-IN-Chirp3-HD-Sulafat`, `bn-IN-Chirp3-HD-Sulafat`).
- **Live wire**: Hindi and Bengali readers also get BBC News हिन्दी and BBC News বাংলা.
- **Everything else in the news is machine-translated** for Hindi and Bengali readers: the live wire and briefing headlines and summaries, reader excerpts, live coverage and its updates, events, and any story that has no editor's translation yet (marked "translated automatically", with a link to the English). Market names come from the hand-made dictionary. Videos are left as they are. This uses **Cloudflare Workers AI** (`@cf/ai4bharat/indictrans2-en-indic-1B`, AI4Bharat's English to Indian-languages model) through the `[ai]` binding in `wrangler.toml`: no API key and no separate account. Each sentence is translated once and kept in D1 (`mt_cache`, cleared after 45 days); the cron translates new headlines, live updates and stories every five minutes so readers get them from the cache. Workers AI's free allowance is 10,000 neurons a day (about 300,000 words' worth of tokens for this model); `MT_DAILY_CHARS` (default 300,000 characters a day) keeps use inside it, and when it is spent, or the model can't be reached, the English is shown. Machine translation of other publishers' headlines and excerpts is a derivative of their work: keep it to the short excerpts the reader already shows, and add any publisher who objects to `PUBLISHER_OPT_OUT`. Local `wrangler dev` can't reach Workers AI without a Cloudflare login; set `MT_ENDPOINT` in `.dev.vars` to a stand-in that answers like the model.

## Control room (`/admin`) and who can do what

Sections: **Overview** (stories, drafts, members, discussions, alert subscribers, most read), **Audience** (below), **Stories & editions** (write, edit, schedule, publish, unpublish, preview, autosave, images, tags, writers, alerts), **Writers** (add guest writers with a photo, title and one-line bio; edit or remove them; the founder and the desk are fixed in `src/writers.js`), **Multimedia** (videos, shorts, audio, images, embeds), **Live publishing** (live coverage, timestamped updates, hero and social images, results counter; Edit changes the headline and summary and corrects or deletes posted updates, which readers see marked "Updated"), **Alerts** (automatic story/live/briefing alerts, the 9 am and 9 pm briefs, manual major alerts), **Translations** (Hindi and Bengali versions of stories and site pages), **Members & roles**, **Community moderation** (hide, remove, edit discussions and replies), **Events & briefings**, **Sales & leads**, **Social metrics**.

| Role | Website | Control room |
|---|---|---|
| Reader (not signed in) | Read everything, listen, share, save on the device, alerts | none |
| member | + start and reply to discussions, vote, saved stories and topics on every device | none |
| premium, analyst | same as member today (labels for future paid or analyst features) | none |
| editor | as member | everything except Members & roles, Sales & leads and Social metrics; Overview without the leads count |
| admin | as member | everything, including changing roles (an admin can't remove their own admin role) |

Roles are enforced by the API, not just hidden in the page. The built-in admin is `ADMIN_EMAIL` with the `ADMIN_PASSWORD` secret.

### Raisina TV (`/tv`)

A 24×7 channel of the desk's explainers (`media_type` video, uploaded `.mp4`/`.webm`; shorts never play on TV). Each viewer starts with the newest explainer and goes back in time, looping. The broadcast screen has the on-screen bug (the Raisina Wire app icon with a blinking ● LIVE tag), sized and placed to sit exactly over the logo printed in the explainers, the date and India time, a lower third, and the BREAKING ticker. The bug and the ticker stay on screen through everything: stories, transitions, News Updates, ads and live inputs. The ticker runs from the live wires: your breaking lines first, then the latest from each live coverage and the newest wire headlines (Raisina stories fill in if the wire can't be reached). Phones start muted ("Tap for sound"; browsers don't allow autoplay with sound). There is a pause button (or tap the picture). The controls fade out after 3 seconds and come back on a mouse move or a tap (on phones the first tap only brings them back).

**Opening TV.** A new visit opens with a stinger, an 8-second promo and **Breaking Headlines**: your breaking lines, then the ten newest items across live coverage and the wire, newest first, each with its source and time. Then the newest explainer. Someone back within 30 minutes goes straight to the channel; a live input on air, or a break-in in the last two minutes, skips the opener. The ticker is newest first too, across live coverage and the wire. With sound on, TV follows the reader as a floating mini-player; it shows on the lock screen (Media Session), can be cast to a TV (Chromecast/AirPlay) and pauses in the background. The red **TV** button in the top bar opens it from any page.

**Between videos.** A 5–7 second transition between explainers (four styles in rotation: "Coming up" with the next picture, a headline flash, the Raisina TV ident, a red slash wipe). After every second explainer (configurable), the full package: a stinger, a 15-second Raisina Wire promo montage of the site's own story pictures, then a **News Update** in a broadcast-studio look (a crimson studio backdrop with moving light and a turning globe grid; a NEWS UPDATE | TOPIC strap; a progress bar per set; five numbered headlines with each one lit in turn on a white strap; the lead picture in an angled panel; every headline is shown in full: the text steps down a little if needed, and on small screens a set splits into two or three screens that share its time; live updates are shown as whole sentences and wire headlines lose the publisher's " | Source" tail): a title card and 3–5 full-screen sets of five headlines on different topics, 7 seconds each (latest live coverage first, a markets board on alternate updates, then a topic per set: India, Security, Diplomacy, World, Energy…). At the top of each hour the News Update becomes a **Bulletin**, opened by a countdown ring of 60 ticks around the hour. **Break in now** plays a full-screen BREAKING NEWS sequence with its own music before the cut.

**Music.** `src/tvaudio.js` makes four original themes in the browser (Web Audio; nothing licensed or downloaded) plus a breaking-news theme. Tracks rotate and the same one never plays twice in a row. Add your own tracks in the control room (Google Drive links to MP3/M4A you have the rights to); they join the rotation. Viewers hear music only with sound on.

**Live input.** Control room → Live TV → Live input: save a YouTube link (live or video), an `.m3u8` livestream or an `.mp4`/Drive video, and switch it **on air**: every viewer's TV hard-cuts to it within about 10 seconds, with the logo, LIVE and ticker on top. Switch it off and the channel returns. One input is on air at a time.

Control room → **Live TV** also has: on/off; **Break in now** (every viewer cuts to a chosen explainer within ~15 s; people opening TV more than two minutes later just start normally); between-video settings (stinger, promo, News Update, hourly bulletin on/off; full package after every 1–6 videos; 3–5 sets; seconds per set); a **pinned headline set** of your own five lines that leads every News Update while on; music (built-in themes on/off with preview, your tracks); breaking ticker lines; ads (Google Drive "Anyone with the link" share links, converted automatically; keep files under ~100 MB; an ad that won't load is skipped), a break every N minutes of watching (default 12), 1–4 ads per break, skippable after 5 s or not; and the running order ("Use my order"). Code: `src/tv.js` (player and sequences), `src/tvaudio.js` (music), `src/channel.js` (feed and settings), migrations 0018–0019. Plays, TV viewers and minutes, and ad impressions show in Audience.

The TV page is also the video library (the old `/watch` address redirects here): Raisina TV on top, then a shorts carousel, Continue watching, Latest, "Because you watched…", a row per category, Most watched, chips and search, hover previews on computers, a detail panel on phones, and a cinema player with "Up next in 5…". Thumbnails load as small WebP copies (`*-sm.webp`, 480 px, and `*-md.webp`, 960 px, next to each `.jpg` in `public/videos/`); after adding videos there, run `python3 tools/thumbs.py`.

### Audience

Returning readers (new vs returning per day, how soon readers come back, weekly retention cohorts), app installs and launches from the home-screen app, notification opt-ins and opt-outs with the current subscriber count, active reading time per story with the share read to the end, and where visits come from (WhatsApp, Facebook, Instagram, X, LinkedIn, Telegram, Google, Google News, email, shared and copied links, notifications, direct), plus devices and languages, for 7, 30 or 90 days with comparisons to the previous period.

How it is counted (`src/audience.js`, migration 0014): the browser remembers the dates of its first and last visit and sends small anonymous events to `/api/m`; the Worker keeps daily totals in India time (`metrics_daily`, `reading_daily`) and nothing that identifies a reader (no cookies, IP addresses, names or account IDs). Bots and link previews are ignored. Share buttons tag links with `utm_source` (WhatsApp hides where visitors come from otherwise; notifications are tagged by the service worker) and the site removes the tag from the address on arrival. Reading time counts only while the page is on screen and the reader has scrolled or tapped in the last 30 seconds; a read cut short by a closed tab is sent on the next visit. The privacy policy describes this. The totals can be inflated by someone posting fake events to `/api/m`; treat them as trends, not audited figures.

## Legal pages and how we use other publishers' work

The About page (`/about`) and the legal pages (`/terms`, `/privacy`, `/disclaimer`, `/copyright`, `/community-guidelines`, `/grievance`) are in `src/legal.js`, shown in the app and rendered by the Worker for search engines. They were drafted with care for Indian law (Copyright Act 1957 s.52 and Copyright Rules 2013 r.75; IT Act 2000 s.79 and IT Rules 2021; DPDP Act 2023; SEBI rules on investment advice; the Emblems and State Emblem Acts) but **should be reviewed by an Indian lawyer** before you rely on them.

To keep the live wire on the right side of copyright, the in-app reader shows only an **excerpt** of other publishers' stories (at most about 120 words, the opening paragraphs, credited and labelled) with a prominent link to read the full story on the publisher's site. It never returns the full text. It identifies itself honestly as `RaisinaWireReader`, shows no excerpt where a page's robots meta says `nosnippet`, `noarchive` or `none`, and applies `max-snippet`. Publishers who ask to opt out are added to `PUBLISHER_OPT_OUT` in `wrangler.toml` (comma-separated domains). Members can delete their own account from My account.

## Getting found on Google

1. The live address is `https://raisinawire.calibrex.org`, set as `SITE_URL` in `wrangler.toml`. Canonical links, sitemaps, the feed and social cards use it, and page visits to the `workers.dev` address are redirected to it (the API keeps working on both).
2. In Google Search Console, add the domain as a property, verify it with the DNS record Search Console gives you (in Cloudflare DNS), and submit `https://<domain>/sitemap.xml` and `https://<domain>/news-sitemap.xml`.
3. For Google News, apply in the Google News Publisher Center with the same domain.
4. Bing Webmaster Tools can import the property from Search Console.

**Share cards.** `public/og-image.jpg`, `og-image-hi.jpg` and `og-image-bn.jpg` (1200×630) are the link previews for WhatsApp, X, LinkedIn and Facebook: real phone screens of the site in light and dark mode, the wordmark, and English · हिन्दी · বাংলা, with the tagline in each language. Each language's pages use their own card; stories, live coverage and videos use their own pictures. To redraw them after a redesign, run from the repository root: `node tools/og/cap.cjs` (screenshots of the live site), `node tools/og/build.mjs`, then `node tools/og/shoot.cjs`.

**What search engines get:** server-rendered pages in all three languages with `hreflang` alternates, canonical links and `og:locale` alternates; `NewsMediaOrganization` (with its Hindi and Bengali names, languages and publishing principles), `NewsArticle`, `LiveBlogPosting`, `VideoObject` (Watch and every shared video), `ItemList`, breadcrumbs and site search; `sitemap.xml` with image and video entries; `news-sitemap.xml` for Google News; `max-image-preview:large` for Discover.

## Data-source notes

1. GDELT is a broad global news-monitoring source. Results are not a substitute for editorial verification. Each story links to its publisher.
2. Market pulse uses public Yahoo Finance chart endpoints without a key. Coverage, delays, endpoint access and public-display rights can vary; this is not a guaranteed real-time exchange feed.
3. If Yahoo Finance is unavailable, USD/INR may fall back to Frankfurter, which provides a daily reference rate rather than real-time FX. Other unavailable instruments are shown as unavailable, never fabricated.

## Project layout

- `index.html`, `admin.html`, `privacy.html`, `terms.html` — Vite page entries (see `vite.config.js`)
- `src/main.js`, `src/style.css` — public site; `src/worker.js` — Cloudflare Worker API
- `src/i18n.js`, `src/i18n/` — languages and the Hindi and Bengali interface text; `src/translate.js` — reading translations; `src/translations/` — bundled Hindi and Bengali versions
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
