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
- **Short lines** (News Update, bulletin, Breaking Headlines, break-ins, "We're bringing you live
  visuals of …") are written automatically in `src/anchors.js`.
- **Voices:** Google Cloud Text-to-Speech, Chirp 3 HD, Indian English: Tara `Despina`, Kabir `Charon`,
  Bharti `Kore`, Vikram `Iapetus`, Ilmaz `Orus` (stand-in until a cloned voice is possible). Each
  line is generated once and kept in D1. Without `GOOGLE_TTS_API_KEY` the anchors still appear, with
  captions instead of a voice.
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
