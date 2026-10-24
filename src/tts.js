// "Listen": stories read aloud by a natural Indian English woman's voice (Google Cloud
// Text-to-Speech, Chirp 3 HD). Each paragraph is generated once, stored in D1 and reused,
// so the cost depends on what is published, not on how many people listen.
// Needs the GOOGLE_TTS_API_KEY secret; without it the site falls back to the device's voice.
import { getBySlug, isPublic, textBlocks } from "./store.js";

export const DEFAULT_VOICE = "en-IN-Chirp3-HD-Sulafat"; // warm female voice, English (India)
const FALLBACK_VOICE = "en-IN-Neural2-A";                // female, English (India)
const MAX_CHARS = 1500;                                   // well under the 5,000-byte request limit

export const ttsEnabled = env => Boolean(env.GOOGLE_TTS_API_KEY);
const voiceName = env => env.TTS_VOICE || DEFAULT_VOICE;

// The parts read aloud, in the same order the page shows them: headline, standfirst, then the text.
export function storyParts(a) {
  const parts = [a.title, a.dek].filter(Boolean);
  for (const b of textBlocks(a.body)) {
    const text = b.t === "li" ? b.x.replace(/^\d+\.\s+/, "") : b.x;
    if (text.length <= MAX_CHARS) { parts.push(text); continue; }
    // Very long paragraphs: split at sentence ends.
    let chunk = "";
    for (const s of text.match(/[^.!?]+[.!?]+["’”)]*\s*|.+$/g) || [text]) {
      if ((chunk + s).length > MAX_CHARS && chunk) { parts.push(chunk.trim()); chunk = ""; }
      chunk += s;
    }
    if (chunk.trim()) parts.push(chunk.trim());
  }
  return parts;
}

async function sha256(s) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function synthesize(env, text, voice) {
  const endpoint = env.TTS_ENDPOINT || "https://texttospeech.googleapis.com/v1/text:synthesize"; // TTS_ENDPOINT: local tests only
  const res = await fetch(`${endpoint}?key=${encodeURIComponent(env.GOOGLE_TTS_API_KEY)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: { text }, voice: { languageCode: "en-IN", name: voice }, audioConfig: { audioEncoding: "MP3", speakingRate: 0.96 } })
  });
  if (!res.ok) throw new Error(`Text-to-speech returned ${res.status}`);
  const { audioContent } = await res.json();
  return Uint8Array.from(atob(audioContent), c => c.charCodeAt(0));
}

// GET /api/tts/<slug>         -> { parts: [...], voice }
// GET /api/tts/<slug>/<n>.mp3 -> the audio for part n
export async function handleTts(request, env, url, json, err) {
  if (url.pathname === "/api/tts/status") return json({ enabled: ttsEnabled(env), voice: voiceName(env) }, 200, { "cache-control": "public, max-age=300" });
  if (!ttsEnabled(env)) return err("Natural voice is not set up.", 404);
  const [, , , slug, part] = url.pathname.split("/").map(decodeURIComponent);
  const a = slug ? await getBySlug(env, slug) : null;
  if (!isPublic(a)) return err("Story not found.", 404);
  const parts = storyParts(a);
  // Each part carries a version, so an edited paragraph gets fresh audio despite long caching.
  if (!part) return json({ voice: voiceName(env), parts: await Promise.all(parts.map(async t => ({ text: t, v: (await sha256(`${voiceName(env)}|${t}`)).slice(0, 12) }))) }, 200, { "cache-control": "no-cache" });
  const n = parseInt(part, 10);
  if (!(n >= 0 && n < parts.length)) return err("No such part.", 404);
  let voice = voiceName(env);
  const key = await sha256(`${voice}|${parts[n]}`);
  let row = await env.DB.prepare("SELECT data FROM tts_audio WHERE key=?").bind(key).first();
  if (!row) {
    let audio;
    try { audio = await synthesize(env, parts[n], voice); }
    catch (e) { if (voice === FALLBACK_VOICE) throw e; voice = FALLBACK_VOICE; audio = await synthesize(env, parts[n], voice); }
    await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(key, voice, parts[n].length, audio.buffer).run();
    row = { data: audio };
  }
  return new Response(new Uint8Array(row.data), { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=31536000, immutable" } });
}
