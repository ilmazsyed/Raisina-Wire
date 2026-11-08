# Rashtrix 24×7 News — the app

Bengali-first news app for Rashtrix 24×7 News (Middleton Media Works), built on the Raisina Wire
code base: a Cloudflare Worker with a D1 database and an installable web app (PWA). It runs as its
**own Worker (`rashtrix`) and its own D1 database (`rashtrix-db`)**, never Raisina Wire's.
Everything runs on free tiers; there is no paid AI API.

Build brief and phases: `rashtrix/BRIEF.md`. Built so far: **Phase 1** (the Bengali-first app) and
**Phase 2** (the two TV channels). The producer and PCR, the live studio and the extras are Phases 3–5.

## What is in Phase 1

- **Bengali first.** Bengali at the bare addresses (`/`, `/article/…`, `/desk/kolkata`), English at
  `/en/…`, Hindi at `/hi/…`. Old `/bn/…` links redirect. The interface is translated as it is drawn
  (`src/i18n/bn.js`, `src/i18n/hi.js`; English text is the key).
- **Five desks:** Kolkata, West Bengal, India, Probashi Bangali, World (`/desk/<name>`), plus
  **Latest** (`/live`, every story newest first) and **Briefs** (`/briefs`).
- **Rashtrix's own articles from www.rashtrix.live** (`src/wix.js`). New posts come from the Wix
  blog RSS (`/blog-feed.xml`) every ten minutes; all older posts are read from the post sitemap a
  few a minute until every post is in. Wix's English, Bengali and Hindi versions of a post become
  one story (Bengali, with English and Hindi versions). Photos are kept. Control room → **Wix import**.
- **The wire desk** (`src/wiredesk.js`), control room → **Wire desk**:
  - reads only the outlets the owner approves (RSS feeds; name + language), skips anything on the
    **blocklist** (domains, or words in a headline);
  - groups items about the same story; a story waits (default 30 minutes) for a **second outlet**
    and is then written from all of them, or from one if no second outlet appears;
  - **Bengali sources → a Bengali rewrite** (180–350 words); **English/Hindi sources → a 100-word
    Bengali brief**; each also gets English and Hindi versions in the same call;
  - writes with **Gemini (Google AI Studio free tier)**, using only facts in the sources, never
    naming the outlets, and is **rejected if it copies eight words in a row** from a source;
  - each item is written once; when the day's free quota is used up the queue waits for the reset
    (midnight Pacific, 13:30 IST) and carries on — no item is lost;
  - **no photos**: rewrites and briefs show a branded text card;
  - sources are **never shown to readers**, but every item each story came from is kept and shown
    in the control room.
- **Corrections** (control room → Stories and → Corrections): **Pull** (one tap, off the site at
  once), **Restore**, **Correct** (new text, with an optional public note shown on the story). Every
  action is logged with the text as it was before. Public policy page: `/corrections`.
- **Listen** with Google Chirp 3 HD, **female or male voice, reader's choice**, in the story's
  language (Bengali `bn-IN-Chirp3-HD-Sulafat` / `bn-IN-Chirp3-HD-Charon`). Each paragraph is made
  once per voice and kept in D1. Without the key, the device's own voice is used.
- **Brand:** the full Rashtrix logo (a trademark: always shown whole, never cropped) in the header,
  icons and text cards, from `rashtrix/brand/logo.png`;
  brand red `#AA0404`, maroon `#A43F44`, gold accents `#D4A017`; Noto Serif Bengali, Hind Siliguri,
  Montserrat; tagline লোক গুনি না, লোকের কথা শুনি; share card `public/og-image.jpg`.
- **Legal and compliance** (`src/legal.js`, English with Bengali versions): Terms, **DPDP privacy
  notice** with consent and withdrawal, Disclaimer (explains AI-assisted wire reports), Copyright
  (facts, not words), Corrections policy, Community guidelines, **Grievance redressal under the IT
  Rules 2021** (24-hour acknowledgement, 15-day resolution). Sign-up shows a consent note.
- Kept from the base: CMS with scheduling and autosave, writers, live coverage, alerts (Web Push),
  community, events, saved stories, search, audience counts, SEO (hreflang, NewsArticle, sitemaps,
  Google News sitemap, RSS), offline PWA.
- **Removed:** the AI anchors, lip-sync, voice cloning and all anchor workflows and assets; Raisina
  TV (the two Rashtrix TV channels come in Phase 2); Calibrex ads; Markets; Raisina Wire's editions.

## Phase 2: Rashtrix TV (two channels)

- **Horizontal** (1920×1080, "Rashtrix TV") and **vertical** (1080×1920, "Rashtrix Shorts") are separate
  channels, each switched on or off on its own, each with its own **secret output address** for OBS or
  vMix: `/tv.html?ch=h&key=…` and `/tv.html?ch=v&key=…` (control room → **TV channels**: copy, open, or
  make a new address, which stops the old one). In OBS: Sources → + → Browser, paste the address, set
  the size, tick "Control audio via OBS".
- **Sourcing** from the YouTube Data API (`src/youtube.js`): add playlists, single videos and lives per
  channel (Shorts playlists → vertical, long videos → horizontal; the vertical channel only plays videos
  up to three minutes, the horizontal one only those over a minute). Sources refresh every 10 minutes
  and with **Refresh now**. Only `playlistItems.list`, `videos.list` and `playlists.list` are used (1 unit
  each), never `search.list`; lives are added by their address and checked with `videos.list`, and go on
  screen only when an editor switches them **on air**. A daily cap (`YOUTUBE_DAILY_UNITS`, default 8,000
  of the free 10,000) stops refreshes before the quota runs out. Any video can be left out of a channel.
