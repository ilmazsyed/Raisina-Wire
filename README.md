# Rashtrix 24×7 News — the app

Bengali-first news app for Rashtrix 24×7 News (founder and editor-in-chief Ilmaz Syed; powered by Calibrex), built on the Raisina Wire
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
- **Rashtrix's own articles from the Wix blog** (`src/wix.js`; off until `WIX_SITE` is set to the Wix site's own address). New posts come from the Wix
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
  Montserrat; tagline দেশ প্রথম । বলিদান পরম ধর্ম; share card `public/og-image.jpg`.
- **Legal and compliance** (`src/legal.js`, English with Bengali versions): Terms, **DPDP privacy
  notice** with consent and withdrawal, Disclaimer (explains AI-assisted wire reports), Copyright
  (facts, not words), Corrections policy, Community guidelines, **Grievance redressal under the IT
  Rules 2021** (24-hour acknowledgement, 15-day resolution). Sign-up shows a consent note.
- Kept from the base: CMS with scheduling and autosave, writers, live coverage, alerts (Web Push),
  community, events, saved stories, search, audience counts, SEO (hreflang, NewsArticle, sitemaps,
  Google News sitemap, RSS), offline PWA.
- **Removed:** the AI anchors, lip-sync, voice cloning and all anchor workflows and assets; Raisina
  TV (the two Rashtrix TV channels come in Phase 2); Calibrex ads; Markets; Raisina Wire's editions.

## Search and sharing

- Every public page is served with its title, description, canonical address, hreflang, schema.org
  data and the page text (`src/seo.js`); sitemaps at `/sitemap.xml` and `/news-sitemap.xml` (Google
  News), RSS at `/feed.xml`. **Watch** (`/watch`) has its own page with the live channel as a
  VideoObject on air (BroadcastEvent).
- **Share pictures:** each story has its own 1200×630 card (`/og/<slug>.jpg`); every other page shows
  the **site card** (`/og/site.jpg`): Rashtrix TV live as the hero, with the top headline in the
  lower third and the next ones in the ticker, drawn again when the top headline changes (at most
  every 20 minutes, by the Browser Rendering free tier). `public/og-image.jpg` is its fixed fallback.
- **IndexNow** (`src/indexnow.js`): new and changed stories are announced to Bing and the other
  IndexNow engines every ten minutes; the key file is `public/<key>.txt`. Google reads the sitemaps:
  add the site in Google Search Console and submit both sitemaps.

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

### Autopilot programming (src/segments.js, src/labels.js)

- **Variety:** every story carries a desk and a weight (heavy, medium, light). Bulletins, AVO blocks and headline cards never put two from one desk in a row, and run a light story after every two heavy ones.
- **No repeats:** AVO blocks are 2–3 stories, and a story doesn't return within 15 minutes for a viewer. Videos don't return within the hour; evergreen videos (control room › Videos on each channel › Evergreen) fill in first.
- **Bulletins:**
  - New stories lead (নতুন) and updated stories are marked (নতুন তথ্য).
  - :15 and :45 read four stories the last bulletin didn't.
- **Programming clock:**
  - Two segment slots each half-hour (:08 and :22), filled by daypart: morning, day, prime time, late night.
  - Segments: শহরের খবর, কলকাতা ১০, বাংলাদেশ ডেস্ক, এক মিনিটে বিশ্ব, সংখ্যায় আজ, খেলার খবর, আজকের দিনে, and the story of the hour (map, quote, timeline, key points).
  - Edit it in Scheduler › Programming clock, which also holds the score strip and the city notice.
- **Map outlines:** Natural Earth (public domain), via the `world-atlas` package, pre-converted in `public/tv/map-*.json`.
- **Check the running order:** `npm run build && NODE_PATH=$(npm root -g) npm run sim -- --at 20:00 --minutes 30` plays the autopilot at speed with the live data and prints it.

## Phase 3: bulletin producer and PCR

- **Realtime control** (`src/control.js`): each channel has a Durable Object that holds what is on
  air and sends every change to every screen over WebSockets in about a second: the OBS/vMix outputs,
  the PCR, the producer, the prompter and the app's players (screens without WebSockets read it every
  five seconds). One program engine (`src/engine.js`) draws the channel everywhere: nine layouts (full,
  PiP, 2-up, 1 big + 2, 3 equal, host + 4, 6-grid, L-band, full graphic) from YouTube, app clips, HLS
  and WHEP streams, live guests and pictures; transitions (cut, mix, red slash wipe, stinger); every
  graphics layer on or off.
