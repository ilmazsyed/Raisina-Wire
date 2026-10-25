import { cached, liveWire, readArticle, marketBoard } from "./feeds.js";
import m0001 from "../migrations/0001_init.sql";
import m0002 from "../migrations/0002_platform_modules.sql";
import m0003 from "../migrations/0003_editorial_console.sql";
import m0004 from "../migrations/0004_app_completion.sql";
import m0005 from "../migrations/0005_editions_media_writers.sql";
import m0006 from "../migrations/0006_tags_views_alerts.sql";
import m0007 from "../migrations/0007_tts_audio.sql";
import m0008 from "../migrations/0008_community_votes.sql";
import m0009 from "../migrations/0009_translations.sql";
import m0010 from "../migrations/0010_community_language.sql";
import { handleTts } from "./tts.js";
import { editions } from "./editions.js";
import editionBodies from "./edition-bodies.json";
import seedHi from "./translations/hi.json";
import seedBn from "./translations/bn.json";
import { ARTICLE_COLS, toArticle, listPublished, getBySlug, blocksToText, splitTags, tagSlug, isPublic, textHash, WRITERS, DEFAULT_WRITER } from "./store.js";
import { LANGS, isLang, localiseArticles, localisePage, PAGES, pageVer } from "./translate.js";
import { vapidKeys, createAlert, drainAlerts } from "./push.js";
import { renderPage, sitemap, newsSitemap, robots, feed, PAGE_PATTERN } from "./seo.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache", // editorial data must show changes at once; wire/markets set their own short caching
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type, authorization"
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function err(message, status = 400) { return json({ error: message }, status, { "cache-control": "no-store" }); }
function randomId() { return crypto.randomUUID(); }
function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function hex(bytes) { return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join(""); }
async function sha256(value) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
// Cloudflare Workers reject PBKDF2 above 100,000 iterations, so that is the ceiling.
// The count is stored with each hash ("salt:hash:iterations") so it can be raised later.
const PBKDF2_ITERATIONS = 100000;
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" }, key, 256);
  return b64(bits);
}
async function passwordHash(password, salt) {
  return `${salt}:${await pbkdf2(password, salt, PBKDF2_ITERATIONS)}:${PBKDF2_ITERATIONS}`;
}
async function verifyPassword(password, stored) {
  const [salt, expected, iterations] = (stored || "").split(":");
  if (!salt || !expected) return false;
  return (await pbkdf2(password, salt, Number(iterations) || 180000)) === expected;
}
function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function getCookie(request, name) {
  const all = request.headers.get("Cookie") || "";
  const match = all.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}
// Apply pending migrations/ on first database use, so a new D1 database needs no manual setup.
// Uses wrangler's own d1_migrations table, so `wrangler d1 migrations apply` sees them as applied.
const MIGRATIONS = [["0001_init.sql", m0001], ["0002_platform_modules.sql", m0002], ["0003_editorial_console.sql", m0003], ["0004_app_completion.sql", m0004], ["0005_editions_media_writers.sql", m0005], ["0006_tags_views_alerts.sql", m0006], ["0007_tts_audio.sql", m0007], ["0008_community_votes.sql", m0008], ["0009_translations.sql", m0009], ["0010_community_language.sql", m0010]];
let schemaReady = null;
function sqlStatements(sql) {
  return sql.replace(/--[^\n]*/g, "").split(";").map(x => x.trim()).filter(Boolean);
}
async function migrate(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const { results } = await db.prepare("SELECT name FROM d1_migrations").all();
  const applied = new Set(results.map(r => r.name));
  for (const [name, sql] of MIGRATIONS) {
    if (applied.has(name)) continue;
    await db.batch([...sqlStatements(sql).map(q => db.prepare(q)), db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(name)]);
  }
  await seedEditions(db, applied);
  await backfillTextHashes(db);
  await seedTranslations(db, applied);
}
// Stories saved before text fingerprints existed get one, so the control room can tell when the
// English has changed since a translation was written.
async function backfillTextHashes(db) {
  const { results } = await db.prepare("SELECT id,title,dek,topic,hero_caption,tags,body FROM articles WHERE text_hash='' LIMIT 500").all();
  if (results.length) await db.batch(await Promise.all(results.map(async r => db.prepare("UPDATE articles SET text_hash=? WHERE id=?").bind(await textHash(r), r.id))));
}
// Hindi and Bengali versions bundled with the site (src/translations/), written in a Claude
// session for the existing editions and pages. Copied in once; versions saved in the control
// room are never overwritten.
async function seedTranslations(db, applied) {
  const seeds = { hi: seedHi, bn: seedBn };
  const count = Object.values(seeds).reduce((n, x) => n + Object.keys(x.articles || {}).length + Object.keys(x.pages || {}).length, 0);
  const marker = `seed_translations_${count}`;
  if (!count || applied.has(marker)) return;
  const now = new Date().toISOString(), stmts = [];
  const insert = (kind, ref, lang, ver, t, tags = "[]") => db.prepare(`INSERT OR IGNORE INTO translations (kind,ref,lang,src_ver,title,dek,topic,hero_caption,tags,body,status,model,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'manual','claude-session',?)`)
    .bind(kind, ref, lang, ver, t.title, t.dek || "", t.topic || "", t.heroCaption || "", tags, t.body ?? t.html ?? "", now);
  for (const [lang, seed] of Object.entries(seeds)) {
    for (const [slug, t] of Object.entries(seed.articles || {})) {
      const e = editions.find(x => x.slug === slug), row = await db.prepare("SELECT id,tags FROM articles WHERE slug=?").bind(slug).first();
      if (!e || !row) continue;
      // The English these were translated from: the bundled edition.
      const tags = splitTags(e.topic.replace(/ · /g, ",")).join(",");
      const ver = await textHash({ title: e.title, dek: e.dek, topic: e.topic, hero_caption: "", tags, body: blocksToText(editionBodies[e.slug]?.blocks) });
      const labels = splitTags(row.tags).map((x, i) => t.tags?.[i] || x);
      stmts.push(insert("article", row.id, lang, ver, t, JSON.stringify(labels)));
    }
    for (const [key, t] of Object.entries(seed.pages || {})) if (PAGES[key]) stmts.push(insert("page", key, lang, await pageVer(key), t));
  }
  stmts.push(db.prepare("INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)").bind(marker));
  await db.batch(stmts);
}
// The LinkedIn editions bundled with the site are copied into the articles table once, so the
// CMS can edit them. Existing rows (same slug) are never overwritten.
const EDITION_CATEGORY = { "shadow-war": "Security", "iron-dome-east": "Security", "dhaka-reset": "Diplomacy", "delhis-red-line": "Security", "deterrence-without-firing": "Security",
  "naravane-midnight-call": "Security", "cia-invisible-front": "Analysis", "pakistan-1971-moment": "Geopolitics", "begging-bowls-terror-hubs": "Geopolitics",
  "bangladesh-breaking-point": "Geopolitics", "silent-superpower": "India", "iran-500m-masterstroke": "Diplomacy", "himalayan-tunnel": "Security" };
async function seedEditions(db, applied) {
  const marker = `seed_editions_${editions.length}`;
  if (applied.has(marker)) return;
  const now = new Date().toISOString();
  await db.batch([
    ...editions.map(e => db.prepare(`INSERT OR IGNORE INTO articles (id,slug,kind,title,dek,topic,tags,body,category,status,writer,published_at,image_url,source_url,created_at,updated_at)
      VALUES (?,?,'edition',?,?,?,?,?,?,'published','ilmaz-syed',?,?,?,?,?)`).bind(`ed-${e.slug}`, e.slug, e.title, e.dek, e.topic, splitTags(e.topic.replace(/ · /g, ",")).join(","), blocksToText(editionBodies[e.slug]?.blocks),
      EDITION_CATEGORY[e.slug] || "Analysis", new Date(`${e.date}T09:00:00+05:30`).toISOString(), e.image, e.url, now, now)),
    db.prepare("INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)").bind(marker)
  ]);
}
function ensureSchema(env) {
  if (!schemaReady) schemaReady = migrate(env.DB).catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}
