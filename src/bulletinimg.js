// Pictures for the TV bulletin. For each story in it: first the lead photo of the news reports
// the story was written from (their og:image), credited to that publication ("ছবি: সৌজন্যে …");
// failing that, a photograph from Wikimedia Commons under a free licence, found by English search
// terms the wire desk's model suggests, credited with its author and licence. Every picture
// carries its credit on screen in small type. A story with nothing suitable is shown without one.
// Runs in the minute cron, a few stories at a time; each story is looked up once (again after
// twelve hours if nothing was found). The app loads the pictures through /api/tv/bimg/<id>, so
// publishers that refuse other sites' pages still show.
import { imageTerms } from "./wiredesk.js";

const UA = "RashtrixTV/1.0 (bulletin pictures; https://rashtrix.ilmazsyed.workers.dev)";
const FREE = /^(cc0|public domain|pd\b|pd-|cc[- ]by(-sa)?[- ]\d)/i;
const strip = h => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function commons(query) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "10", gsrsearch: `${query} filetype:bitmap`, prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "1280" })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
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
    return { url: ii.thumburl || ii.url, page: ii.descriptionurl || "", credit: `ছবি: ${author}${pd ? "" : `, ${licence}`} · Wikimedia Commons` };
  }
  return null;
}


// A publication's name for the credit, from the wire feed's internal label ("ABP ANANDA DIST" →
// "ABP Ananda"): section words dropped, capitals eased (short acronyms kept).
const SECTION = /\b(DIST(RICT)?S?|KOLKATA|STATE|BENGAL|NATIONAL|INDIA|WORLD|SPORTS?|ENTERTAINMENT|BUSINESS|LIFESTYLE|POLITICS|LATEST|TOP|FEED|RSS|NEWS FEED|HOME)\b/gi;
export function pubName(label) {
  let n = String(label || "").replace(SECTION, " ").replace(/[-–|·:]+\s*$/, "").replace(/\s+/g, " ").trim() || String(label || "").trim();
  if (n === n.toUpperCase() && /[A-Z]/.test(n)) n = n.split(" ").map(w => w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()).join(" ");
  return n;
}
export const cleanCredit = c => String(c || "").replace(/^(ছবি: সৌজন্যে )(.+)$/, (_, a, b) => a + pubName(b));

// The lead photo of a web page: og:image, else twitter:image.
const BROWSER_UA = "Mozilla/5.0 (compatible; RashtrixTV/1.0; +https://rashtrix.ilmazsyed.workers.dev)";
async function pagePhoto(url) {
  const r = await fetch(url, { headers: { "user-agent": BROWSER_UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
  if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) return "";
  const html = (await r.text()).slice(0, 200000);
  const meta = name => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1] || "";
  let img = meta("og:image") || meta("og:image:url") || meta("twitter:image") || meta("twitter:image:src");
  img = img.replace(/&amp;/g, "&").trim();
  if (!img) return "";
  try { const u = new URL(img, r.url || url); return /^https?:$/.test(u.protocol) && !/logo|placeholder|default[-_]?(og|share)|favicon/i.test(u.pathname) ? u.href : ""; } catch { return ""; }
}
// The reports a wire story was written from (kept internally), newest first.
async function sourcePhoto(env, articleId) {
  const { results } = await env.DB.prepare(`SELECT i.url, i.source_name FROM wire_jobs j JOIN wire_items i ON i.job_id=j.id WHERE j.article_id=? ORDER BY i.published_at DESC LIMIT 4`).bind(articleId).all().catch(() => ({ results: [] }));
  for (const it of results) {
    const url = await pagePhoto(it.url).catch(() => "");
    if (url) return { url, page: it.url, credit: `ছবি: সৌজন্যে ${pubName(it.source_name)}` };
  }
  return null;
}

export async function bulletinImages(env, n = 3) {
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
    if (!hit) for (const q of terms[s.id] || []) { hit = await commons(q).catch(() => null); used = q; if (hit) break; }
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
