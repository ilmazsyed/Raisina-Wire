import { bnLine, tidyLine } from "./bnline.js";
// The Rashtrix wire desk. It reads the outlets the owner has approved (control room → Wire
// sources), groups items about the same story, and writes a new report in our own words with
// Gemini (Google AI Studio, free tier): a Bengali rewrite when the sources are Bengali, a
// 100-word Bengali brief when they are in another language. Each report also gets an English
// and a Hindi version in the same call. Rules:
//   - facts only from the sources, from two or more outlets where possible (a story waits up to
//     WIRE_WAIT_MINUTES for a second outlet before it is written from one);
//   - never the sources' phrasing: the result is checked for runs of words copied from them
//     and rejected if any are found;
//   - no photos: rewrites and briefs show a branded text card;
//   - sources are never shown to readers, but every item a report was written from is kept
//     (wire_items, linked by job) for the control room;
//   - each item is rewritten once; when the daily free quota is spent the queue simply waits
//     (the free tier resets at midnight Pacific time, 13:30 India time) and carries on.
import { parseFeed, sourceText, categorize, DESKS, PLACE_DESKS, SUBJECT_DESKS, subjectDesk, scriptLang } from "./feeds.js";
import { textHash, splitTags } from "./store.js";

const UA = "Mozilla/5.0 (compatible; RashtrixWire/1.0; +https://www.rashtrix.live)";
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const setting = async (env, key, fallback) => (await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first())?.value ?? fallback;

export const wireReady = env => Boolean(env.GEMINI_API_KEY);
// The free tier counts each model's requests separately and allows Flash-Lite models about 500 a
// day but Flash only 20, so the desk works through a chain of models (GEMINI_MODELS, comma-
// separated, first choice first): when one model's daily allowance is used up it moves to the
// next until midnight Pacific time. A model Google retires (404) is skipped for a month, and the
// one Google names in its answer is tried next.
const DEFAULT_MODELS = "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash";
export const geminiModels = env => String(env.GEMINI_MODELS || env.GEMINI_MODEL_CHAIN || DEFAULT_MODELS).split(",").map(m => m.trim()).filter(Boolean);
export const geminiModel = env => geminiModels(env)[0];
async function modelChain(env) {
  const named = (await setting(env, "gemini_model", "")).trim();   // a replacement Google named
  const chain = [...new Set([...geminiModels(env), ...(named ? [named] : [])])];
  const { results } = await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'gemini_off:%'").all().catch(() => ({ results: [] }));
  const off = new Map(results.filter(r => Date.parse(r.value) > Date.now()).map(r => [r.key.slice(11), r.value]));
  return { chain, available: chain.filter(m => !off.has(m)), off };
}
async function activeModel(env) { const { available, chain } = await modelChain(env); return available[0] || chain[0]; }
const modelOff = (env, model, until) => env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(`gemini_off:${model}`, until).run();
// Calls a day across the chain (about 500 + 500 + 20 on the free tier), spread over the day.
const DAILY_LIMIT = env => Number(env.GEMINI_DAILY_LIMIT || 1000);
const WAIT = async env => Number(await setting(env, "wire_wait_minutes", env.WIRE_WAIT_MINUTES || 30));
const MAX_AGE_H = 24;   // items and queued jobs older than this are not written up

/* ---------- Settings the control room changes ---------- */
export async function wireSettings(env) {
  return {
    autopublish: (await setting(env, "wire_autopublish", "on")) !== "off",
    paused: (await setting(env, "wire_paused", "off")) === "on",
    waitMinutes: await WAIT(env),
    model: await activeModel(env), models: (await modelChain(env)).chain, dailyLimit: DAILY_LIMIT(env), ready: wireReady(env)
  };
}
export async function saveWireSettings(env, b) {
  const put = (k, v) => env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, String(v)).run();
  if (b.autopublish !== undefined) await put("wire_autopublish", b.autopublish ? "on" : "off");
  if (b.paused !== undefined) await put("wire_paused", b.paused ? "on" : "off");
  if (b.waitMinutes !== undefined) await put("wire_wait_minutes", Math.max(0, Math.min(240, parseInt(b.waitMinutes, 10) || 0)));
}

/* ---------- Blocklist ---------- */
async function blocklist(env) {
  const { results } = await env.DB.prepare("SELECT pattern,kind FROM wire_blocklist").all();
  return results;
}
export function blocked(item, rules) {
  let host = ""; try { host = new URL(item.url).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* bad url */ }
  const text = `${item.title} ${item.summary || ""}`.toLowerCase();
  return rules.some(r => r.kind === "domain" ? host === r.pattern || host.endsWith(`.${r.pattern}`) : text.includes(r.pattern.toLowerCase()));
}

