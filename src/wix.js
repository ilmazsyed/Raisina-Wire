// Rashtrix's own articles from www.rashtrix.live (a Wix blog). Wix publishes each post in
// English, Bengali and Hindi as separate posts with the same publication time; they become one
// story here, in Bengali where there is a Bengali version, with the others as its English and
// Hindi versions. Photos are kept: these are Rashtrix's own articles.
//   - New posts: the blog's RSS feed (blog-feed.xml), every ten minutes.
//   - Everything older: the blog's post sitemap, a few posts a minute until all are in.
// Posts already imported are matched by address and never imported twice; a post edited on Wix
// updates its story unless an editor has changed the story here since.
import { parseFeed, plain, extractReadable, categorize, scriptLang, decodeEntities } from "./feeds.js";
import { textHash } from "./store.js";

const UA = "Mozilla/5.0 (compatible; RashtrixImport/1.0; +https://www.rashtrix.live)";
const base = env => String(env.WIX_SITE || "https://www.rashtrix.live").replace(/\/+$/, "");
const now = () => new Date().toISOString();
const get = (url, accept = "text/html,application/xhtml+xml") => fetch(url, { headers: { "user-agent": UA, accept }, redirect: "follow", signal: AbortSignal.timeout(12000) });
const setting = async (env, k, d) => (await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(k).first())?.value ?? d;
const put = (env, k, v) => env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, String(v)).run();

// HTML from Wix (content:encoded or the post page) to the CMS's plain text: paragraphs
// separated by blank lines, "## " headings, "- " bullets.
export function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style|figure|iframe)[\s\S]*?<\/\1>/gi, "")
    .replace(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi, (_, x) => `\n\n## ${plain(x)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, x) => `\n- ${plain(x)}`)
    .replace(/<\/(p|div|ul|ol|blockquote)>|<br\s*\/?>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .split(/\n{2,}/).map(p => decodeEntities(p).replace(/[ \t ]+/g, " ").trim()).filter(p => p && p !== "##").join("\n\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

// One post page: its text, picture, date and the addresses of its other language versions.
export async function readPost(url) {
  const r = await get(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const alternates = {};
  const page = await extractReadable(new HTMLRewriter().on('link[rel="alternate"][hreflang]', { element(el) {
    const l = (el.getAttribute("hreflang") || "").slice(0, 2).toLowerCase(), href = el.getAttribute("href");
    if (["en", "bn", "hi"].includes(l) && href) alternates[l] = href;
  } }).transform(r));
  const body = page.blocks.map(b => b.t === "h" ? `## ${b.x}` : b.t === "li" ? `- ${b.x}` : b.x).join("\n\n");
  return { url: r.url || url, title: page.title.replace(/\s*\|\s*[^|]*$/, "").trim(), dek: page.description, image: page.image, publishedAt: page.publishedAt, body, alternates, lang: scriptLang(page.title) };
}

