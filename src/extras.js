// Phase 5 extras for the channels: in-app polls with an on-air bar ("not a scientific survey"),
// civic results boards (official figures only, locked during the exit-poll blackout), viewer
// comments to curate for the screen (app; YouTube live chat and Facebook when their keys are set),
// sponsors for the ad box (rotated by weight; proof of play from the as-run log), the বঙ্গাব্দ
// date and Kolkata weather for the clock and ticker, the audit-log report, and stories imported
// from the Rashtrix Command Centre (NRCS) into rundowns.
import { ytCall, ytReady } from "./youtube.js";
import { control } from "./controlroom.js";

const now = () => new Date().toISOString();
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const bn = s => String(s).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
async function getSetting(env, key) { const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first(); return r ? parse(r.value, null) : null; }
async function putSetting(env, key, v) { await env.DB.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, JSON.stringify(v)).run(); }

/* ---------- বঙ্গাব্দ: the Bengali date as West Bengal keeps it ---------- */
// The month is the sidereal sign the Sun is in at the start of the day (00:00 IST): a month
// begins on the first day that starts after the saṅkrānti. Sun longitude from Meeus (low
// precision, ~0.01°) less the Lahiri ayanāṁśa.
const MONTHS = ["বৈশাখ", "জ্যৈষ্ঠ", "আষাঢ়", "শ্রাবণ", "ভাদ্র", "আশ্বিন", "কার্তিক", "অগ্রহায়ণ", "পৌষ", "মাঘ", "ফাল্গুন", "চৈত্র"];
function siderealSun(ms) {
  const jd = ms / 864e5 + 2440587.5, T = (jd - 2451545) / 36525, rad = Math.PI / 180;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T, M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * rad;
  const C = (1.914602 - 0.004817 * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * T) * rad, apparent = L0 + C - 0.00569 - 0.00478 * Math.sin(omega);
  const ayanamsa = 23.85306 + (50.2791 / 3600) * (jd - 2451545) / 365.25;
  return ((apparent - ayanamsa) % 360 + 360) % 360;
}
export function bangabda(t = Date.now()) {
  const IST = 5.5 * 3600e3, dayStart = d => Math.floor((d + IST) / 864e5) * 864e5 - IST;   // 00:00 IST
  const start = dayStart(t), sign = d => Math.floor(siderealSun(d) / 30);
  const m = sign(start);
  let first = start; while (sign(first - 864e5) === m) first -= 864e5;
  const day = Math.round((start - first) / 864e5) + 1;
  const g = new Date(start + IST).getUTCFullYear(), month = new Date(start + IST).getUTCMonth();
  const year = m === 0 || (m <= 8 && month >= 3) ? g - 593 : g - 594;
  return { day, month: m, year, text: `${bn(day)} ${MONTHS[m]} ${bn(year)}` };
}

/* ---------- Kolkata weather (Open-Meteo: free, no key), every 30 minutes ---------- */
const WMO = c => c === 0 ? "পরিষ্কার আকাশ" : c <= 2 ? "আংশিক মেঘলা" : c === 3 ? "মেঘলা আকাশ" : c <= 48 ? "কুয়াশা" : c <= 57 ? "গুঁড়ি গুঁড়ি বৃষ্টি" : c <= 67 ? "বৃষ্টি" : c <= 77 ? "তুষারপাত" : c <= 82 ? "বৃষ্টি" : c <= 86 ? "তুষারপাত" : "বজ্রবিদ্যুৎ-সহ বৃষ্টি";
export async function weather(env) {
  const w = await getSetting(env, "weather_kolkata");
  if (w && Date.now() - w.at < 30 * 60e3) return w;
  try {
    const r = await fetch(env.WEATHER_ENDPOINT || "https://api.open-meteo.com/v1/forecast?latitude=22.5726&longitude=88.3639&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FKolkata", { signal: AbortSignal.timeout(6000) });
    const d = (await r.json()).current;
    const out = { at: Date.now(), temp: Math.round(d.temperature_2m), humidity: Math.round(d.relative_humidity_2m), text: WMO(d.weather_code) };
    out.line = `কলকাতার আবহাওয়া: ${bn(out.temp)}° সেলসিয়াস, ${out.text}, আর্দ্রতা ${bn(out.humidity)}%`;
    await putSetting(env, "weather_kolkata", out);
    return out;
  } catch {   // try again in ten minutes, keeping the last reading meanwhile
    await putSetting(env, "weather_kolkata", { ...(w || { line: "" }), at: Date.now() - 20 * 60e3 }).catch(() => {});
    return w || null;
  }
}

