#!/usr/bin/env node
// Raisina Wire autopublisher: publishes to the live site through the control-room API,
// signed in with the PUBLISH_TOKEN Worker secret. Used by the /publish skill
// (.claude/skills/publish/SKILL.md); also works by hand.
//
//   RW_PUBLISH_TOKEN=…  npm run publish -- <command> [args]
//
// Commands (JSON is a file path, or "-" for stdin):
//   health                          check the site and the token
//   list <articles|live|media|events|alerts|images>
//   article <json>                  create an article or edition
//   article-update <id> <json>      edit, publish, unpublish (status draft) or archive
//   live-open <json>                open live coverage
//   live-update <coverageId> <json> post an update to live coverage
//   live-status <coverageId> <live|ended|draft>
//   live-images <coverageId> <json>  set a live coverage's imageUrl, socialUrl, heroCaption
//   media <json>                    publish multimedia
//   media-status <id> <published|draft>
//   event <json>                    publish an event or briefing
//   event-status <id> <published|cancelled|draft>
//   alert <json>                    send a major alert
//   image <file> [alt]              upload an image; prints its /media/ URL
//   translations                    which stories and pages have Hindi and Bengali versions
//   translation-get <ref> <hi|bn>   the English source and the current translation
//   translation <ref> <hi|bn> <json>  save a translation: {title, dek, topic, heroCaption, tags, body}
//   translation-delete <ref> <hi|bn>
//     <ref> is a story id, or page:<key> for a site page (page:about, page:terms, …; body is HTML)
import { readFileSync } from "node:fs";

const SITE = (process.env.RW_SITE || "https://raisinawire.calibrex.org").replace(/\/+$/, "");
const TOKEN = process.env.RW_PUBLISH_TOKEN || "";

function fail(message) { console.error(`Error: ${message}`); process.exit(1); }
function readJson(arg) {
  if (!arg) fail("Give a JSON file path, or - for stdin.");
  try { return JSON.parse(readFileSync(arg === "-" ? 0 : arg, "utf8")); }
  catch (e) { fail(`Could not read JSON from ${arg}: ${e.message}`); }
}
async function call(method, path, body, headers = {}) {
  if (!TOKEN && path.startsWith("/api/admin")) fail("RW_PUBLISH_TOKEN is not set.");
  const isBytes = body instanceof Uint8Array;
  let res;
  try {
    res = await fetch(SITE + path, {
      method,
      headers: { ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}), ...(body && !isBytes ? { "content-type": "application/json" } : {}), ...headers },
      body: body ? (isBytes ? body : JSON.stringify(body)) : undefined
    });
  } catch (e) { fail(`Could not reach ${SITE}: ${e.cause?.message || e.message}`); }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  if (!res.ok) fail(`${method} ${path} → HTTP ${res.status}: ${data.error || data.raw || text}`);
  return data;
}
const out = data => console.log(JSON.stringify(data, null, 2));
// Translations: <ref> is a story id or page:<key>; the language is hi or bn.
function trPath(ref, lang) {
  if (!ref || !["hi", "bn"].includes(lang)) fail("Give the story id (or page:<key>) and the language, hi or bn.");
  const [kind, id] = ref.startsWith("page:") ? ["page", ref.slice(5)] : ["article", ref];
  return `/api/admin/translations/${kind}/${encodeURIComponent(id)}/${lang}`;
}
const link = (kind, slug) => `${SITE}/${kind}/${encodeURIComponent(slug)}`;

const [cmd, a, b] = process.argv.slice(2);
switch (cmd) {
  case "health": {
    const h = await call("GET", "/api/health");
    const auth = TOKEN ? await call("GET", "/api/admin/stats").then(() => "accepted") : "not set";
    out({ site: SITE, ...h, token: auth });
    break;
  }
  case "list": {
    const paths = { translations: "/api/admin/translations", articles: "/api/admin/articles", live: "/api/admin/live", media: "/api/admin/media", events: "/api/admin/events", alerts: "/api/admin/alerts", images: "/api/admin/images" };
    if (!paths[a]) fail(`list one of: ${Object.keys(paths).join(", ")}`);
    const d = await call("GET", paths[a]);
    if (a === "articles") d.articles = d.articles.map(({ body, ...rest }) => rest);
    out(d);
    break;
  }
  case "article": {
    const j = readJson(a), d = await call("POST", "/api/admin/articles", j);
    out({ ...d, url: link(j.kind === "edition" ? "edition" : "article", d.slug) });
    break;
  }
  case "article-update": {
    if (!a) fail("Give the article id.");
    const j = readJson(b), d = await call("PUT", `/api/admin/articles/${encodeURIComponent(a)}`, j);
    out({ ...d, url: link(j.kind === "edition" ? "edition" : "article", d.slug) });
    break;
  }
  case "live-open": {
    const d = await call("POST", "/api/admin/live", readJson(a));
    out({ ...d, url: link("coverage", d.slug) });
    break;
  }
  case "live-update": {
    if (!a) fail("Give the coverage id.");
    out(await call("POST", `/api/admin/live/${encodeURIComponent(a)}/updates`, readJson(b)));
    break;
  }
  case "live-images": out(await call("PUT", `/api/admin/live/${encodeURIComponent(a || "")}`, readJson(b))); break;
  case "live-status": out(await call("PUT", `/api/admin/live/${encodeURIComponent(a || "")}`, { status: b })); break;
  case "media": out({ ...(await call("POST", "/api/admin/media", readJson(a))), url: `${SITE}/watch` }); break;
  case "media-status": out(await call("PUT", `/api/admin/media/${encodeURIComponent(a || "")}`, { status: b })); break;
  case "event": out({ ...(await call("POST", "/api/events", readJson(a))), url: `${SITE}/events` }); break;
  case "event-status": out(await call("PUT", `/api/admin/events/${encodeURIComponent(a || "")}`, { status: b })); break;
  case "alert": out(await call("POST", "/api/admin/alerts", readJson(a))); break;
  case "image": {
    if (!a) fail("Give the image file path.");
    const bytes = new Uint8Array(readFileSync(a));
    const d = await call("POST", "/api/admin/images", bytes, { "content-type": "application/octet-stream", ...(b ? { "x-image-alt": b.slice(0, 300) } : {}) });
    out({ ...d, absoluteUrl: SITE + d.url });
    break;
  }
  case "translations": out(await call("GET", "/api/admin/translations")); break;
  case "translation-get": out(await call("GET", trPath(a, b))); break;
  case "translation": {
    const d = await call("PUT", trPath(a, b), readJson(process.argv[5]));
    const [kind, ref] = a.startsWith("page:") ? ["page", a.slice(5)] : ["article", a];
    const href = kind === "page" ? `/${ref}` : (await call("GET", "/api/admin/articles")).articles.find(x => x.id === ref)?.href;
    out({ ...d, url: href ? `${SITE}/${b}${href}` : undefined });
    break;
  }
  case "translation-delete": out(await call("DELETE", trPath(a, b))); break;
  default:
    fail("Unknown command. Run with one of: health, list, article, article-update, live-open, live-update, live-status, live-images, media, media-status, event, event-status, alert, image, translations, translation-get, translation, translation-delete.");
}