- **Bulletin producer** (`/producer.html`): each channel's rundowns for each day. Nine item types
  (YouTube video with in and out points, live segment with layout and sources, app clip, full-screen
  breaking, headline set, L-band, promo card, ad break, slate). Drag to reorder; each item has its
  own name strap, ticker lines and script. Lengths, running time from the top, back-timing (when each
  item must start to end on time) and the total against the slot are worked out as you type.
  **Templates** make rundowns automatically every chosen day. **On air** hands the rundown to the PCR.
  **Print** makes a PDF in the browser (so Bengali is shaped correctly).
- **Midnight (India time):** the day's rundowns are archived with the **as-run log** (what actually
  went on air, when, for how long, and how: auto, TAKE, breaking, macro…). Archives and logs are kept
  `ARCHIVE_DAYS` (default 90) and can be copied back to today.
- **PCR** (`/pcr.html?ch=h|v`): preview and program monitors; a source grid with tally (green in
  preview, red on air): the running order, live inputs, studio guests, clips, headlines, slate;
  layouts, transitions, **TAKE** and **AUTO**; graphics layers; name strap; ticker; **Breaking in now**;
  the rundown with a countdown, previous / next / skip / go to, auto-advance on or off. The PCR can cut
  in anything at any time, then AUTO resumes the rundown where it paused (or skip on). **Macros**: one
  button or key runs several steps. **Keyboard**: Space TAKE, Enter AUTO, 1–9 sources, Shift+1–9
  layouts, N/B/K next/back/skip, X/M/W/G transitions, L strap, Shift+D DUMP, Shift+S standby.
- **Bitfocus Companion / Stream Deck:** PCR → Companion gives a private address; each button sends a
  GET to `/api/companion/<h|v>/<action>?token=…` (take, auto, next, prev, skip, dump, standby,
  transitions, layers, delay, macros).
- **Clips** (`src/clips.js`): upload (any size, in 20 MB parts) or paste a Google Drive link (copied
  once). Kept in Cloudflare R2; clips not marked “keep” are deleted after `CLIP_RETENTION_DAYS`
  (default 30) unused. MP4 (H.264) plays everywhere. Pictures pasted as Drive links (promo cards,
  slates, ad box) are copied into the app's storage.

## Phase 4: live studio

- **Guests join from a link** (`/guest.html?t=…`, no install): camera preview, name and title (they
  fill the name strap), the broadcast **consent** box (its wording and time are stored), headphones
  advice, then the **green room** checks (camera, microphone level, network round trip, headphones).
  They see the other guests and the on-air **return feed** (muted unless they choose, with
  headphones), get the producer's **messages** and **countdown** on their phone, and hear the
  producer's **private talkback**.
- **Studio desk** (`/studio.html`): rooms per channel, invitations (copy the link or send it on
  WhatsApp), each guest's picture and checks, mute, talkback, message, countdown, green room / ready /
  on air, name strap to the channel, and the **guest directory** (filled as guests join, with how often
  each has been on air).
- **Video** goes through **Cloudflare Realtime** (SFU + TURN; the Worker relays the calls so the
  secret never reaches a browser). Without its keys, or when a room is set to it, rooms use
  **VDO.Ninja** (free, no account). Last resort: put the guest on a Google Meet call and capture the
  window in OBS/vMix.
- **Studio stream for the app:** OBS sends the programme to a media server (MediaMTX) on an Oracle
  Cloud Always Free VM; set its HLS or WHEP address in control room → TV channels → *App live stream*,
  and the app plays it during live-studio segments instead of connecting each viewer to each guest.

## Phase 5: extras

- **Safety:** broadcast delay 0–10 s on the outputs; **DUMP** throws away what is waiting and puts the
  standby slate up; the **standby slate** also goes up by itself when an output's source stops for 10
  seconds, and staff devices get a **push alert** (also when an output goes silent for 30 seconds).
  The **audit log** (on-air desk → Reports) shows who did what and when, and prints as PDF.
- **Teleprompter** (`/prompter.html?ch=h|v`): every item's script in rundown order; moves on with the
  rundown; speed, size, mirror; keys Space, ↑/↓, ←/→, M, +/−, H.
