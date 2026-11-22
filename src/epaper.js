// The e-paper: two editions a day, the morning one at 7:00 and the evening one at 17:00 (India
// time), in Bengali (free for all), English and Hindi (for signed-in readers).
//
// Each edition is built on its own as a draft four hours before its deadline (45 minutes before
// the edition) from the stories the desks sent to the newsprint (Breaking, AVO, Wire and article
// desks: the pool) and the day's published stories, by weight and desk, page by page: the front
// page (a lead with its pictures or video, and seven more), Kolkata, West Bengal, India, the
// world, sports, entertainment and lifestyle, and the horoscope. Until the editor touches it the
// draft is rebuilt every 20 minutes with what is new; the editor chooses the lead, moves and
// orders stories and their pictures, and approves it. The owner and the people they choose are
// reminded from four hours before the deadline (every 30 minutes, every 10 in the last hour)
// until it is approved. At the edition's time it is printed whatever happens: the English and
// Hindi pages are made then, and the paper goes out.
import { bulletinRank, deskKey } from "./labels.js";
import { translateTexts } from "./mt.js";
import { geminiJSON, BENGALI_STYLE } from "./wiredesk.js";
import { sendPush } from "./push.js";
import { ownerPush, ownerTelegram } from "./ownerbrief.js";
import { writer } from "./writers.js";
import { bangabda, weather } from "./extras.js";

