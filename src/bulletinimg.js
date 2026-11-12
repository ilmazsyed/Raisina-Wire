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
const BROADCAST = /abp|ananda\b|zee|india\s*tv|24\s*ghanta|news\s*18|tv\s*9|republic|kolkata\s*tv|ndtv|aaj\s*tak|india\s*today|times\s*now|cnn|wion|mirror\s*now|news\s*nation|calcutta\s*news|hindustan\s*times|\bht\b|jagran|amar\s*ujala|news\s*24|oneindia|youtube/i;
const BROADCAST_HOST = /(^|\.)(indiatv|indiatvnews|abplive|abpananda|abpnews|zeenews|zee24ghanta|zeebiz|news18|tv9bangla|tv9hindi|tv9telugu|republicworld|kolkatatv|ndtv|aajtak|indiatoday|timesnownews|wionews|hindustantimes|livehindustan|jagran|amarujala|news24online|oneindia|youtube|ytimg)\./i;
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
async function sourcePhoto(env, s) {
  return (await checkedPhotos(env, { id: s.id, title: s.title, at: s.published_at }, 1).catch(() => ({ photos: [] }))).photos[0] || null;
}

export async function bulletinImages(env, n = 3) {
  // Pictures already taken from a television channel are dropped and looked up again.
  const { results: old } = await env.DB.prepare("SELECT article_id, credit, page, url FROM bulletin_images WHERE query='source' AND url<>''").all().catch(() => ({ results: [] }));
  // Pictures chosen before the guardrails (and any stock pictures) are judged again.
  await env.DB.prepare("UPDATE bulletin_images SET url='', credit='', query='', checked_at='2000-01-01T00:00:00Z' WHERE query NOT IN ('checked','')").run().catch(() => {});
  const redo = old.filter(r => houseLike(r.url) || broadcaster(r.credit.replace(/^ছবি: সৌজন্যে /, ""), r.page) || THUMB.test(r.url) || BROADCAST_HOST.test((() => { try { return new URL(r.url).hostname + "."; } catch { return ""; } })()));
  if (redo.length) await env.DB.batch(redo.map(r => env.DB.prepare("UPDATE bulletin_images SET url='', credit='', query='', checked_at='2000-01-01T00:00:00Z' WHERE article_id=?").bind(r.article_id)));
  const { results: stories } = await env.DB.prepare(`SELECT a.id, a.title, a.dek, a.published_at FROM articles a LEFT JOIN bulletin_images b ON b.article_id=a.id
    WHERE a.status='published' AND a.lang='bn' AND a.pulled_at IS NULL AND a.kind IN ('rewrite','brief') AND a.published_at>=?
      AND (b.article_id IS NULL OR (b.url='' AND b.checked_at<?))
    ORDER BY a.published_at DESC LIMIT ?`).bind(new Date(Date.now() - 24 * 3600e3).toISOString(), new Date(Date.now() - 12 * 3600e3).toISOString(), n).all();
  if (!stories.length) return { done: 0 };
  // Only a verified photo of the story itself; a story without one is shown without a picture.
  const at = new Date().toISOString(), stmts = [];
  let found = 0;
  for (const s of stories) {
    const hit = await sourcePhoto(env, s), used = "checked";
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
    out.push({ title: get("title"), url: link, date: get("pubDate"), source: get("News:Source") || (() => { try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; } })() });
  }
  return out;
}
// Verified news photos for one story (see the guardrails below).
export async function newsPhotos(env, story, want = 6) { return (await checkedPhotos(env, story, want)).photos; }

