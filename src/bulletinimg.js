// Pictures for the TV bulletin: for each story in it, a photograph from Wikimedia Commons under
// a free licence (public domain, CC0, CC BY or CC BY-SA), found by English search terms the wire
// desk's model suggests. Each picture carries its credit (author and licence), shown on screen in
// small type, as those licences require. A story with nothing suitable is shown without one.
// Runs in the minute cron, a few stories at a time; each story is looked up once (again after
// twelve hours if nothing was found).
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

export async function bulletinImages(env, n = 3) {
  const { results: stories } = await env.DB.prepare(`SELECT a.id, a.title, a.dek FROM articles a LEFT JOIN bulletin_images b ON b.article_id=a.id
    WHERE a.status='published' AND a.lang='bn' AND a.pulled_at IS NULL AND a.kind IN ('rewrite','brief') AND a.published_at>=?
      AND (b.article_id IS NULL OR (b.url='' AND b.checked_at<?))
    ORDER BY a.published_at DESC LIMIT ?`).bind(new Date(Date.now() - 24 * 3600e3).toISOString(), new Date(Date.now() - 12 * 3600e3).toISOString(), n).all();
  if (!stories.length) return { done: 0 };
  let terms = {};
  try { terms = await imageTerms(env, stories); } catch (e) { if (e?.retry) return { done: 0, waiting: true }; throw e; }
  const at = new Date().toISOString(), stmts = [];
  let found = 0;
  for (const s of stories) {
    let hit = null, used = "";
    for (const q of terms[s.id] || []) { hit = await commons(q).catch(() => null); used = q; if (hit) break; }
    if (hit) found++;
    stmts.push(env.DB.prepare("INSERT INTO bulletin_images (article_id,url,credit,page,query,checked_at) VALUES (?,?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET url=excluded.url,credit=excluded.credit,page=excluded.page,query=excluded.query,checked_at=excluded.checked_at")
      .bind(s.id, hit?.url || "", hit?.credit || "", hit?.page || "", used, at));
  }
  await env.DB.batch(stmts);
  return { done: stories.length, found };
}
