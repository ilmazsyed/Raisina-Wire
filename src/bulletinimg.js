// Pictures for the TV bulletin. For each story in it: first the lead photo of the news reports
// the story was written from (their og:image), credited to that publication ("ছবি: সৌজন্যে …"),
// never from a television channel (their pictures are thumbnails with logos and text);
// failing that, a photograph under a free licence from Wikimedia Commons (or Openverse), found by English search
// terms the wire desk's model suggests, credited with its author and licence. Every picture
// carries its credit on screen in small type. A story with nothing suitable is shown without one.
// Runs in the minute cron, a few stories at a time; each story is looked up once (again after
// twelve hours if nothing was found). The app loads the pictures through /api/tv/bimg/<id>, so
// publishers that refuse other sites' pages still show.
import { imageTerms } from "./wiredesk.js";

const UA = "RashtrixTV/1.0 (bulletin pictures; https://rashtrix.ilmazsyed.workers.dev)";
const FREE = /^(cc0|public domain|pd\b|pd-|cc[- ]by(-sa)?[- ]\d)/i;
const strip = h => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function commonsAll(query, max = 6) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "10", gsrsearch: `${query} filetype:bitmap`, prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "1280" })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return [];
  const out = [];
  const pages = Object.values((await r.json()).query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  // Relevance: the file's name or description must mention a word of the query.
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
  for (const p of pages) {
    const ii = p.imageinfo?.[0], md = ii?.extmetadata || {};
    if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime) || ii.width < 800 || ii.height < 450) continue;
    const licence = strip(md.LicenseShortName?.value);
    if (!FREE.test(licence)) continue;
    const about = `${p.title} ${strip(md.ImageDescription?.value)} ${strip(md.ObjectName?.value)}`.toLowerCase();
    if (words.length && !words.some(w => about.includes(w))) continue;
    const author = strip(md.Artist?.value).slice(0, 60) || "Unknown";
    const pd = /public domain|^pd|cc0/i.test(licence);
    out.push({ url: ii.thumburl || ii.url, page: ii.descriptionurl || "", credit: `ছবি: ${author}${pd ? "" : `, ${licence}`} · Wikimedia Commons` });
    if (out.length >= max) break;
  }
  return out;
}
const commons = async query => (await commonsAll(query, 1))[0] || null;

