// IndexNow: new and updated stories are announced to search engines that take it (Bing, Yandex,
// Seznam, Naver…) within minutes, instead of waiting for them to crawl the sitemap. Google does
// not use IndexNow; it reads the sitemaps (robots.txt) and Search Console.
// The key is public by design: it is served at /<key>.txt to prove the site is ours.
export const INDEXNOW_KEY = "96cfde195e5efc48c8c1ea5d700fa1c8";
const get = async (env, k) => (await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(k).first().catch(() => null))?.value || "";
const put = (env, k, v) => env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, v).run();

// Every ten minutes (the cron): the stories published or changed since the last call, in each
// language they are shown in, up to 100 addresses.
export async function indexNow(env) {
  if (!env.SITE_URL) return { skipped: "no site address" };
  const o = String(env.SITE_URL).replace(/\/+$/, ""), last = await get(env, "indexnow_at"), now = new Date();
  if (last && now - Date.parse(last) < 10 * 60e3) return { waiting: true };
  const since = new Date(Math.max(Date.parse(last || 0) || 0, now - 6 * 3600e3)).toISOString();
  const { results } = await env.DB.prepare("SELECT slug, hidden_langs FROM articles WHERE status='published' AND pulled_at IS NULL AND published_at<=? AND (published_at>=? OR updated_at>=?) ORDER BY published_at DESC LIMIT 34")
    .bind(now.toISOString(), since, since).all().catch(() => ({ results: [] }));
  await put(env, "indexnow_at", now.toISOString());
  if (!results.length) return { sent: 0 };
  const urls = results.flatMap(r => ["", "/en", "/hi"].filter(p => !String(r.hidden_langs || "").split(",").includes(p.slice(1) || "bn")).map(p => `${o}${p}/article/${encodeURIComponent(r.slug)}`)).slice(0, 100);
  const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(o).host, key: INDEXNOW_KEY, keyLocation: `${o}/${INDEXNOW_KEY}.txt`, urlList: urls }), signal: AbortSignal.timeout(10000) }).catch(() => null);
  return { sent: urls.length, status: res?.status || 0 };
}
