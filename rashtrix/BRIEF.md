# Rashtrix App — Build Brief (handoff for Claude Code)

Owner: Rashtrix 24×7 News (Middleton Media Works)
Base code: fork of `ilmazsyed/Raisina-Wire` (Cloudflare Worker + D1 + Vite PWA)
Design mockups (approved direction): https://claude.ai/artifact/CtopbLrBdTaJpNmYv5c4UV
Rule: everything must run on free tiers. No paid AI API.

## Brand
- Logo: Rashtrix gold "R" mark + RASHTRIX / 24X7 NEWS (owner will add `logo.png` to the repo).
- Vertical jacket reference: two Short frames (owner will add `jacket-midband.jpg`, `jacket-lowband.jpg`).
- Colours: brand red #AA0404, jacket maroon #A43F44, gold #D4A017 (hints only), ink #111111, white.
- Fonts: Noto Serif Bengali (headlines on bands), Hind Siliguri (UI/body), Montserrat (English caps).
- Tagline: দেশ প্রথম । বলিদান পরম ধর্ম
- Horizontal on-air look: white + red, frosted glass panels, black text on white, white on red, gold only as thin accents, slow animated background (dot grid drift, rotating thin arcs, light sheen). No pastel blobs.
- Vertical on-air look: matches the YouTube Shorts jacket (portrait strip, logo card, maroon frame, slanted headline band + "YOUR AD HERE" box).

## Phase 1 — Bengali-first app
- Fork Raisina Wire into a new repo; rebrand everything to Rashtrix (logo/icons/manifest/SEO/legal).
- Bengali is the default language (`/`); English `/en`, Hindi `/hi`. Desks: Kolkata, West Bengal, India, Probashi Bangali, World.
- Remove: AI anchor, lip-sync, voice cloning, anchor workflows/assets, Calibrex ads, Markets (unless owner asks).
- Import all existing articles from www.rashtrix.live (Wix blog RSS/API), keep syncing new posts.
- Live wire: trusted Bengali outlets (owner supplies approved list + blocklist). Bengali readers get items rewritten in Bengali; sources not shown publicly but logged internally. Rewrite via Gemini API free tier, cached once per item, queue overnight if the daily quota runs out. Rewrites must use facts from 2+ sources where possible and never copy phrasing.
- Auto briefs: 100-word Bengali briefs, translated/rewritten from originals in other languages.
- Photos: rewrites and briefs carry NO photos (branded text card instead). Only Rashtrix's own articles and live coverage carry photos.
- Listen: Google Chirp 3 HD bn-IN male + female voices, reader picks; each paragraph generated once and cached.
- Corrections workflow: pull/correct any rewrite in one tap, keep a record.

