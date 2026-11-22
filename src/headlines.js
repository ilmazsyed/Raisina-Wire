// The Headlines desk (headlines.html): HEADLINES on air at :58 and :28 (the times can be changed),
// straight into the bulletin at :00 and :30. A five-second stinger with the programme's own
// signature music, then ten to twelve headlines of ten seconds each (longer when the newsreader
// needs it), each read in the bulletin's voices, the woman and the man taking turns.
//   - The headlines are made from the wire by priority (src/labels.js bulletinRank: West Bengal
//     politics first), the stories of the last two hours first, then the newest of the day.
//   - The desk can rewrite any of them, drop one, attach a picture or a video to it, and add its
//     own: for every HEADLINES or only at the times it chooses, for as many airings as it sets.
//   - Every HEADLINES the broadcast output airs is recorded with the bulletins and segments (the
//     Segment & bulletin desk, src/progs.js), and each airing counts against a headline's repeats.
// Kept in settings under `headlines_desk`; the screens get it with the channel's state
// (src/tvchannel.js tvState → heads) and play it (src/engine.js, kind "heads").
import { noDots } from "./sentences.js";
import { synthesize, sha256, ttsEnabled } from "./tts.js";
import { tvVoice, voiceRate, voiceBudget, chargeVoice } from "./bulletinvoice.js";

const KEY = "headlines_desk";
export const HEADS_DEFAULT = { on: true, mins: [58, 28], count: 12, secs: 10, items: [], hidden: [], edits: {} };
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const int = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const mediaUrl = v => { const s = clean(v, 600); return /^(https:\/\/|\/media\/|\/clips\/|\/api\/)/.test(s) ? s : ""; };
const hhmm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : null;

let memo = null;
export async function headsSettings(env) {
  if (memo && Date.now() - memo.at < 5000) return memo.v;
  let v = {};
  try { v = JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(KEY).first())?.value || "{}"); } catch { /* the defaults */ }
  v = { ...structuredClone(HEADS_DEFAULT), ...v };
  memo = { at: Date.now(), v };
  return v;
}
async function putHeads(env, v) {
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(KEY, JSON.stringify(v)).run();
  memo = null;
}

// What is read: the headline, as one sentence.
const lineOf = text => { const t = noDots(String(text || "")).replace(/\s+/g, " ").trim(); return /[।!?]$/.test(t) ? t : `${t}।`; };
const sexAt = i => (i % 2 ? "m" : "f");
const keyOf = async (env, text, sex) => (await sha256(`${tvVoice(env, sex)}|hl1|${voiceRate(env)}|${lineOf(text)}`)).slice(0, 40);

// The headlines as the desk and the screens see them. `pool`: the bulletin's stories (the last two
// hours, in the bulletin order), then `more`: the newest of the day; both with id, title, category,
// image. Returns { auto: every automatic headline, with the desk's changes; items: what goes on air }.
export function buildHeads(cfg, pool, more = []) {
  const seen = new Set(), auto = [];
  for (const r of [...pool, ...more]) {
    if (!r?.id || seen.has(r.id)) continue; seen.add(r.id);
    const e = cfg.edits?.[r.id] || {};
    auto.push({ id: r.id, auto: true, text: clean(e.text || noDots(r.title), 160), orig: noDots(r.title), desk: r.category || r.desk || "", image: e.noimg ? "" : e.image || r.image || "", wireImage: r.image || "", video: e.video || "", edited: !!(e.text || e.image || e.video || e.noimg), hidden: (cfg.hidden || []).includes(r.id) });
    if (auto.length >= 30) break;
  }
  const own = (cfg.items || []).filter(x => x.text && (!x.repeat || (x.aired || 0) < x.repeat))
    .map(x => ({ id: x.id, auto: false, text: x.text, desk: x.desk || "", image: x.image || "", video: x.video || "", when: x.when?.length ? x.when : null, top: !!x.top, repeat: x.repeat || 0, aired: x.aired || 0 }));
  // (the desk's own headlines first, those marked "top" before the rest; then the wire's)
  own.sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0));
  let all = [...own, ...auto.filter(a => !a.hidden)];
  // The desk's order: the headlines it placed keep their places, new ones from the wire come after
  // them (none at all while the list is locked). BREAKING headlines always lead.
  const order = (cfg.order || []).filter(id => all.some(x => x.id === id));
  if (order.length) { const placed = order.map(id => all.find(x => x.id === id)); all = cfg.lock ? placed : [...placed, ...all.filter(x => !order.includes(x.id))]; }
  const brk = new Set(cfg.brk || []), hold = cfg.secsOf || {};
  all = [...all.filter(x => brk.has(x.id)), ...all.filter(x => !brk.has(x.id))].map(x => ({ ...x, brk: brk.has(x.id), hold: Number(hold[x.id]) || 0 }));
  return { auto, items: all.slice(0, 30) };
}

