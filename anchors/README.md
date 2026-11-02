# Raisina TV AI anchors (live channel only)

Sources for the AI anchors who present on Raisina TV live (never inside explainer videos).
Not served by the site: nothing here is under `public/`.

| Name | Role | Portrait | Look |
|---|---|---|---|
| Tara | AI Live Anchor | `sources/tara.png` | long wavy hair, black blazer, blush top |
| Kabir | AI Live Anchor | `sources/kabir.png` | slicked hair, navy suit, maroon tie |
| Bharti | AI Live Anchor | `sources/bharti.png` | maroon and gold silk saree, pearl earrings |
| Vikram | AI Live Anchor | `sources/vikram.png` | glasses, navy suit, red tie |
| Ilmaz Syed | Editor (real person, consented) | `sources/ilmaz-studio.png`, `sources/ilmaz-photo.png` | grey suit, studio set |

Names of the four AI anchors are working names. Voices: Kokoro (as in the explainers), Indian-British
blends — women `hf_beta:0.6+bf_isabella:0.4`, men and Ilmaz `hm_omega:0.55+bm_george:0.45` (each
anchor to get a distinct blend).

The four AI anchors are fictional; Ilmaz Syed gave his consent to the use of his photo and voice. Every
anchor carries an on-screen "AI" label.

## On the channel

- **Who is on:** the four AI anchors take turns on the hour (India time), in the order Tara, Kabir,
  Bharti, Vikram (`src/anchors.js`). Explainers made from a story Ilmaz Syed wrote are his Editor's
  Pick, and he introduces them.
- **Intros:** each explainer's 25–30 second intro (65–80 words: `cam` hook, `vo` voice-over, `out`
  hand-off) lives in `src/tv-intros.js`, keyed by the video file. Add one there whenever a new
  explainer is made; an explainer without one simply plays.
- **Short lines** (News Update, an hourly bulletin line, Breaking Headlines, break-ins, live cuts)
  are fixed in `src/anchors.js`.
- **Voices:** Kokoro, the voice engine the explainers use, recorded offline (no Google voice). Tara
  has the explainers' Indian-British narrator voice, `hf_beta:0.6+bf_isabella:0.4`. The other
  anchors have their own blends, set in `src/anchors.js`. Every line an anchor can say is fixed
  text, recorded to `public/anchors/voice/` by `node video/anchor-voices.mjs` (run it after
  adding or editing an intro, or adding an anchor; it also updates `src/anchor-voices.js`). A
  line without a recording shows as a caption. Lines whose words change are said in a fixed form,
  with the words on screen: "Breaking news. Here is what we know." over the breaking story, and
  "We're bringing you live visuals now." over the live input's caption.
- **Live reads:** the breaking story and the live caption are also read in full, in the same voice
  ("Breaking news. {line}", "We're bringing you live visuals of {caption}"). Kokoro can't run on the
  live site, so these are recorded in the editor's browser: whenever the control room's Raisina TV
  page is open, it records any line the channel is waiting for (breaking lines on air, the last
  break-in headline, every live input) and uploads it to D1 (`src/anchorrecord.js`). The first
  time, the browser downloads the voice model, about 90 MB, from Hugging Face. Until a read is
  recorded, Tara says the fixed line above. The blended voice the browser uses is
  `public/anchors/<key>-voice.bin` (the same blend as the recordings).
- **Who is ready:** only anchors listed in `READY` in `src/anchors.js` go on air. For now that is
  Tara alone: she presents every hour, and introduces Ilmaz's Editor's Picks as "Today's Editor's
  Pick". To add an anchor, render their faces (below), put the files in `public/anchors/`, and add
  their key to `READY`.
- **Off switch:** control room → Raisina TV → Between videos → AI anchors.

## Faces (`public/anchors/`)

`<key>.jpg` (still), `<key>-talk.mp4` (talking loop) and `<key>-idle.mp4` (blinks, mouth closed)
for `tara`, `kabir`, `bharti`, `vikram`, `ilmaz`. Made offline with SadTalker (CPU, `--still
--preprocess full --enhancer gfpgan`) from the portraits in `sources/`: the talking loop is driven by a
few seconds of speech, the idle loop by near-silence. Each render becomes a silent loop that plays
forwards then backwards, 720 px tall. Lips are approximate, not synced to the words.

## On screen
- **Aston:** when the anchor is on camera, a broadcast lower third wipes in, holds and wipes out:
  "Tara, Raisina Wire" over "News Anchor (AI)" (roles in `src/anchors.js`).
- **Voice-over pictures:** four per explainer, one after another with a Raisina Wire wipe (crimson
  then navy). They are the explainer script's own photos, made up to four with stills from the film
  (above its captions), in `public/anchors/vo/`. Run `python3 video/anchor_vo_pics.py` after adding
  an intro for a new explainer; it also writes `src/tv-intro-pics.js`.

## Live reads (headlines, breaking lines, live captions)
Tara reads every headline the channel shows (News Update sets, Breaking Headlines), the editor's
breaking lines and live-input captions, in her Kokoro voice. These change all the time, so the
GitHub Action **Raisina TV live reads** (`.github/workflows/live-reads.yml`, every 10 minutes and on
demand) asks the site what's waiting (`/api/admin/tv/voice-todo`), records it with
`video/live_reads.py` and uploads it (kept in D1 for four days). It needs the repository secret
`RW_PUBLISH_TOKEN`, the same value as the Worker's `PUBLISH_TOKEN`. The control room records too
while its Raisina TV page is open. A headline not yet recorded is shown on its usual timer.

## Self-introduction
"Hello and welcome to today's news updates. My name is Tara, and you're watching Raisina Wire Live."
The anchor says it before her first line when TV starts, when a new anchor takes over, and when
she's back on screen after half an hour (`hello` in `src/tv.js`, `FIXED.hello` in `src/anchors.js`).
Names are recorded as they're said ("Raisina" as "Rayseena"): `SAY` in `src/anchors.js`.
