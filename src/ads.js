// The Ad library desk (adsdesk.html): every ad and brand film the channels play, uploaded to the
// clip store or added as a YouTube link, and when each plays:
//   - so many times in every 30 minutes (on rotation, optionally only between two times of day);
//   - at set times of day (India time);
//   - between two dates;
//   - forced: at the next break, once.
// An ad never cuts what is on air: the channel's running order (src/engine.js localSeg) plays it
// in the next break, when the item on air has ended. Ads the app made itself (origin "app", like
// the Rashtrix brand film) cannot be deleted, only rescheduled or switched off; the channel's own
// ads can be deleted.
import { ytCall, isoSeconds } from "./youtube.js";
import { markClipUsed } from "./clips.js";

const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const int = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const hhmm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "").trim()) ? String(v).trim() : "";
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "";
const IST = 5.5 * 3600e3;
const today = () => new Date(Date.now() + IST).toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const ytOf = u => (String(u || "").match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/) || [])[1] || "";

// The brand film the app made (seed/rashtrix-brand-film.mp4 in the repository), copied once into
// the clip store by the cron, and put on rotation twice in every 30 minutes on the TV channel.
// (720p at about 1.5 Mbit/s: it starts at once and plays without stalling on a phone's mobile data;
//  the first copy, full HD at twice that, is replaced by it)
export const BRAND_FILM = { id: "brand-film-1", title: "Rashtrix brand film", secs: 93, key: "clips/brand/rashtrix-brand-film-720.mp4", oldKey: "clips/brand/rashtrix-brand-film.mp4",
  src: "https://raw.githubusercontent.com/ilmazsyed/Raisina-Wire/rashtrix/seed/rashtrix-brand-film-720.mp4" };

const row = r => {
  let times = []; try { times = JSON.parse(r.times || "[]"); } catch { /* none */ }
  return { id: r.id, title: r.title, kind: r.kind, url: r.url, ytId: r.yt_id, secs: r.secs, origin: r.origin, category: r.category, channels: r.channels,
    per30: r.per30, times, from: r.from_time, to: r.to_time, startDay: r.start_day, endDay: r.end_day, forceAt: r.force_at || "",
    active: !!r.active, plays: r.plays, lastPlayed: r.last_played || "", createdAt: r.created_at };
};

// The schedule fields from the desk (the same for a new ad and an edit).
function scheduleOf(b, old = {}) {
  const pick = (k, f) => b[k] === undefined ? old[k] : f(b[k]);
  return {
    title: clean(pick("title", v => v), 120) || old.title || "Ad",
    category: ["ad", "brand", "promo"].includes(b.category) ? b.category : old.category || "ad",
    channels: ["h", "v", "hv"].includes(b.channels) ? b.channels : old.channels || "h",
    per30: pick("per30", v => int(v, 0, 6, 0)) ?? 0,
    times: pick("times", v => (Array.isArray(v) ? v : String(v || "").split(/[\s,]+/)).map(hhmm).filter(Boolean).slice(0, 24)) || [],
    from: pick("from", hhmm) || "", to: pick("to", hhmm) || "",
    startDay: pick("startDay", day) || "", endDay: pick("endDay", day) || "",
    active: b.active === undefined ? old.active !== false : !!b.active
  };
}

// What every screen reads (src/tvchannel.js tvState): the ads on for this channel today.
export async function adsOnAir(env, ch) {
  const { results } = await env.DB.prepare("SELECT * FROM tv_ads WHERE active=1").all().catch(() => ({ results: [] }));
  const d = today();
  return results.map(row).filter(a => a.channels.includes(ch) && (a.kind === "yt" ? a.ytId : a.url) && a.secs > 0
    && (!a.startDay || a.startDay <= d) && (!a.endDay || a.endDay >= d) && (a.per30 || a.times.length || a.forceAt))
    .map(a => ({ id: a.id, title: a.title, ytId: a.kind === "yt" ? a.ytId : "", url: a.kind === "clip" ? a.url : "", dur: a.secs,
      per30: a.per30, times: a.times, from: a.from, to: a.to, force: a.forceAt && Date.now() - Date.parse(a.forceAt) < 30 * 60e3 ? Date.parse(a.forceAt) : 0 }));
}

// From the broadcast output (checked by its key): an ad went on air.
export async function adPlayed(env, b, outputOk) {
  if (!outputOk || !b.id) return { ok: false };
  const r = await env.DB.prepare("SELECT url FROM tv_ads WHERE id=?").bind(String(b.id)).first();
  if (!r) return { ok: false };
  await env.DB.prepare("UPDATE tv_ads SET plays=plays+1, last_played=? WHERE id=?").bind(nowIso(), String(b.id)).run();
  if (r.url) await markClipUsed(env, r.url);
  return { ok: true };
}