// The newsreader's line for each headline, when it is ready: id → { voice, secs }.
export async function headVoices(env, items) {
  if (!ttsEnabled(env) || !items.length) return new Map();
  const want = await Promise.all(items.map((x, i) => keyOf(env, x.text, sexAt(i)))), alt = await Promise.all(items.map((x, i) => keyOf(env, x.text, sexAt(i + 1))));
  const all = [...want, ...alt];
  const have = new Map((await env.DB.prepare(`SELECT key, length(data) AS n FROM tts_audio WHERE key IN (${all.map(() => "?").join(",")})`).bind(...all).all().catch(() => ({ results: [] }))).results.map(r => [r.key, r.n]));
  return new Map(items.map((x, i) => { const k = have.has(want[i]) ? want[i] : have.has(alt[i]) ? alt[i] : ""; return [x.id, k ? { voice: `/api/tv/voice/${k}.mp3`, secs: Math.round(have.get(k) / 4000 * 10) / 10 } : null]; }));
}
// The minute cron: lines for the headlines that have none yet, a few at a time.
export async function prepareHeadVoices(env, items, n = 6) {
  if (!ttsEnabled(env) || !items?.length || (await voiceBudget(env)) < 2000) return { done: 0 };
  const list = items.slice(0, 16);
  const ks = await Promise.all(list.map(async (x, i) => ({ x, i, want: await keyOf(env, x.text, sexAt(i)), alt: await keyOf(env, x.text, sexAt(i + 1)) })));
  const all = ks.flatMap(k => [k.want, k.alt]);
  const have = new Set((await env.DB.prepare(`SELECT key FROM tts_audio WHERE key IN (${all.map(() => "?").join(",")})`).bind(...all).all()).results.map(r => r.key));
  let done = 0, chars = 0;
  for (const k of ks) {
    if (have.has(k.want) || have.has(k.alt) || done >= n) continue;
    const line = lineOf(k.x.text), sex = sexAt(k.i);
    const audio = await synthesize(env, line, tvVoice(env, sex), "bn-IN", voiceRate(env));
    await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(k.want, tvVoice(env, sex), line.length, audio.buffer).run();
    done++; chars += line.length;
  }
  if (chars) await chargeVoice(env, chars);
  return { done, chars };
}

// Each HEADLINES the broadcast output airs (src/progs.js progPlayed): the desk's headlines in it
// count one airing more (counted once, from the horizontal channel).
export async function headsAired(env, b) {
  if (b.ch !== "h") return;
  const ids = new Set((b.items || []).filter(x => x && x.auto === false).map(x => String(x.id)));
  if (!ids.size) return;
  const cfg = await headsSettings(env);
  let changed = false;
  for (const x of cfg.items || []) if (ids.has(x.id)) { x.aired = (x.aired || 0) + 1; changed = true; }
  if (changed) await putHeads(env, cfg);
}

