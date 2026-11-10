// The bulletin read aloud: modern Indian Bengali newsreaders (Google Cloud Text-to-Speech,
// Chirp 3 HD, bn-IN), a woman and a man taking the stories in turn, at a brisk news pace. Each
// story's headline and first sentence are read while it is on screen. Each line is made once by
// the minute cron, kept in D1 (tts_audio, shared with "Listen") and served from
// /api/tv/voice/<key>.mp3. Needs the GOOGLE_TTS_API_KEY secret; without it the bulletin stays
// music only. The month's characters are capped well inside Google's free allowance (1 million a
// month for these voices), counting "Listen" too. TV_VOICE_FEMALE, TV_VOICE_MALE and TV_VOICE_RATE
// change the voices and the pace.
import { synthesize, sha256, ttsEnabled } from "./tts.js";

const VOICE = { f: "bn-IN-Chirp3-HD-Laomedeia", m: "bn-IN-Chirp3-HD-Puck" };   // upbeat, both
export const tvVoice = (env, sex = "f") => (sex === "m" ? env.TV_VOICE_MALE : env.TV_VOICE_FEMALE) || VOICE[sex];
const rate = env => Math.min(1.4, Math.max(0.9, Number(env.TV_VOICE_RATE) || 1.16));
const MONTH_CAP = 800000;
const monthKey = () => `tts_chars_${new Date().toISOString().slice(0, 7)}`;
// Stories take turns: the first, third, fifth… a woman's voice; the others a man's.
const sexAt = i => (i % 2 ? "m" : "f");

// What is read: the headline, then the story's first sentence, at most about 170 characters.
export function readLine(item) {
  const title = String(item.title || "").trim().replace(/[।.!?]+$/, "");
  const first = String(item.text || "").split(/(?<=[।!?])\s+/)[0]?.trim() || "";
  let line = `${title}। ${first}`.trim();
  if (line.length > 170) line = first && title.length < 150 ? `${title}। ${first.slice(0, 170 - title.length).replace(/\s+\S*$/, "")}।` : `${title}।`;
  return line;
}
export const voiceKey = async (env, item, sex = "f") => (await sha256(`${tvVoice(env, sex)}|tv|${rate(env)}|${readLine(item)}`)).slice(0, 40);

// The minute cron: lines for the bulletin's stories that have none yet, a few at a time.
export async function prepareBulletinVoices(env, stories, n = 4) {
  if (!ttsEnabled(env) || !stories?.length) return { done: 0 };
  const used = Number((await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(monthKey()).first().catch(() => null))?.value || 0);
  if (used > MONTH_CAP) return { done: 0, capped: used };
  const items = await Promise.all(stories.map(async (s, i) => ({ line: readLine(s), sex: sexAt(i), key: await voiceKey(env, s, sexAt(i)) })));
  const have = new Set((await env.DB.prepare(`SELECT key FROM tts_audio WHERE key IN (${items.map(() => "?").join(",")})`).bind(...items.map(x => x.key)).all()).results.map(r => r.key));
  let done = 0, chars = 0;
  for (const it of items) {
    if (have.has(it.key) || done >= n) continue;
    const audio = await synthesize(env, it.line, tvVoice(env, it.sex), "bn-IN", rate(env));
    await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(it.key, tvVoice(env, it.sex), it.line.length, audio.buffer).run();
    done++; chars += it.line.length;
  }
  if (chars) await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+? AS TEXT)").bind(monthKey(), String(chars), chars).run();
  return { done, chars };
}
// Which of the bulletin's stories have their line ready, in the voice their place in the
// bulletin calls for (or, while that is being made, the other one): story → key.
export async function readyVoices(env, stories) {
  if (!ttsEnabled(env) || !stories.length) return new Map();
  const want = await Promise.all(stories.map((s, i) => voiceKey(env, s, sexAt(i))));
  const alt = await Promise.all(stories.map((s, i) => voiceKey(env, s, sexAt(i + 1))));
  const all = [...want, ...alt];
  const have = new Set((await env.DB.prepare(`SELECT key FROM tts_audio WHERE key IN (${all.map(() => "?").join(",")})`).bind(...all).all().catch(() => ({ results: [] }))).results.map(r => r.key));
  return new Map(stories.map((s, i) => [s, have.has(want[i]) ? want[i] : have.has(alt[i]) ? alt[i] : ""]));
}
// GET /api/tv/voice/<key>.mp3
export async function voiceRoute(env, key) {
  const row = await env.DB.prepare("SELECT data FROM tts_audio WHERE key=?").bind(key).first().catch(() => null);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=31536000, immutable" } });
}
