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

export const ANCHORS = {
  tara:   { name: "Tara",       role: "AI Live Anchor", voice: "hf_beta:0.6+bf_isabella:0.4" },
  kabir:  { name: "Kabir",      role: "AI Live Anchor", voice: "hm_psi:0.55+bm_fable:0.45" },
  bharti: { name: "Bharti",     role: "AI Live Anchor", voice: "hf_alpha:0.6+bf_emma:0.4" },
  vikram: { name: "Vikram",     role: "AI Live Anchor", voice: "hm_omega:0.55+bm_george:0.45" },
  ilmaz:  { name: "Ilmaz Syed", role: "Editor",         voice: "hm_omega:0.5+bm_daniel:0.5" }
};
// The hourly rota, in order. The editor is not on it: he presents only his Editor's Picks.
export const ROTA = ["tara", "kabir", "bharti", "vikram"];
// Anchors whose faces are ready (public/anchors/<key>-idle.mp4, -talk.mp4, -mouth.*). Only these go
// on air: the rota skips the others, and while the editor's face isn't ready his Editor's Picks are
// introduced by the anchor on duty.
export const READY = ["tara"];
const istHour = (now = Date.now()) => new Date(now + 5.5 * 3600e3).getUTCHours();
const onRota = () => { const r = ROTA.filter(k => READY.includes(k)); return r.length ? r : [ROTA[0]]; };
export const onDuty = (now = Date.now()) => { const r = onRota(); return r[istHour(now) % r.length]; };
const hourWords = h => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
const clip = (t, n) => { const s = String(t || "").replace(/\s+/g, " ").trim(); if (s.length <= n) return s; const c = s.slice(0, n); return `${c.slice(0, c.lastIndexOf(" ")).replace(/[,;:\s]+$/, "")}.`; };
const end = t => /[.!?…]["”’]?$/.test(t) ? t : `${t}.`;

const sha = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, "0")).join("");
export const lineId = async (anchor, text) => (await sha(`${ANCHORS[anchor].voice}|${text}`)).slice(0, 20);
async function line(anchor, text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const id = await lineId(anchor, t);
  return { id, anchor, text: t, audio: VOICED.has(id) ? `/anchors/voice/${id}.mp3` : null };
}
// The fixed lines, shared by the channel and the recording script.
export const FIXED = {
  news: "Time now for a quick news update from the Raisina Wire desk.",
  headlines: "Here are the breaking headlines at this hour.",
  bulletin: h => `It's ${hourWords(h)}. Here are the headlines on Raisina TV.`,
  breaking: "Breaking news. Here is what we know.",
  live: "We're bringing you live visuals now."
};
const camFor = (who, it) => who === "ilmaz" ? it.cam : it.cam.replace(/^My pick today\.\s*/, "Today's Editor's Pick. ");
// Live reads: the breaking story and the live caption in the anchor's own words. Recorded in the
// editor's browser from the control room (src/anchorrecord.js) and kept in D1; until a read is
// recorded the anchor says the fixed line with the words on screen.
export const READ = {
  breaking: t => `Breaking news. ${end(clip(t, 220))}`,
  live: t => `We're bringing you live visuals of ${end(clip(t, 120))}`
};
// The live reads to record now, for each anchor on air: every breaking line on air, the last
// break-in's headline, and every live input (so a cut is voiced the moment it happens).
export async function liveReads({ breaking = [], inputs = [], force = null }) {
  const texts = [...new Set([...breaking.map(READ.breaking), ...(force?.text ? [READ.breaking(force.text)] : []), ...inputs.map(i => READ.live(i.title))])];
  const out = [];
  for (const k of READY.filter(k => ROTA.includes(k))) for (const t of texts) out.push({ id: await lineId(k, t), anchor: k, voice: ANCHORS[k].voice, voiceFile: `/anchors/${k}-voice.bin`, text: t });
  return out;
}
// Every line an anchor can say (for recording): the intros, both ways for the Editor's Picks, and
// the fixed lines, including a bulletin line for each hour.
export function allLines(anchor) {
  const out = [FIXED.news, FIXED.headlines, FIXED.breaking, FIXED.live, ...Array.from({ length: 24 }, (_, h) => FIXED.bulletin(h))];
  for (const it of Object.values(TV_INTROS)) out.push(camFor(anchor, it), it.vo, it.out);
  return [...new Set(out)];
}

// Everything the anchors say on the channel right now (English channel only).
// playlist: [{ id, src, editorPick }]; input: the live input on air; breaking: the editor's lines.
export async function anchorLines({ playlist, input, breaking, force, voiced = new Set(), now = Date.now() }) {
  const duty = onDuty(now), h = istHour(now);
  const intros = {};
  for (const v of playlist) {
    const it = TV_INTROS[String(v.src || "").split("?")[0]];
    if (!it) continue;
    const who = v.editorPick && READY.includes("ilmaz") ? "ilmaz" : duty;
    // His own picks are written in the first person; another anchor introduces them as his pick.
    const [cam, vo, out] = await Promise.all([line(who, camFor(who, it)), line(who, it.vo), line(who, it.out)]);
    if (cam && vo && out) intros[v.id] = { anchor: who, pick: Boolean(v.editorPick), cam, vo, out };
  }
  const brk = force?.breaking ? (force.text || breaking[0] || "") : (breaking[0] || "");
  // The breaking story and the live caption: read in full once recorded (live reads), otherwise
  // the fixed line. Either way the words are on screen.
  const read = async (text, fixed, show) => {
    const l = await line(duty, text);
    return voiced.has(l.id) ? { ...l, audio: `/api/tv/voice/${l.id}`, show } : { ...await line(duty, fixed), show };
  };
  const [news, bulletin, headlines, breakingLine, live] = await Promise.all([
    line(duty, FIXED.news), line(duty, FIXED.bulletin(h)), line(duty, FIXED.headlines),
    brk ? read(READ.breaking(brk), FIXED.breaking, end(clip(brk, 220))) : null,
    input ? read(READ.live(input.title), FIXED.live, clip(input.title, 120)) : null
  ]);
  return {
    duty, roster: Object.fromEntries(Object.entries(ANCHORS).map(([k, a]) => [k, { name: a.name, role: a.role }])),
    intros, lines: { news, bulletin, headlines, breaking: breakingLine, live }
  };
}