const ids = (v, n) => [...new Set((Array.isArray(v) ? v : []).map(x => clean(x, 60)).filter(Boolean))].slice(0, n);
// The desk's "record again": a headline's line made afresh now (after its words were changed).
export async function headVoiceAgain(env, text) {
  if (!ttsEnabled(env)) throw new Error("The newsreader's voice is not set up.");
  const t = clean(text, 160); if (!t) throw new Error("Nothing to read.");
  const kf = await keyOf(env, t, "f"), km = await keyOf(env, t, "m");
  await env.DB.prepare("DELETE FROM tts_audio WHERE key IN (?,?)").bind(kf, km).run();
  const line = lineOf(t), audio = await synthesize(env, line, tvVoice(env, "f"), "bn-IN", voiceRate(env));
  await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(kf, tvVoice(env, "f"), line.length, audio.buffer).run();
  await chargeVoice(env, line.length);
  return { ok: true, voice: `/api/tv/voice/${kf}.mp3` };
}
// /api/admin/heads: GET the desk (settings, the automatic headlines, the desk's own); PUT saves it.
export async function handleHeads(request, env, user, { json, err, audit, state }) {
  if (request.method === "GET") {
    const cfg = await headsSettings(env), s = await state();
    return json({ settings: { on: cfg.on, mins: cfg.mins, count: cfg.count, secs: cfg.secs }, items: cfg.items, edits: cfg.edits || {}, hidden: cfg.hidden || [], order: cfg.order || [], lock: !!cfg.lock, brk: cfg.brk || [], secsOf: cfg.secsOf || {}, runs: cfg.runs || {},
      auto: s?.heads?.auto || [], onAir: s?.heads?.items || [], pool: (s?.avo || []).map(x => ({ id: x.id, title: x.title, desk: x.desk, image: x.images?.[0]?.src || "" })).slice(0, 40) }, 200, { "cache-control": "no-store" });
  }
  if (request.method === "PUT") {
    const b = await request.json().catch(() => ({})), cfg = await headsSettings(env);
    const old = new Map((cfg.items || []).map(x => [x.id, x]));
    const mins = [...new Set((Array.isArray(b.mins) ? b.mins : cfg.mins).map(v => int(v, 0, 59, -1)).filter(v => v >= 0))].slice(0, 4);
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 40).map(x => {
      const id = /^[\w-]{6,40}$/.test(String(x?.id || "")) ? String(x.id) : crypto.randomUUID();
      return { id, ref: clean(x?.ref, 80), text: clean(x?.text, 160), desk: clean(x?.desk, 40), image: mediaUrl(x?.image), video: mediaUrl(x?.video),
        when: (Array.isArray(x?.when) ? x.when : []).map(hhmm).filter(Boolean).slice(0, 48), top: !!x?.top,
        repeat: int(x?.repeat, 0, 999, 0), aired: x?.resetCount ? 0 : old.get(id)?.aired || 0, at: old.get(id)?.at || new Date().toISOString(), by: old.get(id)?.by || user.id };
    }).filter((x, i, all) => x.text && all.findIndex(y => y.id === x.id) === i);
    const edits = {};
    for (const [id, e] of Object.entries(b.edits && typeof b.edits === "object" ? b.edits : {}).slice(0, 200)) {
      const v = { text: clean(e?.text, 160), image: mediaUrl(e?.image), video: mediaUrl(e?.video), noimg: !!e?.noimg && !mediaUrl(e?.image) };
      if (v.text || v.image || v.video || v.noimg) edits[clean(id, 60)] = v;
    }
    const next = { on: b.on === undefined ? cfg.on : !!b.on, mins: mins.length ? mins : HEADS_DEFAULT.mins, count: int(b.count, 6, 15, cfg.count), secs: int(b.secs, 6, 20, cfg.secs),
      items, hidden: (Array.isArray(b.hidden) ? b.hidden : []).map(v => clean(v, 60)).filter(Boolean).slice(0, 200), edits,
      // the on-air order, its lock, the BREAKING headlines, seconds per headline, and runs planned one by one
      order: ids(b.order, 60), lock: !!b.lock, brk: ids(b.brk, 20),
      secsOf: Object.fromEntries(Object.entries(b.secsOf && typeof b.secsOf === "object" ? b.secsOf : {}).slice(0, 80).map(([k, v]) => [clean(k, 60), int(v, 6, 30, 0)]).filter(([k, v]) => k && v)),
      runs: Object.fromEntries(Object.entries(b.runs && typeof b.runs === "object" ? b.runs : {}).filter(([k]) => hhmm(k)).slice(0, 48).map(([k, v]) => [k, ids(v, 15)]).filter(([, v]) => v.length)) };
    await putHeads(env, next);
    await audit("heads.update", "settings", KEY, { items: items.length });
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }
  return err("Not found.", 404);
}
