// "Listen": stories read aloud by Google Cloud Text-to-Speech (Chirp 3 HD), a male or a female
// voice as the reader picks, in the language the story is shown in. Each paragraph is generated
// once per voice, stored in D1 and reused, so the cost depends on what is published, not on how
// many people listen. Needs the GOOGLE_TTS_API_KEY secret; without it the site falls back to
// the device's own voice.
import { getBySlug, isPublic, textBlocks } from "./store.js";
import { isLang, localiseArticles } from "./translate.js";

// Voices per language: female and male, each with a fallback. Override in wrangler.toml with
// TTS_VOICE_<LANG>_<FEMALE|MALE>, e.g. TTS_VOICE_BN_MALE = "bn-IN-Chirp3-HD-Orus".
const VOICES = {
  bn: { code: "bn-IN", female: "bn-IN-Chirp3-HD-Sulafat", male: "bn-IN-Chirp3-HD-Charon", fallback: { female: "bn-IN-Wavenet-A", male: "bn-IN-Wavenet-B" } },
  en: { code: "en-IN", female: "en-IN-Chirp3-HD-Sulafat", male: "en-IN-Chirp3-HD-Charon", fallback: { female: "en-IN-Neural2-A", male: "en-IN-Neural2-B" } },
  hi: { code: "hi-IN", female: "hi-IN-Chirp3-HD-Sulafat", male: "hi-IN-Chirp3-HD-Charon", fallback: { female: "hi-IN-Neural2-A", male: "hi-IN-Neural2-B" } }
};
export const DEFAULT_VOICE = VOICES.bn.female;
const MAX_CHARS = 1500;                                   // well under the 5,000-byte request limit

export const ttsEnabled = env => Boolean(env.GOOGLE_TTS_API_KEY);
const sexOf = v => v === "male" ? "male" : "female";
const voiceName = (env, lang = "bn", sex = "female") => env[`TTS_VOICE_${lang.toUpperCase()}_${sexOf(sex).toUpperCase()}`] || VOICES[lang][sexOf(sex)];

// The parts read aloud, in the same order the page shows them: headline, standfirst, then the text.
export function storyParts(a) {
  const parts = [a.title, a.dek].filter(Boolean);
  for (const b of textBlocks(a.body)) {
    const text = b.t === "li" ? b.x.replace(/^\d+\.\s+/, "") : b.x;
    if (text.length <= MAX_CHARS) { parts.push(text); continue; }
    // Very long paragraphs: split at sentence ends (। ends a sentence in Hindi and Bengali).
    let chunk = "";
    for (const s of text.match(/[^.!?।]+[.!?।]+["’”)]*\s*|.+$/g) || [text]) {
      if ((chunk + s).length > MAX_CHARS && chunk) { parts.push(chunk.trim()); chunk = ""; }
      chunk += s;
    }
    if (chunk.trim()) parts.push(chunk.trim());
  }
  return parts;
}

export async function sha256(s) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function synthesize(env, text, voice, languageCode = "en-IN") {
  const endpoint = env.TTS_ENDPOINT || "https://texttospeech.googleapis.com/v1/text:synthesize"; // TTS_ENDPOINT: local tests only
  const res = await fetch(`${endpoint}?key=${encodeURIComponent(env.GOOGLE_TTS_API_KEY)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: { text }, voice: { languageCode, name: voice }, audioConfig: { audioEncoding: "MP3", speakingRate: 0.96 } })
  });
  if (!res.ok) throw new Error(`Text-to-speech returned ${res.status}`);
  const { audioContent } = await res.json();
  return Uint8Array.from(atob(audioContent), c => c.charCodeAt(0));
}

// GET /api/tts/<slug>?lang=hi&voice=male         -> { parts: [...], voice }
// GET /api/tts/<slug>/<n>.mp3?lang=hi&voice=male -> the audio for part n (Bengali, female when absent)
export async function handleTts(request, env, url, json, err) {
  if (url.pathname === "/api/tts/status") return json({ enabled: ttsEnabled(env), voices: ["female", "male"] }, 200, { "cache-control": "public, max-age=300" });
  if (!ttsEnabled(env)) return err("Natural voice is not set up.", 404);
  const [, , , slug, part] = url.pathname.split("/").map(decodeURIComponent);
  let a = slug ? await getBySlug(env, slug) : null;
  if (!isPublic(a)) return err("Story not found.", 404);
  const want = url.searchParams.get("lang");
  if (isLang(want)) [a] = await localiseArticles(env, want, [a]);
  const lang = isLang(a.lang) ? a.lang : "bn", parts = storyParts(a), sex = sexOf(url.searchParams.get("voice"));
  // Each part carries a version, so an edited paragraph gets fresh audio despite long caching.
  if (!part) return json({ voice: voiceName(env, lang, sex), sex, lang, parts: await Promise.all(parts.map(async t => ({ text: t, v: (await sha256(`${voiceName(env, lang, sex)}|${t}`)).slice(0, 12) }))) }, 200, { "cache-control": "no-cache" });
  const n = parseInt(part, 10);
  if (!(n >= 0 && n < parts.length)) return err("No such part.", 404);
  const { code } = VOICES[lang], fallback = VOICES[lang].fallback[sex];
  let voice = voiceName(env, lang, sex);
  const key = await sha256(`${voice}|${parts[n]}`);
  let row = await env.DB.prepare("SELECT data FROM tts_audio WHERE key=?").bind(key).first();
  if (!row) {
    let audio;
    try { audio = await synthesize(env, parts[n], voice, code); }
    catch (e) { if (voice === fallback) throw e; voice = fallback; audio = await synthesize(env, parts[n], voice, code); }
    await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(key, voice, parts[n].length, audio.buffer).run();
    row = { data: audio };
  }
  return new Response(new Uint8Array(row.data), { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=31536000, immutable" } });
}
