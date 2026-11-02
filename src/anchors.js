// Raisina TV's AI anchors (live channel only; never inside the explainer videos).
// Four fictional AI anchors can take the desk in turn, changing on the hour (India time); Ilmaz
// Syed, the editor, can introduce explainers made from his own stories ("Editor's Pick"). Only the
// anchors in READY go on air. Every anchor is labelled AI on screen. Their faces are photoreal
// loops made offline from a portrait (anchors/README.md).
//
// Voices: Kokoro, the voice engine the explainers use (Indian-British blends), recorded offline:
// every line an anchor can say is fixed text, rendered to public/anchors/voice/<id>.mp3 by
// `node video/anchor-voices.mjs`, which also writes the list of recorded lines (anchor-voices.js).
// A line without a recording is shown as a caption instead. Lines whose words change (a breaking
// story, a live input's caption) are said in a fixed form, with the words themselves on screen.
import { TV_INTROS } from "./tv-intros.js";
import { VOICED } from "./anchor-voices.js";
import { LIPPED } from "./anchor-lips.js";

// Voices. `voice` names the anchor's voice and is part of every line's id, so a new voice means new
// recordings: "cb:<key>" is Chatterbox (expressive) copying the anchor's reference clip
// (public/anchors/<key>-ref.wav, made from their Kokoro blend `kokoro`), recorded by the GitHub
// Actions. `was` is the voice the anchor's lines were recorded in before: those recordings (and their
// lip-synced clips) stay on air until each line has its new one, so an anchor is never silent.
// `face`: the anchor's face loops and lip-sync settings are made (video/lips/faces.json).
export const ANCHORS = {
  tara:   { name: "Tara",       role: "News Anchor (AI)", voice: "cb:tara",   kokoro: "hf_beta:0.6+bf_isabella:0.4", was: "hf_beta:0.6+bf_isabella:0.4", face: true },
  kabir:  { name: "Kabir",      role: "News Anchor (AI)", voice: "cb:kabir",  kokoro: "hm_psi:0.55+bm_fable:0.45" },
  bharti: { name: "Bharti",     role: "News Anchor (AI)", voice: "cb:bharti", kokoro: "hf_alpha:0.6+bf_emma:0.4" },
  vikram: { name: "Vikram",     role: "News Anchor (AI)", voice: "cb:vikram", kokoro: "hm_omega:0.55+bm_george:0.45" },
  ilmaz:  { name: "Ilmaz Syed", role: "Editor (AI)",      voice: "hm_omega:0.5+bm_daniel:0.5" }
};
export const engineOf = k => (String(ANCHORS[k]?.voice).startsWith("cb:") ? "chatterbox" : "kokoro");
// Live duty: 3-hour shifts (India time: 12–3 AM, 3–6 AM, … 9 PM–12 AM) taken in ROTA order, the order
// moving on by one each day, so over four days every anchor has every slot (mornings, primetime,
// nights) equally. The anchor on shift says the channel's own lines (hello, bulletins, News Update,
// breaking, live cuts) and reads the headlines. Explainer intros are not part of this: the editor
// chooses their anchor for each explainer.
export const ROTA = ["tara", "kabir", "bharti", "vikram"];
export const SHIFT_HOURS = 3;
export const shiftAnchor = (now = Date.now()) => {
  const ist = now + 5.5 * 3600e3, day = Math.floor(ist / 864e5), slot = Math.floor(new Date(ist).getUTCHours() / SHIFT_HOURS);
  return ROTA[(slot + day) % ROTA.length];
};
// Anchors on air. Only these take shifts; a shift whose anchor isn't on air is covered by the next
// anchor on air in ROTA order (Tara first). STAGING: anchors being prepared (voice recordings and
// lip sync made in the background) who are not on air yet; they move to READY when complete.
export const READY = ["tara"];
export const STAGING = ["kabir", "bharti", "vikram"];
const istHour = (now = Date.now()) => new Date(now + 5.5 * 3600e3).getUTCHours();
export const onDuty = (now = Date.now()) => {
  const k = shiftAnchor(now);
  if (READY.includes(k)) return k;
  const i = ROTA.indexOf(k), order = [...ROTA.slice(i + 1), ...ROTA.slice(0, i)];
  return order.find(a => READY.includes(a)) || ROTA[0];
};
const prepared = k => READY.includes(k) || STAGING.includes(k);
const hourWords = h => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
const clip = (t, n) => { const s = String(t || "").replace(/\s+/g, " ").trim(); if (s.length <= n) return s; const c = s.slice(0, n); return `${c.slice(0, c.lastIndexOf(" ")).replace(/[,;:\s]+$/, "")}.`; };
const end = t => /[.!?…]["”’]?$/.test(t) ? t : `${t}.`;

const sha = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, "0")).join("");
export const lineId = async (anchor, text, voice = ANCHORS[anchor].voice) => (await sha(`${voice}|${text}`)).slice(0, 20);
// Intros recorded before the anchors moved to Chatterbox (`legacy` in src/tv-intros.js) keep their
// recordings and lip sync in the voice they were made in; intros made since use the anchor's voice.
const introVoice = (it, k) => (it.legacy ? ANCHORS[k].was || ANCHORS[k].kokoro || ANCHORS[k].voice : ANCHORS[k].voice);
// A line's lip-synced clip: rendered offline into the site (LIPPED), or by the GitHub Action
// "Raisina TV lip sync" into D1 (`lips`, ids the Worker found there).
// Its recording: in the anchor's voice (a file in the site, VOICED, or recorded by the Action into
// D1, `lines`), else the anchor's previous voice (`was`) until the new one is in.
const clipOf = (id, lips) => LIPPED.has(id) ? `/anchors/lips/${id}.mp4` : lips.has(id) ? `/api/tv/lip/${id}` : null;
async function line(anchor, text, lips = new Set(), lines = new Set(), voice = ANCHORS[anchor].voice) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const id = await lineId(anchor, t, voice);
  if (lines.has(id)) return { id, anchor, text: t, audio: `/api/tv/voice/${id}`, clip: clipOf(id, lips) };
  if (VOICED.has(id) || !ANCHORS[anchor].was) return { id, anchor, text: t, audio: VOICED.has(id) ? `/anchors/voice/${id}.mp3` : null, clip: clipOf(id, lips) };
  const old = (await sha(`${ANCHORS[anchor].was}|${t}`)).slice(0, 20);
  return { id: old, anchor, text: t, audio: VOICED.has(old) ? `/anchors/voice/${old}.mp3` : null, clip: clipOf(old, lips) };
}
// The fixed lines, shared by the channel and the recording script.
export const FIXED = {
  news: "Time now for a quick news update from the Raisina Wire desk.",
  headlines: "Here are the breaking headlines at this hour.",
  bulletin: h => `It's ${hourWords(h)}. Here are the headlines on Raisina TV.`,
  breaking: "Breaking news. Here is what we know.",
  live: "We're bringing you live visuals now.",
  // The anchor's self-introduction: when TV starts, when an anchor takes over, and when the anchor
  // is back on screen after half an hour.
  hello: name => `Hello and welcome to today's news updates. My name is ${name}, and you're watching Raisina Wire Live.`
};
// How names are said aloud (Kokoro reads the spelling): used when recording, never shown.
export const SAY = [[/Raisina/g, "Rayseena"]];
export const spoken = t => SAY.reduce((s, [a, b]) => s.replace(a, b), String(t));
const camFor = (who, it) => who === "ilmaz" ? it.cam : it.cam.replace(/^My pick today\.\s*/, "Today's Editor's Pick. ");
// Live reads: the breaking story and the live caption in the anchor's own words. Recorded in the
// editor's browser from the control room (src/anchorrecord.js) and kept in D1; until a read is
// recorded the anchor says the fixed line with the words on screen.
export const READ = {
  breaking: t => `Breaking news. ${end(clip(t, 220))}`,
  live: t => `We're bringing you live visuals of ${end(clip(t, 120))}`,
  head: t => end(String(t || "").replace(/\s+/g, " ").trim())   // a headline, read as it's shown
};
// The live reads to record now, for each anchor on air: every breaking line on air, the last
// break-in's headline, every live input (so a cut is voiced the moment it happens), and every
// headline the channel can show (News Update sets, Breaking Headlines), which the anchor reads.
// Recorded by the GitHub Action "Raisina TV live reads" (video/live_reads.py) every few minutes,
// or by the control room when it is open.
// Read by the anchor on shift, and by the next one when their shift starts within half an hour.
export async function liveReads({ breaking = [], inputs = [], force = null, heads = [], now = Date.now() }) {
  const texts = [...new Set([...breaking.map(READ.breaking), ...(force?.text ? [READ.breaking(force.text)] : []), ...inputs.map(i => READ.live(i.title)), ...heads.filter(Boolean).map(READ.head)])];
  const out = [];
  for (const k of new Set([onDuty(now), onDuty(now + 30 * 60e3)])) for (const t of texts) out.push({ id: await lineId(k, t), anchor: k, voice: ANCHORS[k].voice, kokoro: ANCHORS[k].kokoro || ANCHORS[k].voice, engine: engineOf(k), ref: `/anchors/${k}-ref.wav`, voiceFile: `/anchors/${k}-voice.bin`, text: t });
  return out;
}
// Every line an anchor can say (for recording): the intros, both ways for the Editor's Picks, and
// the fixed lines, including a bulletin line for each hour.
// Who reads an intro: the anchor the editor chose for that explainer.
export const introAnchor = it => (ANCHORS[it?.anchor] ? it.anchor : ROTA[0]);
const fixedLines = anchor => [FIXED.hello(ANCHORS[anchor].name), FIXED.news, FIXED.headlines, FIXED.breaking, FIXED.live, ...Array.from({ length: 24 }, (_, h) => FIXED.bulletin(h))];
// Every line an anchor can say (for recording): the channel's fixed lines if the anchor goes on air,
// and the intros of the explainers the editor gave this anchor. Nothing is made for other anchors.
export function allLines(anchor) {
  const out = prepared(anchor) ? fixedLines(anchor) : [];
  for (const it of Object.values(TV_INTROS)) if (introAnchor(it) === anchor && !it.legacy) out.push(camFor(anchor, it), it.vo, it.out);
  return [...new Set(out)];
}
// The lines that need a lip-synced clip (for the GitHub Action): every line an on-air anchor says
// on screen, and the on-camera parts of the intros set to "cam" whose anchor's face is ready.
// `pip`: shown in the small window beside a title card (no face sharpening needed).
export async function lipLines() {
  const out = [];
  for (const k of Object.keys(ANCHORS).filter(a => prepared(a) && ANCHORS[a].face)) {
    const pip = new Set([FIXED.news, FIXED.headlines, ...Array.from({ length: 24 }, (_, h) => FIXED.bulletin(h))]);
    for (const t of fixedLines(k)) out.push({ id: await lineId(k, t), anchor: k, text: t, pip: pip.has(t) });
    for (const it of Object.values(TV_INTROS)) if (it.intro !== "voice" && !it.legacy && introAnchor(it) === k) for (const t of [camFor(k, it), it.out]) out.push({ id: await lineId(k, t), anchor: k, text: t, pip: false });
  }
  return [...new Map(out.map(l => [l.id, l])).values()];
}

