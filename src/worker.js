import { cached, categorize, DESKS } from "./feeds.js";
import { runWireDesk, wireDeskReport, saveWireSettings, wireSettings, fetchSources, groupItems, writeJob, quota, videoHeadlines, refileSubjects } from "./wiredesk.js";
import { syncWixFeed, backfillWix, wixStatus, restartWixBackfill } from "./wix.js";
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
import m0011 from "../migrations/0011_machine_translation.sql";
import m0012 from "../migrations/0012_live_images.sql";
import m0013 from "../migrations/0013_live_results.sql";
import m0014 from "../migrations/0014_audience.sql";
import m0015 from "../migrations/0015_guest_writers.sql";
import m0016 from "../migrations/0016_media_full.sql";
import m0017 from "../migrations/0017_article_video.sql";
import m0020 from "../migrations/0020_oauth.sql";
import m0021 from "../migrations/0021_rashtrix.sql";
import m0022 from "../migrations/0022_tv.sql";
import m0023 from "../migrations/0023_studio.sql";
import m0024 from "../migrations/0024_tv_channels.sql";
import m0025 from "../migrations/0025_tv_likes.sql";
import m0026 from "../migrations/0026_tv_headline.sql";
import m0027 from "../migrations/0027_og_cards.sql";
import m0028 from "../migrations/0028_tv_vertical.sql";
import m0029 from "../migrations/0029_bulletin_images.sql";
import { bulletinImages, bulletinImageRoute } from "./bulletinimg.js";
import { prepareBulletinVoices, voiceRoute } from "./bulletinvoice.js";
import { ogRoute, renderCards } from "./ogcard.js";
import { handleControlRoom, control as ctlCommand } from "./controlroom.js";
import { serveClip, clipHousekeeping } from "./clips.js";
import { handleStudio } from "./studioapi.js";
import { handleExtras, tvExtras } from "./extras.js";
import { rundownHousekeeping } from "./rundown.js";
export { TvControl } from "./control.js";
import { shortsList } from "./tvchannel.js";
import { CHANNELS, tvSettings, saveTvSettings, newOutputKey, setBreaking, tvState, clearTvCache, checkKey, promos as tvPromos, copyImage } from "./tvchannel.js";
import { parseYouTubeRef, refreshSources, refreshSource, playlistTitle, ytUsage, ytReady, addChannelSource, ownChannel, ownerOf, NOT_OWN } from "./youtube.js";
import { setGuestWriters, isBuiltIn } from "./writers.js";
import { recordEvent, audienceReport, countPush } from "./audience.js";
import { handleTts } from "./tts.js";
import { ARTICLE_COLS, toArticle, listPublished, getBySlug, splitTags, tagSlug, isPublic, textHash, WRITERS, DEFAULT_WRITER } from "./store.js";
import { LANGS, PAGE_LANGS, isLang, localiseArticles, localisePage, PAGES, pageVer } from "./translate.js";
import { mtReady, translateFields, translateBody } from "./mt.js";
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
const MIGRATIONS = [["0001_init.sql", m0001], ["0002_platform_modules.sql", m0002], ["0003_editorial_console.sql", m0003], ["0004_app_completion.sql", m0004], ["0005_editions_media_writers.sql", m0005], ["0006_tags_views_alerts.sql", m0006], ["0007_tts_audio.sql", m0007], ["0008_community_votes.sql", m0008], ["0009_translations.sql", m0009], ["0010_community_language.sql", m0010], ["0011_machine_translation.sql", m0011], ["0012_live_images.sql", m0012], ["0013_live_results.sql", m0013], ["0014_audience.sql", m0014], ["0015_guest_writers.sql", m0015], ["0016_media_full.sql", m0016], ["0017_article_video.sql", m0017], ["0020_oauth.sql", m0020], ["0021_rashtrix.sql", m0021], ["0022_tv.sql", m0022], ["0023_studio.sql", m0023], ["0024_tv_channels.sql", m0024], ["0025_tv_likes.sql", m0025], ["0026_tv_headline.sql", m0026], ["0027_og_cards.sql", m0027], ["0028_tv_vertical.sql", m0028], ["0029_bulletin_images.sql", m0029]];
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
  await backfillTextHashes(db);
}
// Stories saved before text fingerprints existed get one, so the control room can tell when the
// original has changed since a translation was written.
async function backfillTextHashes(db) {
  const { results } = await db.prepare("SELECT id,title,dek,topic,hero_caption,tags,body FROM articles WHERE text_hash='' LIMIT 500").all();
  if (results.length) await db.batch(await Promise.all(results.map(async r => db.prepare("UPDATE articles SET text_hash=? WHERE id=?").bind(await textHash(r), r.id))));
}
async function ensureSchema(env) {
  if (!schemaReady) schemaReady = migrate(env.DB).catch(e => { schemaReady = null; throw e; });
  await schemaReady;
  await refreshWriters(env);
}
// Guest writers (control room → Writers) join the built-in ones; re-read every 30 seconds.
let writersAt = 0;
async function refreshWriters(env, force = false) {
  if (!force && Date.now() - writersAt < 30e3) return;
  writersAt = Date.now();
  const { results } = await env.DB.prepare("SELECT key,name,role,bio,photo FROM writers ORDER BY created_at").all().catch(() => ({ results: null }));
  if (results) setGuestWriters(results);
}
// The autopublisher signs in with "Authorization: Bearer <PUBLISH_TOKEN>" (a Worker secret) and
// acts as the built-in admin. Tokens shorter than 24 characters are ignored.