// ---- Picture guardrails (AVO stories and the bulletin) ---------------------------------------
// A picture is used only when it is about this story. Every rule must pass:
// 1. Where it comes from: the lead photo of a report the story was written from (one that agrees
//    with the other reports in its group), or of another outlet's report that is plainly the same
//    story (three or more of the headline's key words, published within a day and a half). No
//    stock photos, no search by loose terms.
// 2. The page and the picture: the page is that report (its headline matches), and the picture is
//    not a logo, a site's default card, a graphic, a map, a chart, a poster, a "file" or
//    "representational" photo, a small image, or a dated file photo from long before the story.
// 3. The image model (Cloudflare Workers AI, free daily allowance) looks at it: it must be a real
//    photograph that plausibly shows this story. Each picture is judged once (photo_checks).
// When the model is not available (its daily allowance used up, or an error), a stricter rule that
// costs nothing applies instead: only photos of the story's own reports, at most two.
// A story with fewer than two good photos is told in motion graphics (src/engine.js).
const STOP = new Set(("the and for with from that this was were are has have had will after over into about says said amid more than its their they them his her who what when where which how new news live update updates video watch photos " +
  "এই ওই সেই একটি এক এবং ও বা হয় হল হলো হয়েছে হয়েছিল করে করা করেন করল করলেন থেকে জন্য নিয়ে দিয়ে পর আগে মধ্যে সঙ্গে সাথে কাছে উপর তার তাঁর তাদের তাঁদের যে যা কি কী না নয় আর আরও এখন এদিন বুধবার বৃহস্পতিবার শুক্রবার শনিবার রবিবার সোমবার মঙ্গলবার খবর").split(" "));