// Save a group of language versions (one post) as one story.
async function savePost(env, versions) {
  const by = Object.fromEntries(versions.filter(v => v.title && v.body).map(v => [v.lang, v]));
  const main = by.bn || by.en || by.hi;
  if (!main) return "empty";
  const ref = (by.en || main).url;
  const refs = versions.map(v => v.url).filter(Boolean);
  const existing = await env.DB.prepare(`SELECT id,updated_at,created_at,origin_ref FROM articles WHERE origin='wix' AND origin_ref IN (${refs.map(() => "?").join(",")})`).bind(...refs).first();
  const desk = categorize(`${by.en?.title || ""} ${by.en?.body?.slice(0, 600) || ""} ${main.title}`);
  const tags = [...new Set(versions.flatMap(v => v.tags || []))].slice(0, 8).join(",");
  const image = versions.map(v => v.image).find(u => /^https:\/\//.test(u || "")) || "";
  const publishedAt = versions.map(v => v.publishedAt).find(Boolean) || now();
  const row = { title: main.title.slice(0, 180), dek: (main.dek || "").slice(0, 400), topic: desk, tags, body: main.body.slice(0, 100000), hero_caption: "" };
  const ver = await textHash(row);
  const tr = (aid, v) => env.DB.prepare(`INSERT INTO translations (kind,ref,lang,src_ver,title,dek,topic,hero_caption,tags,body,status,model,updated_at) VALUES ('article',?,?,?,?,?,'','', '[]',?,'manual','wix',?)
    ON CONFLICT(kind,ref,lang) DO UPDATE SET src_ver=excluded.src_ver,title=excluded.title,dek=excluded.dek,body=excluded.body,updated_at=excluded.updated_at WHERE translations.model='wix'`)
    .bind(aid, v.lang, ver, v.title.slice(0, 180), (v.dek || "").slice(0, 400), v.body.slice(0, 100000), now());
  if (existing) {
    // Edited here since the import: leave the editor's version alone.
    if (existing.updated_at && existing.updated_at > (await setting(env, `wix_seen:${existing.id}`, existing.updated_at))) return "kept";
    await env.DB.batch([
      env.DB.prepare("UPDATE articles SET title=?,dek=?,body=?,lang=?,image_url=CASE WHEN ?<>'' THEN ? ELSE image_url END,text_hash=?,updated_at=? WHERE id=?").bind(row.title, row.dek, row.body, main.lang, image, image, ver, existing.updated_at, existing.id),
      ...Object.values(by).filter(v => v !== main).map(v => tr(existing.id, v))
    ]);
    return "updated";
  }
  const aid = crypto.randomUUID();
  const slugBase = (by.en?.url || main.url).split("/post/")[1]?.split(/[?#]/)[0] || aid.slice(0, 8);
  let slug = decodeURIComponent(slugBase).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || aid.slice(0, 8);
  if (await env.DB.prepare("SELECT 1 FROM articles WHERE slug=?").bind(slug).first()) slug = `${slug.slice(0, 80)}-${aid.slice(0, 6)}`;
  const at = now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO articles (id,slug,kind,title,dek,topic,tags,body,category,status,writer,published_at,image_url,lang,origin,origin_ref,text_hash,created_at,updated_at,alert_state)
      VALUES (?,?,'article',?,?,?,?,?,?,'published','rashtrix-desk',?,?,?,'wix',?,?,?,?,'sent')`).bind(aid, slug, row.title, row.dek, desk, tags, row.body, desk, new Date(publishedAt).toISOString(), image, main.lang, ref, ver, at, at),
    ...Object.values(by).filter(v => v !== main).map(v => tr(aid, v)),
    env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind(`wix_seen:${aid}`, at)
  ]);
  return "added";
}

// New posts from the RSS feed. Items in different languages with the same publication time are
// one post; posts without their text in the feed are read from their page.
export async function syncWixFeed(env, { force = false } = {}) {
  const last = await setting(env, "wix_feed_at", "");
  if (!force && last && Date.now() - Date.parse(last) < 9.5 * 60e3) return { skipped: true };
  await put(env, "wix_feed_at", now());
  const r = await get(`${base(env)}/blog-feed.xml`, "application/rss+xml, application/xml, text/xml");
  if (!r.ok) { await put(env, "wix_error", `Feed: HTTP ${r.status}`); return { error: `HTTP ${r.status}` }; }
  const items = parseFeed(await r.text(), "Rashtrix");
  const groups = new Map();
  for (const it of items) { const k = it.publishedAt || it.url; (groups.get(k) || groups.set(k, []).get(k)).push(it); }
  const out = { added: 0, updated: 0, kept: 0, failed: 0 };
  for (const list of [...groups.values()].slice(0, 12)) {
    try {
      const versions = [];
      for (const it of list) {
        const v = { url: it.url, lang: scriptLang(it.title), title: it.title, dek: "", image: it.image, publishedAt: it.publishedAt, tags: it.tags, body: htmlToText(it.html) };
        if (v.body.length < 200 && /^https:\/\//.test(it.url)) { try { const p = await readPost(it.url); v.body = p.body; v.dek = p.dek; v.image ||= p.image; } catch { /* keep the feed text */ } }
        if (!v.body) v.body = it.summary;
        versions.push(v);
      }
      const done = await savePost(env, versions); if (out[done] !== undefined) out[done]++;
    } catch (e) { out.failed++; await put(env, "wix_error", String(e.message || e).slice(0, 200)); }
  }
  await put(env, "wix_feed_result", JSON.stringify({ at: now(), ...out }));
  return out;
}

// Older posts, from the post sitemap: a few each run until every post is in.
export async function backfillWix(env, { perRun = 3 } = {}) {
  if ((await setting(env, "wix_backfill", "on")) === "done") return { done: true };
  let queue = JSON.parse(await setting(env, "wix_backfill_queue", "null") || "null");
  if (!queue) {
    const urls = [];
    const r = await get(`${base(env)}/sitemap.xml`, "application/xml, text/xml");
    if (!r.ok) return { error: `sitemap HTTP ${r.status}` };
    const index = await r.text();
    const maps = [...index.matchAll(/<loc>([^<]*blog-posts-sitemap[^<]*)<\/loc>/g)].map(m => decodeEntities(m[1]));
    for (const m of maps.length ? maps : [`${base(env)}/blog-posts-sitemap.xml`]) {
      const s = await get(m, "application/xml, text/xml");
      if (s.ok) urls.push(...[...(await s.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => decodeEntities(x[1])).filter(u => /\/post\//.test(u)));
    }
    queue = [...new Set(urls)];
    await put(env, "wix_backfill_total", queue.length);
  }
  let added = 0;
  for (let i = 0; i < perRun && queue.length; i++) {
    const url = queue.shift();
    try {
      if (await env.DB.prepare("SELECT 1 FROM articles WHERE origin='wix' AND origin_ref=?").bind(url).first()) continue;
      const first = await readPost(url);
      const versions = [first];
      for (const [l, href] of Object.entries(first.alternates)) {
        if (href === url || l === first.lang) continue;
        queue = queue.filter(u => u !== href);   // read here, not again later
        try { versions.push(await readPost(href)); } catch { /* that language is missing */ }
      }
      if ((await savePost(env, versions)) === "added") added++;
    } catch (e) { await put(env, "wix_error", String(e.message || e).slice(0, 200)); }
  }
  await put(env, "wix_backfill_queue", JSON.stringify(queue));
  if (!queue.length) await put(env, "wix_backfill", "done");
  return { added, left: queue.length };
}

export async function wixStatus(env) {
  const [n, feed, err, left, total, state] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE origin='wix'").first(),
    setting(env, "wix_feed_result", ""), setting(env, "wix_error", ""), setting(env, "wix_backfill_queue", "null"), setting(env, "wix_backfill_total", "0"), setting(env, "wix_backfill", "on")
  ]);
  let lastFeed = null; try { lastFeed = JSON.parse(feed); } catch { /* none yet */ }
  return { site: base(env), imported: n.n, lastFeed, lastError: err, backfill: state === "done" ? "done" : "running", backfillLeft: (JSON.parse(left || "null") || []).length, backfillTotal: Number(total) };
}
export async function restartWixBackfill(env) {
  await env.DB.batch(["wix_backfill", "wix_backfill_queue"].map(k => env.DB.prepare("DELETE FROM settings WHERE key=?").bind(k)));
}