/* ---------- Grouping items about the same story ---------- */
// Words that say little about which story it is.
const STOP = new Set(("a an the of in on at to for from by with and or but is are was were be been has have had will would as it its this that these those after over into about amid " +
  "says said say new news live update updates latest today report reports video watch photos " +
  "ও এবং এ এই সেই যে না হয় হল হলো হবে করে করা করল করলেন থেকে জন্য নিয়ে দিয়ে পর আগে মধ্যে একটি এক কি কী কেন বলে বললেন জানালেন খবর আজ লাইভ ভিডিও " +
  "का की के है हैं में से को पर और ने भी था थी थे कि यह वह एक लिए बाद तक साथ खबर आज").split(/\s+/));
export function keyWords(title) {
  return [...new Set(String(title).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ").split(/\s+/)
    .map(w => w.replace(/(র|ের|কে|তে|য়|এ|ে|ি|ra|er|s)$/u, w.length > 4 ? "" : "$1"))   // light stemming of case endings
    .filter(w => w.length > 1 && !STOP.has(w)))];
}
export function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  const B = new Set(b); let n = 0;
  for (const w of a) if (B.has(w)) n++;
  return n / Math.min(a.length, b.length);
}
const kindFor = lang => lang === "bn" ? "rewrite" : "brief";

/* ---------- Reading the sources ---------- */
export async function fetchSources(env, { force = false } = {}) {
  const { results: sources } = await env.DB.prepare("SELECT * FROM wire_sources WHERE active=1").all();
  if (!sources.length) return { sources: 0, added: 0 };
  const rules = await blocklist(env);
  let added = 0;
  for (const s of sources) {
    // Each outlet at most every 10 minutes.
    if (!force && s.last_fetch_at && Date.now() - Date.parse(s.last_fetch_at) < 9.5 * 60e3) continue;
    try {
      const r = await fetch(s.feed_url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(9000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const items = parseFeed(await r.text(), s.name).filter(i => !i.publishedAt || Date.now() - Date.parse(i.publishedAt) < MAX_AGE_H * 3600e3);
      const stmts = items.slice(0, 60).map(i => env.DB.prepare("INSERT OR IGNORE INTO wire_items (id,source_id,source_name,lang,url,title,summary,published_at,status) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(id(), s.id, s.name, s.lang || scriptLang(i.title), i.url, i.title.slice(0, 400), (i.summary || "").slice(0, 1200), i.publishedAt, blocked(i, rules) ? "blocked" : "new"));
      const res = stmts.length ? await env.DB.batch(stmts) : [];
      const n = res.reduce((k, x) => k + (x.meta?.changes || 0), 0); added += n;
      await env.DB.prepare("UPDATE wire_sources SET last_fetch_at=?, last_ok=1, last_error='', last_count=? WHERE id=?").bind(now(), items.length, s.id).run();
    } catch (e) {
      await env.DB.prepare("UPDATE wire_sources SET last_fetch_at=?, last_ok=0, last_error=? WHERE id=?").bind(now(), String(e.message || e).slice(0, 200), s.id).run();
    }
  }
  return { sources: sources.length, added };
}

// New items join the story they match (same kind of sources, last 36 hours), or start one.
export async function groupItems(env) {
  const { results: fresh } = await env.DB.prepare("SELECT * FROM wire_items WHERE status='new' ORDER BY fetched_at LIMIT 80").all();
  if (!fresh.length) return 0;
  const since = new Date(Date.now() - 36 * 3600e3).toISOString();
  const { results: jobs } = await env.DB.prepare("SELECT id,kind,status,keys,sources FROM wire_jobs WHERE created_at>=? ORDER BY created_at DESC LIMIT 600").bind(since.replace("T", " ").slice(0, 19)).all();
  const pool = jobs.map(j => ({ ...j, words: j.keys.split(" ").filter(Boolean) }));
  const wait = await WAIT(env);
  for (const it of fresh) {
    const words = keyWords(it.title), kind = kindFor(it.lang);
    let best = null, score = 0;
    for (const j of pool) { if (j.kind !== kind) continue; const s = similarity(words, j.words); if (s > score) { score = s; best = j; } }
    if (best && score >= 0.5 && words.length >= 3) {
      await env.DB.prepare("UPDATE wire_items SET job_id=?, status='grouped' WHERE id=?").bind(best.id, it.id).run();
      const { n } = await env.DB.prepare("SELECT COUNT(DISTINCT source_id) AS n FROM wire_items WHERE job_id=?").bind(best.id).first();
      // A second outlet: the story can be written now (unless it was already written).
      await env.DB.prepare("UPDATE wire_jobs SET sources=?, status=CASE WHEN status='waiting' AND ?>=2 THEN 'queued' ELSE status END, updated_at=? WHERE id=?").bind(n, n, now(), best.id).run();
      best.sources = n;
      continue;
    }
    const jid = id(), notBefore = new Date(Date.now() + wait * 60e3).toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO wire_jobs (id,kind,status,title,keys,sources,not_before) VALUES (?,?,?,?,?,1,?)").bind(jid, kind, wait ? "waiting" : "queued", it.title.slice(0, 300), words.join(" "), notBefore),
      env.DB.prepare("UPDATE wire_items SET job_id=?, status='grouped' WHERE id=?").bind(jid, it.id)
    ]);
    pool.unshift({ id: jid, kind, status: "waiting", keys: words.join(" "), words, sources: 1 });
  }
  // Single-source stories whose wait is over join the queue.
  await env.DB.prepare("UPDATE wire_jobs SET status='queued', updated_at=? WHERE status='waiting' AND not_before<=?").bind(now(), now()).run();
  // Too old to be news any more.
  await env.DB.prepare("UPDATE wire_jobs SET status='skipped', error='too old', updated_at=? WHERE status IN ('waiting','queued') AND created_at<?").bind(now(), new Date(Date.now() - MAX_AGE_H * 3600e3).toISOString().replace("T", " ").slice(0, 19)).run();
  return fresh.length;
}

/* ---------- Gemini, inside the free quota ---------- */
// The free tier's daily allowance resets at midnight Pacific time.
const pacificDay = (t = Date.now()) => new Date(t - 8 * 3600e3).toISOString().slice(0, 10);
const nextPacificMidnight = () => { const d = new Date(Date.now() - 8 * 3600e3); d.setUTCHours(24, 5, 0, 0); return new Date(d.getTime() + 8 * 3600e3).toISOString(); };
export async function quota(env) {
  const row = await env.DB.prepare("SELECT calls,blocked_until FROM ai_usage WHERE day=?").bind(pacificDay()).first();
  const calls = row?.calls || 0, blockedUntil = row?.blocked_until && Date.parse(row.blocked_until) > Date.now() ? row.blocked_until : null;
  return { day: pacificDay(), calls, limit: DAILY_LIMIT(env), blockedUntil, left: blockedUntil ? 0 : Math.max(0, DAILY_LIMIT(env) - calls), resetsAt: nextPacificMidnight() };
}
const countCall = env => env.DB.prepare("INSERT INTO ai_usage (day,calls) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1").bind(pacificDay()).run();
const blockUntil = (env, until) => env.DB.prepare("INSERT INTO ai_usage (day,calls,blocked_until) VALUES (?,0,?) ON CONFLICT(day) DO UPDATE SET blocked_until=excluded.blocked_until").bind(pacificDay(), until).run();

const LANG_SCHEMA = { type: "OBJECT", properties: { title: { type: "STRING" }, dek: { type: "STRING" }, body: { type: "STRING" } }, required: ["title", "body"] };
// Where the story happened and how far it reaches come first, so the desk is chosen from them.
const PLACE_SCHEMA = { type: "OBJECT", properties: { city: { type: "STRING" }, district: { type: "STRING" }, state: { type: "STRING" }, country: { type: "STRING" } }, required: ["country"] };
const SCHEMA = { type: "OBJECT", properties: { place: PLACE_SCHEMA, scope: { type: "STRING", enum: ["city", "state", "national", "international", "diaspora"] }, beat: { type: "STRING", enum: ["news", "entertainment", "sports", "lifestyle"] }, desk: { type: "STRING", enum: DESKS }, tags: { type: "ARRAY", items: { type: "STRING" } }, bn: LANG_SCHEMA, en: LANG_SCHEMA, hi: LANG_SCHEMA, unusable: { type: "BOOLEAN" }, reason: { type: "STRING" } },
  required: ["place", "scope", "beat", "desk", "bn", "en", "hi"], propertyOrdering: ["place", "scope", "beat", "desk", "tags", "bn", "en", "hi", "unusable", "reason"] };

// The desk, from where the story happened and how far it reaches. The model's own choice is
// used only when it gives no place.
const KOLKATA_AREA = /kolkata|calcutta|howrah|salt ?lake|bidhannagar|new ?town|rajarhat|dum ?dum|baranagar|behala|jadavpur|tollygunge|garia|kasba|barasat|sonarpur|কলকাতা|হাওড়া|সল্টলেক|বিধাননগর|নিউ ?টাউন|রাজারহাট|দমদম|বরানগর|বেহালা|যাদবপুর|টালিগঞ্জ|গড়িয়া|কসবা/i;
const IN_BENGAL = /west ?bengal|পশ্চিমবঙ্গ|^bengal$/i;
const IN_INDIA = /^(india|bharat|ভারত|भारत)$/i;
const BEAT_DESK = { entertainment: "Entertainment", sports: "Sports", lifestyle: "Lifestyle" };
export function deskFor(out) {
  // Entertainment, sport and lifestyle have their own desks, wherever the story happened.
  if (BEAT_DESK[out?.beat]) return BEAT_DESK[out.beat];
  if (SUBJECT_DESKS.includes(out?.desk)) return out.desk;
  const p = out?.place || {}, scope = out?.scope;
  const known = [p.country, p.state, p.city].some(x => String(x || "").trim());
  if (!known) return PLACE_DESKS.includes(out?.desk) ? out.desk : null;
  if (scope === "diaspora") return "Probashi Bangali";
  const country = String(p.country || "").trim(), state = String(p.state || "").trim();
  const local = `${p.city || ""} ${p.district || ""}`;
  if (country && !IN_INDIA.test(country)) return "World";
  if (scope === "international" && !IN_BENGAL.test(state)) return "World";
  if (state && !IN_BENGAL.test(state) && !KOLKATA_AREA.test(local)) return "India";
  if (scope === "national" && !state) return "India";
  if (IN_BENGAL.test(state) || KOLKATA_AREA.test(local)) return scope === "city" && KOLKATA_AREA.test(local) ? "Kolkata" : "West Bengal";
  return PLACE_DESKS.includes(out?.desk) ? out.desk : "India";
}

// The Bengali house style: Anandabazar Patrika's standard চলিত বাংলা, with the brisk,
// conversational pace of The Wall. Used for every Bengali rewrite and brief.
export const BENGALI_STYLE = `Bengali house style (follow strictly):
- Standard colloquial Bengali (চলিত ভাষা) as written by Anandabazar Patrika. Never সাধু ভাষা (no করিয়াছে, হইয়াছে, তাহার).
- Anandabazar spellings and verb forms: হয়েছে, গিয়েছে (not গেছে), জানিয়েছেন, বলেছেন, পুজো, পুরসভা, দমকল, পুলিশ, রাজ্য সরকার, কেন্দ্র, বিধানসভা, লোকসভা, পুরভোট, পঞ্চায়েত; শহর ও জায়গার নাম যেমন কলকাতার কাগজে লেখা হয় (হাওড়া, শিয়ালদহ, বিধাননগর, নিউ টাউন)।
- The pace of The Wall: short, clear sentences; one idea per sentence; active voice; the most important fact first; plain everyday words a reader in Kolkata uses (সাধারণ মানুষের মুখের ভাষা), English words only where Bengali readers use them (ট্রেন, হাসপাতাল, পুলিশ, ভোট)।
- Attribution in the Anandabazar manner: “পুলিশ সূত্রে খবর”, “দমকল জানিয়েছে”, “তিনি বলেন”, “প্রশাসনের দাবি”. Never mention other news outlets.
- Respectful forms for named adults (তিনি, জানিয়েছেন). No exclamation marks, no rhetorical questions, no slang or clickbait (চাঞ্চল্যকর, শিউরে ওঠার মতো) — keep it sober.
- Bengali digits (০–৯) for every number in the Bengali text; dates like ৭ নভেম্বর, times like সকাল ১০টা।
- Headline: a short sentence in the present or past tense with a comma pause, as in Anandabazar headlines (e.g. “নিউ টাউনে বস্তিতে আগুন, পুড়ল একাধিক ঝুপড়ি”), no full stop at the end.`;

const RULES = `You are a senior sub-editor at Rashtrix 24×7 News, a Bengali news channel in Kolkata. You write original news reports from the source reports you are given.
Rules, in order of importance:
1. Use only facts that appear in the sources. Never add facts, numbers, names, places, quotes or background that the sources do not contain. Do not guess or speculate.
2. Where there are several sources, combine them, and prefer facts that more than one source reports. If the sources disagree on a fact, either leave it out or say plainly that the accounts differ.
3. Write entirely in your own words. Never copy a phrase of more than four words from any source, except names, official titles and short quotations of what a named person said (which must be in quotation marks and attributed to that person).
4. Never name the outlets, newspapers or channels the sources come from, and never say "according to media reports". Attribute claims to the people or bodies who made them (police, a minister, the hospital, residents).
5. Neutral, factual tone. No opinion, no adjectives of judgement, no clickbait, no exclamation marks. Respect the presumption of innocence: say "accused" or "arrested", never call anyone guilty unless convicted. Do not name victims of sexual offences or minors.
6. Bengali in the house style of Anandabazar Patrika and The Wall (thewall.in): see BENGALI_STYLE below. English in plain Indian English. Hindi in plain standard Hindi.
7. If the sources are not news (an advertisement, an opinion column, a horoscope, a quiz, a list of offers) or too thin to report safely, set "unusable": true and explain in "reason".
Also file the story correctly. First give "place": where the main event happened (city or town, district, state, country, in English; leave a part empty if the sources do not say). Then "scope":
- "city": a local story in Kolkata and its suburbs (Howrah, Salt Lake, New Town, Dum Dum, Behala, Jadavpur and so on): a fire, an accident, crime, civic works, the municipality, a local event.
- "state": anywhere else in West Bengal, or about West Bengal as a whole: the state government, Nabanna, the chief minister, the state assembly, state-wide politics and parties, the Calcutta High Court, a district — even if the announcement was made in Kolkata.
- "national": India outside West Bengal, or India as a whole: the central government, Parliament, the Supreme Court, other states, national politics, the economy, national sport.
- "international": events outside India, including Bangladesh and the rest of South Asia, and foreign affairs where the event happened abroad.
- "diaspora": Bengalis living outside West Bengal, in other states or abroad, as the subject of the story (their associations, festivals, troubles, migrant workers from Bengal elsewhere).
Then "beat", the kind of story:
- "entertainment": films, television and web series, music, theatre, celebrities and their work, film festivals, box office.
- "sports": every sport and sportsperson: cricket, football (Mohun Bagan, East Bengal, Mohammedan Sporting), the Olympics, tennis, chess and the rest, at any level.
- "lifestyle": health and fitness advice, food and recipes, fashion and beauty, travel features, relationships and parenting, astrology, festival customs as features.
- "news": everything else — politics, government, crime, courts, accidents, civic life, the economy, science. A crime, court case, accident or political story about a film star or a sportsperson is "news".
Then "desk", which must match: for the beats entertainment → Entertainment, sports → Sports, lifestyle → Lifestyle; for news, by scope: city → Kolkata, state → West Bengal, national → India, international → World, diaspora → Probashi Bangali.
Give up to five short topic tags in English.

${BENGALI_STYLE}`;

function prompt(kind, items) {
  const shape = kind === "brief"
    ? `Write a brief: a headline (at most 12 words) and a body of 90 to 110 words in one or two short paragraphs. "dek" may be empty.`
    : `Write a report: a headline (at most 14 words), a one-sentence standfirst ("dek", at most 30 words) and a body of 180 to 350 words in short paragraphs separated by a blank line, most important facts first.`;
  return `${shape}
Produce the same report in Bengali ("bn"), English ("en") and Hindi ("hi"); the three must say the same thing.

Sources (${items.length}):
${items.map((it, i) => `--- Source ${i + 1} (${it.lang}) ---\nHeadline: ${it.title}\nPublished: ${it.published_at || "unknown"}\n${it.text || it.summary || ""}`).join("\n\n")}`;
}

async function callGemini(env, text, retried = false, think = true, tries = 0, opt = {}) {
  const { available } = await modelChain(env);
  if (!available.length) { await blockUntil(env, nextPacificMidnight()); const e = new Error("daily free quota used up on every model; waiting for the reset"); e.retry = true; throw e; }
  const model = available[0];
  const endpoint = env.GEMINI_ENDPOINT || `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  // A report in three languages is long: the newer models think before writing, which can take
  // well over a minute. Light thinking keeps it quick; the wait allows three minutes.
  const thinking = think && /^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: "low" } } : {};
  let r;
  try {
    r = await fetch(endpoint, {
      method: "POST", signal: AbortSignal.timeout(180000),
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opt.system || RULES }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json", responseSchema: opt.schema || SCHEMA, maxOutputTokens: opt.schema ? 4096 : 16384, ...thinking }
      })
    });
  } catch (e) {
    const err = new Error(e?.name === "TimeoutError" ? "Gemini took too long; trying again shortly" : `Gemini: ${e?.message || e}`); err.retry = true; throw err;
  }
  if (r.status === 400 && thinking.thinkingConfig) {
    const body = await r.clone().text();
    if (/thinking/i.test(body)) return callGemini(env, text, retried, false, tries, opt);   // a model without that setting
  }
  await countCall(env);
  if (r.status === 429) {
    const body = await r.text();
    // Per-day quota: this model rests until the reset and the next model in the chain takes over.
    // Per-minute: try again in two minutes.
    const daily = /per.?day|PerDay|daily/i.test(body);
    if (daily) { await modelOff(env, model, nextPacificMidnight()); if (tries < 4) return callGemini(env, text, retried, think, tries + 1, opt); }
    await blockUntil(env, daily ? nextPacificMidnight() : new Date(Date.now() + 2 * 60e3).toISOString());
    const e = new Error(daily ? "daily free quota used up; waiting for the reset" : "rate limited; retrying shortly"); e.retry = true; throw e;
  }
  if (!r.ok) {
    const body = await r.text();
    if (r.status === 404 && tries < 4) {
      // A retired model: skip it for a month; if Google names the replacement, add it to the chain.
      const next = body.match(/use (?:models\/)?(gemini-[\w.-]+)/i)?.[1];
      await modelOff(env, model, new Date(Date.now() + 30 * 86400e3).toISOString());
      if (next && next !== model) await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('gemini_model',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(next).run();
      return callGemini(env, text, true, think, tries + 1, opt);
    }
    const e = new Error(`Gemini ${r.status}: ${body.slice(0, 200)}`); e.retry = r.status >= 500; throw e;
  }
  const d = await r.json();
  const out = d.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  if (!out) { const e = new Error(`Gemini returned nothing (${d.candidates?.[0]?.finishReason || d.promptFeedback?.blockReason || "no reason"})`); throw e; }
  return JSON.parse(out);
}

// Copying check: no run of eight words in a row may come from a source.
const words = s => String(s || "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ").split(/\s+/).filter(Boolean);
export function copiedRun(text, sources, n = 8) {
  const grams = new Set();
  for (const s of sources) { const w = words(s); for (let i = 0; i + n <= w.length; i++) grams.add(w.slice(i, i + n).join(" ")); }
  const w = words(text);
  for (let i = 0; i + n <= w.length; i++) { const g = w.slice(i, i + n).join(" "); if (grams.has(g)) return g; }
  return "";
}
const clean = s => String(s || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const wordCount = s => String(s || "").split(/\s+/).filter(Boolean).length;

async function uniqueSlug(env, base) {
  const b = base || id().slice(0, 8);
  for (let i = 1; i < 30; i++) { const s = i === 1 ? b : `${b}-${i}`; if (!(await env.DB.prepare("SELECT 1 FROM articles WHERE slug=?").bind(s).first())) return s; }
  return `${b}-${id().slice(0, 6)}`;
}
const latinSlug = t => String(t).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

// Write one story. Returns the new article's id, or throws.
export async function writeJob(env, job, { onAlert } = {}) {
  const { results: all } = await env.DB.prepare("SELECT * FROM wire_items WHERE job_id=? AND status<>'blocked' ORDER BY published_at").bind(job.id).all();
  if (!all.length) throw new Error("no usable source items");
  // At most one item per outlet, up to four outlets.
  const seen = new Set(), items = [];
  for (const it of all) { if (seen.has(it.source_id)) continue; seen.add(it.source_id); items.push(it); if (items.length === 4) break; }
  for (const it of items) { const t = await sourceText(it.url); it.text = t?.text || ""; }
  const usable = items.filter(it => (it.text || it.summary || "").length >= 120 || it.title.length > 20);
  if (!usable.length) throw new Error("the sources had no readable text");
  let out = await callGemini(env, prompt(job.kind, usable));
  if (out.unusable) { const e = new Error(`not usable: ${out.reason || "no reason given"}`); e.skip = true; throw e; }
  const srcTexts = usable.flatMap(it => [it.title, it.summary, it.text]);
  let copied = ["bn", "en", "hi"].map(l => copiedRun(`${out[l]?.title}\n${out[l]?.body}`, srcTexts)).find(Boolean);
  if (copied) {
    out = await callGemini(env, `${prompt(job.kind, usable)}\n\nYour previous attempt copied this phrase from a source: "${copied}". Rewrite every sentence in your own words.`);
    copied = ["bn", "en", "hi"].map(l => copiedRun(`${out[l]?.title}\n${out[l]?.body}`, srcTexts)).find(Boolean);
    if (copied) throw new Error(`copied phrasing from a source ("${copied}")`);
  }
  const bn = out.bn || {}, en = out.en || {}, hi = out.hi || {};
  if (!bn.title || wordCount(bn.body) < (job.kind === "brief" ? 50 : 80)) throw new Error("the Bengali text came back too short");
  const desk = deskFor(out) || categorize(`${en.title} ${bn.title}`);
  const tags = splitTags((out.tags || []).join(",")).join(",");
  const auto = (await setting(env, "wire_autopublish", "on")) !== "off";
  const aid = id(), slug = await uniqueSlug(env, latinSlug(en.title) || `news-${aid.slice(0, 8)}`), at = now();
  const row = { title: clean(bn.title).slice(0, 180), dek: clean(bn.dek).slice(0, 400), topic: desk, tags, body: clean(bn.body), hero_caption: "" };
  const ver = await textHash(row);
  const tr = (lang, t) => env.DB.prepare(`INSERT OR REPLACE INTO translations (kind,ref,lang,src_ver,title,dek,topic,hero_caption,tags,body,status,model,updated_at) VALUES ('article',?,?,?,?,?,?,'',?,?,'ready','gemini',?)`)
    .bind(aid, lang, ver, clean(t.title).slice(0, 180), clean(t.dek).slice(0, 400), "", "[]", clean(t.body), at);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO articles (id,slug,kind,title,dek,topic,tags,body,category,status,writer,published_at,lang,origin,origin_ref,text_hash,created_at,updated_at,alert_state)
      VALUES (?,?,?,?,?,?,?,?,?,?,'rashtrix-wire',?,'bn','wire',?,?,?,?,'')`).bind(aid, slug, job.kind, row.title, row.dek, desk, tags, row.body, desk, auto ? "published" : "draft", auto ? at : null, job.id, ver, at, at),
    ...(en.title && en.body ? [tr("en", en)] : []), ...(hi.title && hi.body ? [tr("hi", hi)] : []),
    env.DB.prepare("UPDATE wire_jobs SET status='done', article_id=?, error='', updated_at=? WHERE id=?").bind(aid, at, job.id)
  ]);
  if (auto && onAlert && job.kind === "rewrite" && job.sources >= 2) await onAlert({ id: aid, slug, title: row.title }).catch(() => {});
  return aid;
}

