// The Explainer desk's server side (explainer.html, src/xpldesk.js; the film is drawn by src/xpl.js).
//   POST   /api/admin/explainers                {text, links[], storyId, style, minutes, title, media[]}: the shot list is written
//   GET    /api/admin/explainers                the list
//   GET    /api/admin/explainers/<id>           one explainer
//   PUT    /api/admin/explainers/<id>           edits (title, kicker, style, shots, voice mode, voice, keep)
//   POST   /api/admin/explainers/<id>/voice     every line without a voice is read by the newsreader
//   POST   /api/admin/explainers/<id>/rec/<n>   a line recorded on the desk (the audio is the body)
//   POST   /api/admin/explainers/<id>/play      {channels}: on air now, then back to autopilot
//   POST   /api/admin/explainers/<id>/rotation  {on, hours}: in rotation (airs on its own) or out
//   DELETE /api/admin/explainers/<id>
//   GET    /api/tv/explainer/<id>               what the screens draw
// The shot list is written by the free Gemini models from the source alone (no facts added), in
// the house style; nothing is voiced or aired before an editor has read it on the desk.
import { geminiJSON, BENGALI_STYLE, wireReady } from "./wiredesk.js";
import { sourceText } from "./feeds.js";
import { synthesize, sha256, ttsEnabled } from "./tts.js";
import { tvVoice, voiceRate, voiceBudget, chargeVoice } from "./bulletinvoice.js";
import { noDots } from "./sentences.js";

