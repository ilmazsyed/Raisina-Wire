// Raisina TV's AI anchors (live channel only; never inside the explainer videos).
// Four fictional AI anchors take the desk in turn, changing on the hour (India time); Ilmaz Syed,
// the editor, introduces explainers made from his own stories ("Editor's Pick"). Every anchor is
// labelled AI on screen. Their faces are short photoreal loops made offline from a portrait
// (anchors/README.md); their voices are Google Cloud Text-to-Speech (Chirp 3 HD, Indian English),
// one voice each, generated once per line and kept in D1 like "Listen" (src/tts.js).
//
// The lines are written here, on the server, and the player asks for each by its id, so the
// voice endpoint only ever reads what the channel itself put on air.
import { TV_INTROS } from "./tv-intros.js";
import { sha256, synthesize, ttsEnabled } from "./tts.js";

export const ANCHORS = {
  tara:   { name: "Tara",       role: "AI Live Anchor", voice: "en-IN-Chirp3-HD-Despina", fallback: "en-IN-Neural2-A" },
  kabir:  { name: "Kabir",      role: "AI Live Anchor", voice: "en-IN-Chirp3-HD-Charon",  fallback: "en-IN-Neural2-B" },
  bharti: { name: "Bharti",     role: "AI Live Anchor", voice: "en-IN-Chirp3-HD-Kore",    fallback: "en-IN-Neural2-D" },
  vikram: { name: "Vikram",     role: "AI Live Anchor", voice: "en-IN-Chirp3-HD-Iapetus", fallback: "en-IN-Neural2-C" },
  ilmaz:  { name: "Ilmaz Syed", role: "Editor",         voice: "en-IN-Chirp3-HD-Orus",    fallback: "en-IN-Neural2-C" }
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

async function line(anchor, text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t ? { id: await sha256(`${ANCHORS[anchor].voice}|${t}`), anchor, text: t } : null;
}

// Everything the anchors say on the channel right now (English channel only).
// playlist: [{ id, src, editorPick }]; input: the live input on air; breaking: the editor's lines.
export async function anchorLines({ playlist, input, breaking, force, now = Date.now() }) {
  const duty = onDuty(now), h = istHour(now);
  const intros = {};
  for (const v of playlist) {
    const it = TV_INTROS[String(v.src || "").split("?")[0]];
    if (!it) continue;
    const who = v.editorPick && READY.includes("ilmaz") ? "ilmaz" : duty;
    // His own picks are written in the first person; another anchor introduces them as his pick.
    const camText = who === "ilmaz" ? it.cam : it.cam.replace(/^My pick today\.\s*/, "Today's Editor's Pick. ");
    const [cam, vo, out] = await Promise.all([line(who, camText), line(who, it.vo), line(who, it.out)]);
    if (cam && vo && out) intros[v.id] = { anchor: who, pick: Boolean(v.editorPick), cam, vo, out };
  }
  const brk = force?.breaking ? (force.text || breaking[0] || "") : (breaking[0] || "");
  const [news, bulletin, headlines, breakingLine, live] = await Promise.all([
    line(duty, "Time now for a quick news update from the Raisina Wire desk."),
    line(duty, `It's ${hourWords(h)}. Here are the headlines on Raisina TV.`),
    line(duty, "Here are the breaking headlines at this hour."),
    brk ? line(duty, `Breaking news. ${end(clip(brk, 220))}`) : null,
    input ? line(duty, `We're bringing you live visuals of ${end(clip(input.title, 120))}`) : null
  ]);
  return {
    duty, roster: Object.fromEntries(Object.entries(ANCHORS).map(([k, a]) => [k, { name: a.name, role: a.role }])),
    intros, lines: { news, bulletin, headlines, breaking: breakingLine, live }
  };
}

// GET /api/tv/voice/<id>.mp3: one anchor line's audio. Served from D1 once made; otherwise only a
// line the channel has on air now (currentLines) is voiced, so the endpoint can't read anything else.
export async function anchorVoice(env, id, currentLines) {
  if (!/^[0-9a-f]{64}$/.test(id)) return null;
  const hit = await env.DB.prepare("SELECT data FROM tts_audio WHERE key=?").bind(id).first();
  if (hit) return new Uint8Array(hit.data);
  if (!ttsEnabled(env)) return null;
  const a = await currentLines();
  const all = [...Object.values(a?.intros || {}).flatMap(i => [i.cam, i.vo, i.out]), ...Object.values(a?.lines || {})].filter(Boolean);
  const l = all.find(x => x.id === id);
  if (!l) return null;
  const who = ANCHORS[l.anchor];
  let audio;
  try { audio = await synthesize(env, l.text, who.voice, "en-IN"); }
  catch { audio = await synthesize(env, l.text, who.fallback, "en-IN"); }
  await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(id, who.voice, l.text.length, audio.buffer).run();
  return audio;
}