// The autopublisher signs in with "Authorization: Bearer <PUBLISH_TOKEN>" (a Worker secret) and
// acts as the built-in admin. Tokens shorter than 24 characters are ignored.
async function publisherUser(request, env) {
  const header = request.headers.get("Authorization") || "";
  const secret = String(env.PUBLISH_TOKEN || "");
  if (!header.startsWith("Bearer ") || secret.length < 24 || !adminEmail(env)) return null;
  if ((await sha256(header.slice(7).trim())) !== (await sha256(secret))) return null;
  const find = () => env.DB.prepare("SELECT id,email,display_name,role FROM users WHERE email=?").bind(adminEmail(env)).first();
  let row = await find();
  // An empty password hash never verifies; the admin's first password sign-in sets a real one.
  if (!row) { await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,role) VALUES (?,?,?,'','admin')").bind(randomId(), adminEmail(env), "Ilmaz Syed").run(); row = await find(); }
  return { ...row, role: "admin" };
}
async function currentUser(request, env) {
  if (!env.DB) return null;
  await ensureSchema(env);
  if (request.headers.has("Authorization")) return publisherUser(request, env);
  const token = getCookie(request, "rw_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT users.id, users.email, users.display_name, users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?"
  ).bind(tokenHash, Math.floor(Date.now()/1000)).first();
  return row || null;
}
function slugify(s) { return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90) || randomId(); }
function allowedRoles(user, roles) { return user && roles.includes(user.role); }
const isStaff = user => allowedRoles(user, ["admin", "editor"]);
const httpsUrl = (v, max = 1500) => { const s = String(v || "").trim().slice(0, max); return /^https:\/\//i.test(s) ? s : ""; };
// Images: an HTTPS URL, an uploaded image (/media/…) or bundled artwork (/editions/…).
const imageRef = v => { const s = String(v || "").trim().slice(0, 1500); return /^\/(media|editions)\/[\w.-]+$/.test(s) ? s : httpsUrl(s); };
const writerKey = v => WRITERS.some(w => w.key === v) ? v : DEFAULT_WRITER;
const tagsValue = v => splitTags(Array.isArray(v) ? v.join(",") : v).map(t => t.slice(0, 40)).join(",");
const truthy = v => v === true || v === "on" || v === "true" || v === "1";
// Alerts are on by default; the newsroom can switch one off for a single item.
const wantsAlert = v => !(v === false || v === "false" || v === "0" || v === "off");
// A story alert goes out when the story is public; a scheduled story's alert waits for the cron.
async function storyAlert(env, ctx, user, row) {
  const live = row.status === "published" && row.published_at && row.published_at <= new Date().toISOString();
  if (!live) { await env.DB.prepare("UPDATE articles SET alert_state='pending' WHERE id=?").bind(row.id).run(); return "pending"; }
  await createAlert(env, ctx, { title: row.kind === "edition" ? "New Raisina Wire edition" : "New on Raisina Wire", body: row.title, url: `/${row.kind === "edition" ? "edition" : "article"}/${encodeURIComponent(row.slug)}`, userId: user?.id });
  await env.DB.prepare("UPDATE articles SET alert_state='sent' WHERE id=?").bind(row.id).run();
  return "sent";
}
// Push services the Worker may call (PUSH_ALLOW_HOSTS adds hosts for local testing).
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.api\.chrome\.google\.com$/];
function pushEndpointOk(env, v) {
  try {
    const u = new URL(String(v));
    const extra = String(env.PUSH_ALLOW_HOSTS || "").split(",").map(x => x.trim()).filter(Boolean);
    if (extra.includes(u.hostname)) return true;
    return u.protocol === "https:" && PUSH_HOSTS.some(r => r.test(u.hostname));
  } catch { return false; }
}
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|curl|wget|python|headless/i;
// A slug that is free in `table`: "my-title", then "my-title-2", "my-title-3"…
async function uniqueSlug(env, table, wanted, exceptId = null) {
  const base = slugify(wanted);
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base.slice(0, 84)}-${i}`;
    const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE slug=?`).bind(slug).first();
    if (!row || row.id === exceptId) return slug;
  }
  return `${base.slice(0, 70)}-${randomId().slice(0, 8)}`;
}
async function audit(env, user, action, type, id, details) {
  await env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,target_type,target_id,details) VALUES (?,?,?,?,?,?)").bind(randomId(), user.id, action, type, id, JSON.stringify(details || {})).run();
}
// Sign-in throttling: 8 failures per email and 30 per address in 15 minutes.
const LOGIN_WINDOW = 15 * 60;
async function loginBlocked(env, keys) {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, limit] of keys) {
    const row = await env.DB.prepare("SELECT failures,window_start FROM login_attempts WHERE key=?").bind(key).first();
    if (row && now - row.window_start < LOGIN_WINDOW && row.failures >= limit) return true;
  }
  return false;
}
async function recordLoginFailure(env, keys) {
  const now = Math.floor(Date.now() / 1000);
  for (const [key] of keys) {
    await env.DB.prepare(`INSERT INTO login_attempts (key,failures,window_start) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN ?-window_start>=? THEN 1 ELSE failures+1 END,
      window_start=CASE WHEN ?-window_start>=? THEN ? ELSE window_start END`).bind(key, now, now, LOGIN_WINDOW, now, LOGIN_WINDOW, now).run();
  }
}
const clearLoginFailures = (env, keys) => Promise.all(keys.map(([key]) => env.DB.prepare("DELETE FROM login_attempts WHERE key=?").bind(key).run()));
// Built-in admin: ADMIN_EMAIL is a plain var, ADMIN_PASSWORD a Worker secret (never in the repo).
function adminEmail(env) { return String(env.ADMIN_EMAIL || "").trim().toLowerCase(); }
async function isAdminLogin(env, email, password) {
  if (!env.ADMIN_PASSWORD || !adminEmail(env) || email !== adminEmail(env)) return false;
  return (await sha256(password)) === (await sha256(env.ADMIN_PASSWORD));
}

async function gdeltNews(url) {
  const q = url.searchParams.get("q") || "(geopolitics OR diplomacy OR security OR conflict)";
  const safeQ = q.slice(0, 220);
  const api = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  api.searchParams.set("query", safeQ);
  api.searchParams.set("mode", "ArtList");
  api.searchParams.set("format", "json");
  api.searchParams.set("sort", "DateDesc");
  api.searchParams.set("maxrecords", "30");
  api.searchParams.set("timespan", "24h");
  const response = await fetch(api, { headers: { "user-agent": "RaisinaWire/1.0 (editorial research)" } });
  if (!response.ok) throw new Error(`GDELT returned ${response.status}`);
  const data = await response.json();
  const articles = (data.articles || []).map((a, i) => ({
    id: `${a.url || a.title || i}`,
    title: a.title || "Untitled report",
    url: a.url || "#",
    domain: a.domain || "",
    sourceCountry: a.sourcecountry || "",
    language: a.language || "",
    publishedAt: a.seendate || "",
    image: a.socialimage || "",
    tone: a.tone ?? null,
    source: "GDELT / publisher"
  })).filter(a => a.url.startsWith("http"));
  return { source: "GDELT DOC 2.0", updatedAt: new Date().toISOString(), query: safeQ, articles };
}