const TYPES = ["kinetic", "number", "versus", "bars", "timeline", "list", "quote", "doc", "map", "photo", "video", "byte"];
const STYLES = ["politics", "crime", "govt", "soft"];
const KICKER = { politics: "রাজনীতি", crime: "অপরাধ", govt: "সরকারি রিপোর্ট", soft: "ভালো খবর" };
const INTRO = 2.6, OUTRO = 3.2, GAP = 0.3;
const clean = (v, n = 400) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const num = v => { const n = Number(String(v ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
const j = (v, d) => { try { return JSON.parse(v || d); } catch { return JSON.parse(d); } };
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// One shot, as the desk or the model gives it, made safe.
export function cleanShot(s) {
  s = s && typeof s === "object" ? s : {};
  const t = TYPES.includes(s.t) ? s.t : "kinetic";
  const o = { t, say: noDots(clean(s.say, 400)) };
  if (s.text) o.text = clean(s.text, 300);
  if (Array.isArray(s.hl)) o.hl = s.hl.map(x => clean(x, 60)).filter(Boolean).slice(0, 4);
  if (t === "number") { o.value = num(s.value); o.prefix = clean(s.prefix, 12); o.suffix = clean(s.suffix, 24); o.label = clean(s.label, 160); }
  if (t === "versus") for (const k of ["a", "b"]) o[k] = { value: num(s[k]?.value), label: clean(s[k]?.label, 120), prefix: clean(s[k]?.prefix, 12), suffix: clean(s[k]?.suffix, 24) };
  if (["bars", "timeline", "list"].includes(t)) o.items = (Array.isArray(s.items) ? s.items : []).slice(0, 6).map(i => typeof i === "string" ? (t === "list" ? clean(i, 160) : { label: clean(i, 80), what: clean(i, 160) })
    : t === "list" ? clean(i?.text || i?.label || i?.what, 160) : t === "bars" ? { label: clean(i?.label, 80), value: num(i?.value), suffix: clean(i?.suffix, 16), prefix: clean(i?.prefix, 8) } : { when: clean(i?.when, 40), what: clean(i?.what || i?.label, 160) }).filter(Boolean);
  if (t === "quote") o.who = clean(s.who, 120);
  if (t === "doc") o.source = clean(s.source, 120);
  if (t === "map") o.places = (Array.isArray(s.places) ? s.places : []).slice(0, 6).map(p => ({ name: clean(p?.name, 40), lat: num(p?.lat), lon: num(p?.lon) })).filter(p => p.name && (p.lat || p.lon));
  if (["photo", "video", "byte"].includes(t)) { o.media = clean(s.media, 1500); if (s.credit) o.credit = clean(s.credit, 120); }
  if (t === "byte") { o.name = clean(s.name, 80); o.role = clean(s.role, 120); o.secs = Math.max(3, Math.min(600, Math.round(num(s.secs) || 20))); }
  if (s.voice?.url && /^\/(api\/tv\/voice|clips)\//.test(s.voice.url)) o.voice = { url: s.voice.url, secs: Math.max(.5, Math.min(60, num(s.voice.secs))), rec: !!s.voice.rec };
  return o;
}
const total = shots => INTRO + OUTRO + shots.reduce((n, s) => n + (s.t === "byte" ? (s.secs || 20) + .8 : s.voice?.secs ? s.voice.secs + GAP : Math.max(2.4, (s.say || "").length / 13 + GAP)), 0);
const row = (r, full = true) => ({ id: r.id, title: r.title, kicker: r.kicker, style: r.style, status: r.status, voiceMode: r.voice_mode, sex: r.sex, minutes: r.minutes, secs: r.secs, keep: !!r.keep, rotationUntil: r.rotation_until || "", inRotation: !!r.rotation_until && Date.parse(r.rotation_until) > Date.now() && r.status === "voiced", aired: r.aired, lastAired: r.last_aired, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  ...(full ? { shots: j(r.shots, "[]"), media: j(r.media, "[]"), source: j(r.source, "{}") } : { shotCount: j(r.shots, "[]").length }) });

/* ---------- writing the shot list ---------- */
const STYLE_NOTE = {
  politics: "Hard politics: brisk and punchy. Use versus, numbers, timelines, maps, quotes of named politicians, big words with highlights.",
  crime: "Crime: sober and careful, like a case file. A timeline of events, the place on a map, the police or court document, numbers (arrests, sections). Always say 'অভিযুক্ত' (accused) or 'অভিযোগ' (alleged) unless a court has convicted; never call anyone guilty; never name a minor or a victim of a sexual offence; no gore. If the source gives no police or court basis for an allegation, set unusable with the reason.",
  govt: "An official government report: clear and exact. Lead with the report's key finding; documents with the key phrase highlighted, numbers, bar charts and timelines from the report's own figures; name the report and who published it.",
  soft: "A good or soft story: warm and human. Lead with the people; photos, a few numbers, a gentle list; end on a hopeful line. Never sentimental or exaggerated."
};
const SHOT_SCHEMA = { type: "OBJECT", properties: {
  t: { type: "STRING", enum: TYPES }, say: { type: "STRING" }, text: { type: "STRING" }, hl: { type: "ARRAY", items: { type: "STRING" } },
  value: { type: "NUMBER" }, prefix: { type: "STRING" }, suffix: { type: "STRING" }, label: { type: "STRING" },
  a: { type: "OBJECT", properties: { value: { type: "NUMBER" }, label: { type: "STRING" }, suffix: { type: "STRING" } } },
  b: { type: "OBJECT", properties: { value: { type: "NUMBER" }, label: { type: "STRING" }, suffix: { type: "STRING" } } },
  items: { type: "ARRAY", items: { type: "OBJECT", properties: { label: { type: "STRING" }, value: { type: "NUMBER" }, suffix: { type: "STRING" }, when: { type: "STRING" }, what: { type: "STRING" }, text: { type: "STRING" } } } },
  who: { type: "STRING" }, source: { type: "STRING" },
  places: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, lat: { type: "NUMBER" }, lon: { type: "NUMBER" } } } },
  media: { type: "NUMBER" }
}, required: ["t", "say"] };
const SCHEMA = { type: "OBJECT", properties: { title: { type: "STRING" }, kicker: { type: "STRING" }, shots: { type: "ARRAY", items: SHOT_SCHEMA }, unusable: { type: "BOOLEAN" }, reason: { type: "STRING" } }, required: ["title", "shots"] };
const SYSTEM = `You are the senior explainer producer of Rashtrix 24×7 News, a Bengali news channel in Kolkata. You turn a news report into the shot list of a Vox-style video explainer, read by one Bengali newsreader.
Rules, in order:
1. Facts only from the source. Never add a fact, number, name, date, place or quote it does not contain. Numbers on screen must be exactly the source's.
2. Never name other news outlets. Attribute claims to the people or bodies who made them.
3. Neutral, factual, fair. No opinion, no clickbait, no exclamation marks.
4. Each shot is ONE short sentence of narration ("say"), 6 to 18 words, in Bengali in the house style below. The narration runs as one story from shot to shot: a hook first (why this matters now), then the background, the key facts and numbers, what people say, what happens next. The last shot sums up in one line.
5. Pick the shot type that shows the sentence best, and vary them; never more than two of the same type in a row:
 - kinetic: big words on screen ("text", at most 10 words, may differ from "say"; "|" breaks a line), "hl": 1 or 2 key words from "text" to highlight.
 - number: one figure from the source ("value" as a plain number; "prefix" like "₹", "suffix" like " কোটি" or "%"), "label" in Bengali.
 - versus: two figures or sides ("a" and "b", each with value and label).
 - bars: 2 to 5 comparable figures ("items" with label and value; "text" a short title).
 - timeline: 2 to 5 dated events ("items" with when and what).
 - list: 2 to 5 points ("items" with text; "text" a short title).
 - quote: a named person's words from the source ("text" the quote in Bengali, "who" the person and post).
 - doc: a line from an official document, order or report ("text" the line, "hl" the key phrase in it, "source" the document's name).
 - map: the places involved ("places" with Bengali name and real lat/lon; the first is where it happened).
 - photo / video: one of the pictures or videos listed below ("media" its number), with "text" a short caption.
 - byte: one of the bytes listed below, played in full ("media" its number); its "say" is a one-line lead-in naming who speaks.
6. Use every picture, video and byte listed, each once, where it fits.
7. "title" is the explainer's headline in Bengali (at most 12 words, no full stop); "kicker" two or three Bengali words for its subject.
8. If the source is not news or is too thin for an explainer, set "unusable" true and say why in "reason".

${BENGALI_STYLE}`;

async function sourceFrom(env, b) {
  const parts = [];
  if (b.storyId) {
    const a = await env.DB.prepare("SELECT title, dek, body FROM articles WHERE id=? OR slug=?").bind(String(b.storyId), String(b.storyId)).first().catch(() => null);
    if (a) parts.push(`${a.title}\n${a.dek || ""}\n${a.body || ""}`);
  }
  for (const u of (Array.isArray(b.links) ? b.links : String(b.links || "").split(/\s+/)).map(x => String(x).trim()).filter(x => /^https:\/\//.test(x)).slice(0, 4)) {
    const t = await sourceText(u, { maxChars: 9000 }).catch(() => null); if (t?.text) parts.push(`${t.title || ""}\n${t.text}`);
  }
  if (b.text) parts.push(String(b.text).slice(0, 20000));
  return parts.join("\n\n---\n\n").trim();
}
export async function writeExplainer(env, b, user) {
  if (!wireReady(env)) throw new Error("The Gemini key is not set, so the shot list cannot be written.");
  const style = STYLES.includes(b.style) ? b.style : "politics", minutes = Math.max(1.5, Math.min(2.5, Number(b.minutes) || 2));
  const src = await sourceFrom(env, b);
  if (src.length < 300) throw new Error("Give more to work from: paste the report's text, a link to it, or pick a story (at least a few paragraphs).");
  const media = (Array.isArray(b.media) ? b.media : []).slice(0, 24).map(m => ({ kind: ["image", "video", "byte"].includes(m?.kind) ? m.kind : "image", url: clean(m?.url, 1500), credit: clean(m?.credit, 120), name: clean(m?.name, 80), role: clean(m?.role, 120), secs: Math.round(num(m?.secs)) || 0, note: clean(m?.note, 200) })).filter(m => /^(https:\/\/|\/(clips|media)\/)/.test(m.url));
  const byteSecs = media.filter(m => m.kind === "byte").reduce((n, m) => n + (m.secs || 20) + .8, 0);
  const narr = Math.max(40, minutes * 60 - INTRO - OUTRO - byteSecs), shotsWanted = Math.round(narr / 3.6);
  const list = media.map((m, i) => `${i + 1}. ${m.kind === "byte" ? `byte: ${m.name}${m.role ? `, ${m.role}` : ""}${m.note ? ` (${m.note})` : ""}, ${m.secs || "about 20"} seconds` : `${m.kind}${m.note ? `: ${m.note}` : ""}${m.credit ? ` (${m.credit})` : ""}`}`).join("\n");
  const prompt = `Style: ${STYLE_NOTE[style]}
Length: about ${Math.round(minutes * 60)} seconds in all; write about ${shotsWanted} shots of narration (the newsreader reads about 13 Bengali characters a second; about ${Math.round(narr * 13)} characters of narration in all)${byteSecs ? `, plus the bytes` : ""}.
${title(b)}${media.length ? `Pictures, videos and bytes given by the desk:\n${list}\n` : "No pictures or videos were given: use kinetic, number, versus, bars, timeline, list, quote, doc and map shots.\n"}
Source:
${src.slice(0, 24000)}`;
  const out = await geminiJSON(env, SYSTEM, prompt, SCHEMA, 16384);
  if (out.unusable) throw new Error(`Not made: ${out.reason || "the source is not enough for an explainer"}`);
  const shots = (out.shots || []).map(s => {
    const m = Number.isInteger(s.media) && media[s.media - 1] ? media[s.media - 1] : null;
    const o = { ...s, media: m?.url || "" };
    if (["photo", "video", "byte"].includes(s.t) && !m) o.t = "kinetic";
    if (m && s.t !== "byte" && m.kind === "byte") o.t = "byte";
    if (o.t === "byte" && m) { o.name = m.name; o.role = m.role; o.secs = m.secs || 20; }
    if (m?.credit) o.credit = m.credit;
    if (o.t === "video" && m?.kind === "image") o.t = "photo";
    return cleanShot(o);
  }).filter(s => s.say || s.t === "byte");
  if (shots.length < 6) throw new Error("The shot list came back too short; try again or give a fuller source.");
  const xid = id();
  await env.DB.prepare("INSERT INTO explainers (id,title,kicker,style,minutes,source,media,shots,secs,created_by,sex) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(xid, noDots(clean(out.title, 160)) || clean(b.title, 160), clean(out.kicker, 40) || KICKER[style], style, minutes, JSON.stringify({ storyId: b.storyId || "", links: b.links || [], text: String(b.text || "").slice(0, 4000) }), JSON.stringify(media), JSON.stringify(shots), total(shots), user?.display_name || user?.email || "", b.sex === "m" ? "m" : "f").run();
  return xid;
}
const title = b => b.title ? `The desk's working headline: ${clean(b.title, 160)}\n` : "";

/* ---------- the voice ---------- */
export async function voiceExplainer(env, xid) {
  if (!ttsEnabled(env)) throw new Error("The newsreader's voice is not set up (GOOGLE_TTS_API_KEY). Record the lines on the desk instead.");
  const r = await env.DB.prepare("SELECT * FROM explainers WHERE id=?").bind(xid).first(); if (!r) throw new Error("Not found.");
  const shots = j(r.shots, "[]"), voice = tvVoice(env, r.sex === "m" ? "m" : "f"), rate = voiceRate(env);
  const todo = shots.map((s, i) => [s, i]).filter(([s]) => s.t !== "byte" && s.say && !s.voice?.url);
  const chars = todo.reduce((n, [s]) => n + s.say.length, 0);
  if (chars && (await voiceBudget(env)) < chars) throw new Error("This month's free voice allowance is used up. Record the lines on the desk instead.");
  for (let k = 0; k < todo.length; k += 6) {
    await Promise.all(todo.slice(k, k + 6).map(async ([s]) => {
      const line = /[।!?]$/.test(s.say) ? s.say : `${s.say}।`, key = (await sha256(`${voice}|xpl1|${rate}|${line}`)).slice(0, 40);
      let n = (await env.DB.prepare("SELECT length(data) AS n FROM tts_audio WHERE key=?").bind(key).first().catch(() => null))?.n;
      if (!n) { const audio = await synthesize(env, line, voice, "bn-IN", rate); await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(key, voice, line.length, audio.buffer).run(); n = audio.byteLength; }
      s.voice = { url: `/api/tv/voice/${key}.mp3`, secs: Math.round(n / 4000 * 100) / 100 };   // (32 kbit/s MP3)
    }));
  }
  if (chars) await chargeVoice(env, chars);
  const done = shots.every(s => s.t === "byte" || !s.say || s.voice?.url);
  await env.DB.prepare("UPDATE explainers SET shots=?, secs=?, status=?, updated_at=? WHERE id=?").bind(JSON.stringify(shots), total(shots), done ? "voiced" : "draft", now(), xid).run();
  return row({ ...r, shots: JSON.stringify(shots), secs: total(shots), status: done ? "voiced" : "draft" });
}

export async function handleExplainers(request, env, url, user, { json, err, audit, ctlCommand, CHANNELS }) {
  const [, , , , xid, sub, n] = url.pathname.split("/").map(decodeURIComponent);   // /api/admin/explainers/:id/:sub/:n
  const m = request.method;
  try {
    if (!xid && m === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM explainers ORDER BY created_at DESC LIMIT 200").all();
      return json({ explainers: results.map(r => row(r, false)), voice: ttsEnabled(env), writer: wireReady(env) }, 200, { "cache-control": "no-store" });
    }
    if (!xid && m === "POST") { const b = await request.json().catch(() => ({})); const nid = await writeExplainer(env, b, user); await audit(env, user, "explainer.write", "explainer", nid, { style: b.style }); return json({ ok: true, id: nid }); }
    const r = await env.DB.prepare("SELECT * FROM explainers WHERE id=?").bind(xid).first();
    if (!r) return err("Not found.", 404);
    if (!sub && m === "GET") return json({ explainer: row(r) }, 200, { "cache-control": "no-store" });
    if (!sub && m === "DELETE") { await env.DB.prepare("DELETE FROM explainers WHERE id=?").bind(xid).run(); await audit(env, user, "explainer.delete", "explainer", xid, { title: r.title }); return json({ ok: true }); }
    if (!sub && m === "PUT") {
      const b = await request.json().catch(() => ({})), old = j(r.shots, "[]");
      let shots = Array.isArray(b.shots) ? b.shots.slice(0, 60).map(cleanShot) : old;
      // (a line whose words changed loses its old voice; a newsreader's voice is not kept for a recorded film and back)
      shots = shots.map(s => { const o = old.find(x => x.say === s.say && x.voice?.url); if (s.voice?.url && !o && !s.voice.rec) delete s.voice; return s; });
      const mode = b.voiceMode === "rec" ? "rec" : b.voiceMode === "tts" ? "tts" : r.voice_mode, sex = b.sex === "m" || b.sex === "f" ? b.sex : r.sex;
      if (sex !== r.sex) shots.forEach(s => { if (s.voice && !s.voice.rec) delete s.voice; });
      const done = shots.length && shots.every(s => s.t === "byte" || !s.say || s.voice?.url);
      await env.DB.prepare("UPDATE explainers SET title=?, kicker=?, style=?, shots=?, secs=?, voice_mode=?, sex=?, keep=?, status=?, updated_at=? WHERE id=?")
        .bind(noDots(clean(b.title ?? r.title, 160)), clean(b.kicker ?? r.kicker, 40), STYLES.includes(b.style) ? b.style : r.style, JSON.stringify(shots), total(shots), mode, sex, b.keep === undefined ? r.keep : b.keep ? 1 : 0, done ? "voiced" : "draft", now(), xid).run();
      return json({ ok: true, explainer: row(await env.DB.prepare("SELECT * FROM explainers WHERE id=?").bind(xid).first()) });
    }
    if (sub === "voice" && m === "POST") { const out = await voiceExplainer(env, xid); await audit(env, user, "explainer.voice", "explainer", xid, {}); return json({ ok: true, explainer: out }); }
    // A line recorded on the desk: kept in the clip store, played from there.
    if (sub === "rec" && m === "POST") {
      if (!env.CLIPS) return err("Clip storage is not set up.");
      const i = Number(n), shots = j(r.shots, "[]"); if (!shots[i]) return err("No such line.");
      const type = (request.headers.get("content-type") || "audio/webm").split(";")[0], ext = /mp4|m4a|aac/.test(type) ? "m4a" : /mpeg|mp3/.test(type) ? "mp3" : /ogg/.test(type) ? "ogg" : /wav/.test(type) ? "wav" : "webm";
      const body = await request.arrayBuffer(); if (body.byteLength < 2000) return err("The recording is empty."); if (body.byteLength > 8e6) return err("The recording is too long for one line.");
      const key = `clips/xrec/${xid}/${i}-${Date.now()}.${ext}`;
      await env.CLIPS.put(key, body, { httpMetadata: { contentType: type } });
      shots[i].voice = { url: `/${key}`, secs: Math.max(.5, Math.min(60, Number(request.headers.get("x-secs")) || 3)), rec: true };
      const done = shots.every(s => s.t === "byte" || !s.say || s.voice?.url);
      await env.DB.prepare("UPDATE explainers SET shots=?, secs=?, voice_mode='rec', status=?, updated_at=? WHERE id=?").bind(JSON.stringify(shots), total(shots), done ? "voiced" : "draft", now(), xid).run();
      return json({ ok: true, voice: shots[i].voice });
    }
    // On air now on the channels chosen; then back to autopilot.
    if (sub === "play" && m === "POST") {
      const b = await request.json().catch(() => ({})), chs = (Array.isArray(b.channels) ? b.channels : CHANNELS).filter(c => CHANNELS.includes(c));
      if (!chs.length) return err("Choose a channel.");
      if (r.status !== "voiced") return err("Give every line its voice first (the newsreader, or recorded).");
      const dur = Math.ceil(total(j(r.shots, "[]"))) + 1;
      const scene = { layout: "graphic", sources: [], full: true, graphic: { kind: "explainer", id: xid }, dur, label: r.title };
      for (const ch of chs) await ctlCommand(env, ch, "rundown.load", { rundown: { id: `xpl-now:${xid}:${Date.now()}`, title: `Explainer: ${r.title}`.slice(0, 120), items: [{ id: `xpl-now:${xid}`, type: "explainer", title: r.title, dur, scene }] }, index: 0, auto: true }, user.display_name || user.email, "explainer-now");
      await env.DB.prepare("UPDATE explainers SET aired=aired+1, last_aired=? WHERE id=?").bind(now(), xid).run();
      await audit(env, user, "explainer.play", "explainer", xid, { channels: chs });
      return json({ ok: true, seconds: dur });
    }
    // In rotation: the channels' own running order plays it (src/engine.js), about once every 45
    // minutes on each screen, for the hours chosen (24 by default); or out of rotation.
    if (sub === "rotation" && m === "POST") {
      const b = await request.json().catch(() => ({}));
      if (b.on && r.status !== "voiced") return err("Give every line its voice first (the newsreader, or recorded).");
      const hours = Math.max(1, Math.min(72, Number(b.hours) || 24)), until = b.on ? new Date(Date.now() + hours * 3600e3).toISOString() : null;
      await env.DB.prepare("UPDATE explainers SET rotation_until=?, updated_at=? WHERE id=?").bind(until, now(), xid).run();
      await audit(env, user, b.on ? "explainer.rotation.on" : "explainer.rotation.off", "explainer", xid, { hours });
      return json({ ok: true, rotationUntil: until || "" });
    }
    return err("Not found.", 404);
  } catch (e) { return err(e.message || String(e)); }
}

// GET /api/tv/explainer/<id>: what the screens draw (published once an editor has voiced it).
export async function explainerForScreens(env, xid) {
  const r = await env.DB.prepare("SELECT id, title, kicker, style, shots, secs FROM explainers WHERE id=?").bind(xid).first().catch(() => null);
  if (!r) return null;
  return { id: r.id, title: r.title, kicker: r.kicker, style: r.style, shots: j(r.shots, "[]"), secs: r.secs };
}
// The Content Library and the Producer's picker: the explainers, newest first.
export async function explainerList(env, limit = 100) {
  const { results } = await env.DB.prepare("SELECT * FROM explainers ORDER BY created_at DESC LIMIT ?").bind(limit).all().catch(() => ({ results: [] }));
  return results.map(r => row(r, false));
}

// The explainers in rotation, for the screens (src/tvchannel.js): voiced, and their time not over.
export async function xplForScreens(env) {
  const { results } = await env.DB.prepare("SELECT id, title, style, secs, last_aired FROM explainers WHERE status='voiced' AND rotation_until IS NOT NULL AND rotation_until > ? ORDER BY rotation_until DESC LIMIT 8").bind(now()).all().catch(() => ({ results: [] }));
  return results.map(r => ({ id: r.id, title: r.title, style: r.style, secs: Math.ceil(r.secs || 0) + 1 })).filter(x => x.secs > 20);
}