// Cron: read sources, group, then write what the quota allows (two stories a minute at most,
// well inside the free tier's per-minute limit).
export async function runWireDesk(env, { onAlert, budget = 2 } = {}) {
  if (!env.DB) return { skipped: "no database" };
  const s = await wireSettings(env);
  const fetched = await fetchSources(env);
  const grouped = await groupItems(env);
  if (!wireReady(env) || s.paused) return { fetched, grouped, written: 0, note: !wireReady(env) ? "GEMINI_API_KEY not set" : "paused" };
  let q = await quota(env);
  // A desk-wide wait (set when every model had run out) is lifted while a model still has some of
  // its day left, e.g. after a new model is added to the chain.
  if (q.blockedUntil && (await modelChain(env)).available.length) { await env.DB.prepare("UPDATE ai_usage SET blocked_until=NULL WHERE day=?").bind(pacificDay()).run(); q = await quota(env); }
  if (!q.left) return { fetched, grouped, written: 0, note: q.blockedUntil ? `waiting until ${q.blockedUntil}` : "daily limit reached" };
  // Round the clock: by any minute of the (Pacific) day the desk may have used its share of the
  // day so far plus one hour's share, so the allowance is never spent by the afternoon.
  const minutes = (Date.now() - Date.parse(`${pacificDay()}T08:00:00Z`)) / 60e3;
  const paced = Math.floor(q.limit * Math.min(1, (Math.max(0, minutes) + 60) / 1440)) - q.calls;
  if (paced <= 0) return { fetched, grouped, written: 0, note: "pacing: the day's allowance is spread round the clock" };
  budget = Math.min(budget, paced);
  // Stories that failed only because a model was retired go back to the queue once.
  await env.DB.prepare("UPDATE wire_jobs SET status='queued', attempts=0, error='' WHERE status='failed' AND (error LIKE 'Gemini 404:%no longer available%' OR error LIKE '%aborted due to timeout%' OR error LIKE 'Gemini took too long%')").run();
  // Stuck jobs (a Worker that stopped mid-way) go back to the queue after ten minutes.
  await env.DB.prepare("UPDATE wire_jobs SET status='queued' WHERE status='working' AND updated_at<?").bind(new Date(Date.now() - 10 * 60e3).toISOString()).run();
  // Two-source stories first, then the oldest.
  const { results: jobs } = await env.DB.prepare("SELECT * FROM wire_jobs WHERE status='queued' ORDER BY (sources>=2) DESC, created_at LIMIT ?").bind(Math.min(budget, q.left)).all();
  let written = 0;
  for (const job of jobs) {
    const claim = await env.DB.prepare("UPDATE wire_jobs SET status='working', attempts=attempts+1, updated_at=? WHERE id=? AND status='queued'").bind(now(), job.id).run();
    if (!claim.meta.changes) continue;
    try { await writeJob(env, job, { onAlert }); written++; }
    catch (e) {
      const status = e.skip ? "skipped" : e.retry && job.attempts < 4 ? "queued" : job.attempts >= 2 ? "failed" : "queued";
      await env.DB.prepare("UPDATE wire_jobs SET status=?, error=?, updated_at=? WHERE id=?").bind(status, String(e.message || e).slice(0, 300), now(), job.id).run();
      if (e.retry) break;   // quota or rate limit: stop for this minute
    }
  }
  return { fetched, grouped, written };
}