/* ---------- for every screen, alongside the channel state (/api/tv/<ch>) ---------- */
let cache = { at: 0, value: null };
export async function tvExtras(env) {
  if (Date.now() - cache.at < 5000 && cache.value) return cache.value;
  const [polls, boards, w] = await Promise.all([
    env.DB.prepare("SELECT id,question,options,status FROM polls WHERE status IN ('open','closed') AND created_at > datetime('now','-7 days') ORDER BY created_at DESC LIMIT 10").all().then(r => r.results).catch(() => []),
    env.DB.prepare("SELECT * FROM results_boards ORDER BY updated_at DESC LIMIT 10").all().then(r => r.results).catch(() => []),
    weather(env)
  ]);
  const counts = polls.length ? (await env.DB.prepare(`SELECT poll_id, choice, COUNT(*) AS n FROM poll_votes WHERE poll_id IN (${polls.map(() => "?").join(",")}) GROUP BY poll_id, choice`).bind(...polls.map(p => p.id)).all()).results : [];
  const value = {
    bangabda: bangabda().text,
    weather: w?.line || "",
    polls: polls.map(p => { const options = parse(p.options, []); return { id: p.id, question: p.question, options, status: p.status, counts: options.map((_, i) => counts.find(c => c.poll_id === p.id && c.choice === i)?.n || 0) }; }),
    // During the blackout nothing but the board's title leaves the server.
    boards: boards.map(b => { const blackout = b.blackout_until && Date.parse(b.blackout_until) > Date.now(); return { id: b.id, title: b.title, kind: b.kind, total: b.total, source: b.source, blackout, rows: blackout ? [] : parse(b.rows, []), updatedAt: b.updated_at }; })
  };
  cache = { at: Date.now(), value };
  return value;
}

/* ---------- comments from YouTube live chat and Facebook live ---------- */
async function fetchYouTubeChat(env, videoId) {
  if (!ytReady(env)) throw new Error("YouTube is not connected yet (YOUTUBE_API_KEY).");
  const st = (await getSetting(env, `ytchat:${videoId}`)) || {};
  if (!st.chatId) {
    const v = await ytCall(env, "videos", { part: "liveStreamingDetails", id: videoId });
    st.chatId = v.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    if (!st.chatId) throw new Error("That video has no live chat now.");
  }
  const d = await ytCall(env, "liveChat/messages", { liveChatId: st.chatId, part: "snippet,authorDetails", maxResults: "200", ...(st.page ? { pageToken: st.page } : {}) }, 5);
  st.page = d.nextPageToken; await putSetting(env, `ytchat:${videoId}`, st);
  let n = 0;
  for (const m of d.items || []) {
    const text = m.snippet?.displayMessage; if (!text) continue;
    const r = await env.DB.prepare("INSERT OR IGNORE INTO viewer_comments (id,platform,ext_id,author,text,at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), "youtube", `yt:${m.id}`, clean(m.authorDetails?.displayName, 60), clean(text, 300), m.snippet.publishedAt || now()).run();
    n += r.meta.changes;
  }
  return n;
}
async function fetchFacebook(env, liveId) {
  if (!env.FB_PAGE_TOKEN) throw new Error("Facebook is not connected yet (FB_PAGE_TOKEN).");
  const r = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(liveId)}/comments?order=reverse_chronological&limit=100&fields=id,message,from{name},created_time&access_token=${encodeURIComponent(env.FB_PAGE_TOKEN)}`, { signal: AbortSignal.timeout(8000) });
  const d = await r.json(); if (d.error) throw new Error(`Facebook: ${d.error.message}`);
  let n = 0;
  for (const c of d.data || []) { if (!c.message) continue; const x = await env.DB.prepare("INSERT OR IGNORE INTO viewer_comments (id,platform,ext_id,author,text,at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), "facebook", `fb:${c.id}`, clean(c.from?.name || "Facebook", 60), clean(c.message, 300), c.created_time || now()).run(); n += x.meta.changes; }
  return n;
}

/* ---------- Rashtrix Command Centre (self-hosted NRCS): approved stories ---------- */
async function nrcsToken(env, fresh = false) {
  const t = await getSetting(env, "nrcs_token");
  if (t && !fresh && Date.now() - t.at < 20 * 864e5) return t.token;
  const r = await fetch(`${env.NRCS_URL.replace(/\/$/, "")}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: env.NRCS_USERNAME, password: env.NRCS_PASSWORD, department: env.NRCS_DEPARTMENT || "Editorial" }), signal: AbortSignal.timeout(8000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) throw new Error(`Command Centre sign-in failed: ${d.error || r.status}`);
  await putSetting(env, "nrcs_token", { token: d.token, at: Date.now() });
  return d.token;
}
async function nrcsStories(env) {
  const get = async fresh => fetch(`${env.NRCS_URL.replace(/\/$/, "")}/api/stories`, { headers: { authorization: `Bearer ${await nrcsToken(env, fresh)}` }, signal: AbortSignal.timeout(8000) });
  let r = await get(false); if (r.status === 401) r = await get(true);
  if (!r.ok) throw new Error(`Command Centre: ${r.status}`);
  const { stories = [] } = await r.json();
  // Only stories ready for a rundown (the Command Centre's own rule: Approved or On Air).
  return stories.filter(s => ["Approved", "On Air"].includes(s.stage)).slice(0, 100).map(s => ({
    id: s.id, title: s.headlineBn || s.headline, slug: [s.section, s.priority !== "Normal" ? s.priority : ""].filter(Boolean).join(" · "),
    script: s.script || "", duration: Number(s.durationSec) || 60, reporter: s.reporter || "", video: "", lowerThird: "", lowerTitle: ""
  }));
}