- **One running order for everyone** (`src/tvchannel.js`): every screen (OBS outputs and the app)
  computes the same position from the channel's clock, so they show the same thing at the same moment.
  Control changes reach every screen within about five seconds.
- **YouTube's controls are hidden** (`controls=0`, no keyboard, no related videos) under a layer that
  takes every click.
- **Horizontal jacket:** the full Rashtrix logo as the bug, LIVE, India time, a lower third (the
  video's title or your own line), the ad box (three lines or a picture), and the ticker (your lines,
  then the latest Rashtrix headlines). **L-band**: the picture moves up and right and headlines fill
  the L. **Break in now**: full-screen BREAKING NEWS with an original music sting made in the browser
  (nothing licensed). **News Update** every N videos (headline sets by desk), which becomes the
  **Bulletin** at the top of the hour.
- **Vertical:** Shorts carry their own jacket, so our graphics sit in its safe zones: a headline flash
  over the left of the portrait strip, LIVE in the video's corner, the ticker at the bottom. Items the
  app makes (News Update, breaking) get an **app-drawn jacket** in the same positions as the Shorts
  jacket (portrait strip, logo card, maroon frame, slanted band with the ad box). **Promo cards**:
  full-screen 9:16 pictures (uploaded, or a Google Drive link copied into the app's storage), each on
  or skipped, shown after every N Shorts.
- **In the app**, Watch shows the channels in the app's own player (not the YouTube page), muted until
  the viewer taps for sound. On-air graphics stay in Bengali in every language.

To switch on YouTube sourcing: Google Cloud console → APIs & Services → **Enable APIs** → *YouTube
Data API v3* → Credentials → **Create API key** (restrict it to that API) → `npx wrangler secret put
YOUTUBE_API_KEY`.

## Setting it up (owner)

You need a Cloudflare account. Do these once, in order.

1. **Database.** In this folder: `npx wrangler login`, then `npx wrangler d1 create rashtrix-db`.
   Copy the `database_id` it prints into `wrangler.toml` (replace the zeros). Tables are created
   automatically the first time the app is used.
2. **Admin sign-in.** In `wrangler.toml`, set `ADMIN_EMAIL` to the email you will sign in with. Then
   `npx wrangler secret put ADMIN_PASSWORD` and type a long password.
3. **Deploy:** `npm install`, then `npm run deploy`. The app is live at
   `https://rashtrix.<your-subdomain>.workers.dev`. Sign in at `/en/` with the admin email and
   password; the control room is at `/admin.html`.
4. **Gemini (wire desk), free:** go to aistudio.google.com → **Get API key** → **Create API key**
   (no billing needed for the free tier). Then `npx wrangler secret put GEMINI_API_KEY` and paste it.
   The daily cap is `GEMINI_DAILY_LIMIT` in `wrangler.toml` (default 200 calls; keep it under the
   free tier's daily limit for `GEMINI_MODEL`).
5. **Approved outlets:** control room → **Wire desk** → *Approved sources*: add each outlet's name,
   RSS feed address and language. Add anything to avoid under *Blocklist*.
6. **Listen voices (optional):** Google Cloud console → enable **Cloud Text-to-Speech API** (billing
   must be switched on, but the first 1 million Chirp 3 HD characters a month are free) → APIs &
   Services → Credentials → **Create API key**, restricted to Text-to-Speech. Then
   `npx wrangler secret put GOOGLE_TTS_API_KEY`.
7. **Your domain:** add it to the Worker in Cloudflare (Worker → Settings → Domains & Routes) and set
   `SITE_URL` in `wrangler.toml` to it, then deploy again.
8. **Grievance Officer:** fill in `GRIEVANCE` at the top of `src/legal.js` (name, email, phone,
   address) before launch; until then the pages say the details are coming.

Machine translation of English live coverage into Bengali and Hindi uses Cloudflare Workers AI
(free daily allowance) through the `[ai]` binding; no key needed.

## Local development

```bash
npm install
npm run build
npx wrangler dev        # http://localhost:8787 with a local D1
```

Put local-only settings in `.dev.vars` (not committed), e.g. `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`GEMINI_API_KEY`. For tests without Google, `GEMINI_ENDPOINT` can point at a stand-in that answers
like `generateContent`, and `WIX_SITE` at a local copy of the blog.

## Project layout

- `src/main.js`, `src/style.css` — the reader app; `index.html` the page shell
- `src/worker.js` — the Worker (API, cron, page rendering); `src/seo.js` — server-rendered pages,
  sitemaps, feed
- `src/wiredesk.js` — wire desk; `src/wix.js` — Wix import; `src/feeds.js` — RSS parsing, desks,
  fact extraction
- `src/tts.js` — Listen; `src/mt.js` — Workers AI translation; `src/push.js` — alerts
- `src/legal.js` — About and legal pages; `src/i18n/` — interface text
- `admin.html`, `admin.js`, `admin.css` — the control room
- `migrations/` — D1 schema (`0021_rashtrix.sql` adds the Rashtrix tables)
- `rashtrix/` — the brief and the owner's brand files