// OAuth 2.1 for external MCP clients. The legacy PUBLISH_TOKEN remains independent.
const oauthB64url = bytes => b64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const oauthRandom = (n=32) => oauthB64url(crypto.getRandomValues(new Uint8Array(n)));
const oauthHtml = body => new Response("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Rashtrix authorisation</title><style>body{margin:0;background:#0b1220;color:#eef2f7;font:16px system-ui;display:grid;min-height:100vh;place-items:center}.panel{width:min(440px,calc(100% - 40px));padding:30px;border:1px solid #344154;border-radius:18px;background:#111c2d;box-sizing:border-box}h1{font-size:24px}p{color:#bac7d8;line-height:1.5}input{box-sizing:border-box;width:100%;padding:13px;margin:7px 0 14px;border-radius:8px;border:1px solid #526176;background:#0b1220;color:white}button{width:100%;padding:14px;border:0;border-radius:8px;background:#c49a48;color:#111;font-weight:700;font-size:16px;cursor:pointer}</style></head><body><main class=panel>"+body+"</main></body></html>",{headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
const oauthMeta = origin => ({issuer:origin,authorization_endpoint:origin+"/oauth/authorize",token_endpoint:origin+"/oauth/token",registration_endpoint:origin+"/oauth/register",response_types_supported:["code"],grant_types_supported:["authorization_code","refresh_token"],code_challenge_methods_supported:["S256"],token_endpoint_auth_methods_supported:["none"],scopes_supported:["mcp:tools"]});
async function oauthUser(env,email,password) {
 const row=await env.DB.prepare("SELECT id,email,display_name,role,password_hash FROM users WHERE email=?").bind(email).first();
 if(await isAdminLogin(env,email,password)){const hash=await passwordHash(password,oauthRandom(16));if(row)await env.DB.prepare("UPDATE users SET role='admin',password_hash=? WHERE id=?").bind(hash,row.id).run();else await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,role) VALUES (?,?,?,?,'admin')").bind(randomId(),email,"Rashtrix Administrator",hash).run();return await env.DB.prepare("SELECT id,email,display_name,role FROM users WHERE email=?").bind(email).first();}
 if(!row || !(await verifyPassword(password,row.password_hash)) || !["admin","editor"].includes(row.role))return null;return row;
}
async function oauthHandle(request,env) {
 const u=new URL(request.url),origin=u.origin,path=u.pathname;
 if(path==="/.well-known/oauth-authorization-server"&&request.method==="GET")return json(oauthMeta(origin),200,{"cache-control":"public, max-age=300"});
 if((path==="/.well-known/oauth-protected-resource"||path==="/.well-known/oauth-protected-resource/mcp")&&request.method==="GET")return json({resource:origin+"/mcp",authorization_servers:[origin],bearer_methods_supported:["header"],scopes_supported:["mcp:tools"]},200,{"cache-control":"public, max-age=300"});
 if(path==="/oauth/register"&&request.method==="POST"){
  const b=await request.json().catch(()=>null),name=String(b?.client_name||"MCP client").slice(0,120),redirects=Array.isArray(b?.redirect_uris)?b.redirect_uris:[];
  if(!redirects.length||redirects.length>10||redirects.some(x=>typeof x!=="string"||x.length>1000||(!/^https:\/\//.test(x)&&!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(x))))return err("Valid redirect_uris are required.",400);
  const id=oauthRandom(24);await env.DB.prepare("INSERT INTO oauth_clients (client_id,client_name,redirect_uris) VALUES (?,?,?)").bind(id,name,JSON.stringify([...new Set(redirects)])).run();
  return json({client_id:id,client_name:name,redirect_uris:redirects,token_endpoint_auth_method:"none",grant_types:["authorization_code","refresh_token"],response_types:["code"]},201,{"cache-control":"no-store"});
 }
 if(path==="/oauth/authorize"&&request.method==="GET"){
  const p=u.searchParams,client=await env.DB.prepare("SELECT * FROM oauth_clients WHERE client_id=?").bind(p.get("client_id")||"").first(),redirect=p.get("redirect_uri")||"",resource=p.get("resource")||origin+"/mcp";let allowed=[];try{allowed=JSON.parse(client?.redirect_uris||"[]")}catch{}
  if(!client||!allowed.includes(redirect)||p.get("response_type")!=="code"||p.get("code_challenge_method")!=="S256"||!/^[A-Za-z0-9_-]{43,128}$/.test(p.get("code_challenge")||"")||resource!==origin+"/mcp"||!p.get("state"))return err("Invalid OAuth authorization request.",400);
  const fields=["client_id","redirect_uri","response_type","code_challenge","code_challenge_method","state","scope","resource"].map(k=>"<input type=hidden name='"+k+"' value='"+String(p.get(k)||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;")+"'>").join("");
  return oauthHtml("<h1>Connect Rashtrix</h1><p>"+client.client_name.replace(/[&<>"]/g,"") +" is requesting access to Rashtrix editorial tools. Sign in with your staff account and approve to continue.</p><form method=post action=/oauth/authorize>"+fields+"<label>Email</label><input name=email type=email autocomplete=username required><label>Password</label><input name=password type=password autocomplete=current-password required><label><input style='width:auto' type=checkbox name=approve value=yes required> I approve access to Rashtrix publishing tools.</label><button>Approve and connect</button></form><p>Access is revocable. Your existing Claude publishing token is not changed.</p>");
 }
 if(path==="/oauth/authorize"&&request.method==="POST"){
  const p=await request.formData(),get=k=>String(p.get(k)||""),client=await env.DB.prepare("SELECT * FROM oauth_clients WHERE client_id=?").bind(get("client_id")).first();let redirects=[];try{redirects=JSON.parse(client?.redirect_uris||"[]")}catch{}
  const redirect=get("redirect_uri"),resource=get("resource");
  if(!client||!redirects.includes(redirect)||get("response_type")!=="code"||get("code_challenge_method")!=="S256"||!/^[A-Za-z0-9_-]{43,128}$/.test(get("code_challenge"))||resource!==origin+"/mcp"||get("approve")!=="yes"||!get("state"))return err("Invalid OAuth approval request.",400);
  const email=get("email").trim().toLowerCase(),password=get("password"),ip=request.headers.get("cf-connecting-ip")||"unknown",keys=[["oauth:"+email,8],["ip:"+ip,30]];
  if(await loginBlocked(env,keys))return err("Too many sign-in attempts. Wait 15 minutes and try again.",429);
  const user=await oauthUser(env,email,password);
  if(!user){await recordLoginFailure(env,keys);return oauthHtml("<h1>Sign-in failed</h1><p>Use an administrator or editor account. Please restart the connection from ChatGPT.</p>");}
  await clearLoginFailures(env,keys);const code=oauthRandom(32),scope=get("scope")||"mcp:tools",now=Math.floor(Date.now()/1000);
  await env.DB.prepare("INSERT INTO oauth_codes (code_hash,client_id,user_id,redirect_uri,code_challenge,scope,resource,expires_at) VALUES (?,?,?,?,?,?,?,?)").bind(await sha256(code),client.client_id,user.id,redirect,get("code_challenge"),scope,resource,now+300).run();
  const target=new URL(redirect);target.searchParams.set("code",code);target.searchParams.set("state",get("state"));return Response.redirect(target.toString(),302);
 }
 if(path==="/oauth/token"&&request.method==="POST"){
  const p=await request.formData(),get=k=>String(p.get(k)||""),grant=get("grant_type"),clientId=get("client_id"),client=await env.DB.prepare("SELECT client_id FROM oauth_clients WHERE client_id=?").bind(clientId).first();if(!client)return err("Invalid client.",401);
  const now=Math.floor(Date.now()/1000),access=oauthRandom(32),refresh=oauthRandom(48),expires=now+3600;
  if(grant==="authorization_code"){
   const codeHash=await sha256(get("code")),verifier=get("code_verifier"),row=await env.DB.prepare("SELECT * FROM oauth_codes WHERE code_hash=? AND client_id=?").bind(codeHash,clientId).first();
   if(!row||row.used_at||row.expires_at<=now||row.redirect_uri!==get("redirect_uri")||! /^[A-Za-z0-9._~-]{43,128}$/.test(verifier))return err("Invalid or expired authorization code.",400);
   const challenge=oauthB64url(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)));if(challenge!==row.code_challenge)return err("PKCE verification failed.",400);
   const used=await env.DB.prepare("UPDATE oauth_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>?").bind(now,codeHash,now).run();if(!used.meta.changes)return err("Authorization code already used.",400);
   await env.DB.batch([env.DB.prepare("INSERT INTO oauth_access_tokens (token_hash,client_id,user_id,resource,scope,expires_at) VALUES (?,?,?,?,?,?)").bind(await sha256(access),clientId,row.user_id,row.resource,row.scope,expires),env.DB.prepare("INSERT INTO oauth_refresh_tokens (token_hash,client_id,user_id,resource,scope,expires_at) VALUES (?,?,?,?,?,?,?)").bind(await sha256(refresh),clientId,row.user_id,row.resource,row.scope,now+2592000)]);
   return json({access_token:access,token_type:"Bearer",expires_in:3600,refresh_token:refresh,scope:row.scope},200,{"cache-control":"no-store","pragma":"no-cache"});
  }
  if(grant==="refresh_token"){
   const oldHash=await sha256(get("refresh_token")),old=await env.DB.prepare("SELECT * FROM oauth_refresh_tokens WHERE token_hash=? AND client_id=? AND revoked_at IS NULL AND expires_at>?").bind(oldHash,clientId,now).first();if(!old)return err("Invalid or expired refresh token.",400);
   const revoked=await env.DB.prepare("UPDATE oauth_refresh_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=? AND revoked_at IS NULL").bind(oldHash).run();if(!revoked.meta.changes)return err("Refresh token already used.",400);
   await env.DB.batch([env.DB.prepare("INSERT INTO oauth_access_tokens (token_hash,client_id,user_id,resource,scope,expires_at) VALUES (?,?,?,?,?,?)").bind(await sha256(access),clientId,old.user_id,old.resource,old.scope,expires),env.DB.prepare("INSERT INTO oauth_refresh_tokens (token_hash,client_id,user_id,resource,scope,expires_at) VALUES (?,?,?,?,?,?,?)").bind(await sha256(refresh),clientId,old.user_id,old.resource,old.scope,now+2592000)]);
   return json({access_token:access,token_type:"Bearer",expires_in:3600,refresh_token:refresh,scope:old.scope},200,{"cache-control":"no-store","pragma":"no-cache"});
  }
  return err("Unsupported grant_type.",400);
 }
 return null;
}

async function publisherUser(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const bearer = header.slice(7).trim();
  const secret = String(env.PUBLISH_TOKEN || "");
  // Preserve the legacy Claude/autopublisher token exactly: same env secret, comparison and admin identity.
  if (secret.length >= 24 && adminEmail(env) && (await sha256(bearer)) === (await sha256(secret))) {
    const find = () => env.DB.prepare("SELECT id,email,display_name,role FROM users WHERE email=?").bind(adminEmail(env)).first();
    let row = await find();
    if (!row) { await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,role) VALUES (?,?,?,?,'admin')").bind(randomId(), adminEmail(env), "Rashtrix Administrator", "").run(); row = await find(); }
    return { ...row, role: "admin" };
  }
  const token = await env.DB.prepare("SELECT users.id,users.email,users.display_name,users.role FROM oauth_access_tokens JOIN users ON users.id=oauth_access_tokens.user_id WHERE oauth_access_tokens.token_hash=? AND oauth_access_tokens.expires_at>? AND oauth_access_tokens.resource=?").bind(await sha256(bearer), Math.floor(Date.now()/1000), new URL(request.url).origin + "/mcp").first();
  return token && ["admin","editor"].includes(token.role) ? token : null;
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
// Addresses use Latin letters; a Bengali or Hindi headline gets a short "news-…" address unless one is given.
function slugify(s) { return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90) || `news-${randomId().slice(0, 8)}`; }
function allowedRoles(user, roles) { return user && roles.includes(user.role); }
const isStaff = user => allowedRoles(user, ["admin", "editor"]);
const httpsUrl = (v, max = 1500) => { const s = String(v || "").trim().slice(0, max); return /^https:\/\//i.test(s) ? s : ""; };
// Images: an HTTPS URL, an uploaded image (/media/…) or the brand artwork (/brand/…).
// A story video: an https MP4/WebM.
const videoRef = v => { const s = String(v || "").trim().slice(0, 1500); return /^https:\/\/\S+\.(mp4|webm)(\?\S*)?$/.test(s) ? s : ""; };
const imageRef = v => { const s = String(v || "").trim().slice(0, 1500); return /^\/(media|brand)\/[\w.-]+$/.test(s) ? s : httpsUrl(s); };
const STORY_KINDS = ["article", "rewrite", "brief"];
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const kindValue = v => STORY_KINDS.includes(v) ? v : "article";
const langValue = v => LANGS.includes(v) ? v : "bn";
const writerKey = v => WRITERS.some(w => w.key === v) ? v : DEFAULT_WRITER;
const tagsValue = v => splitTags(Array.isArray(v) ? v.join(",") : v).map(t => t.slice(0, 40)).join(",");
const truthy = v => v === true || v === "on" || v === "true" || v === "1";
// Alerts are on by default; the newsroom can switch one off for a single item.
const wantsAlert = v => !(v === false || v === "false" || v === "0" || v === "off");
// A story alert goes out when the story is public; a scheduled story's alert waits for the cron.
async function storyAlert(env, ctx, user, row) {
  const live = row.status === "published" && row.published_at && row.published_at <= new Date().toISOString();
  if (!live) { await env.DB.prepare("UPDATE articles SET alert_state='pending' WHERE id=?").bind(row.id).run(); return "pending"; }
  await createAlert(env, ctx, { title: "রাষ্ট্রিক্স · নতুন খবর", body: row.title, url: `/article/${encodeURIComponent(row.slug)}`, userId: user?.id });
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

// Where a story came from stays in the control room; readers never see it.
const hideSource = ({ sourceUrl, ...a }) => a;

/* ---------- Languages ---------- */
// ?lang=bn|en|hi; Bengali when absent.
const reqLang = url => { const l = url.searchParams.get("lang"); return isLang(l) ? l : "bn"; };
// Live coverage written in English, machine-translated for Bengali and Hindi readers.
async function mtLive(env, lang, item, updates) {
  if (lang === "en" || !mtReady(env)) return;
  await translateFields(env, lang, [item], ["title", "summary"]);
  const bodies = await Promise.all(updates.map(u => translateBody(env, lang, u.body)));
  updates.forEach((u, i) => { if (bodies[i] !== u.body) { u.body = bodies[i]; u.mt = true; } });
}
// Stories with no version in the reader's language: machine-translated with Workers AI (English
// to Bengali/Hindi with IndicTrans2, Bengali and Hindi with M2M100), and marked so the reader says so.
async function mtArticles(env, lang, list, opts = {}) {
  list = list.filter(a => a.original && a.original !== lang && a.lang === a.original);
  if (!list.length || !mtReady(env)) return;
  for (const from of [...new Set(list.map(a => a.original))]) {
    const group = list.filter(a => a.original === from), o = { ...opts, from };
    await translateFields(env, lang, group, ["title", "dek", "topic", "heroCaption"], o);
    for (const a of group) {
      if (a.body !== undefined) { const b = await translateBody(env, lang, a.body, o); if (b !== a.body) { a.body = b; a.mt = true; } }
      if (a.mt) { a.lang = lang; a.machine = true; }
    }
  }
}
// Cron: translate new headlines, live coverage and stories ahead of readers, so their pages
// come from the D1 cache. Every five minutes; the daily cap in src/mt.js still applies.
async function mtWarm(env) {
  if (!mtReady(env) || new Date().getUTCMinutes() % 5) return;
  for (const lang of ["bn", "hi", "en"]) {
    if (lang !== "en") {
    const live = await env.DB.prepare("SELECT id,title,summary FROM live_coverage WHERE status='live'").all();
    for (const c of live.results) {
      const ups = await env.DB.prepare("SELECT body FROM live_updates WHERE coverage_id=? ORDER BY created_at DESC LIMIT 30").bind(c.id).all();
      await mtLive(env, lang, c, ups.results);
    }
    }
    const list = (await localiseArticles(env, lang, await listPublished(env, { limit: 40 }))).filter(a => a.original !== lang && a.lang === a.original);
    const at = (Math.floor(Date.now() / 300e3) * 3) % Math.max(list.length, 1);
    for (const a of list.slice(at, at + 3)) { const full = await getBySlug(env, a.slug); if (full) await mtArticles(env, lang, [{ ...full, original: full.lang || "bn", lang: full.lang || "bn" }]); }
  }
}

const MCP_TOOLS = [
  { name:"publisher_health", description:"Check public Rashtrix API health.", inputSchema:{type:"object",properties:{}} },
  { name:"list_articles", description:"List stories (articles, wire rewrites and briefs) in the editorial system.", inputSchema:{type:"object",properties:{}} },
  { name:"create_article_draft", description:"Create a story as a draft. Never publishes or sends alerts. Write it in Bengali (lang bn) unless told otherwise.", inputSchema:{type:"object",required:["title","body"],properties:{kind:{type:"string",enum:["article","rewrite","brief"]},lang:{type:"string",enum:["bn","en","hi"]},title:{type:"string"},dek:{type:"string"},topic:{type:"string"},category:{type:"string"},tags:{type:"array",items:{type:"string"}},writer:{type:"string"},body:{type:"string"},sourceUrl:{type:"string"},imageUrl:{type:"string"},heroUrl:{type:"string"},heroCaption:{type:"string"},videoUrl:{type:"string"}}} },
  { name:"update_article", description:"Update an existing article. Publishing requires explicit editor approval; notify remains false.", inputSchema:{type:"object",required:["id","changes"],properties:{id:{type:"string"},changes:{type:"object"}}} },
  { name:"list_live_coverage", description:"List live coverage records.", inputSchema:{type:"object",properties:{}} },
  { name:"create_live_draft", description:"Create live coverage in draft status.", inputSchema:{type:"object",required:["title"],properties:{title:{type:"string"},summary:{type:"string"},slug:{type:"string"},imageUrl:{type:"string"},socialUrl:{type:"string"},heroCaption:{type:"string"}}} },
  { name:"post_live_update", description:"Post a live coverage update; push notification remains disabled.", inputSchema:{type:"object",required:["id","body"],properties:{id:{type:"string"},body:{type:"string"},sourceUrl:{type:"string"},mediaUrl:{type:"string"}}} },
  { name:"list_media", description:"List multimedia items.", inputSchema:{type:"object",properties:{}} },
  { name:"create_media_draft", description:"Create a multimedia item in draft status.", inputSchema:{type:"object",required:["title","mediaUrl"],properties:{title:{type:"string"},mediaUrl:{type:"string"},mediaType:{type:"string",enum:["video","short","image","gallery","audio","embed"]},category:{type:"string"},thumbnailUrl:{type:"string"},description:{type:"string"}}} },
  { name:"list_events", description:"List editorial events and briefings.", inputSchema:{type:"object",properties:{}} },
  { name:"create_event", description:"Create an event. This publishes immediately; call only after explicit editor approval.", inputSchema:{type:"object",required:["title","startsAt"],properties:{title:{type:"string"},description:{type:"string"},eventType:{type:"string"},startsAt:{type:"string"},access:{type:"string",enum:["public","member","premium"]},notify:{type:"boolean",default:false}}} },
  { name:"list_alerts", description:"List recent reader alerts.", inputSchema:{type:"object",properties:{}} },
  { name:"send_reader_alert", description:"Send a reader alert immediately. Call only after explicit approval of exact headline, body and destination.", inputSchema:{type:"object",required:["title","url"],properties:{title:{type:"string"},body:{type:"string"},url:{type:"string"}}} },
  { name:"list_translations", description:"List stories and pages with their Bengali, English and Hindi versions.", inputSchema:{type:"object",properties:{}} },
  { name:"get_translation", description:"Get the original and an existing version in another language for a story or page.", inputSchema:{type:"object",required:["ref","lang"],properties:{kind:{type:"string",enum:["article","page"],default:"article"},ref:{type:"string"},lang:{type:"string",enum:["bn","en","hi"]}}} },
  { name:"save_translation", description:"Save a complete version of a story or page in another language. Save only after editorial review; this does not publish a new story.", inputSchema:{type:"object",required:["ref","lang","translation"],properties:{kind:{type:"string",enum:["article","page"],default:"article"},ref:{type:"string"},lang:{type:"string",enum:["bn","en","hi"]},translation:{type:"object",required:["title","body"],properties:{title:{type:"string"},dek:{type:"string"},topic:{type:"string"},heroCaption:{type:"string"},tags:{type:"array",items:{type:"string"}},body:{type:"string"}}}}} }
];
async function handleMcp(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET") return new Response("Rashtrix MCP endpoint. Use Streamable HTTP POST.", {status:405,headers:{"content-type":"text/plain","allow":"POST, OPTIONS"}});
  if (request.method !== "POST") return new Response("Method not allowed",{status:405});
  const user = await currentUser(request, env);
  if (!isStaff(user)) return json({error:"Publisher authentication required."},401,{"cache-control":"no-store","www-authenticate":'Bearer resource_metadata="' + url.origin + '/.well-known/oauth-protected-resource/mcp", scope="mcp:tools"'});
  const rpc = await request.json().catch(()=>null);
  if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return json({jsonrpc:"2.0",id:rpc?.id??null,error:{code:-32600,message:"Invalid JSON-RPC request"}},400);
  // MCP notifications have no id and must not receive a JSON-RPC response.
  if (rpc.method === "notifications/initialized" && !("id" in rpc)) return new Response(null,{status:202,headers:{"cache-control":"no-store"}});
  if (!("id" in rpc)) return new Response(null,{status:202,headers:{"cache-control":"no-store"}});
  const result = (value) => json({jsonrpc:"2.0",id:rpc.id,result:value},200,{"cache-control":"no-store"});
  if (rpc.method === "initialize") return result({protocolVersion:"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"rashtrix-publisher",version:"1.0.0"}});
  if (rpc.method === "ping") return result({});
  if (rpc.method === "tools/list") return result({tools:MCP_TOOLS});
  if (rpc.method !== "tools/call") return json({jsonrpc:"2.0",id:rpc.id,error:{code:-32601,message:"Method not found"}},200);
  const name=rpc.params?.name, a=rpc.params?.arguments||{};
  const routes = {
    publisher_health:["GET","/api/health",null],
    list_articles:["GET","/api/admin/articles",null],
    create_article_draft:["POST","/api/admin/articles",{...a,status:"draft",notify:false}],
    update_article:["PUT","/api/admin/articles/"+encodeURIComponent(a.id||""),{...(a.changes||{}),notify:false}],
    list_live_coverage:["GET","/api/admin/live",null],
    create_live_draft:["POST","/api/admin/live",{...a,status:"draft",notify:false}],
    post_live_update:["POST","/api/admin/live/"+encodeURIComponent(a.id||"")+"/updates",{body:a.body,sourceUrl:a.sourceUrl,mediaUrl:a.mediaUrl,notify:false}],
    list_media:["GET","/api/admin/media",null],
    create_media_draft:["POST","/api/admin/media",{...a,status:"draft"}],
    list_events:["GET","/api/admin/events",null],
    create_event:["POST","/api/events",{...a,notify:false}],
    list_alerts:["GET","/api/admin/alerts",null],
    send_reader_alert:["POST","/api/admin/alerts",a],
    list_translations:["GET","/api/admin/translations",null]
  };
  if(name==="get_translation" || name==="save_translation") {
    const kind=a.kind==="page"?"page":"article", ref=String(a.ref||""), lang=String(a.lang||"");
    if(!ref || !LANGS.includes(lang)) return json({jsonrpc:"2.0",id:rpc.id,error:{code:-32602,message:"ref and lang (bn, en or hi) are required"}},200);
    const path="/api/admin/translations/"+kind+"/"+encodeURIComponent(ref)+"/"+lang;
    routes[name]=[name==="get_translation"?"GET":"PUT",path,name==="save_translation"?a.translation:null];
    if(name==="save_translation" && (!a.translation || typeof a.translation!=="object")) return json({jsonrpc:"2.0",id:rpc.id,error:{code:-32602,message:"translation object is required"}},200);
  }
  const route=routes[name];
  if(!route) return json({jsonrpc:"2.0",id:rpc.id,error:{code:-32602,message:"Unknown tool"}},200);
  if(name==="update_article" && !a.id) return json({jsonrpc:"2.0",id:rpc.id,error:{code:-32602,message:"id is required"}},200);
  if(name==="post_live_update" && !a.id) return json({jsonrpc:"2.0",id:rpc.id,error:{code:-32602,message:"id is required"}},200);
  const headers=new Headers({"authorization":request.headers.get("authorization")||""});
  if(route[2]) headers.set("content-type","application/json");
  const downstream=new Request(new URL(route[1],url.origin),{method:route[0],headers,body:route[2]?JSON.stringify(route[2]):undefined});
  const response=await api(downstream,env,ctx);
  const raw=await response.text();
  let payload; try{payload=JSON.parse(raw)}catch{payload={message:raw}}
  const textValue=JSON.stringify(payload);
  return result({content:[{type:"text",text:textValue}],isError:!response.ok});
}

async function api(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (url.pathname === "/mcp") return handleMcp(request, env, ctx);

  if (url.pathname === "/api/health") {
    // ?wire=1 adds the wire desk's state: counts, the day's model calls and the commonest recent
    // error (quoted text and links stripped), so its health can be seen without signing in.
    const out = { ok: true, service: "Rashtrix API", time: new Date().toISOString(), database: Boolean(env.DB) };
    // ?tv=1 adds each TV source's state (which channel, how many videos, the last refresh and
    // error) and the day's YouTube units, so a source that brings no videos can be seen.
    if (url.searchParams.get("tv") && env.DB) {
      out.tv = {
        sources: await env.DB.prepare("SELECT s.channel, s.kind, s.title, s.active, s.item_count AS items, s.last_refresh AS lastRefresh, s.last_error AS lastError, (SELECT COUNT(*) FROM tv_items i WHERE i.source_id=s.id AND i.playable=1) AS playable FROM tv_sources s ORDER BY s.channel, s.created_at").all().then(r => r.results).catch(e => [{ error: e.message }]),
        youtube: await ytUsage(env).catch(() => null)
      };
    }
    if (url.searchParams.get("wire") && env.DB) {
      const since = new Date(Date.now() - 24 * 3600e3).toISOString().replace("T", " ").slice(0, 19);
      const [jobs, errs, items, last, q] = await Promise.all([
        env.DB.prepare("SELECT status, COUNT(*) AS n FROM wire_jobs WHERE created_at>=? GROUP BY status").bind(since).all().then(r => r.results).catch(() => []),
        env.DB.prepare("SELECT error, COUNT(*) AS n FROM wire_jobs WHERE error<>'' AND updated_at>=? GROUP BY error ORDER BY n DESC LIMIT 3").bind(new Date(Date.now() - 6 * 3600e3).toISOString()).all().then(r => r.results).catch(() => []),
        env.DB.prepare("SELECT COUNT(*) AS n FROM wire_items WHERE fetched_at>=?").bind(new Date(Date.now() - 3600e3).toISOString()).first().catch(() => null),
        env.DB.prepare("SELECT MAX(published_at) AS at FROM articles WHERE kind IN ('rewrite','brief') AND status='published'").first().catch(() => null),
        quota(env).catch(() => null)]);
      const wireStatus = await wireSettings(env).catch(() => ({}));
      const clean = e => String(e || "").replace(/"[^"]*"|“[^”]*”|\([^)]*\)/g, "…").replace(/https?:\/\/\S+/g, "").slice(0, 120);
      out.wire = { jobs24h: Object.fromEntries(jobs.map(j => [j.status, j.n])), errors6h: errs.map(e => ({ error: clean(e.error), n: e.n })), itemsLastHour: items?.n ?? null, lastPublished: last?.at || null, calls: q ? { today: q.calls, limit: q.limit, blockedUntil: q.blockedUntil } : null, models: wireStatus.models, model: wireStatus.model, keySet: Boolean(env.GEMINI_API_KEY) };
    }
    return json(out, 200, { "cache-control": "no-store" });
  }

  if (url.pathname === "/api/config") {
    return json({ appName: env.APP_NAME || "Rashtrix 24×7 News", siteUrl: env.SITE_URL || "", youtubeUrl: env.YOUTUBE_URL || "", facebookUrl: env.FACEBOOK_URL || "", registrationEnabled: Boolean(env.DB) });
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
      else await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,role) VALUES (?,?,?,?,'admin')").bind(randomId(),email,"Rashtrix Administrator",hash).run();
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

  // The language of the control-room and studio screens, remembered per person.
  if (url.pathname === "/api/auth/ui-lang") {
    const user = await currentUser(request, env);
    if (!user) return json({ lang: null }, 200, { "cache-control": "no-store" });
    if (request.method === "PUT") {
      const b = await request.json().catch(() => ({}));
      await env.DB.prepare("UPDATE users SET ui_lang=? WHERE id=?").bind(LANGS.includes(b.lang) ? b.lang : "", user.id).run();
      return json({ ok: true }, 200, { "cache-control": "no-store" });
    }
    const row = await env.DB.prepare("SELECT ui_lang FROM users WHERE id=?").bind(user.id).first();
    return json({ lang: row?.ui_lang || null }, 200, { "cache-control": "no-store" });
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
    await env.DB.prepare("INSERT INTO media_items (id,title,description,media_type,media_url,thumbnail_url,category,status,author_id,published_at,full_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,title,String(b.description||"").slice(0,2000),type,mediaUrl,String(b.thumbnailUrl||"").slice(0,1500),String(b.category||"Geopolitics").slice(0,50),status,user.id,status==="published"?new Date().toISOString():null,String(b.fullId||"").slice(0,64)).run();
    return json({ok:true,id},201,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/media/") && request.method === "PUT") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const id = decodeURIComponent(url.pathname.split("/").pop()), b = await request.json().catch(() => ({}));
    // Linking a short to its full video, without touching its status.
    if (b.fullId !== undefined && b.status === undefined) {
      const res = await env.DB.prepare("UPDATE media_items SET full_id=?, updated_at=? WHERE id=?").bind(String(b.fullId || "").slice(0, 64), new Date().toISOString(), id).run();
      if (!res.meta.changes) return err("Media item not found.", 404);
      await audit(env, user, "media.link", "media_item", id, { fullId: b.fullId });
      return json({ ok: true }, 200, { "cache-control": "no-store" });
    }
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
    await env.DB.prepare("INSERT INTO live_coverage (id,slug,title,summary,status,author_id,started_at,image_url,social_url,hero_caption) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,slug,title,String(b.summary||"").slice(0,500),status,user.id,status==="live"?new Date().toISOString():null,
      String(b.imageUrl||"").slice(0,1500),String(b.socialUrl||"").slice(0,1500),String(b.heroCaption||"").slice(0,300)).run();
    await audit(env,user,"live.create","live_coverage",id,{title,status});
    if (status === "live" && wantsAlert(b.notify)) await createAlert(env, ctx, { title: "লাইভ · রাষ্ট্রিক্স", body: title, url: `/coverage/${encodeURIComponent(slug)}`, userId: user.id });
    return json({ok:true,id,slug},201,{"cache-control":"no-store"});
  }
  // ---- Editing live coverage after posting: each update can be corrected or removed.
  if (/^\/api\/admin\/live\/[^/]+\/updates$/.test(url.pathname) && request.method === "GET") {
    if (!isStaff(await currentUser(request, env))) return err("Editor access required.", 403);
    const id = decodeURIComponent(url.pathname.split("/")[4]);
    const item = await env.DB.prepare("SELECT id,slug,title,summary,status FROM live_coverage WHERE id=?").bind(id).first();
    if (!item) return err("Live coverage not found.", 404);
    const { results } = await env.DB.prepare("SELECT id,body,media_url AS mediaUrl,source_url AS sourceUrl,created_at AS createdAt,edited_at AS editedAt FROM live_updates WHERE coverage_id=? ORDER BY created_at DESC").bind(id).all();
    return json({ item, updates: results }, 200, { "cache-control": "no-store" });
  }
  if (/^\/api\/admin\/live\/[^/]+\/updates\/[^/]+$/.test(url.pathname) && ["PUT", "DELETE"].includes(request.method)) {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const [, , , , id, , uid] = url.pathname.split("/").map(decodeURIComponent);
    const row = await env.DB.prepare("SELECT id FROM live_updates WHERE id=? AND coverage_id=?").bind(uid, id).first();
    if (!row) return err("Update not found.", 404);
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM live_updates WHERE id=?").bind(uid).run();
      await audit(env, user, "live.update.delete", "live_update", uid, { coverage: id });
    } else {
      const b = await request.json().catch(() => ({})), body = String(b.body || "").trim();
      if (!body) return err("Live update text is required.");
      await env.DB.prepare("UPDATE live_updates SET body=?,media_url=?,source_url=?,edited_at=? WHERE id=?").bind(body.slice(0, 12000), String(b.mediaUrl || "").slice(0, 1500), String(b.sourceUrl || "").slice(0, 1500), new Date().toISOString(), uid).run();
      await audit(env, user, "live.update.edit", "live_update", uid, { coverage: id });
    }
    await env.DB.prepare("UPDATE live_coverage SET updated_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname.startsWith("/api/admin/live/") && !url.pathname.includes("/updates") && request.method === "PUT") {
    const user=await currentUser(request,env);
    if (!isStaff(user)) return err("Editor access required.",403);
    const id=decodeURIComponent(url.pathname.split("/").pop()), b=await request.json().catch(()=>({}));
    // Images and caption can change on their own, without touching the status.
    if (b.results!==undefined && b.results!=="" && typeof b.results!=="object") return err("results must be a JSON object.");
    if (b.results && typeof b.results==="object") b.results=JSON.stringify(b.results);
    if (b.title!==undefined && String(b.title).trim().length<5) return err("Live coverage title must be at least 5 characters.");
    const imgs=[["title","title",180],["summary","summary",500],["imageUrl","image_url",1500],["socialUrl","social_url",1500],["heroCaption","hero_caption",300],["results","results",20000]].filter(([k])=>b[k]!==undefined);
    if (imgs.length && b.status===undefined) {
      const res=await env.DB.prepare(`UPDATE live_coverage SET ${imgs.map(([,c])=>`${c}=?`).join(",")}, updated_at=? WHERE id=?`).bind(...imgs.map(([k,,n])=>String(b[k]||"").trim().slice(0,n)),new Date().toISOString(),id).run();
      if(!res.meta.changes) return err("Live coverage not found.",404);
      await audit(env,user,"live.edit","live_coverage",id,{fields:imgs.map(([k])=>k)});
      return json({ok:true},200,{"cache-control":"no-store"});
    }
    const status=["live","ended","draft"].includes(b.status)?b.status:null;
    if(!status) return err("Status must be live, ended or draft.");
    const now=new Date().toISOString();
    const res=await env.DB.prepare(`UPDATE live_coverage SET status=?, started_at=CASE WHEN ?='live' THEN COALESCE(started_at,?) ELSE started_at END,
      ended_at=CASE WHEN ?='ended' THEN ? ELSE NULL END, updated_at=? WHERE id=?`).bind(status,status,now,status,now,now,id).run();
    if(!res.meta.changes) return err("Live coverage not found.",404);
    await audit(env,user,"live.status","live_coverage",id,{status});
    if (status === "live" && wantsAlert(b.notify) && b.notify !== undefined) {
      const row = await env.DB.prepare("SELECT slug,title FROM live_coverage WHERE id=?").bind(id).first();
      await createAlert(env, ctx, { title: "লাইভ · রাষ্ট্রিক্স", body: row.title, url: `/coverage/${encodeURIComponent(row.slug)}`, userId: user.id });
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
    const lang=reqLang(url); if(lang!=="en" && mtReady(env)) await translateFields(env,lang,rows.results,["title","summary"]);
    return json({items:rows.results});
  }
  if (url.pathname.startsWith("/api/live/") && request.method === "GET") {
    const slug=decodeURIComponent(url.pathname.split("/").pop()||"");
    const item=await env.DB.prepare("SELECT id,slug,title,summary,status,started_at AS startedAt,ended_at AS endedAt,image_url AS imageUrl,hero_caption AS heroCaption,(COALESCE(results,'')<>'') AS hasResults FROM live_coverage WHERE slug=? AND status IN ('live','ended')").bind(slug).first();
    if(!item) return err("Live coverage not found.",404);
    const updates=await env.DB.prepare("SELECT body,media_url AS mediaUrl,created_at AS createdAt,edited_at AS editedAt FROM live_updates WHERE coverage_id=? ORDER BY created_at DESC LIMIT 100").bind(item.id).all();
    await mtLive(env,reqLang(url),item,updates.results);
    return json({item,updates:updates.results});
  }
  if (url.pathname === "/api/media" && request.method === "GET") {
    const rows=await env.DB.prepare("SELECT id,title,description,media_type AS mediaType,media_url AS mediaUrl,thumbnail_url AS thumbnailUrl,category,published_at AS publishedAt,full_id AS fullId FROM media_items WHERE status='published' ORDER BY published_at DESC LIMIT 50").all();
    // Plays over the last 60 days, for the Watch page's "Most watched" row.
    const { results: plays } = await env.DB.prepare("SELECT dim,SUM(n) AS n FROM metrics_daily WHERE metric='play' AND day>=? GROUP BY dim").bind(new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)).all().catch(() => ({ results: [] }));
    const pc = new Map(plays.map(r => [r.dim, r.n]));
    return json({items:rows.results.map(m => ({ ...m, plays: pc.get(m.id) || 0 }))});
  }

  if (url.pathname === "/api/articles" && request.method === "GET") {
    const w = url.searchParams.get("writer");
    const list = await listPublished(env, { writerKey: WRITERS.some(x => x.key === w) ? w : null, tag: url.searchParams.get("tag"), limit: 300 });
    const lang = reqLang(url);
    const out = await localiseArticles(env, lang, list);
    // Stories without a version in the reader's language: readers get what is already machine-
    // translated at once; the rest is translated in the background and switches on the next refresh.
    {
      const todo = out.filter(a => a.original !== lang && a.lang === a.original);
      ctx.waitUntil(mtArticles(env, lang, todo.map(a => ({ ...a }))).catch(() => {}));
      await mtArticles(env, lang, todo, { cacheOnly: true });
    }
    return json({ articles: out.map(hideSource) });
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
    const lang = reqLang(url);
    const [localised] = await localiseArticles(env, lang, [a]);
    let article = localised;
    // Languages this story can be read in, and its public corrections.
    const { results: have } = await env.DB.prepare("SELECT lang FROM translations WHERE kind='article' AND ref=? AND title<>''").bind(a.id).all();
    localised.versions = [...new Set([a.lang, ...have.map(r => r.lang)])];
    const { results: fixes } = await env.DB.prepare("SELECT note,created_at AS at FROM corrections WHERE article_id=? AND action='correct' AND public=1 AND note<>'' ORDER BY created_at DESC LIMIT 10").bind(a.id).all();
    localised.corrections = fixes;
    if (localised.original !== lang && localised.lang === localised.original && mtReady(env)) {
      // A few seconds to translate a story nobody has opened in this language yet; if it takes
      // longer the English is shown (marked) and the translation finishes in the background.
      const copy = { ...localised }, job = mtArticles(env, lang, [copy]);
      ctx.waitUntil(job.catch(() => {}));
      article = await Promise.race([job.then(() => copy, () => localised), new Promise(r => setTimeout(() => r(null), 4000))]) || { ...localised, translating: true };
    }
    return json({ article: hideSource(article) }, 200, { "cache-control": isPublic(a) ? "no-cache" : "no-store" });
  }

  // About and the legal pages in Hindi or Bengali (English when no current translation exists).
  if (/^\/api\/pages\/[\w-]+$/.test(url.pathname) && request.method === "GET") {
    const key = url.pathname.split("/").pop();
    if (!PAGES[key]) return err("Page not found.", 404);
    const p = await localisePage(env, reqLang(url), key);
    return json({ page: { key, title: p.title, html: p.html, lang: p.lang } });
  }
  // Translations in the control room: which stories and pages have Hindi and Bengali versions,
  // written by the editor next to the English.
  if (url.pathname === "/api/admin/translations" && request.method === "GET") {
    if (!isStaff(await currentUser(request, env))) return err("Editor access required.", 403);
    const { results: rows } = await env.DB.prepare("SELECT kind,ref,lang,src_ver,updated_at FROM translations WHERE title<>''").all();
    const rowOf = new Map(rows.map(r => [`${r.kind}|${r.ref}|${r.lang}`, r]));
    const state = (kind, ref, ver, own) => Object.fromEntries(LANGS.map(l => {
      if (l === own) return [l, { status: "original", exists: true, original: true }];
      const r = rowOf.get(`${kind}|${ref}|${l}`);
      return [l, { status: !r ? "missing" : r.src_ver === ver ? "ready" : "original changed", exists: !!r, updatedAt: r?.updated_at || "" }];
    }));
    const { results: arts } = await env.DB.prepare("SELECT id,slug,kind,title,status,text_hash,lang FROM articles ORDER BY COALESCE(published_at,updated_at) DESC LIMIT 500").all();
    const items = arts.map(a => ({ kind: "article", ref: a.id, slug: a.slug, title: a.title, status: a.status, storyKind: a.kind, lang: a.lang, href: `/article/${a.slug}`, langs: state("article", a.id, a.text_hash, a.lang) }));
    for (const key of Object.keys(PAGES)) items.push({ kind: "page", ref: key, title: PAGES[key].title, lang: "en", href: `/${key}`, langs: state("page", key, await pageVer(key), "en") });
    return json({ langs: LANGS, items }, 200, { "cache-control": "no-store" });
  }
  const trMatch = url.pathname.match(/^\/api\/admin\/translations\/(article|page)\/([^/]+)\/(bn|en|hi)$/);
  if (trMatch) {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const [, kind, ref, lang] = trMatch.map(x => x && decodeURIComponent(x));
    const src = kind === "page" ? (PAGES[ref] ? { title: PAGES[ref].title, body: PAGES[ref].html, ver: await pageVer(ref) } : null)
      : await env.DB.prepare("SELECT title,dek,topic,hero_caption,tags,body,text_hash AS ver,lang FROM articles WHERE id=?").bind(ref).first();
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
      if (!title || !body.trim()) return err(`The ${{ hi: "Hindi", bn: "Bengali", en: "English" }[lang]} version needs a headline and text.`);
      if (kind === "article" && src.lang === lang) return err("That is the story's own language. Edit the story itself.");
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

  // ---- Writers: the built-in two plus guest writers (name, photo, one-line bio)
  if (url.pathname === "/api/writers" && request.method === "GET") {
    return json({ writers: WRITERS.map(w => ({ key: w.key, name: w.name, role: w.role, bio: w.bio, photo: w.photo, guest: !!w.guest, isDesk: !!w.isDesk })) }, 200, { "cache-control": "public, max-age=60" });
  }
  if (url.pathname === "/api/admin/writers" && request.method === "GET") {
    if (!isStaff(await currentUser(request, env))) return err("Editor access required.", 403);
    const { results } = await env.DB.prepare("SELECT writer, COUNT(*) AS n FROM articles GROUP BY writer").all();
    const counts = Object.fromEntries(results.map(r => [r.writer, r.n]));
    return json({ writers: WRITERS.map(w => ({ key: w.key, name: w.name, role: w.role, bio: w.bio, photo: w.guest && w.photo.startsWith("data:") ? "" : w.photo, guest: !!w.guest, stories: counts[w.key] || 0 })) }, 200, { "cache-control": "no-store" });
  }
  if ((url.pathname === "/api/admin/writers" && request.method === "POST") || (/^\/api\/admin\/writers\/[\w-]+$/.test(url.pathname) && ["PUT", "DELETE"].includes(request.method))) {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const key = request.method === "POST" ? null : url.pathname.split("/").pop();
    if (key && isBuiltIn(key)) return err("The desks are fixed. Only reporters and guest writers can be changed here.");
    if (key && !(await env.DB.prepare("SELECT 1 FROM writers WHERE key=?").bind(key).first())) return err("Writer not found.", 404);
    if (request.method === "DELETE") {
      const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE writer=?").bind(key).first();
      if (used.n) return err(`This writer has ${used.n} ${used.n === 1 ? "story" : "stories"}. Move them to another writer first.`);
      await env.DB.prepare("DELETE FROM writers WHERE key=?").bind(key).run();
      await audit(env, user, "writer.delete", "writer", key, {});
      await refreshWriters(env, true);
      return json({ ok: true }, 200, { "cache-control": "no-store" });
    }
    const b = await request.json().catch(() => ({}));
    const name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 80), role = String(b.role || "Guest writer").replace(/\s+/g, " ").trim().slice(0, 60) || "Guest writer";
    const bio = String(b.bio || "").replace(/\s+/g, " ").trim().slice(0, 200), photo = imageRef(b.photo);
    if (name.length < 2) return err("Write the writer's name.");
    if (b.photo && !photo) return err("Upload the photo, or use an https:// image address.");
    if (key) {
      await env.DB.prepare("UPDATE writers SET name=?,role=?,bio=?,photo=?,updated_at=? WHERE key=?").bind(name, role, bio, photo, new Date().toISOString(), key).run();
      await audit(env, user, "writer.update", "writer", key, { name });
    } else {
      let k = slugify(name).slice(0, 60);
      for (let i = 2; isBuiltIn(k) || await env.DB.prepare("SELECT 1 FROM writers WHERE key=?").bind(k).first(); i++) k = `${slugify(name).slice(0, 56)}-${i}`;
      await env.DB.prepare("INSERT INTO writers (key,name,role,bio,photo) VALUES (?,?,?,?,?)").bind(k, name, role, bio, photo).run();
      await audit(env, user, "writer.create", "writer", k, { name });
      await refreshWriters(env, true);
      return json({ ok: true, key: k }, 201, { "cache-control": "no-store" });
    }
    await refreshWriters(env, true);
    return json({ ok: true, key }, 200, { "cache-control": "no-store" });
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
    const category = DESKS.includes(b.category) ? b.category : categorize(`${title} ${b.body || ""}`.slice(0, 1500));
    const text = { title, dek: String(b.dek||"").trim().slice(0,400), topic: String(b.topic||"").trim().slice(0,80), tags: tagsValue(b.tags), body: String(b.body||"").slice(0,100000), hero_caption: String(b.heroCaption||"").trim().slice(0,300) };
    const kind = kindValue(b.kind);
    await env.DB.prepare("INSERT INTO articles (id,slug,kind,title,dek,topic,tags,body,category,status,author_id,writer,published_at,image_url,hero_url,hero_caption,source_url,text_hash,video_url,lang,origin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'desk')").bind(
      id, slug, kind, title, text.dek, text.topic, text.tags, text.body,
      category, status, user.id, writerKey(b.writer), publishedAt, imageRef(b.imageUrl), imageRef(b.heroUrl), text.hero_caption, httpsUrl(b.sourceUrl), await textHash(text), videoRef(b.videoUrl), langValue(b.lang)).run();
    await audit(env, user, "article.create", "article", id, { title, status });
    const alert = wantsAlert(b.notify) && status === "published" ? await storyAlert(env, ctx, user, { id, slug, title, status, kind, published_at: publishedAt }) : "";
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
    await env.DB.prepare("UPDATE articles SET title=?,dek=?,topic=?,tags=?,body=?,category=?,kind=?,writer=?,status=?,published_at=?,image_url=?,hero_url=?,hero_caption=?,source_url=?,updated_at=?,text_hash=?,video_url=?,lang=?,alert_state=CASE WHEN ?<>'published' AND alert_state='pending' THEN '' ELSE alert_state END WHERE id=?").bind(
      title, text.dek, text.topic, text.tags, text.body,
      pick("category", v => DESKS.includes(v) ? v : c.category, c.category),
      pick("kind", kindValue, c.kind),
      pick("writer", writerKey, c.writer),
      status, publishedAt,
      pick("imageUrl", imageRef, c.image_url),
      pick("heroUrl", imageRef, c.hero_url),
      text.hero_caption,
      pick("sourceUrl", httpsUrl, c.source_url),
      new Date().toISOString(), await textHash(text), pick("videoUrl", videoRef, c.video_url || ""), pick("lang", langValue, c.lang), status, id).run();
    await audit(env,user,"article.update","article",id,{title,status});
    // First publication of a story sends its alert (unless switched off); later edits never re-send.
    const firstPublish = c.status !== "published" || c.alert_state === "pending";
    const alert = wantsAlert(b.notify) && status === "published" && firstPublish && c.alert_state !== "sent" ? await storyAlert(env, ctx, user, { id, slug: c.slug, title, status, kind: c.kind, published_at: publishedAt }) : "";
    return json({ok:true,slug:c.slug,alert},200,{"cache-control":"no-store"});
  }

  // ---- Corrections: pull a story in one tap, put it back, or correct it with a public note.
  // Every action is logged with the text as it was before (corrections table).
  const fixMatch = url.pathname.match(/^\/api\/admin\/articles\/([^/]+)\/(pull|restore|correct)$/);
  if (fixMatch && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const [, id, action] = fixMatch.map(decodeURIComponent);
    const c = await env.DB.prepare("SELECT * FROM articles WHERE id=?").bind(id).first();
    if (!c) return err("Story not found.", 404);
    const b = await request.json().catch(() => ({})), at = new Date().toISOString(), note = String(b.note || "").trim().slice(0, 500);
    const log = (pub = 1) => env.DB.prepare("INSERT INTO corrections (id,article_id,action,note,public,before_title,before_body,actor_id) VALUES (?,?,?,?,?,?,?,?)").bind(randomId(), id, action, note, pub, c.title, c.body, user.id);
    if (action === "pull") {
      await env.DB.batch([env.DB.prepare("UPDATE articles SET status='archived', pulled_at=?, updated_at=? WHERE id=?").bind(at, at, id), log(0)]);
    } else if (action === "restore") {
      await env.DB.batch([env.DB.prepare("UPDATE articles SET status='published', pulled_at=NULL, published_at=COALESCE(published_at,?), updated_at=? WHERE id=?").bind(at, at, id), log(0)]);
    } else {
      const title = b.title !== undefined ? String(b.title).trim().slice(0, 180) : c.title, body = b.body !== undefined ? String(b.body).slice(0, 100000) : c.body;
      const dek = b.dek !== undefined ? String(b.dek).trim().slice(0, 400) : c.dek;
      if (title.length < 8 || !body.trim()) return err("The corrected story needs a headline and text.");
      const pub = b.public === false ? 0 : 1;
      if (pub && !note) return err("Write the correction note readers will see, or untick “Show a correction note”.");
      const text = { title, dek, topic: c.topic, tags: c.tags, body, hero_caption: c.hero_caption };
      // Versions in other languages written by the machine no longer match: they go, and readers
      // in those languages see the corrected original until a new version is written.
      await env.DB.batch([
        env.DB.prepare("UPDATE articles SET title=?,dek=?,body=?,text_hash=?,updated_at=?,corrected_at=CASE WHEN ?=1 THEN ? ELSE corrected_at END,correction_note=CASE WHEN ?=1 THEN ? ELSE correction_note END WHERE id=?").bind(title, dek, body, await textHash(text), at, pub, at, pub, note, id),
        env.DB.prepare("DELETE FROM translations WHERE kind='article' AND ref=? AND model IN ('gemini','indictrans2')").bind(id),
        log(pub)
      ]);
    }
    await audit(env, user, `article.${action}`, "article", id, { note });
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/admin/corrections" && request.method === "GET") {
    if (!isStaff(await currentUser(request, env))) return err("Editor access required.", 403);
    const { results } = await env.DB.prepare(`SELECT c.id,c.article_id AS articleId,c.action,c.note,c.public,c.before_title AS beforeTitle,c.created_at AS createdAt,u.display_name AS actor,a.title,a.slug,a.kind,a.status
      FROM corrections c LEFT JOIN users u ON u.id=c.actor_id LEFT JOIN articles a ON a.id=c.article_id ORDER BY c.created_at DESC LIMIT 300`).all();
    return json({ corrections: results }, 200, { "cache-control": "no-store" });
  }

  // ---- Wire desk (src/wiredesk.js): approved sources, blocklist, settings, queue and log.
  if (url.pathname.startsWith("/api/admin/wire")) {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const b = ["GET", "DELETE"].includes(request.method) ? {} : await request.json().catch(() => ({}));
    const sid = decodeURIComponent(url.pathname.split("/")[5] || "");
    try {
      if (url.pathname === "/api/admin/wire" && request.method === "GET") return json(await wireDeskReport(env), 200, { "cache-control": "no-store" });
      if (url.pathname === "/api/admin/wire/settings" && request.method === "PUT") { await saveWireSettings(env, b); await audit(env, user, "wire.settings", "settings", "wire", b); }
      else if (url.pathname === "/api/admin/wire/run" && request.method === "POST") {
        const out = await runWireDesk(env, { budget: 3, onAlert: a => storyAlert(env, ctx, user, { ...a, status: "published", kind: "rewrite", published_at: new Date().toISOString() }) });
        return json({ ok: true, ...out }, 200, { "cache-control": "no-store" });
      }
      else if (url.pathname === "/api/admin/wire/fetch" && request.method === "POST") return json({ ok: true, ...(await fetchSources(env, { force: true })), grouped: await groupItems(env) }, 200, { "cache-control": "no-store" });
      else if (url.pathname.startsWith("/api/admin/wire/jobs/") && request.method === "POST") {
        // Write this story now (or again), whatever its state.
        const job = await env.DB.prepare("SELECT * FROM wire_jobs WHERE id=?").bind(sid).first();
        if (!job) return err("Not found.", 404);
        if (job.status === "done" && job.article_id) return err("This story has already been written. Correct or pull it instead.");
        if (!(await quota(env)).left) return err("The free Gemini quota for today is used up. The queue carries on after it resets.");
        await env.DB.prepare("UPDATE wire_jobs SET status='working', attempts=attempts+1, updated_at=? WHERE id=?").bind(new Date().toISOString(), sid).run();
        try { await writeJob(env, job); }
        catch (e) { await env.DB.prepare("UPDATE wire_jobs SET status='failed', error=? WHERE id=?").bind(String(e.message || e).slice(0, 300), sid).run(); return err(e.message || "Writing failed."); }
      }
      else if (url.pathname.startsWith("/api/admin/wire/jobs/") && request.method === "DELETE") await env.DB.prepare("UPDATE wire_jobs SET status='skipped', error='skipped by an editor' WHERE id=? AND status<>'done'").bind(sid).run();
      else if (url.pathname.startsWith("/api/admin/wire/sources")) {
        if (request.method === "DELETE") await env.DB.prepare("DELETE FROM wire_sources WHERE id=?").bind(sid).run();
        else {
          const name = String(b.name || "").trim().slice(0, 80), feed = httpsUrl(b.feedUrl || b.feed_url || "") || (/^http:\/\//.test(b.feedUrl || "") ? String(b.feedUrl).trim().slice(0, 1500) : "");
          const lang = ["bn", "en", "hi"].includes(b.lang) ? b.lang : "bn", active = b.active === false ? 0 : 1;
          if (request.method === "POST") {
            if (name.length < 2 || !feed) return err("Give the outlet’s name and its RSS feed address.");
            await env.DB.prepare("INSERT INTO wire_sources (id,name,feed_url,lang,active,notes) VALUES (?,?,?,?,?,?)").bind(randomId(), name, feed, lang, active, String(b.notes || "").slice(0, 300)).run();
          } else {
            const cur = await env.DB.prepare("SELECT * FROM wire_sources WHERE id=?").bind(sid).first();
            if (!cur) return err("Not found.", 404);
            await env.DB.prepare("UPDATE wire_sources SET name=?,feed_url=?,lang=?,active=?,notes=? WHERE id=?").bind(name || cur.name, feed || cur.feed_url, b.lang ? lang : cur.lang, b.active === undefined ? cur.active : active, b.notes !== undefined ? String(b.notes).slice(0, 300) : cur.notes, sid).run();
          }
        }
        await audit(env, user, `wire.source.${request.method.toLowerCase()}`, "wire_source", sid, { name: b.name });
      }
      else if (url.pathname.startsWith("/api/admin/wire/blocklist")) {
        if (request.method === "DELETE") await env.DB.prepare("DELETE FROM wire_blocklist WHERE id=?").bind(sid).run();
        else {
          let pattern = String(b.pattern || "").trim().toLowerCase().slice(0, 120);
          const kind = b.kind === "domain" || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(pattern.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")) && b.kind !== "word" ? "domain" : "word";
          if (kind === "domain") pattern = pattern.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
          if (pattern.length < 2) return err("Write a domain or a word to block.");
          await env.DB.prepare("INSERT OR IGNORE INTO wire_blocklist (id,pattern,kind,note) VALUES (?,?,?,?)").bind(randomId(), pattern, kind, String(b.note || "").slice(0, 200)).run();
          // Items already read that match are kept out of every story still to be written.
          if (kind === "domain") await env.DB.prepare("UPDATE wire_items SET status='blocked' WHERE (url LIKE ? OR url LIKE ?) AND job_id IN (SELECT id FROM wire_jobs WHERE status IN ('waiting','queued'))").bind(`%://${pattern}/%`, `%.${pattern}/%`).run();
        }
        await audit(env, user, `wire.block.${request.method.toLowerCase()}`, "wire_blocklist", sid, { pattern: b.pattern });
      }
      else return err("Not found.", 404);
    } catch (e) { return err(e.message); }
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }

  // ---- Wix import (src/wix.js): rashtrix.live posts, kept in sync.
  if (url.pathname.startsWith("/api/admin/wix")) {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    if (url.pathname === "/api/admin/wix" && request.method === "GET") return json(await wixStatus(env), 200, { "cache-control": "no-store" });
    if (url.pathname === "/api/admin/wix/sync" && request.method === "POST") return json({ ok: true, feed: await syncWixFeed(env, { force: true }), backfill: await backfillWix(env, { perRun: 4 }) }, 200, { "cache-control": "no-store" });
    if (url.pathname === "/api/admin/wix/restart" && request.method === "POST") { await restartWixBackfill(env); return json({ ok: true }, 200, { "cache-control": "no-store" }); }
    return err("Not found.", 404);
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

  // ---- The Watch page's videos: the channels' YouTube videos, each filed under a desk from its
  // title (long videos from the horizontal channel, Shorts from the vertical one).
  // The bulletin's pictures and the newsreader's lines.
  { const m = url.pathname.match(/^\/api\/tv\/bimg\/([^/]+)$/); if (m && request.method === "GET") return bulletinImageRoute(env, decodeURIComponent(m[1])); }
  { const m = url.pathname.match(/^\/api\/tv\/voice\/([0-9a-f]{20,64})\.mp3$/); if (m && request.method === "GET") return voiceRoute(env, m[1]); }
  if (url.pathname === "/api/tv/videos" && request.method === "GET") {
    const { results } = await env.DB.prepare(`SELECT i.channel, i.yt_id AS id, i.title, i.thumb, i.duration, i.published_at AS publishedAt FROM tv_items i JOIN tv_sources s ON s.id=i.source_id
      WHERE i.excluded=0 AND i.playable=1 AND s.active=1 AND i.duration>0 ORDER BY i.published_at DESC LIMIT 240`).all();
    const seen = new Set(), videos = [];
    for (const v of results) { if (seen.has(v.id)) continue; seen.add(v.id); videos.push({ ...v, short: v.channel === "v" && v.duration <= 180, category: categorize(v.title) }); }
    return json({ videos }, 200, { "cache-control": "public, max-age=120" });
  }
  // ---- The Shorts tab: YouTube Shorts from the vertical channel's sources.
  if (url.pathname === "/api/shorts" && request.method === "GET") return json({ shorts: await shortsList(env) }, 200, { "cache-control": "public, max-age=60" });
  // ---- Likes for the video on air (the app player's like button). One per device, kept on the
  // device; the server keeps the count.
  if (url.pathname === "/api/tv/like") {
    const id = (request.method === "GET" ? url.searchParams.get("id") : (await request.clone().json().catch(() => ({}))).id) || "";
    if (!/^[\w-]{11}$/.test(id)) return err("Unknown video.");
    if (request.method === "POST") {
      const b = await request.json().catch(() => ({}));
      await env.DB.prepare("INSERT INTO tv_likes (yt_id,n) VALUES (?,?) ON CONFLICT(yt_id) DO UPDATE SET n=MAX(0,n+excluded.n), updated_at=CURRENT_TIMESTAMP").bind(id, b.undo ? -1 : 1).run();
    }
    const row = await env.DB.prepare("SELECT n FROM tv_likes WHERE yt_id=?").bind(id).first();
    return json({ id, likes: row?.n || 0 }, 200, { "cache-control": "no-store" });
  }
  // ---- Rashtrix TV (src/tvchannel.js, src/youtube.js): two channels, sources, promos, controls.
  const tvMatch = url.pathname.match(/^\/api\/tv\/(h|v)(\/key)?$/);
  if (tvMatch && request.method === "GET") {
    if (tvMatch[2]) return json({ ok: await checkKey(env, tvMatch[1], url.searchParams.get("key")) }, 200, { "cache-control": "no-store" });
    const [tvs, extras] = await Promise.all([tvState(env, tvMatch[1]), tvExtras(env).catch(() => ({}))]);
    return json({ ...tvs, ...extras }, 200, { "cache-control": "no-cache" });
  }
  // ---- Polls, results boards, comments, sponsors, reports, Command Centre (src/extras.js).
  if (/^\/api\/(polls|comments|admin\/(polls|boards|comments|sponsors|audit|nrcs))(\/|$)/.test(url.pathname)) {
    const out = await handleExtras(request, env, url, { json, err, currentUser, isStaff, auditFn: (u, ...a) => audit(env, u, ...a) });
    if (out) return out;
  }
  // ---- The live studio (src/studioapi.js): guests, rooms, the media relay.
  if (/^\/api\/(rtc|ws\/room|studio\/guest|admin\/studio)(\/|$)/.test(url.pathname)) {
    const out = await handleStudio(request, env, url, { json, err, currentUser, isStaff, auditFn: (u, ...a) => audit(env, u, ...a) });
    if (out) return out;
  }
  // ---- The control room (src/controlroom.js): realtime control, PCR commands, Companion, rundowns, clips.
  if (/^\/api\/(ws\/ctl|ctl|companion|admin\/(rundowns|templates|asrun|proof|clips|macros|companion|copy-image|inputs))(\/|$)/.test(url.pathname)) {
    const out = await handleControlRoom(request, env, url, { json, err, currentUser, isStaff, auditFn: (u, ...a) => audit(env, u, ...a) });
    if (out) return out;
  }
  if (url.pathname.startsWith("/api/admin/tv")) {
    const user = await currentUser(request, env);
    if (!isStaff(user)) return err("Editor access required.", 403);
    const parts = url.pathname.split("/").slice(4).map(decodeURIComponent);   // after /api/admin/tv
    const b = ["GET", "DELETE"].includes(request.method) ? {} : await request.json().catch(() => ({}));
    const done = async (out = { ok: true }) => { clearTvCache(); return json(out, 200, { "cache-control": "no-store" }); };
    try {
      if (!parts.length && request.method === "GET") {
        const [h, v, sources, counts, cards, usage] = await Promise.all([tvSettings(env, "h"), tvSettings(env, "v"),
          env.DB.prepare("SELECT * FROM tv_sources ORDER BY channel, kind, created_at").all().then(r => r.results),
          env.DB.prepare("SELECT channel, COUNT(*) AS n, SUM(excluded) AS off FROM tv_items GROUP BY channel").all().then(r => r.results),
          tvPromos(env, true), ytUsage(env)]);
        return json({ channels: { h, v }, sources, counts, promos: cards, usage, ready: ytReady(env) }, 200, { "cache-control": "no-store" });
      }
      const [first, second, third] = parts;
      if (CHANNELS.includes(first)) {
        if (!second && request.method === "PUT") { await saveTvSettings(env, first, b); await audit(env, user, "tv.settings", "tv", first, { keys: Object.keys(b) }); return done(); }
        if (second === "key" && request.method === "POST") { const key = await newOutputKey(env, first); await audit(env, user, "tv.key", "tv", first, {}); return done({ ok: true, key }); }
        if (second === "breaking" && request.method === "POST") { const br = await setBreaking(env, first, b); await ctlCommand(env, first, "breaking", br ? br : { clear: true }, user.display_name || user.email, "breaking").catch(() => {}); await audit(env, user, br ? "tv.breaking" : "tv.breaking.clear", "tv", first, br || {}); return done({ ok: true, breaking: br }); }
        if (second === "items" && request.method === "GET") {
          const { results } = await env.DB.prepare("SELECT i.yt_id AS ytId,i.title,i.duration,i.thumb,i.published_at AS publishedAt,i.excluded,i.playable,s.title AS source FROM tv_items i LEFT JOIN tv_sources s ON s.id=i.source_id WHERE i.channel=? ORDER BY i.published_at DESC LIMIT 400").bind(first).all();
          return json({ items: results }, 200, { "cache-control": "no-store" });
        }
        if (second === "items" && third && request.method === "PUT") { await env.DB.prepare("UPDATE tv_items SET excluded=? WHERE channel=? AND yt_id=?").bind(b.excluded ? 1 : 0, first, third).run(); return done(); }
      }
      if (first === "refresh" && request.method === "POST") return done({ ok: true, ...(await refreshSources(env, { force: true, channel: CHANNELS.includes(b.channel) ? b.channel : null })) });
      if (first === "sources") {
        if (request.method === "POST") {
          const ch = CHANNELS.includes(b.channel) ? b.channel : null, ref = parseYouTubeRef(b.ref);
          if (!ch) return err("Choose the horizontal or the vertical channel.");
          if (!ref) return err("Paste a YouTube channel, playlist, video, Short or live address.");
          // A playlist is never a live, even with Live ticked.
          let kind = ref.kind === "playlist" ? "playlist" : b.kind === "live" || ref.kind === "live" ? "live" : ref.kind, id = randomId();
          // Shorts and videos only from the Rashtrix channel; lives from any channel.
          if (kind !== "live") {
            if (!ytReady(env)) return err("Add the YouTube key first: it is needed to check the channel.");
            if (await ownerOf(env, ref) !== (await ownChannel(env)).id) return err(NOT_OWN);
          }
          if (ref.kind === "channel") {
            // A whole channel: its Shorts (vertical), its long videos (horizontal), or its live.
            if (!ytReady(env)) return err("Add the YouTube key first: a channel address needs it.");
            const added = await addChannelSource(env, ch, ref, { title: clean(b.title, 200), live: kind === "live" || ref.tab === "live" || ref.tab === "streams" });
            id = added.id; kind = added.kind;
          } else await env.DB.prepare("INSERT INTO tv_sources (id,channel,kind,yt_id,title) VALUES (?,?,?,?,?)").bind(id, ch, kind, ref.id, clean(b.title, 200) || (kind === "playlist" && ytReady(env) ? await playlistTitle(env, ref.id) : "")).run()
            .catch(e => { throw new Error(/UNIQUE/.test(e.message) ? "That source is already on this channel." : e.message); });
          await audit(env, user, "tv.source.add", "tv_source", id, { ch, kind, yt: ref.id });
          if (ytReady(env)) { const src = await env.DB.prepare("SELECT * FROM tv_sources WHERE id=?").bind(id).first(); await refreshSource(env, src).catch(e => env.DB.prepare("UPDATE tv_sources SET last_error=? WHERE id=?").bind(String(e.message).slice(0, 200), id).run()); }
          return done({ ok: true, id });
        }
        if (second && request.method === "DELETE") { await env.DB.batch([env.DB.prepare("DELETE FROM tv_items WHERE source_id=?").bind(second), env.DB.prepare("DELETE FROM tv_sources WHERE id=?").bind(second)]); await audit(env, user, "tv.source.delete", "tv_source", second, {}); return done(); }
        if (second && request.method === "PUT") {
          const src = await env.DB.prepare("SELECT * FROM tv_sources WHERE id=?").bind(second).first();
          if (!src) return err("Not found.", 404);
          // One live on air per channel.
          if (b.onAir) await env.DB.prepare("UPDATE tv_sources SET on_air=0 WHERE channel=?").bind(src.channel).run();
          // Straight to air: read the live's state now rather than at the next ten-minute refresh.
          if (b.onAir && src.kind === "live" && ytReady(env)) await refreshSource(env, src).catch(() => {});
          await env.DB.prepare("UPDATE tv_sources SET active=?, on_air=?, title=? WHERE id=?").bind(b.active === undefined ? src.active : b.active ? 1 : 0, b.onAir === undefined ? src.on_air : b.onAir ? 1 : 0, b.title !== undefined ? clean(b.title, 200) : src.title, second).run();
          await audit(env, user, b.onAir !== undefined ? (b.onAir ? "tv.live.on" : "tv.live.off") : "tv.source.edit", "tv_source", second, b);
          return done();
        }
      }
      if (first === "promos") {
        if (request.method === "POST") {
          let image = String(b.image || "").trim();
          if (!/^\/media\/[\w.-]+$/.test(image)) image = await copyImage(env, image, user.id);
          const { n } = await env.DB.prepare("SELECT COALESCE(MAX(sort),0)+1 AS n FROM tv_promos").first();
          await env.DB.prepare("INSERT INTO tv_promos (id,title,image_url,seconds,sort) VALUES (?,?,?,?,?)").bind(randomId(), clean(b.title, 120), image, Math.max(3, Math.min(30, parseInt(b.seconds, 10) || 8)), n).run();
          return done();
        }
        if (second && request.method === "DELETE") { await env.DB.prepare("DELETE FROM tv_promos WHERE id=?").bind(second).run(); return done(); }
        if (second && request.method === "PUT") {
          const p = await env.DB.prepare("SELECT * FROM tv_promos WHERE id=?").bind(second).first();
          if (!p) return err("Not found.", 404);
          await env.DB.prepare("UPDATE tv_promos SET active=?, seconds=?, sort=? WHERE id=?").bind(b.active === undefined ? p.active : b.active ? 1 : 0, b.seconds ? Math.max(3, Math.min(30, parseInt(b.seconds, 10) || p.seconds)) : p.seconds, b.sort ?? p.sort, second).run();
          return done();
        }
      }
      return err("Not found.", 404);
    } catch (e) { return err(e.message); }
  }

  // ---- Audience events from readers' browsers (src/audience.js); daily totals only
  if (url.pathname === "/api/m" && request.method === "POST") {
    if (!BOT_UA.test(request.headers.get("user-agent") || "")) {
      const b = await request.json().catch(() => null);
      if (b && typeof b === "object") await recordEvent(env, b).catch(e => console.log("audience", e.message));
    }
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  if (url.pathname === "/api/admin/audience" && request.method === "GET") {
    if (!isStaff(await currentUser(request, env))) return err("Editor access required.", 403);
    return json(await audienceReport(env, url.searchParams.get("days")), 200, { "cache-control": "no-store" });
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
    const known = await env.DB.prepare("SELECT 1 FROM push_subscriptions WHERE endpoint=?").bind(b.endpoint).first();
    await env.DB.prepare("INSERT INTO push_subscriptions (endpoint,user_id) VALUES (?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=COALESCE(excluded.user_id,user_id)").bind(b.endpoint, user?.id || null).run();
    if (!known) await countPush(env, true);
    return json({ ok: true }, 201, { "cache-control": "no-store" });
  }
  if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const gone = await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(String(b.endpoint || "")).run();
    if (gone.meta?.changes) await countPush(env, false);
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
    // Staff devices get a newsroom alert (an output problem) when there is a fresh one.
    if (request.headers.get("cookie")?.includes("rw_session")) {
      const user = await currentUser(request, env).catch(() => null);
      const row = isStaff(user) && await env.DB.prepare("SELECT value FROM settings WHERE key='staff_alert'").first();
      const sa = row ? JSON.parse(row.value) : null;
      if (sa && Date.now() - Date.parse(sa.at) < 5 * 60e3) return json({ alert: { title: sa.title, body: sa.body, url: sa.url, createdAt: sa.at } }, 200, { "cache-control": "no-store" });
    }
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
    if (!isStaff(user)) return err("Editor access required.",403);   // leads are for administrators only
    const [members, articles, drafts, leads, discussions, events] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM users").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE status='published'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE status='draft'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM leads").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM community_posts WHERE status='published'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published'").first()
    ]);
    const subscribers = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").first();
    return json({members:members.n,published:articles.n,drafts:drafts.n,leads:user.role==="admin"?leads.n:null,discussions:discussions.n,events:events.n,subscribers:subscribers.n,generatedAt:new Date().toISOString()},200,{"cache-control":"no-store"});
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
    const lang = reqLang(url); if (lang !== "en" && mtReady(env)) await translateFields(env, lang, rows.results, ["title", "description"]);
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
      await createAlert(env, ctx, { title: `New ${String(b.eventType || "briefing").toLowerCase()}: ${title}`.slice(0, 140), body: `${when} IST. Add it to your calendar on Rashtrix.`, url: "/events", userId: user.id });
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
    await env.DB.prepare("INSERT INTO leads (id,name,email,organisation,interest,source) VALUES (?,?,?,?,?,?)").bind(id,name,email,String(b.organisation||"").slice(0,180),String(b.interest||"General").slice(0,100),String(b.source||"Rashtrix website").slice(0,100)).run();
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

// Every minute: alerts for scheduled stories that have just gone live, the next batch of pushes,
// the wire desk and the Wix import.
async function scheduled(env) {
  if (!env.DB) return;
  await ensureSchema(env);
  const { results } = await env.DB.prepare(`SELECT id,slug,title,kind,status,published_at FROM articles WHERE alert_state='pending' AND status='published' AND published_at<=? LIMIT 5`).bind(new Date().toISOString()).all();
  // Each step runs on its own, so one failure can't hold up the others; errors go to the Worker logs.
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.error(`cron ${name} failed:`, e?.stack || e); } };
  await step("scheduled stories", async () => { for (const row of results) await storyAlert(env, null, null, row); });
  await step("daily alerts", () => dailyAlerts(env, env.CRON_TEST_NOW ? new Date(env.CRON_TEST_NOW) : new Date())); // CRON_TEST_NOW: local tests only
  await step("push delivery", () => drainAlerts(env));
  await step("translations", () => mtWarm(env));
  await step("translation cache", () => env.DB.prepare("DELETE FROM mt_cache WHERE created_at < datetime('now','-45 days')").run());
  // The wire desk (approved sources → rewrites and briefs) and the Wix import (rashtrix.live).
  await step("wire desk", () => runWireDesk(env, { onAlert: a => storyAlert(env, null, null, { ...a, status: "published", kind: "rewrite", published_at: new Date().toISOString() }) }));
  await step("subject desks", () => refileSubjects(env));
  await step("wix feed", () => syncWixFeed(env));
  await step("wix backfill", () => backfillWix(env));
  // Rashtrix TV: refresh YouTube sources (each at most every ten minutes).
  await step("tv sources", () => refreshSources(env));
  // A one-line Bengali title for each new video, for the TV's "up next" card.
  await step("tv headlines", () => videoHeadlines(env));
  // A free-licence photo (with its credit) for each story in the TV bulletin.
  await step("bulletin pictures", () => bulletinImages(env));
  // The newsreader's voice for the bulletin's stories (when the Google voice key is set).
  await step("bulletin voices", async () => prepareBulletinVoices(env, (await tvState(env, "h")).bulletin));
  // The control room: midnight archive and the day's rundowns from templates; old clips go.
  await step("rundowns", () => rundownHousekeeping(env));
  await step("clips", () => clipHousekeeping(env));
  // Share cards for the newest stories (last: it opens a headless browser).
  await step("share cards", async () => {
    const origin = env.SITE_URL || (await env.DB.prepare("SELECT value FROM settings WHERE key='site_origin'").first())?.value;
    return renderCards(env, String(origin || "").replace(/\/$/, ""));
  });
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
    ? { title: "সুপ্রভাত, রাষ্ট্রিক্স", body: `কলকাতা, রাজ্য, দেশ আর বিদেশের সকালের খবর এক জায়গায়।${latest ? ` সর্বশেষ: ${latest.title}` : ""}`, url: "/" }
    : { title: "আজকের খবর · রাষ্ট্রিক্স", body: `সারা দিনের গুরুত্বপূর্ণ খবরে চোখ রাখুন।${latest ? ` সর্বশেষ: ${latest.title}` : ""}`, url: "/" };
  await createAlert(env, null, { ...alert, body: alert.body.slice(0, 240) });
  return slot;
}

let originSaved = false;
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(scheduled(env)); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // The share cards (src/ogcard.js); the cron needs the site's own address to photograph them.
    if (url.pathname.startsWith("/og/")) {
      try { await ensureSchema(env); const r = await ogRoute(url, env, ctx); if (r) return r; } catch (e) { console.error("og", e?.stack || e); return Response.redirect(`${url.origin}/og-image.jpg`, 302); }
    }
    if (!env.SITE_URL && !originSaved && env.DB && /^https:/.test(url.origin) && !/localhost|127\.0\.0\.1/.test(url.host)) { originSaved = true; ctx.waitUntil(env.DB.prepare("INSERT INTO settings (key,value) VALUES ('site_origin',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(url.origin).run().catch(() => {})); }
    if (url.pathname.startsWith("/oauth/") || url.pathname.startsWith("/.well-known/oauth-")) { try { await ensureSchema(env); const response=await oauthHandle(request,env); if(response)return response; } catch(e) { return err("OAuth service temporarily unavailable.",503); } }
    if (url.pathname === "/mcp") {
      try { return await api(request,env,ctx); }
      catch (e) { return json({error:"MCP internal error",detail:e.message},500,{"cache-control":"no-store"}); }
    }
    if (url.pathname.startsWith("/api/")) {
      try { return await api(request,env,ctx); }
      catch (e) { return json({error:"Internal API error",detail:e.message},500,{"cache-control":"no-store"}); }
    }
    // One public address for search engines: page visits to the workers.dev copy go to SITE_URL.
    if (env.SITE_URL && url.hostname.endsWith(".workers.dev") && ["GET", "HEAD"].includes(request.method)) {
      const target = new URL(url.pathname + url.search, env.SITE_URL);
      if (target.host !== url.host) return Response.redirect(target.toString(), 301);
    }
    // Bengali is the default language: old /bn/… addresses go to the bare address.
    if (/^\/bn(\/|$)/.test(url.pathname) && ["GET", "HEAD"].includes(request.method)) return Response.redirect(new URL((url.pathname.replace(/^\/bn/, "") || "/") + url.search, request.url).toString(), 301);
    try {
      if (url.pathname.startsWith("/media/")) return await serveMedia(request, env, ctx);
      if (url.pathname.startsWith("/clips/")) return await serveClip(request, env);
      if (url.pathname === "/robots.txt") return robots(request, env);
      if (url.pathname === "/privacy.html" || url.pathname === "/terms.html") return Response.redirect(new URL(url.pathname.replace(".html", ""), request.url).toString(), 301);
      if (url.pathname === "/sitemap.xml" && env.DB) return await sitemap(request, env, ensureSchema);
      if (url.pathname === "/news-sitemap.xml" && env.DB) return await newsSitemap(request, env, ensureSchema);
      if ((url.pathname === "/feed.xml" || url.pathname === "/rss.xml") && env.DB) return await feed(request, env, ensureSchema);
      if (env.ASSETS && request.method === "GET" && PAGE_PATTERN.test(url.pathname.replace(/^\/(en|hi)(?=\/|$)/, "") || "/")) return await renderPage(request, env, ensureSchema);
    } catch (e) { /* fall through to the static app */ }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Rashtrix assets are not built. Run npm run build.", { status: 503 });
  }
};
