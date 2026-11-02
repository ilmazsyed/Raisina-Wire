# Raisina Wire video engine

Animated explainers in the Raisina Wire style (Vox-like motion graphics): two news anchors (female
and male, taking turns), scenes that build in time with the voice, burned-in captions, an original
score, in 16:9 and 9:16.

```bash
npm run video -- video/scripts/chemical-parks.json            # both formats
npm run video -- video/scripts/<slug>.json --formats 16x9      # one format
npm run video -- video/scripts/<slug>.json --skip-audio --stills 4,20,40   # check layouts fast
```

Output: `public/videos/<slug>-16x9.mp4`, `-9x16.mp4` and a poster `.jpg` for each. Scratch files
(voice, score, timing, stills) go to `video/out/<slug>/`, which is not committed. A 100-second
film takes about 3 minutes per format on 4 CPUs.

**Preview with sound:** serve `video/` (e.g. `npx serve video`) and open
`engine/engine.html?preview&spec=../out/<slug>/spec.json&format=16x9`; click to play, drag to scrub.

## What keeps it moving
- The camera never stops: every scene pushes in slowly and smoothly, one way only. There are no
  punches, pulses or wobbles, so the frame never throbs.
- Items appear as the anchor reaches them: list points, flow boxes, timeline stops, stat cards,
  bars and map pins are spread across the narration, and the one being read is highlighted.
- Quotes light up word by word as they are read; numbers burst when the count lands; maps fly
  towards their pins and draw dashed routes between them; photos push, turn and catch a light sweep.
- A drifting grid, slow-turning rings and hairlines move behind everything, and a ticker scrolls
  the headline along the bottom.
- Brisk pieces (`pace` above 1.2) cut with a crimson wipe, an iris and a split shutter in turn.
- Files are encoded to stay near 19 MB whatever their length.

## Vox style (`"style": "vox"`, the house style for new explainers)
One narrator (an Indian-English female voice, `hf_beta:0.6+bf_isabella:0.4`, set with `voice`), short
shots that run straight into each other (one sentence each, 2–5 seconds; `para: true` on the first shot
of a new paragraph adds a breath), a paper background, no ticker, and a news bed with sound effects
on every hit. Shots cut in turn hard, whip (a fast pan with motion blur), hard, zoom; set `cut` on a
scene to choose. A 3-minute film is about 45–55 shots.

| type | fields |
|---|---|
| `kinetic` | `say`; `text` (what is shown, default the narration; "\|" breaks a line), `hl` (words given a highlighter stroke and a pop), `kicker`, `size` |
| `snap` | `src`, `frame` (`clip`: a taped paper clipping, default; `full`: full bleed), `marks`, `title`, `zoom`, `tilt`, `duotone`, `credit` |
| `doc` | `text` (a clipping of a document or statement), `hl` (the phrase swept with a highlighter), `kicker`, `source`, `at` |
| `versus` | `a`, `b` (`{value, prefix, suffix, label, inr, decimals}`), `at` (when b lands), `kicker`, `hot` |

`marks` on a `snap` are drawn by hand as the narrator reaches them, and the camera glides to each:
`{kind: "circle", x, y, r}`, `{kind: "arrow", from: [x, y], to: [x, y]}`, `{kind: "underline", x, y, w}`,
`{kind: "box", x, y, w, h}`, `{kind: "highlight", x, y, w, h}`, `{kind: "label", x, y, text, color: "red"}`.
Coordinates are 0–1 across the photo. `at` is a word of the narration (the mark lands when it is said)
or a fraction of the line. `number`, `stats`, `map` and the other types still work inside a Vox film.

## How it works
1. `audio.py` voices each scene's narration with Kokoro (offline, free), alternating the anchors and
   giving each line broadcast processing (presence lift, compression), lays the lines end to end,
   writes `timing.json` (scene starts and caption chunks) and mixes `audio.m4a`: the voice over an
   original score (pads, a soft pulse, a whoosh on each cut, ducked under the voice, -16 LUFS).
2. `engine/engine.js` draws every frame as a function of time on one canvas, in Raisina Wire's
   colours and type (Newsreader, Manrope, DM Mono, bundled in `engine/fonts/`).
3. `render.mjs` steps the engine frame by frame in headless Chromium and pipes the frames to ffmpeg.

Needs: Python with `kokoro-onnx` and `soundfile`; the Kokoro model files `kokoro-v1.0.onnx` and
`voices-v1.0.bin` (from the kokoro-onnx GitHub releases) in `~/.cache/rw-video/`, or set
`RW_VIDEO_MODELS`; ffmpeg; Playwright with Chromium. For photo cut-outs: `rembg` with
`onnxruntime` and `scipy` (rembg downloads its models to `~/.u2net/` on first use).