// Everything the anchors say on the channel right now (English channel only).
// playlist: [{ id, src, editorPick }]; input: the live input on air; breaking: the editor's lines.
export async function anchorLines({ playlist, input, breaking, force, voiced = new Set(), lips = new Set(), lines = new Set(), now = Date.now() }) {
  const duty = onDuty(now), h = istHour(now);
  const intros = {};
  for (const v of playlist) {
    const it = TV_INTROS[String(v.src || "").split("?")[0]];
    if (!it) continue;
    const who = introAnchor(it);
    // His own picks are written in the first person; another anchor introduces them as his pick.
    const [cam, vo, out] = await Promise.all([line(who, camFor(who, it), lips, lines, introVoice(it, who)), line(who, it.vo, lips, lines, introVoice(it, who)), line(who, it.out, lips, lines, introVoice(it, who))]);
    if (!cam || !vo || !out) continue;
    // On camera once the anchor's face and both lip-synced clips are ready; until then (and for
    // intros set to "voice") all three parts are read over the explainer's pictures.
    const mode = it.intro !== "voice" && READY.includes(who) && cam.clip && out.clip ? "cam" : "voice";
    intros[v.id] = { anchor: who, mode, pick: Boolean(v.editorPick), cam, vo, out };
  }
  const brk = force?.breaking ? (force.text || breaking[0] || "") : (breaking[0] || "");
  // The breaking story and the live caption: read in full once recorded (live reads), otherwise
  // the fixed line. Either way the words are on screen.
  const read = async (text, fixed, show) => {
    const id = await lineId(duty, text);
    return voiced.has(id) ? { id, anchor: duty, text, audio: `/api/tv/voice/${id}`, clip: null, show } : { ...await line(duty, fixed, lips, lines), show };
  };
  const [hello, news, bulletin, headlines, breakingLine, live] = await Promise.all([
    line(duty, FIXED.hello(ANCHORS[duty].name), lips, lines), line(duty, FIXED.news, lips, lines), line(duty, FIXED.bulletin(h), lips, lines), line(duty, FIXED.headlines, lips, lines),
    brk ? read(READ.breaking(brk), FIXED.breaking, end(clip(brk, 220))) : null,
    input ? read(READ.live(input.title), FIXED.live, clip(input.title, 120)) : null
  ]);
  return {
    duty, roster: Object.fromEntries(Object.entries(ANCHORS).map(([k, a]) => [k, { name: a.name, role: a.role }])),
    intros, lines: { hello, news, bulletin, headlines, breaking: breakingLine, live }
  };
}