// The control room's view of the desk: sources, blocklist, quota and recent stories with what
// each was written from (internal only).
export async function wireDeskReport(env) {
  const [sources, rules, jobs, counts] = await Promise.all([
    env.DB.prepare("SELECT * FROM wire_sources ORDER BY active DESC, name").all(),
    env.DB.prepare("SELECT * FROM wire_blocklist ORDER BY created_at DESC").all(),
    env.DB.prepare("SELECT j.*, a.slug, a.status AS articleStatus FROM wire_jobs j LEFT JOIN articles a ON a.id=j.article_id ORDER BY j.updated_at DESC LIMIT 80").all(),
    env.DB.prepare("SELECT status, COUNT(*) AS n FROM wire_jobs WHERE created_at>=? GROUP BY status").bind(new Date(Date.now() - 864e5).toISOString().replace("T", " ").slice(0, 19)).all()
  ]);
  const ids = jobs.results.map(j => j.id);
  const items = ids.length ? (await env.DB.prepare(`SELECT job_id,source_name,lang,url,title,published_at FROM wire_items WHERE job_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results : [];
  return {
    settings: await wireSettings(env), quota: await quota(env),
    sources: sources.results, blocklist: rules.results,
    counts: Object.fromEntries(counts.results.map(r => [r.status, r.n])),
    jobs: jobs.results.map(j => ({ ...j, items: items.filter(i => i.job_id === j.id) }))
  };
}
export { scriptLang };

/* ---------- One-line Bengali titles for the TV's videos ---------- */
// The "up next" card on Rashtrix TV names the coming video in one Bengali line. The desk writes
// it from the video's YouTube title and description, fifteen videos to a call, only while the
// day's free quota has room to spare; until then (or if it fails) the line is taken from the
// title itself (src/bnline.js).
const LINE_SCHEMA = { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, line: { type: "STRING" } }, required: ["id", "line"] } } }, required: ["items"] };
export async function videoHeadlines(env, n = 15) {
  const { results } = await env.DB.prepare("SELECT yt_id AS id, MAX(title) AS title, MAX(description) AS description FROM tv_items WHERE headline='' AND playable=1 AND excluded=0 GROUP BY yt_id ORDER BY MAX(published_at) DESC LIMIT ?").bind(n).all();
  if (!results.length) return { done: 0 };
  let lines = {};
  const q = wireReady(env) ? await quota(env) : null;
  if (q && !q.blockedUntil && q.left > 150) {
    const text = `For each YouTube video below, write ONE short Bengali headline (at most ten words) that says what the video is about, using its title and description. Bengali words only: leave out the channel's name, "Shorts", "Breaking", "Live", hashtags, emoji, English words, links, dates and every prefix or suffix. No quotation marks and no দাঁড়ি at the end.\n\n${results.map(r => `id: ${r.id}\ntitle: ${r.title}\ndescription: ${String(r.description || "").slice(0, 600)}`).join("\n\n")}`;
    try { const out = await callGemini(env, text, false, false, 0, { system: BENGALI_STYLE, schema: LINE_SCHEMA }); for (const x of out.items || []) lines[x.id] = tidyLine(x.line); } catch (e) { if (!e.retry) console.error("video headlines:", e?.message || e); else return { done: 0, waiting: true }; }
  }
  const stmts = results.map(r => env.DB.prepare("UPDATE tv_items SET headline=? WHERE yt_id=?").bind(lines[r.id] || bnLine(r.title, r.description) || " ", r.id));
  await env.DB.batch(stmts);
  return { done: stmts.length, written: Object.keys(lines).length };
}


/* ---------- Moving earlier stories to the new subject desks (once) ---------- */
// Entertainment, sport and lifestyle stories filed under a place desk before those desks
// existed are moved to them, by their headline and tags. It runs once, on the newest 2,000.
export async function refileSubjects(env) {
  const done = await env.DB.prepare("SELECT value FROM settings WHERE key='desks_subjects_v1'").first().catch(() => null);
  if (done) return { done: 0 };
  const { results } = await env.DB.prepare(`SELECT id, title, dek, tags, category FROM articles WHERE category IN (${PLACE_DESKS.map(() => "?").join(",")}) ORDER BY published_at DESC LIMIT 2000`).bind(...PLACE_DESKS).all();
  const moves = results.map(r => [r.id, subjectDesk(`${r.title} ${r.dek || ""} ${r.tags || ""}`)]).filter(([, d]) => d);
  for (let i = 0; i < moves.length; i += 50) await env.DB.batch(moves.slice(i, i + 50).map(([id, d]) => env.DB.prepare("UPDATE articles SET category=? WHERE id=?").bind(d, id)));
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('desks_subjects_v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(moves.length)).run();
  return { done: moves.length };
}