- **On-air desk** (`/onair.html`): **polls** (viewers vote in the app's Watch page, one vote per device
  a day, kept only as a one-way hash; the on-air bar always says it is not a scientific survey);
  **results boards** (official figures only, the source on screen, refused on air until the
  exit-poll **blackout** time); **comments** (app comments from signed-in readers, YouTube live chat
  and Facebook live comments when their keys are set; nothing goes on screen until approved and
  ticked); **sponsors** for the ad box, rotated by weight, each showing logged as **proof of play**
  (PDF or CSV).
- **বঙ্গাব্দ date** under the clock (the Bengali calendar as West Bengal keeps it) and **Kolkata
  weather** in the ticker (Open-Meteo, free, no key; every 30 minutes).
- **Rashtrix Command Centre** (the self-hosted NRCS): in the producer, *Import from Command Centre*
  lists its Approved and On Air stories and adds them to the rundown with their scripts and lengths.
- **Language:** the producer, PCR, studio, on-air desk, prompter and guest screens switch between
  বাংলা, English and हिन्दी (remembered per person); on-air graphics stay in Bengali.

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
   free tier's daily limit for `GEMINI_MODEL`, default `gemini-3.8-flash`; if Google retires a model, the desk switches to the one Google names by itself).
5. **Approved outlets:** control room → **Wire desk** → *Approved sources*: add each outlet's name,
   RSS feed address and language. Add anything to avoid under *Blocklist*.
6. **Listen voices (optional):** Google Cloud console → enable **Cloud Text-to-Speech API** (billing
   must be switched on, but the first 1 million Chirp 3 HD characters a month are free) → APIs &
   Services → Credentials → **Create API key**, restricted to Text-to-Speech. Then
   `npx wrangler secret put GOOGLE_TTS_API_KEY`.
7. **Your domain:** add it to the Worker in Cloudflare (Worker → Settings → Domains & Routes) and set
   `SITE_URL` in `wrangler.toml` to it, then deploy again. The app is at **https://rashtrix.live**; page
   visits to the workers.dev copy and to www.rashtrix.live (once added to the Worker) go there. The Wix
   import reads `WIX_SITE`, the Wix site's own address (e.g. `https://name.wixsite.com/site`); it is empty,
   so the import is off, now that rashtrix.live is this app.
8. **Grievance Officer:** fill in `GRIEVANCE` at the top of `src/legal.js` (name, email, phone,
   address) before launch; until then the pages say the details are coming.

The control room screens (producer, PCR, studio, on-air desk, prompter) need nothing more: the
Durable Object for realtime control is created by the deploy, on the free plan. These switch on the
rest, whenever you are ready:

9. **Clips (Cloudflare R2, 10 GB free):** Cloudflare dashboard → **R2** → enable it (Cloudflare asks
   for a payment method even for the free tier) → in this folder `npx wrangler r2 bucket create
   rashtrix-clips` → in `wrangler.toml` remove the `#` from the three `[[r2_buckets]]` lines → deploy.
10. **Cloudflare Realtime (live studio video):** dashboard → **Realtime** → *Serverless SFU* →
    **Create application** → copy the App ID and the API token, then
    `npx wrangler secret put CALLS_APP_ID` and `npx wrangler secret put CALLS_APP_SECRET`. For guests
    on strict office or mobile networks, also *TURN Server* → **Create TURN key** →
    `npx wrangler secret put TURN_KEY_ID` and `npx wrangler secret put TURN_KEY_TOKEN`. The free
    allowance is 1,000 GB a month. Until then rooms use VDO.Ninja.
