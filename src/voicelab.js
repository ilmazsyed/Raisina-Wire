// The newsreader's voice (AVO desk > Newsreader voice): the Bengali voices the channel reads its
// bulletins, AVO stories and links in (Google Cloud Text-to-Speech, Chirp 3 HD, inside the free
// million characters a month). The desk listens to any voice at any pace on a sample, then puts a
// woman's and a man's voice on air at once or from midnight (India time). Kept in settings
// (tv:voice); every request and the cron read it (applyVoice), so new recordings use the chosen
// voices; stories already recorded keep theirs.
import { synthesize, sha256, ttsEnabled } from "./tts.js";
import { voiceBudget, chargeVoice, DEFAULT_TV_VOICE, DEFAULT_TV_RATE } from "./bulletinvoice.js";

// Chirp 3 HD voices (Bengali, India), by how they sound.
export const VOICE_LIST = {
  f: ["Achernar", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Gacrux", "Kore", "Laomedeia", "Leda", "Pulcherrima", "Sulafat", "Vindemiatrix", "Zephyr"],
  m: ["Achird", "Algenib", "Algieba", "Alnilam", "Charon", "Enceladus", "Fenrir", "Iapetus", "Orus", "Puck", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Umbriel", "Zubenelgenubi"]
};
const full = n => `bn-IN-Chirp3-HD-${n}`;
const okName = v => /^bn-IN-Chirp3-HD-[A-Za-z]+$/.test(v || "") && [...VOICE_LIST.f, ...VOICE_LIST.m].includes(v.split("-").pop());
const okRate = r => Math.min(1.35, Math.max(0.85, Math.round((Number(r) || 1.1) * 100) / 100));

let cache = { at: 0, v: null };
async function stored(env, fresh = false) {
  if (!fresh && Date.now() - cache.at < 60e3) return cache.v;
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='tv:voice'").first().catch(() => null);
  cache = { at: Date.now(), v: r ? JSON.parse(r.value || "null") : null };
  return cache.v;
}
const active = s => !s ? null : s.next && Date.parse(s.next.from) <= Date.now() ? s.next : s.now || null;

// The chosen voices into env (TV_VOICE_FEMALE, TV_VOICE_MALE, TV_VOICE_RATE) for this request.
export async function applyVoice(env) {
  if (!env.DB) return;
  const a = active(await stored(env).catch(() => null)); if (!a) return;
  try { env.TV_VOICE_FEMALE = a.f; env.TV_VOICE_MALE = a.m; env.TV_VOICE_RATE = String(a.rate); } catch { /* read-only env: defaults stay */ }
}

// The next midnight in India.
const nextMidnightIST = () => { const ist = new Date(Date.now() + 5.5 * 3600e3); return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1) - 5.5 * 3600e3).toISOString(); };

// /api/admin/tv/voice[/sample]
export async function handleVoice(request, env, sub, b, { json, err, audit }) {
  const s = await stored(env, true) || {}, cur = active(s) || { f: DEFAULT_TV_VOICE.f, m: DEFAULT_TV_VOICE.m, rate: DEFAULT_TV_RATE };
  if (!sub && request.method === "GET")
    return json({ enabled: ttsEnabled(env), onAir: cur, next: s.next && Date.parse(s.next.from) > Date.now() ? s.next : null, voices: VOICE_LIST, defaults: { ...DEFAULT_TV_VOICE, rate: DEFAULT_TV_RATE }, budget: await voiceBudget(env) }, 200, { "cache-control": "no-store" });
  if (sub === "sample" && request.method === "POST") {
    if (!ttsEnabled(env)) return err("The natural voice is not set up (GOOGLE_TTS_API_KEY).");
    const voice = full(String(b.voice || "")), rate = okRate(b.rate), text = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!okName(voice)) return err("Choose a voice.");
    if (!text) return err("Write a few lines to hear.");
    const key = (await sha256(`${voice}|sample|${rate}|${text}`)).slice(0, 40);
    let row = await env.DB.prepare("SELECT data FROM tts_audio WHERE key=?").bind(key).first();
    if (!row) {
      if (await voiceBudget(env) < text.length + 500) return err("This month's voice allowance is nearly used up.");
      const audio = await synthesize(env, text, voice, "bn-IN", rate);
      await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(key, voice, text.length, audio.buffer).run();
      await chargeVoice(env, text.length);
      row = { data: audio };
    }
    return new Response(row.data, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  }
  if (!sub && request.method === "PUT") {
    const v = { f: full(String(b.f || "")), m: full(String(b.m || "")), rate: okRate(b.rate) };
    if (!okName(v.f) || !okName(v.m)) return err("Choose a woman's voice and a man's voice.");
    const out = b.when === "now" ? { now: v, next: null } : b.when === "cancel" ? { now: s.now || null, next: null } : { now: active(s) || null, next: { ...v, from: nextMidnightIST() } };
    await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('tv:voice',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(out)).run();
    cache = { at: 0, v: null };
    await audit("tv.voice", "tv", "", { when: b.when || "tomorrow", ...v });
    return json({ ok: true, onAir: active(out) || cur, next: out.next });
  }
  return err("Not found.", 404);
}
