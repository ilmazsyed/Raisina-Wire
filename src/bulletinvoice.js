// The bulletin read aloud: modern Indian Bengali newsreaders (Google Cloud Text-to-Speech,
// Chirp 3 HD, bn-IN), a woman and a man taking the stories in turn, at a brisk news pace. Each
// story's headline and first sentence are read while it is on screen. Each line is made once by
// the minute cron, kept in D1 (tts_audio, shared with "Listen") and served from
// /api/tv/voice/<key>.mp3. Needs the GOOGLE_TTS_API_KEY secret; without it the bulletin stays
// music only. The month's characters are capped well inside Google's free allowance (1 million a
// month for these voices), counting "Listen" too. TV_VOICE_FEMALE, TV_VOICE_MALE and TV_VOICE_RATE
// change the voices and the pace.
import { synthesize, sha256, ttsEnabled } from "./tts.js";

const VOICE = { f: "bn-IN-Chirp3-HD-Despina", m: "bn-IN-Chirp3-HD-Sadachbia" };   // smooth; lively
export const tvVoice = (env, sex = "f") => (sex === "m" ? env.TV_VOICE_MALE : env.TV_VOICE_FEMALE) || VOICE[sex];
const rate = env => Math.min(1.4, Math.max(0.9, Number(env.TV_VOICE_RATE) || 1.22));
// Shared by the bulletin and the AVO engine (src/avo.js), inside Google's free million a month.
const MONTH_CAP = 950000;
const monthKey = () => `tts_chars_${new Date().toISOString().slice(0, 7)}`;
export const voiceRate = env => rate(env);
export async function voiceBudget(env) { const used = Number((await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(monthKey()).first().catch(() => null))?.value || 0); return MONTH_CAP - used; }
export async function chargeVoice(env, chars) { await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+? AS TEXT)").bind(monthKey(), String(chars), chars).run(); }
// Stories take turns: a woman's voice, then a man's (see prepareBulletinVoices).
const sexAt = i => (i % 2 ? "m" : "f");

// What is read: the story's text (not its headline), up to its first three sentences but no
// more than about 190 characters (whole sentences; about 11 seconds), so a two-minute bulletin
// carries six or seven stories and a 65-second one three or four; with its punctuation made clear for the reader: every sentence ends in a
// দাঁড়ি (or ? !), line breaks become sentence ends, and spaces follow commas and stops.
export function readLine(item) {
  let t = String(item.text || "").replace(/…$/, "").replace(/\s*\n+\s*/g, "। ").replace(/\s+/g, " ").trim();
  t = t.replace(/\s*([,;:।!?])\s*/g, "$1 ").replace(/([।!?])\s*([।!?])+/g, "$1").replace(/\.(\s|$)/g, "।$1").trim();
  const sentences = t.split(/(?<=[।!?])\s+/).map(x => x.trim()).filter(Boolean);
  let line = "";
  for (const x of sentences.slice(0, 3)) { const next = line ? `${line} ${x}` : x; if (line && next.length > 190) break; line = next; }
  if (!line) line = String(item.title || "").trim();
  if (line.length > 220) line = line.slice(0, 220).replace(/[\s,]+\S*$/, "");
  if (!/[।!?]$/.test(line)) line += "।";
  return line;
}
export const voiceKey = async (env, item, sex = "f") => (await sha256(`${tvVoice(env, sex)}|tv2|${rate(env)}|${readLine(item)}`)).slice(0, 40);