const IST = 5.5 * 3600e3, DEADLINE = 45 * 60e3, REMIND = 4 * 3600e3, BUILD_EVERY = 20 * 60e3;
export const SLOTS = { morning: 7, evening: 17 };
export const SLOT_NAME = { morning: { bn: "প্রভাতী সংস্করণ", en: "Morning Edition", hi: "प्रभात संस्करण" }, evening: { bn: "সান্ধ্য সংস্করণ", en: "Evening Edition", hi: "सांध्य संस्करण" } };
const istDay = ms => new Date(ms + IST).toISOString().slice(0, 10);
export const editionAt = (day, slot) => Date.parse(`${day}T${String(SLOTS[slot]).padStart(2, "0")}:00:00Z`) - IST;
const nowIso = (t = Date.now()) => new Date(t).toISOString();
const bnNum = v => String(v).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
// (a story's text: paragraphs kept, separated by a blank line)
const cleanBody = (v, n = 20000) => String(v ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
const htmlText = h => cleanBody(String(h || "").replace(/<\/(p|h\d|li|blockquote)>|<br\s*\/?>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
const J = (t, d) => { try { return JSON.parse(t || ""); } catch { return d; } };

// The pages, in order: each takes the desks named (the front page takes the best of all).
export const PAGES = [
  { key: "front", title: { bn: "প্রথম পাতা", en: "Front Page", hi: "मुख्य पृष्ठ" } },
  { key: "kolkata", keys: ["kolkata"], title: { bn: "কলকাতা", en: "Kolkata", hi: "कोलकाता" } },
  { key: "bengal", keys: ["bengal"], title: { bn: "পশ্চিমবঙ্গ", en: "West Bengal", hi: "पश्चिम बंगाल" } },
  { key: "india", keys: ["india", "other", "business"], title: { bn: "দেশ", en: "India", hi: "देश" } },
  { key: "world", keys: ["world", "bangladesh"], title: { bn: "বিদেশ", en: "World", hi: "विदेश" } },
  { key: "sports", keys: ["sports"], title: { bn: "খেলা", en: "Sports", hi: "खेल" } },
  { key: "life", keys: ["entertainment", "lifestyle"], title: { bn: "বিনোদন ও জীবনধারা", en: "Entertainment & Life", hi: "मनोरंजन और जीवन" } },
  { key: "stars", title: { bn: "রাশিফল", en: "Horoscope", hi: "राशिफल" } }
];
const pageOf = (desk, text) => { const c = String(desk || "").toLowerCase(); if (c === "entertainment" || c === "lifestyle") return "life"; const k = deskKey(desk, text); return PAGES.find(p => (p.keys || []).includes(k))?.key || "india"; };
export const SIGNS = ["মেষ", "বৃষ", "মিথুন", "কর্কট", "সিংহ", "কন্যা", "তুলা", "বৃশ্চিক", "ধনু", "মকর", "কুম্ভ", "মীন"];

/* ---------- settings: who is reminded ---------- */
export async function epaperSettings(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='epaper:settings'").first();
  return { recipients: [], ...J(r?.value, {}) };
}
async function saveSettings(env, s) { await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('epaper:settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(s)).run(); }

/* ---------- a story for the paper ---------- */
async function mediaOf(env, a) {
  const m = [];
  if (a.video_url) m.push(/youtu/.test(a.video_url) ? { kind: "yt", id: (a.video_url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [])[1] || "" } : { kind: "video", url: a.video_url });
  const avo = await env.DB.prepare("SELECT images, videos FROM avo_stories WHERE article_id=? AND status IN ('ready','off')").bind(a.id).first().catch(() => null);
  if (avo) {
    J(avo.videos, []).forEach(v => { if (v?.kind === "yt" && v.id) m.push({ kind: "yt", id: v.id }); else if (/^(\/clips\/|https:\/\/)/.test(v?.url || "")) m.push({ kind: "video", url: v.url }); });
    J(avo.images, []).forEach((_, i) => m.push({ kind: "img", url: `/api/tv/aimg/${encodeURIComponent(a.id)}/${i}` }));
  }
  for (const u of [a.hero_url, a.image_url]) if (u && !m.some(x => x.url === u)) m.push({ kind: "img", url: u });
  if (!m.some(x => x.kind === "img")) { const b = await env.DB.prepare("SELECT url FROM bulletin_images WHERE article_id=? AND url<>''").bind(a.id).first().catch(() => null); if (b) m.push({ kind: "img", url: `/api/tv/bimg/${encodeURIComponent(a.id)}` }); }
  return m.filter(x => x.url || x.id).slice(0, 6);
}
const firstLine = t => clean(String(t || "").replace(/<[^>]+>/g, " "), 600).split(/(?<=[।.!?])\s/)[0] || "";
async function articleItem(env, a, from = "") {
  return { ref: `a:${a.id}`, byline: a.kind === "article" && a.writer && a.writer !== "rashtrix-desk" ? clean(writer(a.writer)?.name, 120) : "", title: clean(a.title, 240), dek: clean(a.dek, 360) || firstLine(a.body), desk: a.category || "", slug: a.slug, kind: a.kind || "article", at: a.published_at, from, page: pageOf(a.category, `${a.title} ${String(a.body || "").slice(0, 300)}`), media: await mediaOf(env, a), pri: bulletinRank(a.category, `${a.title} ${String(a.body || "").slice(0, 300)}`) };
}
function poolCard(p) {
  const c = J(p.content, {});
  const media = [...(c.video ? [/youtu/.test(c.video) ? { kind: "yt", id: (c.video.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [])[1] || "" } : { kind: "video", url: c.video }] : []), ...(c.images || []).map(u => ({ kind: "img", url: u }))].filter(x => x.url || x.id).slice(0, 6);
  return { ref: `p:${p.id}`, byline: clean(c.byline, 120), title: clean(c.title, 240), dek: clean(c.dek, 360) || firstLine(c.body), body: cleanBody(c.body), desk: c.desk || "", kind: p.kind, at: p.created_at, from: p.sent_from || p.kind, page: pageOf(c.desk, `${c.title} ${c.body || ""}`), media, pri: bulletinRank(c.desk, `${c.title} ${c.body || ""}`) };
}

/* ---------- building an edition ---------- */
// The stories of an edition: those sent to the newsprint since the last edition's deadline (or in
// the last day), then the day's published Bengali stories, the desk's own and the wire's.
async function candidates(env, day, slot) {
  const at = editionAt(day, slot), from = new Date(at - 10 * 3600e3 - DEADLINE).toISOString(), wide = new Date(at - 26 * 3600e3).toISOString();
  const { results: pool } = await env.DB.prepare("SELECT * FROM epaper_pool WHERE created_at >= ? ORDER BY created_at DESC LIMIT 80").bind(wide.replace("T", " ").slice(0, 19)).all();
  const out = [], seen = new Set();
  for (const p of pool) {
    if (p.kind === "article" || (p.kind === "avo" && p.ref)) {
      const a = await env.DB.prepare("SELECT * FROM articles WHERE id=? AND status='published' AND pulled_at IS NULL").bind(p.ref).first();
      if (a && !seen.has(a.id)) { seen.add(a.id); out.push({ ...(await articleItem(env, a, p.sent_from || p.kind)), sent: true }); continue; }
    }
    if (p.kind !== "article") { const c = poolCard(p); if (c.title && !seen.has(c.title)) { seen.add(c.title); out.push({ ...c, sent: true }); } }
  }
  const pick = async since => (await env.DB.prepare(`SELECT * FROM articles WHERE status='published' AND lang='bn' AND pulled_at IS NULL AND published_at >= ? AND published_at <= ? ORDER BY published_at DESC LIMIT 140`).bind(since, new Date(at).toISOString()).all()).results;
  let rows = await pick(from); if (rows.length < 24) rows = await pick(wide);
  for (const a of rows) if (!seen.has(a.id)) { seen.add(a.id); out.push(await articleItem(env, a)); }
  return out;
}
const hasPic = x => (x.media || []).length > 0;
const rank = (a, b) => (b.sent ? 1 : 0) - (a.sent ? 1 : 0) || a.pri - b.pri || (hasPic(b) ? 1 : 0) - (hasPic(a) ? 1 : 0) || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0);
function layout(items, lead = "") {
  const all = items.slice().sort(rank), used = new Set(), take = x => { used.add(x.ref); return x; };
  const first = all.find(x => x.ref === lead) || all.find(hasPic) || all[0];
  const pages = PAGES.map(p => ({ key: p.key, title: p.title.bn, items: [] }));
  if (first) pages[0].items.push(take(first));
  all.filter(x => !used.has(x.ref)).slice(0, 7).forEach(x => pages[0].items.push(take(x)));
  for (const x of all) { if (used.has(x.ref)) continue; const pg = pages.find(p => p.key === x.page); if (pg && pg.items.length < 9) pg.items.push(take(x)); }
  return pages.filter(p => p.key === "front" || p.key === "stars" || p.items.length);
}
async function horoscope(env, day, slot) {
  const schema = { type: "OBJECT", properties: { signs: { type: "ARRAY", items: { type: "OBJECT", properties: { bn: { type: "STRING" }, en: { type: "STRING" }, hi: { type: "STRING" } }, required: ["bn", "en", "hi"] } } }, required: ["signs"] };
  const system = `You write a newspaper's daily horoscope column for Rashtrix 24×7 News (Kolkata), in Bengali, English and Hindi; the three say the same thing. Twelve signs in order: Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces. For each, two short sentences (about 25 words) of gentle, warm, everyday guidance (work, money, family, health, a lucky colour or number); never frightening, never a medical or financial instruction.\n\n${BENGALI_STYLE}`;
  try { const r = await geminiJSON(env, system, `The ${slot === "morning" ? "morning" : "evening"} edition of ${day}. Write the twelve signs.`, schema); const s = (r?.signs || []).slice(0, 12); if (s.length === 12) return { bn: s.map(x => clean(x.bn, 400)), en: s.map(x => clean(x.en, 400)), hi: s.map(x => clean(x.hi, 400)) }; } catch { /* none today */ }
  return {};
}
export async function buildEdition(env, day, slot, { force = false, t = Date.now() } = {}) {
  const id = `${day}:${slot}`, row = await env.DB.prepare("SELECT * FROM epaper_editions WHERE id=?").bind(id).first();
  if (row && (row.status === "published" || (row.touched && !force))) return row;
  const items = await candidates(env, day, slot), pages = layout(items, row?.lead || "");
  const lead = pages[0]?.items[0]?.ref || "", hz = row && Object.keys(J(row.horoscope, {})).length ? row.horoscope : JSON.stringify(await horoscope(env, day, slot));
  await env.DB.prepare(`INSERT INTO epaper_editions (id,day,slot,status,lead,pages,horoscope,built_at,updated_at) VALUES (?,?,?,'draft',?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET lead=excluded.lead, pages=excluded.pages, horoscope=excluded.horoscope, built_at=excluded.built_at, updated_at=excluded.updated_at, touched=CASE WHEN ? THEN 0 ELSE touched END, lang_edits=CASE WHEN ? THEN '{}' ELSE lang_edits END`)
    .bind(id, day, slot, lead, JSON.stringify(pages), hz, nowIso(t), nowIso(t), force ? 1 : 0, force ? 1 : 0).run();
  return env.DB.prepare("SELECT * FROM epaper_editions WHERE id=?").bind(id).first();
}

/* ---------- English and Hindi pages, made at print ---------- */
async function localise(env, pages, lang) {
  const out = structuredClone(pages);
  const refs = out.flatMap(p => p.items).filter(x => x.ref.startsWith("a:")).map(x => x.ref.slice(2));
  const tr = new Map();
  for (let i = 0; i < refs.length; i += 80) {
    const part = refs.slice(i, i + 80);
    const { results } = await env.DB.prepare(`SELECT ref,title,dek FROM translations WHERE kind='article' AND lang=? AND status IN ('ready','manual') AND ref IN (${part.map(() => "?").join(",")})`).bind(lang, ...part).all().catch(() => ({ results: [] }));
    results.forEach(r => tr.set(r.ref, r));
  }
  const want = [];
  for (const p of out) {
    p.title = PAGES.find(x => x.key === p.key)?.title[lang] || p.title;
    for (const x of p.items) { const t = x.ref.startsWith("a:") && !x.edited ? tr.get(x.ref.slice(2)) : null; if (t?.title) { x.title = t.title; x.dek = t.dek || x.dek; } else want.push(x); }
  }
  // (what has no translation yet: machine-translated now, from Bengali)
  if (want.length) {
    const texts = want.flatMap(x => [x.title, x.dek || "", x.body || ""]);
    const done = await translateTexts(env, lang, texts, { from: "bn" }).catch(() => texts);
    want.forEach((x, i) => { x.title = done[i * 3] || x.title; x.dek = done[i * 3 + 1] || x.dek; if (x.body) x.body = done[i * 3 + 2] || x.body; });
  }
  return out;
}
const TEXT_MAX = 1100;
const excerpt = (body, n = TEXT_MAX) => { const t = htmlText(body); if (t.length <= n) return t; const cut = t.slice(0, n), end = Math.max(cut.lastIndexOf("।"), cut.lastIndexOf(". "), cut.lastIndexOf("\n")); return (end > n * .5 ? cut.slice(0, end + 1) : cut).trim(); };
async function addText(env, pages, lang) {
  const items = pages.flatMap(p => p.items), ids = [...new Set(items.filter(x => x.ref.startsWith("a:") && !x.body).map(x => x.ref.slice(2)))];
  const art = new Map(), tr = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80), q = part.map(() => "?").join(",");
    (await env.DB.prepare(`SELECT id, lang, body FROM articles WHERE id IN (${q})`).bind(...part).all()).results.forEach(r => art.set(r.id, r));
    (await env.DB.prepare(`SELECT ref, body FROM translations WHERE kind='article' AND lang=? AND status IN ('ready','manual') AND body<>'' AND ref IN (${q})`).bind(lang, ...part).all().catch(() => ({ results: [] }))).results.forEach(r => tr.set(r.ref, r.body));
  }
  const want = {};
  for (const x of items) {
    if (x.body) { x.text = excerpt(x.body, TEXT_MAX * 2); continue; }
    if (!x.ref.startsWith("a:")) { x.text = x.dek || ""; continue; }
    const a = art.get(x.ref.slice(2)); if (!a) { x.text = x.dek || ""; continue; }
    if ((a.lang || "bn") === lang) x.text = excerpt(a.body);
    else if (tr.get(a.id)) x.text = excerpt(tr.get(a.id));
    else (want[a.lang || "bn"] ||= []).push([x, excerpt(a.body, 700)]);
  }
  // (no translation of the story yet: its opening, machine-translated; else the translated summary,
  // never another language's text)
  for (const [from, list] of Object.entries(want)) {
    const src = list.map(([, t]) => t), done = await translateTexts(env, lang, src, { from }).catch(() => src);
    list.forEach(([x], i) => { x.text = done[i] && done[i] !== src[i] ? done[i] : (x.dek || ""); });
  }
  return pages;
}
export async function printEdition(env, id, by = "auto", t = Date.now()) {
  const row = await env.DB.prepare("SELECT * FROM epaper_editions WHERE id=?").bind(id).first(); if (!row) return null;
  const pages = J(row.pages, []), own = J(row.lang_edits, {});
  const made = async l => addText(env, own[l]?.length ? structuredClone(own[l]) : await localise(env, pages, l), l);
  const langs = { bn: await addText(env, structuredClone(pages), "bn"), en: await made("en"), hi: await made("hi") };
  await env.DB.prepare("UPDATE epaper_editions SET status='published', langs=?, published_at=?, updated_at=?, approved_by=COALESCE(approved_by,?) WHERE id=?").bind(JSON.stringify(langs), nowIso(t), nowIso(t), by, id).run();
  return true;
}

/* ---------- reminders ---------- */
async function remind(env, row, minsLeft, t) {
  const s = await epaperSettings(env), name = SLOT_NAME[row.slot].bn, dl = new Date(editionAt(row.day, row.slot) - DEADLINE + IST).toISOString().slice(11, 16);
  const title = `ই-পেপার: ${name} অনুমোদনের অপেক্ষায়`, body = `শেষ সময় ${bnNum(dl)}। আর ${bnNum(minsLeft)} মিনিট বাকি। খসড়া তৈরি আছে, দেখে অনুমোদন করুন।`, url = "/newsprint.html";
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('epaper_alert',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({ title, body, url, at: nowIso() })).run();
  await ownerPush(env, { title, body, url }).catch(() => {});
  await ownerTelegram(env, `<b>${title}</b>\n${body}\n${env.SITE_URL || ""}${url}`).catch(() => {});
  const ids = (s.recipients || []).filter(Boolean).slice(0, 20);
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT endpoint FROM push_subscriptions WHERE user_id IN (${ids.map(() => "?").join(",")}) LIMIT 40`).bind(...ids).all().catch(() => ({ results: [] }));
    const subject = env.SITE_URL || "mailto:alerts@rashtrix.invalid";
    await Promise.all(results.map(x => sendPush(env, x.endpoint, subject)));
  }
  await env.DB.prepare("UPDATE epaper_editions SET reminded_at=? WHERE id=?").bind(nowIso(t), row.id).run();
}

/* ---------- the cron step (every minute) ---------- */
export async function epaperStep(env, t = Date.now()) {
  const done = [];
  for (const d of [istDay(t), istDay(t + 864e5)]) for (const slot of Object.keys(SLOTS)) {
    const at = editionAt(d, slot), deadline = at - DEADLINE, start = deadline - REMIND;
    if (t < start || t > at + 30 * 60e3) continue;
    const id = `${d}:${slot}`;
    let row = await env.DB.prepare("SELECT * FROM epaper_editions WHERE id=?").bind(id).first();
    if (row?.status === "published") continue;
    // the draft: built, then rebuilt every 20 minutes while no one has touched it
    if (!row || (!row.touched && row.status === "draft" && t < at && t - Date.parse(row.built_at || 0) > BUILD_EVERY)) { row = await buildEdition(env, d, slot, { t }); done.push(`built ${id}`); }
    // reminders until it is approved: every 30 minutes, every 10 in the last hour before the deadline
    if (row.status === "draft" && t >= start && t < deadline) {
      const left = deadline - t, every = left <= 3600e3 ? 10 * 60e3 : 30 * 60e3;
      if (!row.reminded_at || t - Date.parse(row.reminded_at) >= every - 30e3) { await remind(env, row, Math.ceil(left / 60e3), t); done.push(`reminded ${id}`); }
    }
    // at the edition's time it is printed, approved or not
    if (t >= at) { if (!row.touched && row.status === "draft") row = await buildEdition(env, d, slot, { t }); await printEdition(env, id, "auto", t); done.push(`printed ${id}`); }
  }
  return done.length ? done : null;
}

/* ---------- what readers read ---------- */
export async function readerEdition(env, { day, slot, lang = "bn" } = {}) {
  const row = day && slot
    ? await env.DB.prepare("SELECT * FROM epaper_editions WHERE id=? AND status='published'").bind(`${day}:${slot}`).first()
    : await env.DB.prepare("SELECT * FROM epaper_editions WHERE status='published' ORDER BY published_at DESC LIMIT 1").first();
  if (!row) return null;
  const langs = J(row.langs, {});
  let pages = langs[lang] || (lang === "bn" ? J(row.pages, []) : langs.en || J(row.pages, []));
  // (an edition printed before the paper carried its stories' text: the text added once, and kept)
  if (!pages.some(p => p.items.some(x => x.text))) {
    pages = await addText(env, structuredClone(pages), lang).catch(() => pages);
    if (pages.some(p => p.items.some(x => x.text))) { langs[lang] = pages; await env.DB.prepare("UPDATE epaper_editions SET langs=? WHERE id=?").bind(JSON.stringify(langs), row.id).run().catch(() => {}); }
  }
  const hz = J(row.horoscope, {});
  // a story changed since the paper went out: marked (the paper knows the news)
  const ids = pages.flatMap(p => p.items).filter(x => x.ref.startsWith("a:")).map(x => x.ref.slice(2));
  const upd = new Set();
  if (ids.length) { const { results } = await env.DB.prepare(`SELECT id FROM articles WHERE id IN (${ids.map(() => "?").join(",")}) AND (updated_at > ? OR corrected_at > ?)`).bind(...ids, row.published_at, row.published_at).all().catch(() => ({ results: [] })); results.forEach(r => upd.add(`a:${r.id}`)); }
  pages.forEach(p => p.items.forEach(x => { if (upd.has(x.ref)) x.updated = true; delete x.pri; }));
  const { results: list } = await env.DB.prepare("SELECT id, day, slot FROM epaper_editions WHERE status='published' ORDER BY published_at DESC LIMIT 30").all();
  const at = editionAt(row.day, row.slot), wx = await weather(env).catch(() => null);
  return { id: row.id, day: row.day, slot: row.slot, lang, name: SLOT_NAME[row.slot][lang], publishedAt: row.published_at, at: new Date(at).toISOString(), bangabda: bangabda(at).text, weather: wx ? { temp: wx.temp, text: wx.text } : null, pages, horoscope: hz[lang] || hz.bn || [], editions: list };
}

/* ---------- the control room (the Newsprint desk) ---------- */
export async function sendToNewsprint(env, user, b) {
  const kind = ["article", "avo", "breaking"].includes(b.kind) ? b.kind : "article", ref = clean(b.id, 120);
  if (kind === "article" && !ref) throw new Error("Which story?");
  let content = {};
  if (kind === "article") { const a = await env.DB.prepare("SELECT title FROM articles WHERE id=?").bind(ref).first(); if (!a) throw new Error("Story not found."); content = { title: a.title }; }
  if (kind === "avo") {
    const r = await env.DB.prepare("SELECT * FROM avo_stories WHERE article_id=?").bind(ref).first(); if (!r) throw new Error("AVO story not found.");
    const vids = J(r.videos, []).map(v => v?.url || "").filter(Boolean);
    content = { title: r.title, body: J(r.script, []).join(" "), desk: r.desk, images: J(r.images, []).map((_, i) => `/api/tv/aimg/${encodeURIComponent(ref)}/${i}`), video: vids[0] || "" };
  }
  if (kind === "breaking") { const c = b.content || {}; content = { title: clean(c.title, 240), dek: clean(c.dek, 360), body: cleanBody(c.body), desk: clean(c.desk, 40), images: (c.images || []).filter(u => /^(\/media\/|\/clips\/|https:\/\/)/.test(u)).slice(0, 4), video: /^(\/clips\/|https:\/\/)/.test(c.video || "") ? c.video : "" }; if (!content.title) throw new Error("A headline is needed."); }
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO epaper_pool (id,kind,ref,content,sent_by,sent_from) VALUES (?,?,?,?,?,?)").bind(id, kind, ref, JSON.stringify(content), user.id, clean(b.from || kind, 30)).run();
  return { id };
}
const SAFE_ITEM = x => ({ ref: clean(x.ref, 140), title: clean(x.title, 240), dek: clean(x.dek, 360), body: x.body ? cleanBody(x.body) : undefined, byline: clean(x.byline, 120), edited: !!x.edited, desk: clean(x.desk, 40), slug: clean(x.slug, 200), kind: clean(x.kind, 20), at: clean(x.at, 40), from: clean(x.from, 30), page: clean(x.page, 20), media: (Array.isArray(x.media) ? x.media : []).filter(m => m && (m.url || m.id)).slice(0, 6).map(m => ({ kind: ["img", "video", "yt"].includes(m.kind) ? m.kind : "img", url: m.url ? clean(m.url, 600) : undefined, id: m.id ? clean(m.id, 20) : undefined })), sent: !!x.sent });
export async function handleNewsprint(request, env, url, user, { json, err, audit, isOwner }) {
  const parts = url.pathname.split("/").slice(4).map(decodeURIComponent), m = request.method;   // after /api/admin/epaper
  const b = ["GET", "DELETE"].includes(m) ? {} : await request.json().catch(() => ({}));
  const ok = (x = {}) => json({ ok: true, ...x }, 200, { "cache-control": "no-store" });
  if (!parts[0] && m === "GET") {
    const t = Date.now(), [eds, pool, s, users] = await Promise.all([
      env.DB.prepare("SELECT id,day,slot,status,touched,lead,built_at,approved_by,approved_at,published_at,reminded_at FROM epaper_editions ORDER BY day DESC, slot DESC LIMIT 12").all(),
      env.DB.prepare("SELECT * FROM epaper_pool ORDER BY created_at DESC LIMIT 60").all(), epaperSettings(env),
      env.DB.prepare("SELECT id, display_name AS name, email, role FROM users WHERE role IN ('admin','editor') ORDER BY role, display_name LIMIT 60").all().catch(() => ({ results: [] }))]);
    // the next two editions, with their deadlines
    const next = []; for (const d of [istDay(t), istDay(t + 864e5)]) for (const slot of Object.keys(SLOTS)) { const at = editionAt(d, slot); if (at > t - 30 * 60e3) next.push({ id: `${d}:${slot}`, day: d, slot, at: new Date(at).toISOString(), deadline: new Date(at - DEADLINE).toISOString(), draftFrom: new Date(at - DEADLINE - REMIND).toISOString() }); }
    return json({ editions: eds.results, next: next.slice(0, 2), pool: pool.results.map(p => ({ ...p, content: J(p.content, {}) })), settings: s, owner: !!isOwner, users: users.results.map(u => ({ id: u.id, name: u.name || u.email, role: u.role })) }, 200, { "cache-control": "no-store" });
  }
  const LG = ["en", "hi"].includes(url.searchParams.get("lang") || b.lang) ? (url.searchParams.get("lang") || b.lang) : "bn";
  if (parts[0] === "story" && m === "GET" && LG !== "bn") {
    // (its translation when there is one, else the Bengali put into the language now)
    const ref = url.searchParams.get("ref") || "";
    let src = { title: "", dek: "", body: "", byline: "" };
    if (ref.startsWith("a:")) {
      const t = await env.DB.prepare("SELECT title, dek, body FROM translations WHERE kind='article' AND ref=? AND lang=? AND status IN ('ready','manual')").bind(ref.slice(2), LG).first().catch(() => null);
      if (t?.body) return json({ title: t.title || "", dek: t.dek || "", body: htmlText(t.body), byline: "" }, 200, { "cache-control": "no-store" });
      const a = await env.DB.prepare("SELECT title, dek, body, lang FROM articles WHERE id=?").bind(ref.slice(2)).first();
      if (a) { if ((a.lang || "bn") === LG) return json({ title: a.title, dek: a.dek || "", body: htmlText(a.body), byline: "" }, 200, { "cache-control": "no-store" }); src = { title: a.title, dek: a.dek || "", body: htmlText(a.body).slice(0, 4000) }; }
    } else if (ref.startsWith("p:")) { const q = await env.DB.prepare("SELECT content FROM epaper_pool WHERE id=?").bind(ref.slice(2)).first(); const c = J(q?.content, {}); src = { title: c.title || "", dek: c.dek || "", body: htmlText(cleanBody(c.body)).slice(0, 4000) }; }
    if (!src.body) return json({ title: "", dek: "", body: "", byline: "" }, 200, { "cache-control": "no-store" });
    const done = await translateTexts(env, LG, [src.body], { from: "bn" }).catch(() => [""]);
    return json({ title: "", dek: "", body: done[0] && done[0] !== src.body ? done[0] : "", byline: "" }, 200, { "cache-control": "no-store" });
  }
  // stories added to the English or Hindi pages: their headlines put into the language
  if (parts[0] === "localise" && m === "POST") {
    if (LG === "bn") return ok({ items: b.items || [] });
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 12).map(SAFE_ITEM).filter(x => x.ref && x.title);
    const [pg] = await localise(env, [{ key: "front", title: "", items }], LG);
    return ok({ items: pg.items });
  }
  if (parts[0] === "story" && m === "GET") {
    const ref = url.searchParams.get("ref") || "";
    if (ref.startsWith("a:")) { const a = await env.DB.prepare("SELECT title, dek, body, kind, writer FROM articles WHERE id=?").bind(ref.slice(2)).first(); if (!a) return err("Story not found.", 404); return json({ title: a.title, dek: a.dek || "", body: htmlText(a.body), byline: a.kind === "article" && a.writer ? writer(a.writer)?.name || "" : "" }, 200, { "cache-control": "no-store" }); }
    if (ref.startsWith("p:")) { const p = await env.DB.prepare("SELECT content FROM epaper_pool WHERE id=?").bind(ref.slice(2)).first(); const c = J(p?.content, {}); return json({ title: c.title || "", dek: c.dek || "", body: cleanBody(c.body), byline: c.byline || "" }, 200, { "cache-control": "no-store" }); }
    return json({ title: "", dek: "", body: "", byline: "" }, 200, { "cache-control": "no-store" });
  }
  if (parts[0] === "send" && m === "POST") { try { const r = await sendToNewsprint(env, user, b); await audit("epaper.send", "epaper", r.id, { kind: b.kind, from: b.from }); return ok(r); } catch (e) { return err(e.message); } }
  if (parts[0] === "pool" && parts[1] && m === "DELETE") { await env.DB.prepare("DELETE FROM epaper_pool WHERE id=?").bind(parts[1]).run(); return ok(); }
  if (parts[0] === "settings" && m === "PUT") {
    if (!isOwner) return err("Only the owner chooses who is reminded.", 403);
    await saveSettings(env, { recipients: (Array.isArray(b.recipients) ? b.recipients : []).map(x => clean(x, 80)).filter(Boolean).slice(0, 20) });
    await audit("epaper.settings", "epaper", "", {}); return ok();
  }
  const id = parts[0] && /^\d{4}-\d{2}-\d{2}:(morning|evening)$/.test(parts[0]) ? parts[0] : "";
  if (!id) return err("Not found.", 404);
  const [day, slot] = id.split(":");
  if (!parts[1] && m === "GET") {
    let row = await env.DB.prepare("SELECT * FROM epaper_editions WHERE id=?").bind(id).first();
    if (!row) row = await buildEdition(env, day, slot);
    // everything that could go in it (to add by hand)
    const items = (await candidates(env, day, slot)).sort(rank);
    // English and Hindi: as edited by hand, else as printed, else made now from the Bengali draft
    let pages = J(row.pages, []), own = false, auto = false;
    if (LG !== "bn") { const e = J(row.lang_edits, {})[LG], pr = J(row.langs, {})[LG]; if (e?.length) { pages = e; own = true; } else if (row.status === "published" && pr?.length) pages = pr; else { pages = await localise(env, pages, LG); auto = true; } }
    else if (row.status === "published" && J(row.langs, {}).bn?.length) pages = J(row.langs, {}).bn;
    pages.forEach(p => p.items.forEach(x => { delete x.text; delete x.updated; delete x.pri; }));
    const langs = J(row.lang_edits, {});
    return json({ edition: { ...row, pages, lang: LG, own, auto, edited: { en: !!langs.en?.length, hi: !!langs.hi?.length }, horoscope: J(row.horoscope, {}), langs: undefined, lang_edits: undefined }, candidates: items, deadline: new Date(editionAt(day, slot) - DEADLINE).toISOString(), at: new Date(editionAt(day, slot)).toISOString() }, 200, { "cache-control": "no-store" });
  }
  const row = await env.DB.prepare("SELECT * FROM epaper_editions WHERE id=?").bind(id).first();
  if (parts[1] === "build" && m === "POST") { if (row?.status === "published") return err("This edition is already out."); await buildEdition(env, day, slot, { force: true }); await audit("epaper.build", "epaper", id, {}); return ok(); }
  if (!row) return err("Not found.", 404);
  if (!parts[1] && m === "PUT") {
    const out = row.status === "published";
    const pages = (Array.isArray(b.pages) ? b.pages : []).filter(p => PAGES.some(x => x.key === p.key)).map(p => ({ key: p.key, title: PAGES.find(x => x.key === p.key).title[LG], items: (p.items || []).slice(0, 12).map(SAFE_ITEM).filter(x => x.ref && x.title) }));
    if (!pages.length || !pages[0].items.length) return err("The front page needs at least its lead story.");
    const langs = J(row.langs, {}), own = J(row.lang_edits, {});
    // (a printed paper: the readers' pages are made again from these at once, with their text)
    if (out) langs[LG] = await addText(env, structuredClone(pages), LG);
    if (LG === "bn") {
      await env.DB.prepare("UPDATE epaper_editions SET pages=?, lead=?, langs=?, touched=1, status=CASE WHEN status='approved' THEN 'draft' ELSE status END, updated_at=? WHERE id=?").bind(JSON.stringify(pages), pages[0].items[0].ref, JSON.stringify(langs), nowIso(), id).run();
    } else {
      own[LG] = pages;
      await env.DB.prepare("UPDATE epaper_editions SET lang_edits=?, langs=?, touched=1, status=CASE WHEN status='approved' THEN 'draft' ELSE status END, updated_at=? WHERE id=?").bind(JSON.stringify(own), JSON.stringify(langs), nowIso(), id).run();
    }
    await audit("epaper.edit", "epaper", id, { lang: LG, printed: out }); return ok();
  }
  // English or Hindi made again from the Bengali (the hand edits in that language are dropped)
  if (parts[1] === "relang" && m === "POST") {
    if (LG === "bn") return err("Choose English or Hindi.");
    const own = J(row.lang_edits, {}); delete own[LG];
    const langs = J(row.langs, {});
    if (row.status === "published") langs[LG] = await addText(env, await localise(env, J(row.pages, []), LG), LG);
    await env.DB.prepare("UPDATE epaper_editions SET lang_edits=?, langs=?, updated_at=? WHERE id=?").bind(JSON.stringify(own), JSON.stringify(langs), nowIso(), id).run();
    await audit("epaper.relang", "epaper", id, { lang: LG }); return ok();
  }
  if (parts[1] === "approve" && m === "POST") {
    if (row.status === "published") return err("This edition is already out.");
    await env.DB.prepare("UPDATE epaper_editions SET status=?, touched=1, approved_by=?, approved_at=?, updated_at=? WHERE id=?").bind(b.undo ? "draft" : "approved", b.undo ? null : (user.display_name || user.email), b.undo ? null : nowIso(), nowIso(), id).run();
    await audit(b.undo ? "epaper.unapprove" : "epaper.approve", "epaper", id, {}); return ok();
  }
  if (parts[1] === "print" && m === "POST") {
    if (row.status === "published") return err("This edition is already out.");
    await printEdition(env, id, user.display_name || user.email); await audit("epaper.print", "epaper", id, {}); return ok();
  }
  return err("Not found.", 404);
}