async function api(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });

  if (url.pathname === "/api/health") return json({ ok: true, service: "Raisina Wire API", time: new Date().toISOString(), database: Boolean(env.DB) }, 200, { "cache-control":"no-store" });

  if (url.pathname === "/api/news") {
    try { return json(await gdeltNews(url)); }
    catch (e) { return json({ source: "GDELT DOC 2.0", updatedAt: null, articles: [], error: "Live news feed temporarily unavailable", detail: e.message }, 502); }
  }
  if (url.pathname === "/api/markets") {
    return json(await cached("markets", 45e3, marketBoard), 200, { "cache-control":"public, max-age=45, s-maxage=60" });
  }
  if (url.pathname === "/api/wire") {
    const lang = isLang(url.searchParams.get("lang")) ? url.searchParams.get("lang") : "";
    return json(await cached(`wire${lang}`, 90e3, () => liveWire(lang)), 200, { "cache-control":"public, max-age=60, s-maxage=90" });
  }
  if (url.pathname === "/api/read") {
    const target = url.searchParams.get("url") || "";
    const optOut = String(env.PUBLISHER_OPT_OUT || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    const result = await cached(`read:${target}`, 10 * 60e3, () => readArticle(target, { optOut }));
    return json(result, 200, { "cache-control":"public, max-age=600, s-maxage=600" });
  }
  if (url.pathname === "/api/config") {
    return json({ appName: env.APP_NAME || "Raisina Wire", linkedinUrl: env.LINKEDIN_URL || "", registrationEnabled: Boolean(env.DB), marketProviderConfigured: true, marketProvider: "keyless public feeds", marketRefreshSeconds: 60 });
  }

  if (!env.DB) return err("Database is not configured. Add a D1 binding before using account and publishing features.", 503);
  try { await ensureSchema(env); } catch (e) { return err("The database could not be prepared. Try again shortly.", 503); }

  if (url.pathname === "/api/auth/register" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim().slice(0, 80);
    const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2 || password.length < 12) {
      return err("Enter a valid email, a name, and a password of at least 12 characters.");
    }
    if (email === adminEmail(env)) return err("This email is reserved. Sign in instead.", 409);
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    if (existing) return err("An account with this email already exists.", 409);
    const id = randomId(), salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await passwordHash(password, salt);
    await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash) VALUES (?,?,?,?)").bind(id,email,displayName,hash).run();
    return json({ ok:true, message:"Account created. Sign in to continue." }, 201, { "cache-control":"no-store" });
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase(), password = String(body.password || "");
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const keys = [[`email:${email}`, 8], [`ip:${ip}`, 30]];
    if (await loginBlocked(env, keys)) return err("Too many sign-in attempts. Wait 15 minutes and try again.", 429);
    let row = await env.DB.prepare("SELECT id,email,display_name,role,password_hash FROM users WHERE email=?").bind(email).first();
    if (await isAdminLogin(env, email, password)) {
      // The secret is the source of truth: create the admin account on first sign-in, keep it admin afterwards.
      const hash = await passwordHash(password, b64(crypto.getRandomValues(new Uint8Array(16))));
      if (row) await env.DB.prepare("UPDATE users SET role='admin', password_hash=? WHERE id=?").bind(hash,row.id).run();
      else await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,role) VALUES (?,?,?,?,'admin')").bind(randomId(),email,"Ilmaz Syed",hash).run();
      row = await env.DB.prepare("SELECT id,email,display_name,role,password_hash FROM users WHERE email=?").bind(email).first();
    } else if (!row || !(await verifyPassword(password, row.password_hash))) { await recordLoginFailure(env, keys); return err("Email or password is incorrect.", 401); }
    await clearLoginFailures(env, keys);
    const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, c => ({"+":"-","/":"_","=":""}[c]));
    const tokenHash = await sha256(token), expires = Math.floor(Date.now()/1000) + 60*60*24*14;
    await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(tokenHash,row.id,expires).run();
    return json({ ok:true, user:{ id:row.id,email:row.email,displayName:row.display_name,role:row.role } }, 200, { "set-cookie":cookie("rw_session",token,60*60*24*14), "cache-control":"no-store" });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = getCookie(request,"rw_session");
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return json({ ok:true },200,{ "set-cookie":cookie("rw_session","",0),"cache-control":"no-store" });
  }

  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    const user = await currentUser(request,env);
    return json({ user: user ? { id:user.id,email:user.email,displayName:user.display_name,role:user.role } : null },200,{ "cache-control":"no-store" });
  }

  if (url.pathname === "/api/auth/me" && request.method === "PUT") {
    const user = await currentUser(request, env);
    if (!user) return err("Sign in required.", 401);
    const b = await request.json().catch(() => ({}));
    const displayName = String(b.displayName || "").trim().slice(0, 80);
    if (displayName.length < 2) return err("Your name must be at least 2 characters.");
    await env.DB.prepare("UPDATE users SET display_name=? WHERE id=?").bind(displayName, user.id).run();
    return json({ ok: true, user: { ...user, displayName } }, 200, { "cache-control": "no-store" });
  }
  // Account deletion (Privacy Policy, DPDP Act): removes the member and, by cascade, their sessions,
  // saved stories, topics, discussions and replies. Staff accounts are removed by an administrator.
  if (url.pathname === "/api/auth/me" && request.method === "DELETE") {
    const user = await currentUser(request, env);
    if (!user) return err("Sign in required.", 401);
    if (isStaff(user)) return err("Editor and administrator accounts can’t be deleted here. Ask an administrator.", 400);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM community_replies WHERE user_id=?").bind(user.id),
      env.DB.prepare("DELETE FROM community_replies WHERE post_id IN (SELECT id FROM community_posts WHERE user_id=?)").bind(user.id),
      env.DB.prepare("DELETE FROM community_posts WHERE user_id=?").bind(user.id),
      env.DB.prepare("DELETE FROM saved_items WHERE user_id=?").bind(user.id),
      env.DB.prepare("DELETE FROM saved_topics WHERE user_id=?").bind(user.id),
      env.DB.prepare("UPDATE push_subscriptions SET user_id=NULL WHERE user_id=?").bind(user.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
      env.DB.prepare("DELETE FROM users WHERE id=?").bind(user.id)
    ]);
    return json({ ok: true }, 200, { "set-cookie": cookie("rw_session", "", 0), "cache-control": "no-store" });
  }
  if (url.pathname === "/api/auth/password" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return err("Sign in required.", 401);
    if (user.email === adminEmail(env) && env.ADMIN_PASSWORD) return err("The built-in admin password is set in Cloudflare (ADMIN_PASSWORD), not here.", 400);
    const b = await request.json().catch(() => ({}));
    const current = String(b.currentPassword || ""), next = String(b.newPassword || "");
    if (next.length < 12) return err("The new password must be at least 12 characters.");
    const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id=?").bind(user.id).first();
    if (!row || !(await verifyPassword(current, row.password_hash))) return err("Your current password is incorrect.", 401);
    const hash = await passwordHash(next, b64(crypto.getRandomValues(new Uint8Array(16))));
    await env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(hash, user.id).run();
    // Sign out other devices; keep this session.
    const token = getCookie(request, "rw_session");
    await env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(user.id, token ? await sha256(token) : "").run();
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }

  if (url.pathname === "/api/topics" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!user) return err("Sign in required.",401);
    const rows = await env.DB.prepare("SELECT topic FROM saved_topics WHERE user_id=? ORDER BY topic").bind(user.id).all();
    return json({ topics: rows.results.map(x=>x.topic) },200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/topics" && request.method === "POST") {
    const user = await currentUser(request,env);
    if (!user) return err("Sign in required.",401);
    const body = await request.json().catch(()=>({}));
    const topic = String(body.topic||"").trim().slice(0,80);
    if (!topic) return err("Topic is required.");
    await env.DB.prepare("INSERT OR IGNORE INTO saved_topics(user_id,topic) VALUES (?,?)").bind(user.id,topic).run();
    return json({ok:true},200,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/topics/") && request.method === "DELETE") {
    const user = await currentUser(request,env);
    if (!user) return err("Sign in required.",401);
    const topic = decodeURIComponent(url.pathname.split("/").pop());
    await env.DB.prepare("DELETE FROM saved_topics WHERE user_id=? AND topic=?").bind(user.id,topic).run();
    return json({ok:true},200,{"cache-control":"no-store"});
  }

  // Lean editorial console: multimedia metadata and live text coverage.
  if (url.pathname === "/api/admin/media" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const rows = await env.DB.prepare("SELECT * FROM media_items ORDER BY updated_at DESC LIMIT 100").all();
    return json({items:rows.results},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/media" && request.method === "POST") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const b = await request.json().catch(()=>({}));
    const title=String(b.title||"").trim().slice(0,180), mediaUrl=String(b.mediaUrl||"").trim().slice(0,1500);
    // An HTTPS address, or a video shipped with the site (/videos/…, made by the video engine).
    if(title.length<3 || !(/^https:\/\//i.test(mediaUrl) || /^\/videos\/[\w.-]+$/.test(mediaUrl))) return err("Add a title and a valid HTTPS media URL.");
    // "short" is a vertical (9:16) video: story bubbles on the homepage and Shorts on Watch.
    const type=["video","short","image","gallery","audio","embed"].includes(b.mediaType)?b.mediaType:"video";
    const status=b.status==="published"?"published":"draft", id=randomId();
    await env.DB.prepare("INSERT INTO media_items (id,title,description,media_type,media_url,thumbnail_url,category,status,author_id,published_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,title,String(b.description||"").slice(0,2000),type,mediaUrl,String(b.thumbnailUrl||"").slice(0,1500),String(b.category||"Geopolitics").slice(0,50),status,user.id,status==="published"?new Date().toISOString():null).run();
    return json({ok:true,id},201,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/media/") && request.method === "PUT") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const id = decodeURIComponent(url.pathname.split("/").pop()), b = await request.json().catch(() => ({}));
    const status = b.status === "published" ? "published" : "draft";
    const res = await env.DB.prepare("UPDATE media_items SET status=?, published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END, updated_at=? WHERE id=?").bind(status, status, new Date().toISOString(), new Date().toISOString(), id).run();
    if (!res.meta.changes) return err("Media item not found.", 404);
    await audit(env, user, "media.status", "media_item", id, { status });
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/admin/live" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const rows=await env.DB.prepare("SELECT * FROM live_coverage ORDER BY updated_at DESC LIMIT 100").all();
    return json({items:rows.results},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/live" && request.method === "POST") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const b=await request.json().catch(()=>({})), title=String(b.title||"").trim().slice(0,180);
    if(title.length<5) return err("Live coverage title must be at least 5 characters.");
    const id=randomId(), slug=await uniqueSlug(env,"live_coverage",b.slug||title), status=b.status==="live"?"live":"draft";
    await env.DB.prepare("INSERT INTO live_coverage (id,slug,title,summary,status,author_id,started_at) VALUES (?,?,?,?,?,?,?)").bind(id,slug,title,String(b.summary||"").slice(0,500),status,user.id,status==="live"?new Date().toISOString():null).run();
    await audit(env,user,"live.create","live_coverage",id,{title,status});
    if (status === "live" && wantsAlert(b.notify)) await createAlert(env, ctx, { title: "LIVE · Raisina Wire", body: title, url: `/coverage/${encodeURIComponent(slug)}`, userId: user.id });
    return json({ok:true,id,slug},201,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/live/") && !url.pathname.endsWith("/updates") && request.method === "PUT") {
    const user=await currentUser(request,env);
    if (!isStaff(user)) return err("Editor access required.",403);
    const id=decodeURIComponent(url.pathname.split("/").pop()), b=await request.json().catch(()=>({}));
    const status=["live","ended","draft"].includes(b.status)?b.status:null;
    if(!status) return err("Status must be live, ended or draft.");
    const now=new Date().toISOString();
    const res=await env.DB.prepare(`UPDATE live_coverage SET status=?, started_at=CASE WHEN ?='live' THEN COALESCE(started_at,?) ELSE started_at END,
      ended_at=CASE WHEN ?='ended' THEN ? ELSE NULL END, updated_at=? WHERE id=?`).bind(status,status,now,status,now,now,id).run();
    if(!res.meta.changes) return err("Live coverage not found.",404);
    await audit(env,user,"live.status","live_coverage",id,{status});
    if (status === "live" && wantsAlert(b.notify) && b.notify !== undefined) {
      const row = await env.DB.prepare("SELECT slug,title FROM live_coverage WHERE id=?").bind(id).first();
      await createAlert(env, ctx, { title: "LIVE · Raisina Wire", body: row.title, url: `/coverage/${encodeURIComponent(row.slug)}`, userId: user.id });
    }
    return json({ok:true},200,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/live/") && url.pathname.endsWith("/updates") && request.method === "POST") {
    const user=await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const id=decodeURIComponent(url.pathname.split("/")[4]||""), b=await request.json().catch(()=>({})), body=String(b.body||"").trim();
    if(!body) return err("Live update text is required.");
    const exists=await env.DB.prepare("SELECT id FROM live_coverage WHERE id=?").bind(id).first();
    if(!exists) return err("Live coverage not found.",404);
    await env.DB.prepare("INSERT INTO live_updates (id,coverage_id,body,media_url,source_url,author_id) VALUES (?,?,?,?,?,?)").bind(randomId(),id,body.slice(0,12000),String(b.mediaUrl||"").slice(0,1500),String(b.sourceUrl||"").slice(0,1500),user.id).run();
    if (truthy(b.notify)) {
      const cov = await env.DB.prepare("SELECT slug,title FROM live_coverage WHERE id=?").bind(id).first();
      await createAlert(env, ctx, { title: `LIVE · ${cov.title}`.slice(0, 140), body: body.slice(0, 200), url: `/coverage/${encodeURIComponent(cov.slug)}`, userId: user.id });
    }
    await env.DB.prepare("UPDATE live_coverage SET status='live', started_at=COALESCE(started_at,?), updated_at=? WHERE id=?").bind(new Date().toISOString(),new Date().toISOString(),id).run();
    return json({ok:true},201,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/live" && request.method === "GET") {
    const rows=await env.DB.prepare("SELECT id,slug,title,summary,status,started_at AS startedAt,ended_at AS endedAt FROM live_coverage WHERE status='live' ORDER BY started_at DESC LIMIT 20").all();
    return json({items:rows.results});
  }
  if (url.pathname.startsWith("/api/live/") && request.method === "GET") {
    const slug=decodeURIComponent(url.pathname.split("/").pop()||"");
    const item=await env.DB.prepare("SELECT id,slug,title,summary,status,started_at AS startedAt,ended_at AS endedAt FROM live_coverage WHERE slug=? AND status IN ('live','ended')").bind(slug).first();
    if(!item) return err("Live coverage not found.",404);
    const updates=await env.DB.prepare("SELECT body,media_url AS mediaUrl,source_url AS sourceUrl,created_at AS createdAt FROM live_updates WHERE coverage_id=? ORDER BY created_at DESC LIMIT 100").bind(item.id).all();
    return json({item,updates:updates.results});
  }
  if (url.pathname === "/api/media" && request.method === "GET") {
    const rows=await env.DB.prepare("SELECT id,title,description,media_type AS mediaType,media_url AS mediaUrl,thumbnail_url AS thumbnailUrl,category,published_at AS publishedAt FROM media_items WHERE status='published' ORDER BY published_at DESC LIMIT 50").all();
    return json({items:rows.results});
  }

  if (url.pathname === "/api/articles" && request.method === "GET") {
    const w = url.searchParams.get("writer");
    const list = await listPublished(env, { writerKey: WRITERS.some(x => x.key === w) ? w : null, tag: url.searchParams.get("tag"), limit: 300 });
    return json({ articles: await localiseArticles(env, url.searchParams.get("lang"), list) });
  }
  if (url.pathname === "/api/tags" && request.method === "GET") {
    const counts = new Map();
    for (const a of await listPublished(env, { limit: 1000 })) for (const t of a.tags) { const k = tagSlug(t); const c = counts.get(k) || { name: t, slug: k, count: 0 }; c.count++; counts.set(k, c); }
    return json({ tags: [...counts.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)) });
  }
  if (url.pathname.startsWith("/api/articles/") && request.method === "GET") {
    const a = await getBySlug(env, decodeURIComponent(url.pathname.split("/").pop() || ""));
    if (!a) return err("Article not found.", 404);
    if (!isPublic(a) && !isStaff(await currentUser(request, env))) return err("Article not found.", 404);
    const [localised] = await localiseArticles(env, url.searchParams.get("lang"), [a]);
    return json({ article: localised }, 200, { "cache-control": isPublic(a) ? "no-cache" : "no-store" });
  }

  // About and the legal pages in Hindi or Bengali (English when no current translation exists).
  if (/^\/api\/pages\/[\w-]+$/.test(url.pathname) && request.method === "GET") {
    const key = url.pathname.split("/").pop();
    if (!PAGES[key]) return err("Page not found.", 404);
    const p = await localisePage(env, url.searchParams.get("lang"), key);
    return json({ page: { key, title: p.title, html: p.html, lang: p.lang } });
  }
  // Translations in the control room: which stories and pages have Hindi and Bengali versions,
  // written by the editor next to the English.
  if (url.pathname === "/api/admin/translations" && request.method === "GET") {
    if (!isStaff(await currentUser(request, env))) return err("Editor access required.", 403);
    const { results: rows } = await env.DB.prepare("SELECT kind,ref,lang,src_ver,updated_at FROM translations WHERE title<>''").all();
    const rowOf = new Map(rows.map(r => [`${r.kind}|${r.ref}|${r.lang}`, r]));
    const state = (kind, ref, ver) => Object.fromEntries(LANGS.map(l => {
      const r = rowOf.get(`${kind}|${ref}|${l}`);
      return [l, { status: !r ? "missing" : r.src_ver === ver ? "ready" : "English changed", exists: !!r, updatedAt: r?.updated_at || "" }];
    }));
    const { results: arts } = await env.DB.prepare("SELECT id,slug,kind,title,status,text_hash FROM articles ORDER BY COALESCE(published_at,updated_at) DESC LIMIT 500").all();
    const items = arts.map(a => ({ kind: "article", ref: a.id, slug: a.slug, title: a.title, status: a.status, href: `/${a.kind === "edition" ? "edition" : "article"}/${a.slug}`, langs: state("article", a.id, a.text_hash) }));
    for (const key of Object.keys(PAGES)) items.push({ kind: "page", ref: key, title: PAGES[key].title, href: `/${key}`, langs: state("page", key, await pageVer(key)) });
    return json({ langs: LANGS, items }, 200, { "cache-control": "no-store" });
  }
  const trMatch = url.pathname.match(/^\/api\/admin\/translations\/(article|page)\/([^/]+)\/(hi|bn)$/);
  if (trMatch) {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const [, kind, ref, lang] = trMatch.map(x => x && decodeURIComponent(x));
    const src = kind === "page" ? (PAGES[ref] ? { title: PAGES[ref].title, body: PAGES[ref].html, ver: await pageVer(ref) } : null)
      : await env.DB.prepare("SELECT title,dek,topic,hero_caption,tags,body,text_hash AS ver FROM articles WHERE id=?").bind(ref).first();
    if (!src) return err("Not found.", 404);
    if (request.method === "GET") {
      const t = await env.DB.prepare("SELECT title,dek,topic,hero_caption,tags,body,src_ver FROM translations WHERE kind=? AND ref=? AND lang=? AND title<>''").bind(kind, ref, lang).first();
      let tags = []; try { tags = JSON.parse(t?.tags || "[]"); } catch { /* none */ }
      return json({ source: { title: src.title, dek: src.dek || "", topic: src.topic || "", heroCaption: src.hero_caption || "", tags: splitTags(src.tags), body: src.body || "" },
        translation: t ? { title: t.title, dek: t.dek, topic: t.topic, heroCaption: t.hero_caption, tags, body: t.body, current: t.src_ver === src.ver } : null }, 200, { "cache-control": "no-store" });
    }
    if (request.method === "PUT") {
      const b = await request.json().catch(() => ({}));
      const title = String(b.title || "").trim().slice(0, 300), body = String(b.body || "").slice(0, 200000);
      if (!title || !body.trim()) return err(`The ${lang === "hi" ? "Hindi" : "Bengali"} version needs a headline and text.`);
      const tags = JSON.stringify(splitTags(src.tags).map((t, i) => String(b.tags?.[i] || t).trim().slice(0, 60)));
      await env.DB.prepare(`INSERT INTO translations (kind,ref,lang,src_ver,title,dek,topic,hero_caption,tags,body,status,model,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'manual','editor',?)
        ON CONFLICT(kind,ref,lang) DO UPDATE SET src_ver=excluded.src_ver, title=excluded.title, dek=excluded.dek, topic=excluded.topic, hero_caption=excluded.hero_caption, tags=excluded.tags, body=excluded.body, status='manual', model='editor', updated_at=excluded.updated_at`)
        .bind(kind, ref, lang, src.ver, title, String(b.dek || "").trim().slice(0, 600), String(b.topic || "").trim().slice(0, 120), String(b.heroCaption || "").trim().slice(0, 400), tags, body, new Date().toISOString()).run();
      await audit(env, user, "translation.save", kind, ref, { lang });
      return json({ ok: true }, 200, { "cache-control": "no-store" });
    }
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM translations WHERE kind=? AND ref=? AND lang=?").bind(kind, ref, lang).run();
      await audit(env, user, "translation.delete", kind, ref, { lang });
      return json({ ok: true }, 200, { "cache-control": "no-store" });
    }
    return err("Method not allowed.", 405);
  }

  if (url.pathname === "/api/admin/articles" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!isStaff(user)) return err("Editor access required.",403);
    const rows = await env.DB.prepare(`SELECT ${ARTICLE_COLS},body FROM articles ORDER BY COALESCE(published_at,updated_at) DESC LIMIT 500`).all();
    const { results: tr } = await env.DB.prepare("SELECT ref,lang FROM translations WHERE kind='article' AND title<>''").all();
    const langsOf = id => tr.filter(t => t.ref === id).map(t => t.lang);
    return json({ articles: rows.results.map(r => ({ ...toArticle(r, { body: true }), langs: langsOf(r.id) })), writers: WRITERS.map(w => ({ key: w.key, name: w.name })) },200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/articles" && request.method === "POST") {
    const user = await currentUser(request,env);
    if (!isStaff(user)) return err("Editor access required.",403);
    const b = await request.json().catch(()=>({}));
    const title = String(b.title||"").trim().slice(0,180);
    if (title.length < 8) return err("Title must be at least 8 characters.");
    const id = randomId(), slug = await uniqueSlug(env, "articles", b.slug || title), status = b.status === "published" ? "published" : "draft";
    const publishedAt = status === "published" ? (Date.parse(b.publishedAt) ? new Date(b.publishedAt).toISOString() : new Date().toISOString()) : null;
    const category = String(b.category||"Analysis").slice(0,40);
    const text = { title, dek: String(b.dek||"").trim().slice(0,400), topic: String(b.topic||"").trim().slice(0,80), tags: tagsValue(b.tags), body: String(b.body||"").slice(0,100000), hero_caption: String(b.heroCaption||"").trim().slice(0,300) };
    await env.DB.prepare("INSERT INTO articles (id,slug,kind,title,dek,topic,tags,body,category,status,author_id,writer,published_at,image_url,hero_url,hero_caption,source_url,text_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(
      id, slug, b.kind === "edition" ? "edition" : "article", title, text.dek, text.topic, text.tags, text.body,
      category, status, user.id, writerKey(b.writer), publishedAt, imageRef(b.imageUrl), imageRef(b.heroUrl), text.hero_caption, httpsUrl(b.sourceUrl), await textHash(text)).run();
    await audit(env, user, "article.create", "article", id, { title, status });
    const alert = wantsAlert(b.notify) && status === "published" ? await storyAlert(env, ctx, user, { id, slug, title, status, kind: b.kind === "edition" ? "edition" : "article", published_at: publishedAt }) : "";
    return json({ok:true,id,slug,alert},201,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/articles/") && request.method === "PUT") {
    const user = await currentUser(request,env);
    if (!isStaff(user)) return err("Editor access required.",403);
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const c = await env.DB.prepare("SELECT * FROM articles WHERE id=?").bind(id).first();
    if (!c) return err("Article not found.",404);
    const b = await request.json().catch(()=>({}));
    const pick = (key, fn, cur) => b[key] !== undefined ? fn(b[key]) : cur;
    const title = pick("title", v => String(v).trim().slice(0,180), c.title);
    if (title.length < 8) return err("Title must be at least 8 characters.");
    const status = ["draft","published","archived"].includes(b.status) ? b.status : c.status;
    const publishedAt = status === "published" ? (Date.parse(b.publishedAt) ? new Date(b.publishedAt).toISOString() : (c.published_at || new Date().toISOString())) : c.published_at;
    const text = { title, dek: pick("dek", v => String(v).trim().slice(0,400), c.dek), topic: pick("topic", v => String(v).trim().slice(0,80), c.topic),
      tags: pick("tags", tagsValue, c.tags), body: pick("body", v => String(v).slice(0,100000), c.body), hero_caption: pick("heroCaption", v => String(v).trim().slice(0,300), c.hero_caption) };
    await env.DB.prepare("UPDATE articles SET title=?,dek=?,topic=?,tags=?,body=?,category=?,kind=?,writer=?,status=?,published_at=?,image_url=?,hero_url=?,hero_caption=?,source_url=?,updated_at=?,text_hash=?,alert_state=CASE WHEN ?<>'published' AND alert_state='pending' THEN '' ELSE alert_state END WHERE id=?").bind(
      title, text.dek, text.topic, text.tags, text.body,
      pick("category", v => String(v).slice(0,40), c.category),
      pick("kind", v => v === "edition" ? "edition" : "article", c.kind),
      pick("writer", writerKey, c.writer),
      status, publishedAt,
      pick("imageUrl", imageRef, c.image_url),
      pick("heroUrl", imageRef, c.hero_url),
      text.hero_caption,
      pick("sourceUrl", httpsUrl, c.source_url),
      new Date().toISOString(), await textHash(text), status, id).run();
    await audit(env,user,"article.update","article",id,{title,status});
    // First publication of a story sends its alert (unless switched off); later edits never re-send.
    const firstPublish = c.status !== "published" || c.alert_state === "pending";
    const alert = wantsAlert(b.notify) && status === "published" && firstPublish && c.alert_state !== "sent" ? await storyAlert(env, ctx, user, { id, slug: c.slug, title, status, kind: b.kind === "edition" || (b.kind === undefined && c.kind === "edition") ? "edition" : "article", published_at: publishedAt }) : "";
    return json({ok:true,slug:c.slug,alert},200,{"cache-control":"no-store"});
  }

  // Images uploaded by writers: stored in D1 (resized in the browser first) and served from /media/.
  if (url.pathname === "/api/admin/images" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const mime = imageMime(bytes);
    if (!mime) return err("Upload a JPEG, PNG, WebP, AVIF or GIF image.");
    if (bytes.length > MAX_IMAGE_BYTES) return err("That image is too large. Use one under 1.8 MB (the uploader resizes large photos automatically).", 413);
    const id = randomId().replace(/-/g, "").slice(0, 20), ext = mime.split("/")[1].replace("jpeg", "jpg");
    const dim = v => Math.max(0, Math.min(20000, parseInt(v, 10) || 0));
    await env.DB.prepare("INSERT INTO images (id,mime,data,width,height,bytes,alt,uploaded_by) VALUES (?,?,?,?,?,?,?,?)").bind(id, mime, bytes.buffer, dim(request.headers.get("x-image-width")), dim(request.headers.get("x-image-height")), bytes.length, String(request.headers.get("x-image-alt") || "").slice(0, 300), user.id).run();
    await audit(env, user, "image.upload", "image", id, { bytes: bytes.length, mime });
    return json({ ok: true, id, url: `/media/${id}.${ext}` }, 201, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/admin/images" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const { results } = await env.DB.prepare("SELECT id,mime,width,height,bytes,alt,created_at AS createdAt FROM images ORDER BY created_at DESC LIMIT 60").all();
    return json({ images: results.map(r => ({ ...r, url: `/media/${r.id}.${r.mime.split("/")[1].replace("jpeg", "jpg")}` })) }, 200, { "cache-control": "no-store" });
  }

  // ---- Story views (no cookies: one count per story per browser session, bots ignored)
  if (/^\/api\/views\/[^/]+$/.test(url.pathname) && request.method === "POST") {
    const slug = decodeURIComponent(url.pathname.split("/").pop());
    if (BOT_UA.test(request.headers.get("user-agent") || "")) return json({ ok: true, counted: false }, 200, { "cache-control": "no-store" });
    const exists = await env.DB.prepare("SELECT 1 FROM articles WHERE slug=? AND status='published'").bind(slug).first();
    if (!exists) return err("Not found.", 404);
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare("INSERT INTO story_views (slug,day,views) VALUES (?,?,1) ON CONFLICT(slug,day) DO UPDATE SET views=views+1").bind(slug, day).run();
    return json({ ok: true, counted: true }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/admin/stats" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const since = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    const [top, per, week, today, subs] = await Promise.all([
      env.DB.prepare("SELECT v.slug, SUM(v.views) AS views, a.title, a.kind FROM story_views v JOIN articles a ON a.slug=v.slug WHERE v.day>=? GROUP BY v.slug ORDER BY views DESC LIMIT 10").bind(since(6)).all(),
      env.DB.prepare("SELECT slug, SUM(views) AS views FROM story_views WHERE day>=? GROUP BY slug").bind(since(29)).all(),
      env.DB.prepare("SELECT COALESCE(SUM(views),0) AS n FROM story_views WHERE day>=?").bind(since(6)).first(),
      env.DB.prepare("SELECT COALESCE(SUM(views),0) AS n FROM story_views WHERE day=?").bind(since(0)).first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").first()
    ]);
    return json({ top: top.results, views30: Object.fromEntries(per.results.map(r => [r.slug, r.views])), week: week.n, today: today.n, subscribers: subs.n }, 200, { "cache-control": "no-store" });
  }

  // ---- Saved stories that follow the member across devices
  if (url.pathname === "/api/me/saved") {
    const user = await currentUser(request, env);
    if (!user) return err("Sign in required.", 401);
    if (request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT href,title,source,saved_at AS savedAt FROM saved_items WHERE user_id=? ORDER BY saved_at DESC LIMIT 500").bind(user.id).all();
      return json({ items: results }, 200, { "cache-control": "no-store" });
    }
    if (request.method === "POST") {
      const b = await request.json().catch(() => ({}));
      const items = (Array.isArray(b.items) ? b.items : [b]).slice(0, 200).filter(x => typeof x?.href === "string" && x.href.startsWith("/") && !x.href.startsWith("//"));
      if (!items.length) return err("Nothing to save.");
      await env.DB.batch(items.map(x => env.DB.prepare("INSERT INTO saved_items (user_id,href,title,source,saved_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,href) DO NOTHING")
        .bind(user.id, x.href.slice(0, 1500), String(x.title || x.href).slice(0, 300), String(x.source || "").slice(0, 80), Date.parse(x.savedAt) ? new Date(x.savedAt).toISOString() : new Date().toISOString())));
      return json({ ok: true }, 200, { "cache-control": "no-store" });
    }
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM saved_items WHERE user_id=? AND href=?").bind(user.id, url.searchParams.get("href") || "").run();
      return json({ ok: true }, 200, { "cache-control": "no-store" });
    }
  }

  // ---- Breaking-news alerts
  if (url.pathname === "/api/push/key" && request.method === "GET") {
    return json({ publicKey: (await vapidKeys(env)).publicKey }, 200, { "cache-control": "public, max-age=3600" });
  }
  if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (!pushEndpointOk(env, b.endpoint) || String(b.endpoint).length > 1000) return err("This browser’s push service isn’t supported.");
    const user = await currentUser(request, env);
    await env.DB.prepare("INSERT INTO push_subscriptions (endpoint,user_id) VALUES (?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=COALESCE(excluded.user_id,user_id)").bind(b.endpoint, user?.id || null).run();
    return json({ ok: true }, 201, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(String(b.endpoint || "")).run();
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/alerts" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id,title,body,url,created_at AS createdAt FROM alerts ORDER BY created_at DESC LIMIT 20").all();
    return json({ alerts: results }, 200, { "cache-control": "no-cache" });
  }
  if (url.pathname === "/api/admin/alert-settings" && request.method === "PUT") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const b = await request.json().catch(() => ({}));
    await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('daily_alerts',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(b.daily === false ? "off" : "on").run();
    await audit(env, user, "alerts.daily", "settings", "daily_alerts", { on: b.daily !== false });
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/alerts/latest" && request.method === "GET") {
    const a = await env.DB.prepare("SELECT title,body,url,created_at AS createdAt FROM alerts ORDER BY created_at DESC LIMIT 1").first();
    return json({ alert: a || null }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/admin/alerts" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const [list, subs] = await Promise.all([env.DB.prepare("SELECT id,title,body,url,sent,done,created_at AS createdAt FROM alerts ORDER BY created_at DESC LIMIT 30").all(), env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").first()]);
    const daily = await env.DB.prepare("SELECT value FROM settings WHERE key='daily_alerts'").first();
    return json({ alerts: list.results, subscribers: subs.n, daily: daily?.value !== "off" }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/admin/alerts" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const b = await request.json().catch(() => ({}));
    const title = String(b.title || "").trim(), path = String(b.url || "/").trim();
    if (title.length < 3) return err("Write the alert headline.");
    if (!path.startsWith("/") || path.startsWith("//")) return err("The link must be a page on this site, e.g. /live or /edition/…");
    const id = await createAlert(env, ctx, { title, body: String(b.body || ""), url: path, userId: user.id });
    await audit(env, user, "alert.send", "alert", id, { title });
    return json({ ok: true, id }, 201, { "cache-control": "no-store" });
  }

  if (url.pathname.startsWith("/api/tts/") && request.method === "GET") return handleTts(request, env, url, json, err);

  if (url.pathname === "/api/community/stats" && request.method === "GET") {
    const [m, p, r] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM users").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM community_posts WHERE status='published'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM community_replies").first()
    ]);
    return json({ members: m.n, discussions: p.n, replies: r.n }, 200, { "cache-control": "public, max-age=300" });
  }

  if (url.pathname === "/api/admin/overview" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const [members, articles, drafts, leads, discussions, events] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM users").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE status='published'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE status='draft'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM leads").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM community_posts WHERE status='published'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published'").first()
    ]);
    const subscribers = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").first();
    return json({members:members.n,published:articles.n,drafts:drafts.n,leads:leads.n,discussions:discussions.n,events:events.n,subscribers:subscribers.n,generatedAt:new Date().toISOString()},200,{"cache-control":"no-store"});
  }


  // Discussions with replies, votes, latest activity and the most recent participants.
  if (url.pathname === "/api/community/posts" && request.method === "GET") {
    const user = await currentUser(request, env).catch(() => null);
    const sort = url.searchParams.get("sort") === "top" ? "top" : "latest";
    const topic = String(url.searchParams.get("topic") || "").slice(0, 80);
    const inLang = ["en", ...LANGS].includes(url.searchParams.get("lang")) ? url.searchParams.get("lang") : "";
    const rows = await env.DB.prepare(`SELECT p.id,p.title,p.body,p.topic,p.lang,p.created_at AS createdAt,u.display_name AS author,
        (SELECT COUNT(*) FROM community_replies r WHERE r.post_id=p.id) AS replies,
        (SELECT COUNT(*) FROM community_votes v WHERE v.post_id=p.id) AS votes,
        (SELECT MAX(r.created_at) FROM community_replies r WHERE r.post_id=p.id) AS lastReplyAt,
        (SELECT group_concat(name, '|') FROM (SELECT DISTINCT u2.display_name AS name FROM community_replies r2 JOIN users u2 ON u2.id=r2.user_id WHERE r2.post_id=p.id ORDER BY r2.created_at DESC LIMIT 4)) AS repliers,
        ${user ? "EXISTS(SELECT 1 FROM community_votes v WHERE v.post_id=p.id AND v.user_id=?)" : "0"} AS voted
      FROM community_posts p JOIN users u ON u.id=p.user_id
      WHERE p.status='published' ${topic ? "AND p.topic=?" : ""} ${inLang ? "AND p.lang=?" : ""}
      ORDER BY ${sort === "top" ? "(votes*2 + replies) DESC, COALESCE(lastReplyAt, p.created_at) DESC" : "COALESCE(lastReplyAt, p.created_at) DESC"} LIMIT 60`)
      .bind(...[user?.id, topic || undefined, inLang || undefined].filter(v => v !== undefined)).all();
    return json({ posts: rows.results.map(p => ({ ...p, voted: !!p.voted, repliers: p.repliers ? p.repliers.split("|") : [] })) }, 200, { "cache-control": "no-store" });
  }
  if (/^\/api\/community\/posts\/[^/]+\/vote$/.test(url.pathname) && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return err("Sign in to vote.", 401);
    const id = decodeURIComponent(url.pathname.split("/")[4]);
    const post = await env.DB.prepare("SELECT id FROM community_posts WHERE id=? AND status='published'").bind(id).first();
    if (!post) return err("Discussion not found.", 404);
    const del = await env.DB.prepare("DELETE FROM community_votes WHERE post_id=? AND user_id=?").bind(id, user.id).run();
    if (!del.meta.changes) await env.DB.prepare("INSERT INTO community_votes (post_id,user_id) VALUES (?,?)").bind(id, user.id).run();
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM community_votes WHERE post_id=?").bind(id).first();
    return json({ ok: true, voted: !del.meta.changes, votes: n.n }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/community/posts" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return err("Sign in required to start a discussion.", 401);
    const body = await request.json().catch(() => ({}));
    const title = String(body.title || "").trim().slice(0, 180);
    const content = String(body.body || "").trim().slice(0, 5000);
    const topic = String(body.topic || "General").trim().slice(0, 80);
    const lang = ["en", ...LANGS].includes(body.lang) ? body.lang : "en";
    if (title.length < 5 || content.length < 10) return err("Add a clear title and a post of at least 10 characters.");
    const id = randomId();
    await env.DB.prepare("INSERT INTO community_posts (id,user_id,title,body,topic,lang) VALUES (?,?,?,?,?,?)").bind(id,user.id,title,content,topic,lang).run();
    return json({ok:true,id},201,{"cache-control":"no-store"});
  }

  if (/^\/api\/community\/posts\/[^/]+$/.test(url.pathname) && request.method === "GET") {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const viewer = await currentUser(request, env).catch(() => null);
    const post = await env.DB.prepare(`SELECT p.id,p.title,p.body,p.topic,p.lang,p.created_at AS createdAt,u.display_name AS author,
      (SELECT COUNT(*) FROM community_votes v WHERE v.post_id=p.id) AS votes,
      ${viewer ? "EXISTS(SELECT 1 FROM community_votes v WHERE v.post_id=p.id AND v.user_id=?)" : "0"} AS voted
      FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.status='published'`).bind(...(viewer ? [viewer.id, id] : [id])).first();
    if (!post) return err("Discussion not found.", 404);
    post.voted = !!post.voted;
    const replies = await env.DB.prepare("SELECT r.id,r.body,r.created_at AS createdAt,u.display_name AS author FROM community_replies r JOIN users u ON u.id=r.user_id WHERE r.post_id=? ORDER BY r.created_at LIMIT 500").bind(id).all();
    return json({ post, replies: replies.results }, 200, { "cache-control": "no-store" });
  }
  if (/^\/api\/community\/posts\/[^/]+\/replies$/.test(url.pathname) && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return err("Sign in to reply.", 401);
    const id = decodeURIComponent(url.pathname.split("/")[4]);
    const post = await env.DB.prepare("SELECT id FROM community_posts WHERE id=? AND status='published'").bind(id).first();
    if (!post) return err("Discussion not found.", 404);
    const b = await request.json().catch(() => ({}));
    const body = String(b.body || "").trim().slice(0, 5000);
    if (body.length < 2) return err("Write a reply first.");
    const replyId = randomId();
    await env.DB.prepare("INSERT INTO community_replies (id,post_id,user_id,body) VALUES (?,?,?,?)").bind(replyId, id, user.id, body).run();
    return json({ ok: true, id: replyId }, 201, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/admin/community" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const rows = await env.DB.prepare("SELECT p.id,p.title,p.body,p.topic,p.status,p.created_at AS createdAt,u.display_name AS author,(SELECT COUNT(*) FROM community_replies r WHERE r.post_id=p.id) AS replies FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.status<>'removed' ORDER BY p.created_at DESC LIMIT 200").all();
    return json({ posts: rows.results }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname.startsWith("/api/admin/community-replies/") && request.method === "DELETE") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const id = decodeURIComponent(url.pathname.split("/").pop());
    await env.DB.prepare("DELETE FROM community_replies WHERE id=?").bind(id).run();
    await audit(env, user, "community.reply.delete", "community_reply", id, {});
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname.startsWith("/api/admin/community/") && request.method === "PUT") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const id=decodeURIComponent(url.pathname.split("/").pop()), b=await request.json().catch(()=>({}));
    const status=String(b.status||"");
    if(!["published","hidden","removed"].includes(status)) return err("Invalid moderation status.");
    await env.DB.prepare("UPDATE community_posts SET status=? WHERE id=?").bind(status,id).run();
    await env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,target_type,target_id,details) VALUES (?,?,?,?,?,?)").bind(randomId(),user.id,"community.moderate","community_post",id,JSON.stringify({status})).run();
    return json({ok:true},200,{"cache-control":"no-store"});
  }

  if (url.pathname === "/api/events" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT id,title,description,event_type AS eventType,starts_at AS startsAt,access FROM events WHERE status='published' AND starts_at >= ? ORDER BY starts_at LIMIT 30").bind(new Date().toISOString()).all();
    return json({events:rows.results});
  }
  if (url.pathname === "/api/events" && request.method === "POST") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const b = await request.json().catch(()=>({}));
    const title=String(b.title||"").trim().slice(0,180), starts=String(b.startsAt||"");
    if(title.length<5 || Number.isNaN(Date.parse(starts))) return err("A title and valid start date are required.");
    const id=randomId();
    await env.DB.prepare("INSERT INTO events (id,title,description,event_type,starts_at,access,status,created_by) VALUES (?,?,?,?,?,?,?,?)").bind(id,title,String(b.description||"").slice(0,3000),String(b.eventType||"Briefing").slice(0,40),new Date(starts).toISOString(),["public","member","premium"].includes(b.access)?b.access:"public","published",user.id).run();
    if (wantsAlert(b.notify)) {
      const when = new Date(starts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
      await createAlert(env, ctx, { title: `New ${String(b.eventType || "briefing").toLowerCase()}: ${title}`.slice(0, 140), body: `${when} IST. Add it to your calendar on Raisina Wire.`, url: "/events", userId: user.id });
    }
    return json({ok:true,id},201,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/events" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!isStaff(user)) return err("Editor access required.",403);
    const rows = await env.DB.prepare("SELECT id,title,description,event_type AS eventType,starts_at AS startsAt,access,status FROM events ORDER BY starts_at DESC LIMIT 200").all();
    return json({events:rows.results},200,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/events/") && request.method === "PUT") {
    const user = await currentUser(request,env);
    if (!isStaff(user)) return err("Editor access required.",403);
    const id = decodeURIComponent(url.pathname.split("/").pop()), b = await request.json().catch(()=>({}));
    const status = ["published","cancelled","draft"].includes(b.status) ? b.status : null;
    if (!status) return err("Status must be published, cancelled or draft.");
    const res = await env.DB.prepare("UPDATE events SET status=? WHERE id=?").bind(status,id).run();
    if (!res.meta.changes) return err("Event not found.",404);
    await audit(env,user,"event.status","event",id,{status});
    return json({ok:true},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/lead" && request.method === "POST") {
    const b = await request.json().catch(()=>({}));
    const name=String(b.name||"").trim().slice(0,120), email=String(b.email||"").trim().toLowerCase().slice(0,180);
    if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Enter a name and valid email address.");
    const id=randomId();
    await env.DB.prepare("INSERT INTO leads (id,name,email,organisation,interest,source) VALUES (?,?,?,?,?,?)").bind(id,name,email,String(b.organisation||"").slice(0,180),String(b.interest||"General").slice(0,100),String(b.source||"Raisina Wire website").slice(0,100)).run();
    return json({ok:true,message:"Thanks. Your request has been received."},201,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/leads" && request.method === "GET") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const rows=await env.DB.prepare("SELECT * FROM leads ORDER BY created_at DESC LIMIT 500").all();
    return json({leads:rows.results},200,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/leads/") && request.method === "PUT") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const id=decodeURIComponent(url.pathname.split("/").pop()), b=await request.json().catch(()=>({}));
    const stage=String(b.stage||"New");
    if(!["New","Contacted","Qualified","Demo","Proposal","Won","Lost"].includes(stage)) return err("Invalid lead stage.");
    await env.DB.prepare("UPDATE leads SET stage=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(stage,String(b.notes||"").slice(0,5000),id).run();
    return json({ok:true},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/members" && request.method === "GET") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const rows=await env.DB.prepare("SELECT id,email,display_name AS displayName,role,created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 500").all();
    return json({members:rows.results},200,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/members/") && request.method === "PUT") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const id=decodeURIComponent(url.pathname.split("/").pop()), b=await request.json().catch(()=>({}));
    const role=String(b.role||"member");
    if(!["member","premium","analyst","editor","admin"].includes(role)) return err("Invalid role.");
    if(id===user.id && role!=="admin") return err("You cannot remove your own administrator role.");
    await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(role,id).run();
    await env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,target_type,target_id,details) VALUES (?,?,?,?,?,?)").bind(randomId(),user.id,"member.role.update","user",id,JSON.stringify({role})).run();
    return json({ok:true},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/social-metrics" && request.method === "GET") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const rows=await env.DB.prepare("SELECT * FROM social_metrics ORDER BY recorded_at DESC LIMIT 200").all();
    return json({metrics:rows.results,note:"Only connected or manually entered metrics are shown. No fabricated analytics."},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/social-metrics" && request.method === "POST") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const b=await request.json().catch(()=>({}));
    const platform=String(b.platform||"").slice(0,50), metric=String(b.metric||"").slice(0,80), value=Number(b.value);
    if(!platform||!metric||!Number.isFinite(value)) return err("Platform, metric and numeric value are required.");
    await env.DB.prepare("INSERT INTO social_metrics (id,platform,metric,value,period,source_note) VALUES (?,?,?,?,?,?)").bind(randomId(),platform,metric,value,String(b.period||"latest").slice(0,50),String(b.sourceNote||"Manual entry").slice(0,180)).run();
    return json({ok:true},201,{"cache-control":"no-store"});
  }

  return err("Not found.",404);
}

const MAX_IMAGE_BYTES = 1_800_000; // D1 stores up to 2 MB per value
function imageMime(b) {
  const at = (i, ...v) => v.every((x, j) => b[i + j] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(4, 0x66, 0x74, 0x79, 0x70) && at(8, 0x61, 0x76, 0x69, 0x66)) return "image/avif";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  return null;
}
async function serveMedia(request, env, ctx) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const id = (new URL(request.url).pathname.split("/").pop() || "").split(".")[0];
  if (!env.DB || !/^[a-f0-9]{8,32}$/.test(id)) return new Response("Not found", { status: 404 });
  await ensureSchema(env);
  const row = await env.DB.prepare("SELECT mime,data FROM images WHERE id=?").bind(id).first();
  if (!row) return new Response("Not found", { status: 404 });
  const res = new Response(new Uint8Array(row.data), { headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
  ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

// Every minute: alerts for scheduled stories that have just gone live, then the next batch of pushes.
async function scheduled(env) {
  if (!env.DB) return;
  await ensureSchema(env);
  const { results } = await env.DB.prepare(`SELECT id,slug,title,kind,status,published_at FROM articles WHERE alert_state='pending' AND status='published' AND published_at<=? LIMIT 5`).bind(new Date().toISOString()).all();
  // Each step runs on its own, so one failure can't hold up the others; errors go to the Worker logs.
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.error(`cron ${name} failed:`, e?.stack || e); } };
  await step("scheduled stories", async () => { for (const row of results) await storyAlert(env, null, null, row); });
  await step("daily alerts", () => dailyAlerts(env, env.CRON_TEST_NOW ? new Date(env.CRON_TEST_NOW) : new Date())); // CRON_TEST_NOW: local tests only
  await step("push delivery", () => drainAlerts(env));
}
// 9 am and 9 pm India time, every day (unless switched off in the control room).
// The settings row makes each one send exactly once, even if two cron runs overlap.
async function dailyAlerts(env, now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600e3), h = ist.getUTCHours(), m = ist.getUTCMinutes();
  const slot = h === 9 && m < 15 ? "am" : h === 21 && m < 15 ? "pm" : null;
  if (!slot) return null;
  const off = await env.DB.prepare("SELECT value FROM settings WHERE key='daily_alerts'").first();
  if (off?.value === "off") return null;
  const key = `daily:${slot}:${ist.toISOString().slice(0, 10)}`;
  const claim = await env.DB.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind(key, now.toISOString()).run();
  if (!claim.meta.changes) return null;
  try { return await sendDaily(env, slot); }
  catch (e) { await env.DB.prepare("DELETE FROM settings WHERE key=?").bind(key).run(); throw e; } // retry next minute
}
async function sendDaily(env, slot) {
  const latest = (await listPublished(env, { limit: 1 }))[0];
  const alert = slot === "am"
    ? { title: "Good morning from Raisina Wire", body: `Markets open at 9:15. Check the market board, the live wire and today’s briefing.${latest ? ` Latest analysis: ${latest.title}` : ""}`, url: "/" }
    : { title: "Tonight on Raisina Wire", body: `Catch up on what happened today: the day’s headlines, markets at the close and live coverage.${latest ? ` Latest analysis: ${latest.title}` : ""}`, url: "/" };
  await createAlert(env, null, { ...alert, body: alert.body.slice(0, 240) });
  return slot;
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(scheduled(env)); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(request,env,ctx); }
      catch (e) { return json({error:"Internal API error",detail:e.message},500,{"cache-control":"no-store"}); }
    }
    // One public address for search engines: page visits to the workers.dev copy go to SITE_URL.
    if (env.SITE_URL && url.hostname.endsWith(".workers.dev") && ["GET", "HEAD"].includes(request.method)) {
      const target = new URL(url.pathname + url.search, env.SITE_URL);
      if (target.host !== url.host) return Response.redirect(target.toString(), 301);
    }
    try {
      if (url.pathname.startsWith("/media/")) return await serveMedia(request, env, ctx);
      if (url.pathname === "/robots.txt") return robots(request, env);
      if (url.pathname === "/privacy.html" || url.pathname === "/terms.html") return Response.redirect(new URL(url.pathname.replace(".html", ""), request.url).toString(), 301);
      if (url.pathname === "/sitemap.xml" && env.DB) return await sitemap(request, env, ensureSchema);
      if (url.pathname === "/news-sitemap.xml" && env.DB) return await newsSitemap(request, env, ensureSchema);
      if ((url.pathname === "/feed.xml" || url.pathname === "/rss.xml") && env.DB) return await feed(request, env, ensureSchema);
      if (env.ASSETS && request.method === "GET" && PAGE_PATTERN.test(url.pathname.replace(/^\/(hi|bn)(?=\/|$)/, "") || "/")) return await renderPage(request, env, ensureSchema);
    } catch (e) { /* fall through to the static app */ }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Raisina Wire assets are not built. Run npm run build.", { status: 503 });
  }
};