// The minute cron: lines for the bulletin's stories that have none yet, a few at a time.
export async function prepareBulletinVoices(env, stories, n = 4) {
  if (!ttsEnabled(env) || !stories?.length) return { done: 0 };
  const used = Number((await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(monthKey()).first().catch(() => null))?.value || 0);
  if (used > MONTH_CAP) return { done: 0, capped: used };
  // Each story is read once, in one voice: a story already read keeps its voice; a new one takes
  // the voice opposite the story before it, so the voices keep alternating.
  const items = await Promise.all(stories.map(async s => ({ line: readLine(s), f: await voiceKey(env, s, "f"), m: await voiceKey(env, s, "m") })));
  const keys = items.flatMap(x => [x.f, x.m]);
  const have = new Set((await env.DB.prepare(`SELECT key FROM tts_audio WHERE key IN (${keys.map(() => "?").join(",")})`).bind(...keys).all()).results.map(r => r.key));
  let done = 0, chars = 0, prev = null;
  for (const [i, it] of items.entries()) {
    const got = have.has(it.f) ? "f" : have.has(it.m) ? "m" : null;
    if (got) { prev = got; continue; }
    const sex = prev ? (prev === "f" ? "m" : "f") : sexAt(i);
    prev = sex;
    if (done >= n) continue;
    const audio = await synthesize(env, it.line, tvVoice(env, sex), "bn-IN", rate(env));
    await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(it[sex], tvVoice(env, sex), it.line.length, audio.buffer).run();
    done++; chars += it.line.length;
  }
  if (chars) await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+? AS TEXT)").bind(monthKey(), String(chars), chars).run();
  return { done, chars };
}
// Which of the bulletin's stories have their line ready, in the voice their place in the
// bulletin calls for (or, while that is being made, the other one), and how long it lasts (the
// MP3s are 32 kbit/s, 4,000 bytes a second): story → { key, secs }.
export async function readyVoices(env, stories) {
  if (!ttsEnabled(env) || !stories.length) return new Map();
  const want = await Promise.all(stories.map((s, i) => voiceKey(env, s, sexAt(i))));
  const alt = await Promise.all(stories.map((s, i) => voiceKey(env, s, sexAt(i + 1))));
  const all = [...want, ...alt];
  const have = new Map((await env.DB.prepare(`SELECT key, length(data) AS n FROM tts_audio WHERE key IN (${all.map(() => "?").join(",")})`).bind(...all).all().catch(() => ({ results: [] }))).results.map(r => [r.key, r.n]));
  return new Map(stories.map((s, i) => { const k = have.has(want[i]) ? want[i] : have.has(alt[i]) ? alt[i] : ""; return [s, k ? { key: k, secs: Math.round(have.get(k) / 4000 * 10) / 10 } : null]; }));
}
// GET /api/tv/voice/<key>.mp3
export async function voiceRoute(env, key) {
  const row = await env.DB.prepare("SELECT data FROM tts_audio WHERE key=?").bind(key).first().catch(() => null);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=31536000, immutable" } });
}

// The voice-over links between segments ("আপনি দেখছেন রাষ্ট্রিক্স…"): fixed lines, recorded once in
// the newsreader's voice and kept (a few hundred characters in all), played over each segment's
// title card and the weather and market updates (src/engine.js).
export const LINKS = {
  "seg:kolkata10": "আপনি দেখছেন রাষ্ট্রিক্স টোয়েন্টি ফোর সেভেন। এবার কলকাতা দশ, শহর ও রাজ্যের দশ খবর।",
  "seg:city": "শহরের খবরে এবার আবহাওয়া আর যাতায়াতের হালহকিকত।",
  "seg:bangladesh": "এবার চোখ রাখা যাক পড়শি দেশ বাংলাদেশে।",
  "seg:world": "এক মিনিটে দেখে নিন দুনিয়ার বড় খবর।",
  "seg:numbers": "সংখ্যায় আজ। দিনের খবর, অঙ্কের হিসেবে।",
  "seg:sports": "আপনি দেখছেন রাষ্ট্রিক্স টোয়েন্টি ফোর সেভেন। এবার খেলার খবর।",
  "seg:onthisday": "আজকের দিনে, ইতিহাসের পাতা থেকে।",
  "seg:soth": "এই ঘণ্টার সবচেয়ে বড় খবর, বিস্তারিত।",
  weather: "এবার আবহাওয়ার খবর।",
  market: "এক নজরে বাজারের হাল।"
};
const linkKey = async (env, id) => (await sha256(`${tvVoice(env, "f")}|link|${rate(env)}|${LINKS[id]}`)).slice(0, 40);
export async function prepareLinks(env) {
  if (!ttsEnabled(env)) return { done: 0 };
  const ids = Object.keys(LINKS), keys = await Promise.all(ids.map(id => linkKey(env, id)));
  const have = new Set((await env.DB.prepare(`SELECT key FROM tts_audio WHERE key IN (${keys.map(() => "?").join(",")})`).bind(...keys).all()).results.map(r => r.key));
  let done = 0, chars = 0;
  for (const [i, id] of ids.entries()) {
    if (have.has(keys[i]) || done >= 4) continue;
    const audio = await synthesize(env, LINKS[id], tvVoice(env, "f"), "bn-IN", rate(env));
    await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(keys[i], tvVoice(env, "f"), LINKS[id].length, audio.buffer).run();
    done++; chars += LINKS[id].length;
  }
  if (chars) await chargeVoice(env, chars);
  return { done, chars };
}
// The links that are ready: id → the recording's address.
export async function readyLinks(env) {
  const ids = Object.keys(LINKS), keys = await Promise.all(ids.map(id => linkKey(env, id)));
  const have = new Set((await env.DB.prepare(`SELECT key FROM tts_audio WHERE key IN (${keys.map(() => "?").join(",")})`).bind(...keys).all().catch(() => ({ results: [] }))).results.map(r => r.key));
  return Object.fromEntries(ids.map((id, i) => [id, have.has(keys[i]) ? `/api/tv/voice/${keys[i]}.mp3` : ""]).filter(([, u]) => u));
}