const keyWords = t => [...new Set(String(t || "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)))];
// Shared key words, allowing for Bengali endings (নৈহাটির ~ নৈহাটি).
const sharedKeys = (a, b) => { const B = keyWords(b); let n = 0; for (const w of keyWords(a)) if (B.some(v => v === w || (Math.min(v.length, w.length) >= 4 && (v.startsWith(w) || w.startsWith(v))))) n++; return n; };
const BAD_WORD = /(^|[^a-z])(logo|default|placeholder|fallback|generic|banner|template|infographic|graphics?|maps?|constituency|explainer|poll|results?|chart|stock|poster|promo|collage|quote|card|thumbnail|representational|representative|file[-_ ]?(photo|pic|image)|symbolic|illustration|cartoon|screenshot)([^a-z]|$)/i;
const BAD_TEXT = /file photo|file image|representational|representative image|for representation|symbolic image|illustration|ফাইল ছবি|ফাইল চিত্র|প্রতীকী|প্রতিকী|প্রতিনিধিত্বমূলক|प्रतीकात्मक|फाइल फोटो|सांकेतिक/i;
const pathWords = u => { try { const x = new URL(u); return decodeURIComponent(x.pathname + " " + x.search).replace(/[-_/.?=&+]/g, " "); } catch { return ""; } };
// The lead photo of a page, with what the page says about it.
async function pageMeta(url) {
  const r = await fetch(url, { headers: { "user-agent": BROWSER_UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
  if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) return { failed: true };
  const html = (await r.text()).slice(0, 300000), dec = s => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  const meta = name => dec(html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${name}["']`, "i"))?.[1] || "");
  let img = meta("og:image") || meta("og:image:url") || meta("twitter:image") || meta("twitter:image:src"), u = null;
  try { u = img ? new URL(img, r.url || url) : null; } catch { u = null; }
  return { page: r.url || url, img: u && /^https?:$/.test(u.protocol) ? u.href : "", alt: meta("og:image:alt") || meta("twitter:image:alt"), width: Number(meta("og:image:width")) || 0,
    title: meta("og:title") || dec(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]), published: meta("article:published_time") || meta("datePublished") || dec(html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1]),
    caption: strip(html.match(/<figcaption[^>]*>([\s\S]{0,400}?)<\/figcaption>/i)?.[1] || ""),
    // Other photographs in the report itself: pictures inside its figures (never icons, logos,
    // avatars, ads or thumbnails of other stories), up to three.
    more: (() => {
      const out = [], at = html.search(/<article|<figure|class=["'][^"']*(?:story|article|post)-?(?:body|content)/i), body = at >= 0 ? html.slice(at) : html;
      for (const m of body.matchAll(/<figure[\s\S]{0,600}?<img[^>]+?(?:data-src|data-lazy-src|src)=["']([^"']+)["'][^>]*>/gi)) {
        let u; try { u = new URL(m[1].replace(/&amp;/g, "&"), r.url || url); } catch { continue; }
        if (!/^https?:$/.test(u.protocol) || /^data:/.test(m[1]) || /icon|avatar|logo|sprite|placeholder|lazy|blank|1x1|banner|advert|\/ads?\//i.test(u.href)) continue;
        if (!out.includes(u.href)) out.push(u.href);
        if (out.length >= 3) break;
      }
      return out;
    })() };
}
// Rules 1–2 for one page's photo; returns the reason it is refused, or "".
async function pageRules(m, { expect, storyAt }) {
  if (!m?.img) return "no photo on the page";
  let u; try { u = new URL(m.img); } catch { return "bad address"; }
  if (/favicon/i.test(u.pathname) || houseLike(u.href) || THUMB.test(u.href) || BROADCAST_HOST.test(u.hostname + ".")) return "logo, video still or site picture";
  if (expect && sharedKeys(m.title, expect) < 2) return "the page is not that report";
  if (BAD_WORD.test(pathWords(u.href)) || BAD_WORD.test(m.alt) || BAD_TEXT.test(`${m.alt} ${m.caption}`)) return "graphic, map, file or representational picture";
  if (m.width && m.width < 600) return "too small";
  const d = pathWords(u.href).match(/(20\d\d)\s?(0[1-9]|1[0-2])\s?([0-3]\d)?/);
  if (d && storyAt) { const t = Date.UTC(+d[1], +d[2] - 1, +(d[3] || 28)); if (t < storyAt - 10 * 864e5) return "file photo from an earlier date"; }
  const pub = Date.parse(m.published || "");
  if (pub && storyAt && pub < storyAt - 4 * 864e5) return "an older report";
  const card = await siteCard(m.page);
  if (card && sameImg(card, u.href)) return "the site's default picture";
  return "";
}
// Rule 3: the image model. Returns { ok, why } or null when the model cannot be asked.
const VISION = "@cf/llava-hf/llava-1.5-7b-hf";
const visionDaily = env => Math.max(0, Number(env.PHOTO_AI_DAILY) || 150);
async function visionCheck(env, url, about) {
  if (!env.AI) return null;
  const since = new Date(Date.now() - 864e5).toISOString().replace("T", " ").slice(0, 19);
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM photo_checks WHERE ai=1 AND at>=?").bind(since).first().catch(() => null);
  if (!used || used.n >= visionDaily(env)) return null;
  const r = await fetch(url, { headers: { "user-agent": BROWSER_UA, accept: "image/*" }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!r?.ok || !/^image\//.test(r.headers.get("content-type") || "")) return { ok: false, why: "the picture could not be opened" };
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length < 15000) return { ok: false, why: "too small" };
  if (buf.length > 3e6) return null;
  const prompt = `A TV news channel wants to show this image with the story: "${about}". Answer exactly in this form: PHOTO=yes or no; MATCH=yes or no or unsure. PHOTO=yes if it is mainly a photograph of a real scene, people, place or object (a small logo, watermark or caption on it is fine); PHOTO=no for a graphic, map, chart, poster, screenshot, collage or a card made mostly of text. MATCH=yes if the photograph plausibly shows this event, its place, its people or its subject; MATCH=no if it clearly shows something else.`;
  let out = "";
  try { out = String((await env.AI.run(VISION, { image: [...buf], prompt, max_tokens: 40 }))?.description || ""); } catch { return null; }
  const photo = /PHOTO\s*=\s*yes/i.test(out), match = /MATCH\s*=\s*yes/i.test(out), mismatch = /MATCH\s*=\s*no/i.test(out);
  if (!/PHOTO\s*=/i.test(out)) return null;   // an answer the model did not give in the form asked: not trusted either way
  // `match` (yes), `mismatch` (no) or neither (unsure): the caller decides by where the photo is from.
  return { ok: photo && !mismatch, sure: photo && match, why: !photo ? "the image model saw a graphic, not a photograph" : mismatch ? "the image model saw something else in it" : match ? "checked by the image model" : "a photograph from the story's own report (the image model was unsure of the subject)", ai: true };
}
const remember = (env, url, v) => env.DB.prepare("INSERT INTO photo_checks (url,ok,why,ai,at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(url) DO UPDATE SET ok=excluded.ok,why=excluded.why,ai=excluded.ai,at=excluded.at").bind(url, v.ok ? 1 : 0, v.why.slice(0, 120), v.ai ? 1 : 0).run().catch(() => {});
// The story's headline in English for the image model (it does not read Bengali): the site's English
// version, else a translation made now (kept with the site's translations' model, free allowance).
async function englishTitle(env, story) {
  const t = await env.DB.prepare("SELECT title FROM translations WHERE kind='article' AND ref=? AND lang='en' AND title<>''").bind(story.id).first().catch(() => null);
  if (t?.title) return t.title;
  if (!env.AI || !story.title) return "";
  try { return String((await env.AI.run("@cf/meta/m2m100-1.2b", { text: story.title, source_lang: "bn", target_lang: "en" }))?.translated_text || ""); } catch { return ""; }
}
// The story's own reports that agree with the rest of their group (a report sharing no key words
// with any other in the group is set aside), with their titles, newest first.
async function ownReports(env, id) {
  const { results } = await env.DB.prepare(`SELECT i.url, i.source_name, i.title FROM wire_jobs j JOIN wire_items i ON i.job_id=j.id WHERE j.article_id=? ORDER BY i.published_at DESC LIMIT 8`).bind(id).all().catch(() => ({ results: [] }));
  return results.filter((r, i) => results.length < 2 || results.some((o, k) => k !== i && sharedKeys(r.title, o.title) >= 2));
}
// Verified photos for one story: { photos: [{url,page,credit}], log: [{url,ok,why}] }.
export async function checkedPhotos(env, story, want = 6) {
  const storyAt = Date.parse(story.at || "") || Date.now(), photos = [], log = [], seen = new Set();
  const own = await ownReports(env, story.id);
  const about = (await englishTitle(env, story) || [story.title, ...own.map(r => r.title).filter(t => /[a-z]{3}/i.test(t)).slice(0, 2)].join(" / ")).slice(0, 400);
  const cands = [];
  for (const it of own) if (!broadcaster(it.source_name, it.url)) cands.push({ page: it.url, expect: it.title, credit: `ছবি: সৌজন্যে ${pubName(it.source_name)}`, own: true });
  // Other outlets' reports on the same story (only while the image model can check them).
  const aiOn = !!env.AI && visionDaily(env) > 0;
  if (aiOn && story.title) {
    const tried = new Set(cands.map(c => c.page)), en = /[a-z]{3}/i.test(about) ? about : "";
    const hits = [...await newsSearch(story.title).catch(() => []), ...(en ? await newsSearch(en).catch(() => []) : [])];
    for (const h of hits) {
      if (tried.has(h.url) || broadcaster(h.source, h.url) || Math.max(sharedKeys(h.title, story.title), en ? sharedKeys(h.title, en) : 0) < 2) continue;
      const pub = Date.parse(h.date || ""); if (pub && Math.abs(pub - storyAt) > 36 * 3600e3) continue;
      const same = (en ? sharedKeys(h.title, en) : 0) >= 3 && (!pub || Math.abs(pub - storyAt) <= 24 * 3600e3);
      tried.add(h.url); cands.push({ page: h.url, expect: h.title, credit: `ছবি: সৌজন্যে ${h.source || "সংবাদমাধ্যম"}`, own: false, same });
      if (cands.length >= 10) break;
    }
  }
  let ownKept = 0, failed = 0;
  const fileOnes = [];
  for (const c of cands) {
    if (photos.length >= want) break;
    const m = await pageMeta(c.page).catch(() => ({ failed: true }));
    if (m?.failed) { failed++; log.push({ page: c.page, ok: false, why: "the page could not be read (tried again later)" }); continue; }
    if (!m?.img || seen.has(m.img)) { if (m?.img) continue; log.push({ page: c.page, ok: false, why: "no photo on the page" }); continue; }
    seen.add(m.img);
    const known = await env.DB.prepare("SELECT ok, why, ai FROM photo_checks WHERE url=?").bind(m.img).first().catch(() => null);
    let v = known ? { ok: !!known.ok, sure: !!known.ok && known.why === "checked by the image model", why: known.why, ai: !!known.ai } : null;
    if (!v) {
      const bad = await pageRules(m, { expect: c.expect, storyAt });
      if (bad && c.own && /earlier date|older report/.test(bad)) fileOnes.push({ m, c });
      if (bad) v = { ok: false, why: bad };
      else {
        const ai = await visionCheck(env, m.img, about);
        // Without the model: only the story's own reports, two at most.
        v = ai || (c.own && ownKept < 2 ? { ok: true, why: "the story's own report (rule check, no image model)" } : { ok: false, why: c.own ? "two rule-checked photos at most" : "not checked: image model unavailable" });
        if (ai || !v.ok) await remember(env, m.img, v);
      }
    }
    if (v.ok && !c.own && !v.ai) v = { ok: false, why: "another outlet's photo needs the image model" };
    // Another outlet's photo: the model sure it shows this story, or its report plainly the same
    // story (its headline and ours share three key words, within a day) and the model not objecting.
    if (v.ok && !c.own && v.ai && !v.sure && !c.same) v = { ok: false, why: "another outlet's photo: the image model was not sure it shows this story", ai: true };
    if (v.ok && !c.own && v.ai && !v.sure && c.same) v = { ...v, why: "another outlet's report of the same story (its headline matches; a real photograph)" };
    if (v.ok && c.own && !v.ai && ownKept >= 2) v = { ok: false, why: "two rule-checked photos at most" };
    log.push({ url: m.img, page: c.page, ok: v.ok, why: v.why });
    if (v.ok) { photos.push({ url: m.img, page: c.page, credit: c.credit }); if (c.own) ownKept++; }
    // More photographs from the same report: each judged by the image model (never without it).
    if (v.ok && c.own && v.ai) for (const extra of m.more || []) {
      if (photos.length >= want || seen.has(extra)) continue;
      seen.add(extra);
      const bad = await pageRules({ ...m, img: extra, alt: "", caption: "", width: 0 }, { expect: "", storyAt });
      let w = bad ? { ok: false, why: bad } : null;
      if (!w) { const k = await env.DB.prepare("SELECT ok, why, ai FROM photo_checks WHERE url=?").bind(extra).first().catch(() => null); w = k ? { ok: !!k.ok, why: k.why, ai: !!k.ai } : await visionCheck(env, extra, about); if (w && !k) await remember(env, extra, w); }
      if (!w) continue;   // the model could not be asked: not used
      // (pictures in a report can belong to its "read also" boxes: unless the model is sure, the
      // picture's file name must name the story)
      if (w.ok && !w.sure && !(w.why === "checked by the image model")) {
        const file = decodeURIComponent((() => { try { return new URL(extra).pathname.split("/").pop(); } catch { return ""; } })()).replace(/\.[a-z0-9]+$/i, "").replace(/[-_.]+/g, " ");
        if (sharedKeys(file, `${about} ${decodeURIComponent((() => { try { return new URL(c.page).pathname; } catch { return ""; } })()).replace(/[-_/]+/g, " ")}`) < 1) w = { ok: false, why: "a picture in the report not shown to be about this story" };
      }
      log.push({ url: extra, page: c.page, ok: w.ok, why: w.ok ? `another photo in the same report: ${w.why}` : w.why });
      if (w.ok) photos.push({ url: extra, page: c.page, credit: c.credit });
    }
  }
  // No photo at all: a file photo from the story's own report, when the image model is sure it shows
  // the story's subject (a parliament story, the parliament).
  if (!photos.length) for (const { m, c } of fileOnes.slice(0, 2)) {
    const w = await visionCheck(env, m.img, about);
    if (!w) break;
    if (w.sure) { photos.push({ url: m.img, page: c.page, credit: c.credit }); log.push({ url: m.img, page: c.page, ok: true, why: "a file photo of the story's subject (the story had no other photo; the image model is sure)" }); break; }
  }
  return { photos, log, failed };
}