/* ---------- routes ---------- */
export async function handleExtras(request, env, url, { json, err, currentUser, isStaff, auditFn }) {
  const p = url.pathname, m = request.method;
  const ok = (x = {}) => json({ ok: true, ...x }, 200, { "cache-control": "no-store" });

  // Public: vote in a poll (one vote per device a day, kept only as a one-way hash).
  const vote = p.match(/^\/api\/polls\/([\w-]{8,64})\/vote$/);
  if (vote && m === "POST") {
    const poll = await env.DB.prepare("SELECT * FROM polls WHERE id=?").bind(vote[1]).first();
    if (!poll || poll.status !== "open") return err("This poll is closed.");
    const b = await request.json().catch(() => ({})), opts = parse(poll.options, []);
    const choice = Number(b.choice); if (!Number.isInteger(choice) || choice < 0 || choice >= opts.length) return err("Choose an option.");
    const who = `${request.headers.get("cf-connecting-ip") || ""}|${request.headers.get("user-agent") || ""}|${poll.id}|${now().slice(0, 10)}`;
    const voter = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(who)))].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
    const r = await env.DB.prepare("INSERT OR IGNORE INTO poll_votes (poll_id,voter,choice) VALUES (?,?,?)").bind(poll.id, voter, choice).run();
    cache.at = 0;
    return ok({ counted: !!r.meta.changes });
  }
  if (p === "/api/polls" && m === "GET") { const x = await tvExtras(env); return json({ polls: x.polls.filter(q => q.status === "open"), note: "এটি বৈজ্ঞানিক সমীক্ষা নয়।" }, 200, { "cache-control": "no-cache" }); }
  // Signed-in readers can send a comment to the channel (the desk chooses what goes on screen).
  if (p === "/api/comments" && m === "POST") {
    const u = await currentUser(request, env); if (!u) return err("Sign in to send a comment.", 401);
    const b = await request.json().catch(() => ({})), text = clean(b.text, 300);
    if (text.length < 2) return err("Write a comment.");
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM viewer_comments WHERE platform='app' AND ext_id LIKE ? AND at > datetime('now','-1 minute')").bind(`app:${u.id}:%`).first();
    if (recent.n >= 3) return err("Please wait a minute before sending another comment.", 429);
    await env.DB.prepare("INSERT INTO viewer_comments (id,platform,ext_id,author,text,at) VALUES (?,?,?,?,?,datetime('now'))").bind(crypto.randomUUID(), "app", `app:${u.id}:${Date.now()}`, clean(u.display_name, 60), text).run();
    return ok();
  }

  if (!p.startsWith("/api/admin/")) return null;
  const sect = p.split("/")[3];
  if (!["polls", "boards", "comments", "sponsors", "audit", "nrcs"].includes(sect)) return null;
  const user = await currentUser(request, env);
  if (!isStaff(user)) return err("Editor access required.", 403);
  const audit = (...a) => auditFn(user, ...a);
  const id = p.split("/")[4], b = ["GET", "DELETE"].includes(m) ? {} : await request.json().catch(() => ({}));
  const done = x => { cache.at = 0; return ok(x); };

  if (sect === "polls") {
    if (!id && m === "GET") { cache.at = 0; const x = await tvExtras(env); const { results } = await env.DB.prepare("SELECT id,question,status,created_at FROM polls ORDER BY created_at DESC LIMIT 50").all(); return json({ polls: results.map(r => ({ ...r, ...(x.polls.find(q => q.id === r.id) || {}) })) }, 200, { "cache-control": "no-store" }); }
    if (!id && m === "POST") {
      const q = clean(b.question, 160), opts = (b.options || []).map(o => clean(o, 60)).filter(Boolean).slice(0, 5);
      if (q.length < 5 || opts.length < 2) return err("Write the question and at least two answers.");
      const nid = crypto.randomUUID(); await env.DB.prepare("INSERT INTO polls (id,question,options,status) VALUES (?,?,?,?)").bind(nid, q, JSON.stringify(opts), "open").run();
      await audit("poll.create", "poll", nid, { q }); return done({ id: nid });
    }
    if (id && m === "PUT") { await env.DB.prepare("UPDATE polls SET status=? WHERE id=?").bind(["open", "closed", "draft"].includes(b.status) ? b.status : "closed", id).run(); await audit(`poll.${b.status}`, "poll", id, {}); return done(); }
    if (id && m === "DELETE") { await env.DB.batch([env.DB.prepare("DELETE FROM poll_votes WHERE poll_id=?").bind(id), env.DB.prepare("DELETE FROM polls WHERE id=?").bind(id)]); await audit("poll.delete", "poll", id, {}); return done(); }
  }
  if (sect === "boards") {
    const rows = r => (Array.isArray(r) ? r : []).slice(0, 12).map(x => ({ party: clean(x.party, 40), colour: /^#[0-9a-f]{3,6}$/i.test(x.colour || "") ? x.colour : "#AA0404", won: Math.max(0, Number(x.won) || 0), leading: Math.max(0, Number(x.leading) || 0), votes: Math.max(0, Number(x.votes) || 0) }));
    const blackout = v => v && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
    if (!id && m === "GET") { const { results } = await env.DB.prepare("SELECT * FROM results_boards ORDER BY updated_at DESC").all(); return json({ boards: results.map(x => ({ ...x, rows: parse(x.rows, []), blackout: x.blackout_until && Date.parse(x.blackout_until) > Date.now() })) }, 200, { "cache-control": "no-store" }); }
    if (!id && m === "POST" || id && m === "PUT") {
      if (!clean(b.source, 120)) return err("Name the official source (e.g. Election Commission of India). Only official figures go on air.");
      const bid = id || crypto.randomUUID();
      await env.DB.prepare("INSERT INTO results_boards (id,title,kind,total,rows,source,blackout_until,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, kind=excluded.kind, total=excluded.total, rows=excluded.rows, source=excluded.source, blackout_until=excluded.blackout_until, updated_at=excluded.updated_at")
        .bind(bid, clean(b.title, 100) || "ফলাফল", b.kind === "votes" ? "votes" : "seats", Math.max(0, Number(b.total) || 0), JSON.stringify(rows(b.rows)), clean(b.source, 120), blackout(b.blackoutUntil), now()).run();
      await audit("results.update", "board", bid, { source: b.source }); return done({ id: bid });
    }
    if (id && m === "DELETE") { await env.DB.prepare("DELETE FROM results_boards WHERE id=?").bind(id).run(); return done(); }
  }
  if (sect === "comments") {
    if (!id && m === "GET") { const st = ["new", "approved", "rejected"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "new"; const { results } = await env.DB.prepare("SELECT id,platform,author,text,at,status FROM viewer_comments WHERE status=? ORDER BY at DESC LIMIT 200").bind(st).all(); return json({ comments: results, youtube: ytReady(env), facebook: Boolean(env.FB_PAGE_TOKEN) }, 200, { "cache-control": "no-store" }); }
    if (id === "fetch" && m === "POST") {
      const out = {};
      if (b.youtube) { const vid = String(b.youtube).match(/(?:v=|youtu\.be\/|live\/)?([\w-]{11})/)?.[1]; try { out.youtube = await fetchYouTubeChat(env, vid); } catch (e) { out.youtubeError = e.message; } }
      if (b.facebook) { try { out.facebook = await fetchFacebook(env, String(b.facebook).match(/(\d{6,})/)?.[1] || b.facebook); } catch (e) { out.facebookError = e.message; } }
      return ok(out);
    }
    if (id === "onair" && m === "POST") {   // put up to three approved comments on screen (or clear)
      const ids = (b.ids || []).slice(0, 3);
      const items = ids.length ? (await env.DB.prepare(`SELECT author,text,platform FROM viewer_comments WHERE status='approved' AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results : [];
      const r = await control(env, ["h", "v"].includes(b.channel) ? b.channel : "h", "overlay", { comments: items.length ? items : null }, user.display_name || user.email);
      await audit("comments.onair", "channel", b.channel || "h", { n: items.length }); return json(r);
    }
    if (id && m === "PUT") { await env.DB.prepare("UPDATE viewer_comments SET status=? WHERE id=?").bind(["approved", "rejected", "new"].includes(b.status) ? b.status : "new", id).run(); return ok(); }
  }
  if (sect === "sponsors") {
    if (!id && m === "GET") { const { results } = await env.DB.prepare("SELECT * FROM sponsors ORDER BY active DESC, weight DESC, name").all(); return json({ sponsors: results }, 200, { "cache-control": "no-store" }); }
    if (!id && m === "POST" || id && m === "PUT") {
      const sid = id || crypto.randomUUID(), img = String(b.image || "").trim();
      if (img && !/^(https:\/\/|\/media\/|\/brand\/)/.test(img)) return err("The picture must be uploaded or an https:// address.");
      await env.DB.prepare("INSERT INTO sponsors (id,name,image,line1,line2,line3,weight,seconds,active,starts,ends) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,image=excluded.image,line1=excluded.line1,line2=excluded.line2,line3=excluded.line3,weight=excluded.weight,seconds=excluded.seconds,active=excluded.active,starts=excluded.starts,ends=excluded.ends")
        .bind(sid, clean(b.name, 80) || "Sponsor", img.slice(0, 800), clean(b.line1, 40), clean(b.line2, 60), clean(b.line3, 80), Math.max(1, Math.min(100, Number(b.weight) || 1)), Math.max(5, Math.min(300, Number(b.seconds) || 20)), b.active === false ? 0 : 1, b.starts || null, b.ends || null).run();
      await audit("sponsor.save", "sponsor", sid, { name: b.name }); return ok({ id: sid });
    }
    if (id && m === "DELETE") { await env.DB.prepare("UPDATE sponsors SET active=0 WHERE id=?").bind(id).run(); await audit("sponsor.off", "sponsor", id, {}); return ok(); }
  }
  if (sect === "audit" && m === "GET") {   // the audit log for a period (printable as PDF)
    const from = url.searchParams.get("from") || now().slice(0, 10), to = url.searchParams.get("to") || now().slice(0, 10), pre = clean(url.searchParams.get("action"), 40);
    const { results } = await env.DB.prepare(`SELECT a.created_at AS at, a.action, a.target_type AS type, a.target_id AS target, a.details, COALESCE(u.display_name, u.email, a.actor_id) AS who FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id WHERE a.created_at >= ? AND a.created_at < date(?, '+1 day') ${pre ? "AND a.action LIKE ?" : ""} ORDER BY a.created_at LIMIT 5000`).bind(...(pre ? [from, to, `${pre}%`] : [from, to])).all();
    return json({ from, to, rows: results }, 200, { "cache-control": "no-store" });
  }
  if (sect === "nrcs" && id === "stories" && m === "GET") {
    if (!env.NRCS_URL || !env.NRCS_USERNAME || !env.NRCS_PASSWORD) return json({ configured: false, stories: [] }, 200, { "cache-control": "no-store" });
    try { return json({ configured: true, stories: await nrcsStories(env) }, 200, { "cache-control": "no-store" }); }
    catch (e) { return err(e.message, 502); }
  }
  return err("Not found.", 404);
}