## Writing a script
A script is JSON: `slug`, `title`, `voices` (the anchors, taken in turn scene by scene; default
`["bf_emma", "bm_george"]`, British female and male anchors read briskly with broadcast processing),
`alternate: false` with a single `voice` for one narrator, `anchorSpeed` (overrides each anchor's
pace), `ticker` (text after the headline in the scrolling ticker), `pace` (how fast scenes animate: 1 is calm, 1.6 is brisk, with push-in cuts, a crimson wipe,
shorter pauses and a quicker beat), `captionChars` (caption length, 36–44), `series` (shown under
the logo) and `scenes`.
Every scene has `say` (the narration, also the captions; write numbers as numerals, e.g.
"₹3,030 crore") and may have `speak` (the same line spelt for the voice: "three thousand and
thirty crore rupees"), `hold` (extra seconds on screen) and `source` (shown at the bottom).

| type | fields |
|---|---|
| `title` | `kicker`, `title`, `sub` |
| `number` | `kicker`, `prefix`, `value`, `suffix`, `decimals`, `inr` (Indian digit grouping), `label` |
| `share` | `kicker`, `value` or `range: [lo, hi]` (per cent), `ringLabel`, `title`, `detail` |
| `bars` | `kicker`, `title`, `items: [{label, value, display, hot}]`, `max` |
| `timeline` | `kicker`, `title`, `items: [{when, what, hot}]` |
| `stats` | `kicker`, `title`, `items: [{prefix, value, suffix, inr, label}]`, `hot` (index in red) |
| `flow` | `kicker`, `title`, `nodes: [..]` (boxes joined by arrows), `base` (a shared bar beneath) |
| `map` | `kicker`, `title`, `view: [lon0, lon1, lat0, lat1]`, `pins: [{lon, lat, label, side}]`, `stats: [{value, label}]` |
| `quote` | `text`, `who`, `role` |
| `list` | `kicker`, `title`, `items: [..]` |
| `photo` | `src` (a file path relative to the script, or a URL), `title`, `focus` / `focusV` (0–1: which part of a wide photo stays in frame, landscape / vertical), `style`: `kenburns` (default: push, turn, light sweep), `duotone` (crimson duotone with halftone dots), `parallax` (the subject cut out and moving over a blurred copy of the photo) |
| `cutout` | `src`, `kicker`, `title`, `side` (`right` default, or `left`): the subject is cut out as a white-edged sticker that pops up in front of a giant headline, over a duotone of the photo |
| `collage` | `kicker`, `title`, `photos: [{src, caption}]` (2–4): polaroids fly in with a 3D turn, and the one being read comes forward |
| `outro` | `title`, `url` |

Any scene can take `bg` (a photo shown as a faint duotone backdrop behind the graphics). Cut-outs
(`cutout`, `photo` with `style: "parallax"`, or `cutout: true`) are made by `cutout.py` with rembg
and cached in `video/out/<slug>/`. The default model is `u2net_human_seg` (people). For objects or
buildings set `cutModel: "isnet-general-use"`.

Maps are dot maps of land only (Natural Earth coastlines at 0.4°, `engine/land.json`, covering
20°W–110°E, 10°S–60°N: Europe, Africa, the Middle East and Asia; plus 95°W–30°W, 25°S–30°N:
the Caribbean, Central America and northern South America); no borders are drawn. Keep every fact, figure and quote to what the source
story says, as for articles.

## Raisina TV anchor intros
Each explainer that plays on Raisina TV gets a 25–30 second intro (written in `src/tv-intros.js`,
keyed by the 16:9 video file). Before starting an explainer, ask the editor (every time, see
`CLAUDE.md`): which anchor reads the intro, whether it is on camera (`intro: "cam"`) or voice only
(`intro: "voice"`), and which anchor narrates the explainer (its script's `voice`, that anchor's
blend in `src/anchors.js`). Then:
1. Add the intro with `anchor` and `intro` set as chosen.
2. Record it: `PYTHON=<python with kokoro-onnx> node video/anchor-voices.mjs` (only the chosen
   anchor's lines are made).
3. The voice-over pictures: `python video/anchor_vo_pics.py` (see its header).
4. Publish. The intro plays at once as a voice-over on the pictures; for an on-camera intro the
   GitHub Action "Raisina TV lip sync" renders the anchor's two on-camera clips (10–20 minutes)
   and the intro switches to camera by itself. See `anchors/README.md`.