// The clips the ads use (kept by the clip store's clean-up).
export async function adClips(env) {
  const { results } = await env.DB.prepare("SELECT url FROM tv_ads WHERE kind='clip'").all().catch(() => ({ results: [] }));
  return results.map(r => String(r.url).replace(/^\//, ""));
}

// Cron: the brand film, once, into the clip store and the ad library.
export async function seedBrandFilm(env) {
  if (!env.CLIPS) return null;
  const row = await env.DB.prepare("SELECT url FROM tv_ads WHERE id=?").bind(BRAND_FILM.id).first();
  if (row && row.url !== `/${BRAND_FILM.oldKey}`) return null;
  const has = await env.CLIPS.head(BRAND_FILM.key);
  let bytes = has?.size || 0;
  if (!has) {
    const r = await fetch(BRAND_FILM.src);
    const len = Number(r.headers.get("content-length") || 0);
    if (!r.ok || !len) return { error: `brand film: ${r.status}` };
    const { readable, writable } = new FixedLengthStream(len);
    const put = env.CLIPS.put(BRAND_FILM.key, readable, { httpMetadata: { contentType: "video/mp4" } });
    await r.body.pipeTo(writable); await put; bytes = len;
  }
  await env.DB.prepare("INSERT OR IGNORE INTO clips (id,title,r2_key,mime,bytes,duration,source,status,keep) VALUES (?,?,?,?,?,?,?,?,1)")
    .bind(`${BRAND_FILM.id}-720`, BRAND_FILM.title, BRAND_FILM.key, "video/mp4", bytes, BRAND_FILM.secs, "app", "ready").run().catch(() => {});
  await env.DB.prepare("INSERT OR IGNORE INTO tv_ads (id,title,kind,url,secs,origin,category,channels,per30) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(BRAND_FILM.id, BRAND_FILM.title, "clip", `/${BRAND_FILM.key}`, BRAND_FILM.secs, "app", "brand", "h", 2).run();
  // (the ad already in the library moves to the lighter copy; its schedule stays as the desk set it)
  if (row) { await env.DB.prepare("UPDATE tv_ads SET url=? WHERE id=?").bind(`/${BRAND_FILM.key}`, BRAND_FILM.id).run(); await env.CLIPS.delete(BRAND_FILM.oldKey).catch(() => {}); await env.DB.prepare("DELETE FROM clips WHERE r2_key=?").bind(BRAND_FILM.oldKey).run().catch(() => {}); }
  return { seeded: bytes };
}

// The desk's API: /api/admin/ads[/:id[/force]]
export async function handleAds(request, env, url, user, { json, err, audit }) {
  const [, , , , id, sub] = url.pathname.split("/").map(decodeURIComponent), m = request.method;
  const b = m === "GET" || m === "DELETE" ? {} : await request.json().catch(() => ({}));
  const ok = (x = {}) => json({ ok: true, ...x }, 200, { "cache-control": "no-store" });
  if (!id && m === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM tv_ads ORDER BY origin='app' DESC, created_at DESC LIMIT 300").all();
    return json({ ads: results.map(row), today: today() }, 200, { "cache-control": "no-store" });
  }
  if (!id && m === "POST") {
    // A new ad: an uploaded clip (/clips/...) or a YouTube link.
    const link = clean(b.link, 800), yt = ytOf(link), clip = /^\/clips\/[\w./-]+$/.test(link) && !link.includes("..") ? link : "";
    if (!yt && !clip) return err("Upload a video, or paste a YouTube link.");
    let secs = int(b.secs, 0, 3600, 0);
    if (!secs && yt && env.YOUTUBE_API_KEY) { try { const d = await ytCall(env, "videos", { part: "contentDetails", id: yt }); secs = isoSeconds(d.items?.[0]?.contentDetails?.duration) || 0; } catch { /* none */ } }
    if (!secs) return err("How long is the ad? Give its length in seconds.");
    const s = scheduleOf(b), nid = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO tv_ads (id,title,kind,url,yt_id,secs,origin,category,channels,per30,times,from_time,to_time,start_day,end_day,active,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(nid, s.title, yt ? "yt" : "clip", clip, yt, secs, "channel", s.category, s.channels, s.per30, JSON.stringify(s.times), s.from, s.to, s.startDay, s.endDay, s.active ? 1 : 0, user.id).run();
    if (clip) await env.DB.prepare("UPDATE clips SET keep=1 WHERE r2_key=?").bind(clip.slice(1)).run().catch(() => {});
    await audit("ad.create", "ad", nid, { title: s.title, kind: yt ? "yt" : "clip" });
    return ok({ id: nid });
  }
  const r = id ? await env.DB.prepare("SELECT * FROM tv_ads WHERE id=?").bind(id).first() : null;
  if (!r) return err("Ad not found.", 404);
  const a = row(r);
  if (!sub && m === "PUT") {
    // Reschedule (any ad, the app's own too): title, where, how often, when, on or off.
    const s = scheduleOf(b, a), secs = a.origin === "app" ? a.secs : int(b.secs, 1, 3600, a.secs);
    await env.DB.prepare("UPDATE tv_ads SET title=?, category=?, channels=?, per30=?, times=?, from_time=?, to_time=?, start_day=?, end_day=?, active=?, secs=?, updated_at=? WHERE id=?")
      .bind(s.title, s.category, s.channels, s.per30, JSON.stringify(s.times), s.from, s.to, s.startDay, s.endDay, s.active ? 1 : 0, secs, nowIso(), id).run();
    await audit("ad.schedule", "ad", id, { per30: s.per30, times: s.times, active: s.active });
    return ok();
  }
  if (sub === "force" && m === "POST") {
    // Forced: at the next break on air (never cutting what is playing); or cancelled.
    await env.DB.prepare("UPDATE tv_ads SET force_at=?, updated_at=? WHERE id=?").bind(b.cancel ? null : nowIso(), nowIso(), id).run();
    await audit(b.cancel ? "ad.unforce" : "ad.force", "ad", id, {});
    return ok();
  }
  if (!sub && m === "DELETE") {
    if (a.origin === "app") return err("Ads the app made cannot be deleted. Switch it off or reschedule it instead.", 403);
    await env.DB.prepare("DELETE FROM tv_ads WHERE id=?").bind(id).run();
    // Its clip is no longer kept for the ad (the clip store's own clean-up then decides).
    if (a.url) await env.DB.prepare("UPDATE clips SET keep=0 WHERE r2_key=?").bind(a.url.slice(1)).run().catch(() => {});
    await audit("ad.delete", "ad", id, { title: a.title });
    return ok();
  }
  return err("Not found.", 404);
}