// Openverse (Flickr and other open collections): free-licence photographs, landscape and large.
async function openverseAll(query, max = 6) {
  const u = new URL("https://api.openverse.org/v1/images/");
  Object.entries({ q: query, license: "by,by-sa,cc0,pdm", aspect_ratio: "wide", size: "large", mature: "false", page_size: "10" }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return [];
  const out = [];
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
  for (const it of (await r.json()).results || []) {
    if (!it.url || (it.width && it.width < 800) || (it.height && it.height < 450) || THUMB.test(it.url)) continue;
    const about = `${it.title || ""} ${(it.tags || []).map(t => t.name).join(" ")}`.toLowerCase();
    if (words.length && !words.some(w => about.includes(w))) continue;
    const lic = /^(cc0|pdm)$/i.test(it.license) ? "" : `, CC ${String(it.license).toUpperCase()} ${it.license_version || ""}`.trimEnd();
    const where = it.source ? it.source[0].toUpperCase() + it.source.slice(1) : "Openverse";
    out.push({ url: it.url, page: it.foreign_landing_url || "", credit: `ছবি: ${String(it.creator || "Unknown").slice(0, 60)}${lic} · ${where}` });
    if (out.length >= max) break;
  }
  return out;
}
const openverse = async query => (await openverseAll(query, 1))[0] || null;

// A publication's name for the credit, from the wire feed's internal label ("ABP ANANDA DIST" →
// "ABP Ananda"): section words dropped, capitals eased (short acronyms kept).
const SECTION = /\b(DIST(RICT)?S?|KOLKATA|STATE|BENGAL|NATIONAL|INDIA|WORLD|SPORTS?|ENTERTAINMENT|BUSINESS|LIFESTYLE|POLITICS|LATEST|TOP|FEED|RSS|NEWS FEED|HOME)\b/gi;
export function pubName(label) {
  let n = String(label || "").replace(SECTION, " ").replace(/[-–|·:]+\s*$/, "").replace(/\s+/g, " ").trim() || String(label || "").trim();
  if (n === n.toUpperCase() && /[A-Z]/.test(n)) n = n.split(" ").map(w => w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()).join(" ");
  return n;
}
export const cleanCredit = c => String(c || "").replace(/^(ছবি: সৌজন্যে )(.+)$/, (_, a, b) => a + pubName(b));

// Television channels (and publishers that print text on their share pictures) are never used:
// their pictures are video thumbnails carrying the channel's logo, captions and graphics. Their
// stories get a clean photograph from Commons instead.
const BROADCAST = /abp|ananda\b|zee|24\s*ghanta|news\s*18|tv\s*9|republic|kolkata\s*tv|ndtv|aaj\s*tak|india\s*today|times\s*now|cnn|wion|mirror\s*now|news\s*nation|calcutta\s*news|hindustan\s*times|\bht\b|jagran|amar\s*ujala|news\s*24|oneindia|youtube/i;
const BROADCAST_HOST = /(^|\.)(abplive|abpananda|abpnews|zeenews|zee24ghanta|zeebiz|news18|tv9bangla|tv9hindi|tv9telugu|republicworld|kolkatatv|ndtv|aajtak|indiatoday|timesnownews|wionews|hindustantimes|livehindustan|jagran|amarujala|news24online|oneindia|youtube|ytimg)\./i;
const THUMB = /thumb|ytimg|video|youtube|watermark|share[-_]?card|og[-_]?image|social[-_]?share/i;
export const broadcaster = (name, url) => { try { if (BROADCAST_HOST.test(new URL(url).hostname + ".")) return true; } catch { /* name only */ } return BROADCAST.test(String(name || "")); };

// The lead photo of a web page: og:image, else twitter:image.
const BROWSER_UA = "Mozilla/5.0 (compatible; RashtrixTV/1.0; +https://rashtrix.ilmazsyed.workers.dev)";
// A publication's own logo or house card (the picture a site shares when a report has no photo of
// its own) is never used: by its address, and by being the same picture the site's front page shares.
const HOUSE = /logo|placeholder|default|fallback|og[-_]?image|share[-_]?(img|image)|social[-_]?(share|image|card)|masthead|brand|no[-_]?image|1x1|spacer|\/theme\/|\/static\/(img|images)\/|\/assets\/(img|images)\//i;
const houseImg = new Map();
const sameImg = (a, b) => { try { const x = new URL(a), y = new URL(b); return x.hostname === y.hostname && x.pathname === y.pathname; } catch { return false; } };
async function siteCard(pageUrl) {
  let origin; try { origin = new URL(pageUrl).origin; } catch { return ""; }
  if (houseImg.has(origin)) return houseImg.get(origin);
  const p = (async () => {
    const r = await fetch(origin + "/", { headers: { "user-agent": BROWSER_UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!r?.ok) return "";
    const html = (await r.text()).slice(0, 150000);
    const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    try { return m ? new URL(m[1].replace(/&amp;/g, "&"), r.url || origin).href : ""; } catch { return ""; }
  })().catch(() => "");
  houseImg.set(origin, p); return p;
}
export const houseLike = u => { try { return HOUSE.test(new URL(u).pathname); } catch { return true; } };
async function pagePhoto(url) {
  const r = await fetch(url, { headers: { "user-agent": BROWSER_UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
  if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) return "";
  const html = (await r.text()).slice(0, 200000);
  const meta = name => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1] || "";
  let img = meta("og:image") || meta("og:image:url") || meta("twitter:image") || meta("twitter:image:src");
  img = img.replace(/&amp;/g, "&").trim();
  if (!img) return "";
  let u; try { u = new URL(img, r.url || url); } catch { return ""; }
  if (!/^https?:$/.test(u.protocol) || /favicon/i.test(u.pathname) || houseLike(u.href) || THUMB.test(u.href) || BROADCAST_HOST.test(u.hostname + ".")) return "";
  const card = await siteCard(r.url || url);
  return card && sameImg(card, u.href) ? "" : u.href;
}
// The reports a wire story was written from (kept internally), newest first.
async function sourcePhoto(env, articleId) {
  const { results } = await env.DB.prepare(`SELECT i.url, i.source_name FROM wire_jobs j JOIN wire_items i ON i.job_id=j.id WHERE j.article_id=? ORDER BY i.published_at DESC LIMIT 4`).bind(articleId).all().catch(() => ({ results: [] }));
  for (const it of results) {
    if (broadcaster(it.source_name, it.url)) continue;
    const url = await pagePhoto(it.url).catch(() => "");
    if (url) return { url, page: it.url, credit: `ছবি: সৌজন্যে ${pubName(it.source_name)}` };
  }
  return null;
}

export async function bulletinImages(env, n = 3) {
  // Pictures already taken from a television channel are dropped and looked up again.
  const { results: old } = await env.DB.prepare("SELECT article_id, credit, page, url FROM bulletin_images WHERE query='source' AND url<>''").all().catch(() => ({ results: [] }));
  const redo = old.filter(r => houseLike(r.url) || broadcaster(r.credit.replace(/^ছবি: সৌজন্যে /, ""), r.page) || THUMB.test(r.url) || BROADCAST_HOST.test((() => { try { return new URL(r.url).hostname + "."; } catch { return ""; } })()));
  if (redo.length) await env.DB.batch(redo.map(r => env.DB.prepare("UPDATE bulletin_images SET url='', credit='', query='', checked_at='2000-01-01T00:00:00Z' WHERE article_id=?").bind(r.article_id)));
  const { results: stories } = await env.DB.prepare(`SELECT a.id, a.title, a.dek FROM articles a LEFT JOIN bulletin_images b ON b.article_id=a.id
    WHERE a.status='published' AND a.lang='bn' AND a.pulled_at IS NULL AND a.kind IN ('rewrite','brief') AND a.published_at>=?
      AND (b.article_id IS NULL OR (b.url='' AND b.checked_at<?))
    ORDER BY a.published_at DESC LIMIT ?`).bind(new Date(Date.now() - 24 * 3600e3).toISOString(), new Date(Date.now() - 12 * 3600e3).toISOString(), n).all();
  if (!stories.length) return { done: 0 };
  // The reports' own photos first; Commons only for the stories left without one.
  const hits = new Map();
  for (const s of stories) { const h = await sourcePhoto(env, s.id); if (h) hits.set(s.id, { ...h, query: "source" }); }
  let terms = {};
  const rest = stories.filter(s => !hits.has(s.id));
  if (rest.length) { try { terms = await imageTerms(env, rest); } catch (e) { if (!e?.retry) console.error("bulletin picture terms:", e?.message || e); } }
  const at = new Date().toISOString(), stmts = [];
  let found = 0;
  for (const s of stories) {
    let hit = hits.get(s.id) || null, used = hit ? "source" : "";
    if (!hit) for (const q of terms[s.id] || []) { hit = await commons(q).catch(() => null) || await openverse(q).catch(() => null); used = q; if (hit) break; }
    if (hit) found++;
    stmts.push(env.DB.prepare("INSERT INTO bulletin_images (article_id,url,credit,page,query,checked_at) VALUES (?,?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET url=excluded.url,credit=excluded.credit,page=excluded.page,query=excluded.query,checked_at=excluded.checked_at")
      .bind(s.id, hit?.url || "", hit?.credit || "", hit?.page || "", used, at));
  }
  await env.DB.batch(stmts);
  return { done: stories.length, found };
}

// GET /api/tv/bimg/<article id>: the bulletin picture, fetched once and cached at the edge.
export async function bulletinImageRoute(env, id) {
  const row = await env.DB.prepare("SELECT url FROM bulletin_images WHERE article_id=? AND url<>''").bind(id).first().catch(() => null);
  if (!row) return new Response("Not found", { status: 404 });
  const r = await fetch(row.url, { headers: { "user-agent": BROWSER_UA, accept: "image/*" }, cf: { cacheTtl: 86400, cacheEverything: true }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!r?.ok || !/^image\//.test(r.headers.get("content-type") || "")) return Response.redirect(row.url, 302);
  return new Response(r.body, { headers: { "content-type": r.headers.get("content-type"), "cache-control": "public, max-age=86400" } });
}

// Several clean photographs for one story (the AVO engine wants four or more): every usable
// photo of the reports it was written from (never a television channel's), then Commons and
// Openverse pictures for the search terms, without repeats. Each carries its credit.
export async function storyPhotos(env, story, want = 6) {
  const out = [], seen = new Set(), add = x => { if (x?.url && !seen.has(x.url) && out.length < want) { seen.add(x.url); out.push(x); } };
  const { results } = await env.DB.prepare(`SELECT i.url, i.source_name FROM wire_jobs j JOIN wire_items i ON i.job_id=j.id WHERE j.article_id=? ORDER BY i.published_at DESC LIMIT 6`).bind(story.id).all().catch(() => ({ results: [] }));
  for (const it of results) {
    if (broadcaster(it.source_name, it.url)) continue;
    const url = await pagePhoto(it.url).catch(() => "");
    if (url) add({ url, page: it.url, credit: `ছবি: সৌজন্যে ${pubName(it.source_name)}` });
  }
  let terms = [];
  try { terms = (await imageTerms(env, [story]))[story.id] || []; } catch { /* none today */ }
  for (const q of terms) {
    if (out.length >= want) break;
    for (const x of await commonsAll(q, want).catch(() => [])) add(x);
    if (out.length < want) for (const x of await openverseAll(q, want).catch(() => [])) add(x);
  }
  return out;
}

// News photographs of one particular story, for the AVO engine: the lead photos of the reports it
// was written from, then of other outlets' reports on the same story, found by searching Bing News
// for its headline (Bengali, then the English search terms) and kept only when the report's own
// headline shares words with ours. Never a television channel's picture; no general stock photos
// (a picture with no connection to the story is worse than the channel's text cards).
const words = t => new Set(String(t || "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length >= 3));
const overlap = (a, b) => { const A = words(a); let n = 0; for (const w of words(b)) if (A.has(w)) n++; return n; };
async function newsSearch(query) {
  const u = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
  const r = await fetch(u, { headers: { "user-agent": BROWSER_UA, accept: "application/rss+xml, text/xml" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return [];
  const xml = (await r.text()).slice(0, 300000), out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1], get = tag => (it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").trim();
    let link = get("link");
    try { const q = new URL(link).searchParams.get("url"); if (q) link = q; } catch { continue; }
    out.push({ title: get("title"), url: link, source: get("News:Source") || (() => { try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; } })() });
  }
  return out;
}
export async function newsPhotos(env, story, want = 6) {
  const out = [], seenImg = new Set(), seenHost = new Map(), add = x => {
    if (!x?.url || seenImg.has(x.url) || out.length >= want) return;
    let host = ""; try { host = new URL(x.page || x.url).hostname; } catch { /* none */ }
    if ((seenHost.get(host) || 0) >= 2) return;   // two at most from one outlet
    seenImg.add(x.url); seenHost.set(host, (seenHost.get(host) || 0) + 1); out.push(x);
  };
  // 1. The reports the story was written from.
  const { results } = await env.DB.prepare(`SELECT i.url, i.source_name FROM wire_jobs j JOIN wire_items i ON i.job_id=j.id WHERE j.article_id=? ORDER BY i.published_at DESC LIMIT 6`).bind(story.id).all().catch(() => ({ results: [] }));
  for (const it of results) {
    if (broadcaster(it.source_name, it.url)) continue;
    const url = await pagePhoto(it.url).catch(() => "");
    if (url) add({ url, page: it.url, credit: `ছবি: সৌজন্যে ${pubName(it.source_name)}` });
  }
  // 2. Other outlets' reports on the same story.
  let terms = [];
  if (out.length < want) { try { terms = (await imageTerms(env, [story]))[story.id] || []; } catch { /* none today */ } }
  const tried = new Set(results.map(r => r.url));
  for (const q of [story.title, ...terms.slice(0, 1)]) {
    if (out.length >= want || !q) break;
    const hits = (await newsSearch(q).catch(() => [])).filter(h => !tried.has(h.url) && !broadcaster(h.source, h.url) && overlap(h.title, q) >= (q === story.title ? 2 : 1)).slice(0, 8);
    for (const h of hits) {
      if (out.length >= want) break;
      tried.add(h.url);
      const url = await pagePhoto(h.url).catch(() => "");
      if (url) add({ url, page: h.url, credit: `ছবি: সৌজন্যে ${h.source || "সংবাদমাধ্যম"}` });
    }
  }
  return out;
}