11. **Studio stream for the app (Oracle Cloud Always Free):** create an Always Free Ubuntu VM
    (Ampere A1). In its VCN security list allow TCP 80, 443 and 1935 and UDP 8189 (and open the same
    in the VM's own firewall). Install **MediaMTX** (github.com/bluenviron/mediamtx, one file) and run
    it as a service; in `mediamtx.yml` set `hlsVariant: lowLatency` and allow your app's address as
    the origin for HLS and WebRTC. Put **Caddy** in front (`live.yourdomain` → `localhost:8888` for HLS
    and `localhost:8889` for WebRTC) for HTTPS. In OBS: Settings → Stream → *WHIP*,
    `https://live.yourdomain/studio/whip` (or RTMP `rtmp://<vm-ip>/studio`). The app address is then
    `https://live.yourdomain/studio/index.m3u8` (HLS) or `https://live.yourdomain/studio/whep`
    (WebRTC): paste it in control room → TV channels → *App live stream*, and add it in the PCR under
    *Live inputs* to cut to it.
12. **Facebook live comments (optional):** a Page access token with `pages_read_engagement` →
    `npx wrangler secret put FB_PAGE_TOKEN`. YouTube live chat uses the `YOUTUBE_API_KEY` from Phase 2.
13. **Rashtrix Command Centre:** make it a newsroom account (Editorial department) for the app, then
    set `NRCS_URL` (its address, e.g. `https://nrcs.yourdomain`) and `NRCS_USERNAME` in `wrangler.toml`
    `[vars]` and `npx wrangler secret put NRCS_PASSWORD`.
14. **Bitfocus Companion (optional):** PCR → *Companion* → **Make a token**, then follow the steps on
    that screen.
15. **Both channels as HLS for streaming platforms (`streamer/`, Oracle Cloud Always Free):** a
    machine that opens each channel's output address in a hidden browser, records it and serves it
    as HLS around the clock (MediaMTX for HLS, Caddy for HTTPS; optional RTMP push to a platform).
    1. Oracle Cloud → *Compute → Instances → Create*: image **Ubuntu 24.04**, shape **Ampere
       VM.Standard.A1.Flex**, 4 OCPU and 24 GB (all inside Always Free). Save the SSH key it offers.
       In the instance's subnet → *Security list* → add ingress rules for TCP **80** and **443** from
       `0.0.0.0/0`.
    2. A free address: **duckdns.org** → sign in → add a subdomain (e.g. `rashtrix-tv`) → set it to
       the machine's public IP. Your DOMAIN is `rashtrix-tv.duckdns.org`.
    3. On the machine: `git clone` this repository, `cd Raisina-Wire/streamer`, `sudo bash setup.sh`
       (installs Docker, opens the ports, makes `.env`), then `nano .env`: the two output keys (the
       `key=` part of each output address in control room → TV channels), DOMAIN, and a long random
       FEED_SECRET (`openssl rand -hex 16`). Run `sudo bash setup.sh` again: it starts everything and
       prints the two HLS addresses, `https://DOMAIN/FEED_SECRET/h/index.m3u8` and `…/v/index.m3u8`.
    4. Optional: a platform that takes RTMP instead (ingest address + stream key) → `PUSH_H` /
       `PUSH_V` in `.env`, then `docker compose up -d`.
    Start at 720p (the default); 1080p for both channels may be more than the free machine can
    encode. A new output address in the control room stops the old one: then update `.env` and run
    `docker compose up -d`. Only stream to platforms the rights to the videos on the channel allow.
16. **The owner's Desk Brief (`src/ownerbrief.js`, app page `/mybrief`):** at 11:00, 14:00, 17:00,
    19:00 and 21:00 (India time) the major West Bengal politics, India politics, world and developing
    stories go to the owner (`ADMIN_EMAIL`) only, as a push on their signed-in devices and on
    Telegram. The draft is ready 15 minutes before; the owner's picks go if made, otherwise the
    desk's choice. Big stories between briefs come at once. Rules (counts, follow and mute words)
    are on the page. Telegram is off unless a bot token is added (the page then shows it):
    1. In Telegram, open **@BotFather**, send `/newbot`, give it a name and a username ending in
       `bot`. Copy the token it gives.
    2. `npx wrangler secret put TELEGRAM_BOT_TOKEN` and paste the token (or Cloudflare dashboard →
       Workers → rashtrix → Settings → Variables and Secrets → Add → Secret).
    3. In the app, signed in as the owner: `/mybrief` → Telegram → **Connect Telegram** → Start.

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
- `src/control.js` — realtime control (Durable Object); `src/engine.js` — the program engine;
  `src/scenes.js` — layouts, item types, timings
- `src/rundown.js`, `src/clips.js`, `src/controlroom.js` — rundowns, clips, control-room API;
  `producer.html`/`src/producer.js`, `pcr.html`/`src/pcr.js`
- `src/studioapi.js`, `src/rtc.js` — live studio and WebRTC; `studio.html`/`src/studiodesk.js`,
  `guest.html`/`src/guest.js`
- `src/extras.js` — polls, results, comments, sponsors, বঙ্গাব্দ, weather, audit, Command Centre;
  `onair.html`/`src/onair.js`, `prompter.html`/`src/prompter.js`
- `src/crshell.js`, `src/control.css`, `src/uilang.js` — shared by the control-room screens
- `migrations/` — D1 schema (`0021_rashtrix.sql` the Rashtrix tables, `0022_tv.sql` the channels,
  `0023_studio.sql` the control room and studio)
- `rashtrix/` — the brief and the owner's brand files
