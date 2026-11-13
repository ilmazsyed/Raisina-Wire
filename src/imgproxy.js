// The channel's pictures from news sites (the AVO stories' and the bulletin's), through our own
// address. Each is kept at the edge for a week once fetched (Cache API), so a site that is slow or
// down later does not leave the screen without it. A failed fetch is tried once more without the
// referrer; a picture that cannot be had answers 404 (never a redirect to the site itself, whose
// hotlink guard showed a broken picture in the app), and the screen leaves it out.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
export async function proxyImage(request, url) {
  if (!/^https?:\/\//.test(url || "")) return new Response("Not found", { status: 404 });
  const cache = caches.default, key = new Request(new URL(request.url).origin + "/__img/" + encodeURIComponent(url));
  const hit = await cache.match(key).catch(() => null);
  if (hit) return hit;
  let origin = ""; try { origin = new URL(url).origin + "/"; } catch { /* none */ }
  for (const referer of [origin, ""]) {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "image/avif,image/webp,image/*;q=0.9", ...(referer ? { referer } : {}) }, cf: { cacheTtl: 604800, cacheEverything: true }, signal: AbortSignal.timeout(9000) }).catch(() => null);
    const type = r?.headers.get("content-type") || "";
    if (!r?.ok || !/^image\//.test(type)) continue;
    const body = await r.arrayBuffer().catch(() => null);
    if (!body || body.byteLength < 800) continue;
    const res = new Response(body, { headers: { "content-type": type, "cache-control": "public, max-age=604800", "access-control-allow-origin": "*" } });
    await cache.put(key, res.clone()).catch(() => {});
    return res;
  }
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}