## Phase 2 — Rashtrix Live (one live, two formats)
- There is ONE live: the app's own channel, Rashtrix Live, in a horizontal (1920×1080) and a vertical (1080×1920) format. Each format can be switched on/off.
- It plays out inside the app exactly like Raisina TV (`src/tv.js`): every viewer's player runs the channel itself. The videos (Shorts and horizontal videos) are NOT made in the app: they are sourced from the Rashtrix YouTube channel's playlists and played in the app's player. The breaking cards, headline cards, graphics, music and cut-ins are made in the app. No OBS/vMix in making the live.
- Playout: recency first (newest video first). In-app breaking cards and headline cards between every video.
- Everyone in sync: unlike Raisina TV (where each viewer's sequence starts fresh when they open it), Rashtrix Live follows one shared clock. The server keeps the running order (video, card, video, card...) with start times; every player, including the OBS output link, joins at the same item and the same second, like real TV. Each format (horizontal, vertical) has its own running order. New videos join the order at the next slot; PCR cut-ins and bulletins pause the order for everyone and it resumes for everyone when they end.
- Video sourcing: YouTube Data API, from the Rashtrix channel's own playlists; owner selects/deselects playlists (Shorts → vertical, long videos → horizontal). Refresh every 10 minutes + instant "Refresh now". No YouTube lives as sources. Stay inside free quota.
- YouTube player controls hidden (controls=0 + click-blocking overlay).
- Vertical: Shorts carry their own jacket; our graphics sit in safe zones (breaking/headline flash over the left of the portrait strip, LIVE tag in video corner, ticker at the bottom). App-made items (breaking cards, graphics, clips) get an app-drawn jacket identical in position to the Shorts jacket. Full-screen 9:16 promo swipe cards (upload or Drive link), on/off, play/skip, repeat rules.
- Horizontal: full designable jacket (bug, LIVE, clock, lower third, ad box, ticker), L-band, full-screen breaking with music, News Update/Bulletin packages from Raisina Wire.
- Output link: each format has its own secret full-screen output page of the live. Later, OBS can open that link as a browser source only to restream it to YouTube/Facebook. OBS does no mixing and nothing on air depends on it.

## Phase 3 — Bulletin producer + PCR
- Producer space: daily rundowns per channel; item types: YouTube video (trim in/out), live segment (layout + sources), app clip, full-screen breaking, headline set, L-band, promo card, ad break, slate. Drag to reorder; per-item text (lower third, L-band, breaking text, ticker lines); auto durations, back-timing, total vs slot.
- Midnight IST: archive the day's rundowns + as-run log; working rundowns cleared; archive kept for a set period (default 90 days). PDF generated in the browser (correct Bengali shaping).
- PCR: preview/program, TAKE/AUTO, transitions (cut, mix, red slash wipe, stinger). Layouts usable any time: full screen, PiP, 2-up, 1 big + 2, 3 equal, host + 4, 6-grid, L-band, full graphic. Source grid with tally. Graphics layers on/off. "Breaking in now". Rundown auto/manual; PCR can cut in anything at any time, then resume or skip.
- Live bulletins: at set times (or any time) the PCR cuts the live into a live bulletin; every viewer's player switches within about a second, then goes back to the recency playout when the bulletin ends. All from the PCR, in the app.
- Realtime control to all outputs via Durable Objects (~1 s).
- Videos: upload or paste Drive link (copied once into Cloudflare R2, 10 GB free; auto-delete old clips). MP4 H.264.
- Google Drive images for popups/bugs/L-bands copied into app storage on paste.

## Phase 4 — In-app live studio
- Guests/reporters join via a link in the browser (no install): camera preview, name + title (fills strap), consent tick box for broadcast/recording, headphones advice.
- WebRTC via Cloudflare Realtime (SFU + TURN, free monthly allowance). Up to 5–6 debate guests; all see/hear each other plus an on-air return feed. Producer: mute, private talkback, green room with camera/mic/network/headphone checks, countdown + messages on guest's phone.
- Fallback: VDO.Ninja (free), brought into the PCR mixer as a source.
- Live bulletin mixer runs in the operator's browser (Chrome, laptop/desktop): it mixes anchor, reporters, guests and clips into one picture with the app's graphics and sends one stream to a self-hosted media server on an Oracle Cloud Always Free VM; viewers' players play that stream (HLS / low-latency WebRTC) during the bulletin. No OBS/vMix.

## Phase 5 — Extras
- Safety: 5–10 s broadcast delay with DUMP; emergency standby slate (auto if a feed drops 10 s); output health + phone push alerts; audit log (PDF).
- Speed: macros (one button = layout + graphics + music), keyboard shortcuts (Bitfocus Companion compatible), rundown templates auto-created daily, teleprompter driven by rundown, guest directory.
- Audience: curated YouTube/Facebook/app comments on screen, in-app polls with on-air bar ("not a scientific survey"), civic poll results board (official figures only, with an exit-poll blackout lock), বঙ্গাব্দ date + Kolkata weather in ticker.
- Business: sponsor ad-box rotation with weights; proof-of-play report from the as-run log (PDF/CSV).
- Integration: import stories from Rashtrix Command Centre (NRCS, repo `ilmazsyed/rashtrix-nrcs-commandcentre`) into rundowns.

## All control-room and guest screens
- UI language switch: বাংলা / English / हिन्दी, remembered per user. On-air graphics stay Bengali.

## Compliance (owner is CLO)
- IT Rules 2021 grievance officer page; DPDP privacy notice + consent; guest broadcast consent; royalty-free music only; poll disclaimer; official-figures-only results.

## Free-tier notes
- Cloudflare free plan ~100k Worker requests/day; may need the $5/month plan as audience grows.
- PWA install is free; Play Store ($25 once) / App Store ($99/yr) optional.
- Accounts/keys owner must create: Cloudflare, GitHub, Google Cloud (YouTube Data API, Drive API, Text-to-Speech), Gemini (AI Studio), Oracle Cloud.

## How to work
- Build phase by phase; each phase deployed and usable before the next.
- Ask the owner for keys only when that phase needs them, with step-by-step instructions.
