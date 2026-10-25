// Machine translation of English news text for readers in Hindi and Bengali: the live wire,
// briefings, live coverage, events, reader excerpts, and stories the editor has not translated.
// It uses Cloudflare Workers AI (IndicTrans2, AI4Bharat's English to Indian-languages model)
// through the AI binding: no key, and the daily free allowance covers a news site's headlines.
// Each sentence is translated once and kept in D1 (mt_cache); a daily character cap
// (MT_DAILY_CHARS) keeps use inside the free allowance. When the model cannot be reached or
// the cap is spent, the English is shown, so nothing breaks.
import { isLang } from "./translate.js";

const MODEL = "@cf/ai4bharat/indictrans2-en-indic-1B";
const TARGET = { hi: "hin_Deva", bn: "ben_Beng" };
const PIECE = 380;   // characters per piece sent to the model (it reads ~256 tokens at a time)
const BATCH = 12;    // pieces per model call

export const mtReady = env => Boolean(env.DB && (env.AI || env.MT_ENDPOINT));

// Text worth sending: has English words in it, and is not already Hindi or Bengali.
const needsMt = s => /[A-Za-z]{2}/.test(s) && !/[ऀ-৿]/.test(s);

async function key(lang, text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${lang}\n${text}`));
  return [...new Uint8Array(d).slice(0, 16)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Long text goes to the model in sentence-sized pieces.
export function pieces(text) {
  const out = [];
  let cur = "";
  for (const s of text.match(/[^.!?।]+[.!?।]*["”’)\]]*\s*/g) || [text]) {
    if (cur && (cur + s).length > PIECE) { out.push(cur.trim()); cur = ""; }
    if (s.length > PIECE) { for (let i = 0; i < s.length; i += PIECE) out.push(s.slice(i, i + PIECE).trim()); continue; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

async function runModel(env, lang, texts) {
  const input = { text: texts, target_language: TARGET[lang] };
  if (env.MT_ENDPOINT) {   // a stand-in model for local tests
    const r = await fetch(env.MT_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!r.ok) throw new Error(`MT ${r.status}`);
    return (await r.json()).translations;
  }
  return (await env.AI.run(MODEL, input)).translations;
}

const today = () => new Date().toISOString().slice(0, 10);
async function spend(env, chars) {
  const cap = Number(env.MT_DAILY_CHARS || 300000);
  const row = await env.DB.prepare("SELECT chars FROM mt_usage WHERE day=?").bind(today()).first();
  if ((row?.chars || 0) + chars > cap) return false;
  await env.DB.prepare("INSERT INTO mt_usage (day,chars) VALUES (?,?) ON CONFLICT(day) DO UPDATE SET chars=chars+excluded.chars").bind(today(), chars).run();
  return true;
}

const memo = new Map();   // per-isolate copy of recent translations
function remember(k, v) { memo.set(k, v); if (memo.size > 4000) memo.delete(memo.keys().next().value); }

// Translates a list of strings; returns the list with each string translated where possible.
export async function translateTexts(env, lang, texts, { cacheOnly = false } = {}) {
  if (!isLang(lang) || !mtReady(env)) return texts;
  const out = texts.slice();
  const want = [...new Set(texts.map(t => String(t || "").trim()).filter(needsMt))];
  if (!want.length) return out;
  const keys = await Promise.all(want.map(t => key(lang, t)));
  const found = new Map();
  const missing = [];
  want.forEach((t, i) => memo.has(keys[i]) ? found.set(t, memo.get(keys[i])) : missing.push(i));
  for (let i = 0; i < missing.length; i += 90) {
    const part = missing.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT k,out FROM mt_cache WHERE k IN (${part.map(() => "?").join(",")})`).bind(...part.map(j => keys[j])).all();
    const got = new Map(results.map(r => [r.k, r.out]));
    for (const j of part) if (got.has(keys[j])) { found.set(want[j], got.get(keys[j])); remember(keys[j], got.get(keys[j])); }
  }
  const todo = missing.filter(j => !found.has(want[j]));
  if (todo.length && !cacheOnly && await spend(env, todo.reduce((n, j) => n + want[j].length, 0))) {
    const split = todo.map(j => pieces(want[j]));
    const flat = split.flat();
    const done = [];
    const chunks = [];
    for (let i = 0; i < flat.length; i += BATCH) chunks.push(flat.slice(i, i + BATCH));
    const replies = [];
    for (let i = 0; i < chunks.length; i += 4) {   // four model calls at a time
      const got = await Promise.all(chunks.slice(i, i + 4).map(c => runModel(env, lang, c).then(r => Array.isArray(r) && r.length === c.length ? r : null, e => { console.log("mt", String(e.message || e).slice(0, 120)); return null; })));
      replies.push(...got);
      if (got.includes(null)) break;
    }
    chunks.forEach((c, i) => done.push(...(replies[i] || c.map(() => "")).map(x => String(x || "").trim())));
    let at = 0;
    const writes = [];
    split.forEach((ps, n) => {
      const parts = done.slice(at, at + ps.length); at += ps.length;
      if (parts.length !== ps.length || parts.some(p => !p)) return;
      const j = todo[n], text = parts.join(" ");
      found.set(want[j], text); remember(keys[j], text);
      writes.push(env.DB.prepare("INSERT OR REPLACE INTO mt_cache (k,lang,out,created_at) VALUES (?,?,?,datetime('now'))").bind(keys[j], lang, text));
    });
    if (writes.length) await env.DB.batch(writes).catch(() => {});
  }
  return out.map(t => found.get(String(t || "").trim()) ?? t);
}

// Translates the named fields of each object in place; marks the ones it changed.
export async function translateFields(env, lang, items, fields, opts) {
  const refs = [];
  for (const it of items) for (const f of fields) if (it && typeof it[f] === "string" && it[f]) refs.push([it, f]);
  const res = await translateTexts(env, lang, refs.map(([it, f]) => it[f]), opts);
  refs.forEach(([it, f], i) => { if (res[i] !== it[f]) { it[f] = res[i]; it.mt = true; } });
  return items;
}

// A story body (plain text: paragraphs, "# " headings, "- " or "1. " list lines), line by line.
export async function translateBody(env, lang, body) {
  const lines = String(body || "").split("\n");
  const parts = lines.map(l => l.match(/^(\s*(?:#{1,3}\s+|[-•*]\s+|\d+\.\s+)?)(.*)$/));
  const res = await translateTexts(env, lang, parts.map(m => m[2]));
  return parts.map((m, i) => m[1] + res[i]).join("\n");
}
