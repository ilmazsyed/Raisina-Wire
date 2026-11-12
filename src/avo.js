// The AVO Breaking Engine: major stories from the wire read by the AI newsreader over full-screen
// pictures, 30 seconds each. A story still goes out as before (breaking card, headlines, the
// bulletin); a major one also becomes an AVO story here, and the screens play them in blocks of
// four to six, newest first, between every three videos (src/engine.js).
//
// - Major only, with a Bengal focus: up to 45 a day (India time), shared 60% Bengal and Kolkata,
//   20% India, 15% Bangladesh, the USA, China, Russia and South Asia (seen from India), 5% the
//   rest of the world, paced across the day. "Major" is scored from how many outlets carried the
//   story and whether it went out as a breaking alert; entertainment and lifestyle are left out.
// - The script: the story's own Bengali text (the wire desk's, in the house style), five or six
//   sentences, about 30 seconds read at the bulletin's pace. Its first part is the bulletin's own
//   line (the same recording, so it costs nothing twice); the rest is recorded once.
// - The newsreader: Despina and Sadachbia in turn, story by story.
// - Pictures: only photographs that are about the story (src/bulletinimg.js checkedPhotos: its own
//   reports or plainly the same story elsewhere, page and picture rules, then the image model; with
//   the model unavailable, the stricter free rules). A story with fewer than two is told in motion
//   graphics on the screens (its icon, map, figure and sentences).
// - A story leaves the rotation when it is six hours old or has been on air four times.
import { readLine, voiceKey, tvVoice, voiceRate, voiceBudget, chargeVoice } from "./bulletinvoice.js";
import { synthesize, sha256, ttsEnabled } from "./tts.js";
import { checkedPhotos } from "./bulletinimg.js";
import { placesIn, topicOf } from "./segments.js";
import { labelsOf } from "./labels.js";

export const AVO_DAILY = 45, AVO_HOURS = 6, AVO_MAX_AIRED = 4, AVO_SECONDS = 30;
const QUOTA = { bengal: 27, india: 9, neighbours: 7, world: 2 };
const IST = 5.5 * 3600e3;
const istDay = (t = Date.now()) => new Date(t + IST).toISOString().slice(0, 10);
const NEIGH = /বাংলাদেশ|ঢাকা|ইউনূস|হাসিনা|আমেরিকা|মার্কিন|যুক্তরাষ্ট্র|ওয়াশিংটন|ট্রাম্প|হোয়াইট হাউস|চিন|চীন|বেজিং|জিনপিং|রাশিয়া|মস্কো|পুতিন|পাকিস্তান|ইসলামাবাদ|নেপাল|কাঠমান্ডু|ভুটান|শ্রীলঙ্কা|মায়ানমার|মায়ানমার|আফগানিস্তান|কাবুল|মালদ্বীপ|bangladesh|dhaka|america|united states|washington|trump|china|beijing|russia|moscow|putin|pakistan|nepal|bhutan|sri lanka|myanmar|afghanistan|maldives/i;
const BENGAL_SPORT = /কলকাতা|মোহনবাগান|ইস্টবেঙ্গল|মহমেডান|ইডেন|সৌরভ|বাংলা দল/;
// The same opening words the bulletin reads (src/tvchannel.js firstWords), so the line is shared.
const firstWords = (body, n = 100) => {
  const words = String(body || "").replace(/<[^>]+>/g, " ").replace(/[#*_>]+/g, " ").replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, n).join(" ") + (words.length > n ? "…" : "");
};
const plain = body => String(body || "").replace(/<[^>]+>/g, " ").replace(/[#*_>]+/g, " ").replace(/\s+/g, " ").trim();
const sentencesOf = text => String(text || "").replace(/…$/, "").replace(/\s*\n+\s*/g, "। ").replace(/\s+/g, " ").trim()
  .replace(/\s*([,;:।!?])\s*/g, "$1 ").replace(/([।!?])\s*([।!?])+/g, "$1").replace(/\.(\s|$)/g, "।$1").trim()
  .split(/(?<=[।!?])\s+/).map(x => x.trim()).filter(Boolean);

export function regionOf(a) {
  const text = `${a.title || ""} ${a.dek || ""} ${a.tags || ""}`;
  if (["Kolkata", "West Bengal"].includes(a.category)) return "bengal";
  if (["India", "Probashi Bangali"].includes(a.category)) return "india";
  if (a.category === "Sports") return BENGAL_SPORT.test(text) ? "bengal" : "india";
  return NEIGH.test(text) ? "neighbours" : "world";
}
// The script: the bulletin's line first, then the next sentences up to about 30 seconds.
export function avoScript(a) {
  const item = { text: firstWords(a.body), title: a.title };
  const first = readLine(item), all = sentencesOf(plain(a.body));
  const firstN = sentencesOf(first).length;
  let rest = "", total = first.length;
  for (const x of all.slice(firstN, 6)) { if (total + x.length + 1 > 420) break; rest = rest ? `${rest} ${x}` : x; total += x.length + 1; }
  return { item, first, rest, lines: [...sentencesOf(first), ...sentencesOf(rest)] };
}

// Which new stories become AVO stories: the major ones, within each region's share of the day.
async function choose(env) {
  const day = istDay(), hour = new Date(Date.now() + IST).getUTCHours() + new Date(Date.now() + IST).getUTCMinutes() / 60;
  const used = Object.fromEntries((await env.DB.prepare("SELECT region, COUNT(*) AS n FROM avo_stories WHERE day=? AND origin='auto' GROUP BY region").bind(day).all()).results.map(r => [r.region, r.n]));
  const total = Object.values(used).reduce((n, x) => n + x, 0);
  if (total >= AVO_DAILY) return 0;
  const { results } = await env.DB.prepare(`SELECT a.id, a.title, a.dek, a.tags, a.category, a.kind, a.body, a.published_at, a.alert_state,
      (SELECT COUNT(*) FROM wire_jobs j JOIN wire_items i ON i.job_id=j.id WHERE j.article_id=a.id) AS outlets
    FROM articles a LEFT JOIN avo_stories v ON v.article_id=a.id
    WHERE v.article_id IS NULL AND a.status='published' AND a.lang='bn' AND a.pulled_at IS NULL AND a.kind IN ('rewrite','brief')
      AND a.category NOT IN ('Entertainment','Lifestyle') AND a.published_at>=? ORDER BY a.published_at DESC LIMIT 40`)
    .bind(new Date(Date.now() - 3 * 3600e3).toISOString()).all();
  const scored = results.map(a => ({ a, region: regionOf(a), score: 2 * Math.min(5, a.outlets || 0) + (a.alert_state === "sent" ? 6 : 0) + (a.kind === "rewrite" ? 1 : 0) }))
    .filter(x => x.a.category !== "Sports" || x.a.alert_state === "sent").sort((x, y) => y.score - x.score);
  let added = 0;
  for (const x of scored) {
    // Paced: a region may have used its share in proportion to the hours gone (plus two).
    const allowed = Math.ceil(QUOTA[x.region] * Math.min(1, (hour + 2) / 24)), have = used[x.region] || 0;
    if (have >= allowed || total + added >= AVO_DAILY) continue;
    // Major: carried by two or more outlets, or a breaking alert; a region well behind its pace
    // takes the best single-outlet story too.
    const need = have < allowed / 2 && hour > 4 ? 3 : 5;
    if (x.score < need) continue;
    const s = avoScript(x.a);
    await env.DB.prepare("INSERT OR IGNORE INTO avo_stories (article_id,title,desk,region,score,script,status,day,published_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(x.a.id, x.a.title, x.a.category, x.region, x.score, JSON.stringify(s.lines), "new", day, x.a.published_at).run();
    used[x.region] = have + 1; added++;
  }
  return added;
}

// Breaking news put in by hand in the control room: an AVO story at once (headline read).
export async function avoFromBreaking(env, br) {
  if (!br?.text) return;
  const id = `brk:${Date.parse(br.at) || Date.now()}`;
  await env.DB.prepare("INSERT OR IGNORE INTO avo_stories (article_id,title,desk,region,score,script,status,day,published_at,origin) VALUES (?,?,?,?,?,?,?,?,?,'breaking')")
    .bind(id, String(br.text).slice(0, 300), "Breaking", "bengal", 99, JSON.stringify(sentencesOf(br.text).length ? sentencesOf(br.text) : [String(br.text)]), "new", istDay(), new Date().toISOString()).run().catch(() => {});
}

// Voice and pictures for a chosen story.
async function prepare(env, row, sex) {
  const own = row.origin === "manual" || row.origin === "breaking" || row.article_id.startsWith("brk:");
  const brief = own ? (JSON.parse(row.script || "[]").join(" ") || row.title) : "";
  const a = own ? { id: row.article_id, title: row.title, dek: "", body: brief, published_at: row.published_at } : await env.DB.prepare("SELECT id, title, dek, body, published_at FROM articles WHERE id=?").bind(row.article_id).first();
  if (!a) { await env.DB.prepare("UPDATE avo_stories SET status='failed' WHERE article_id=?").bind(row.article_id).run(); return; }
  // A hand-written story is read as written (its brief, up to 450 characters), in one recording.
  const s = own ? { item: { text: brief, title: a.title }, first: brief, rest: "", lines: sentencesOf(brief).length ? sentencesOf(brief) : [brief], whole: true } : avoScript(a);
  const keys = []; let bytes = 0;
  if (ttsEnabled(env) && await voiceBudget(env) > 600) {
    const voice = tvVoice(env, sex), rate = voiceRate(env);
    const k1 = s.whole ? (await sha256(`${voice}|avo-own|${rate}|${s.first}`)).slice(0, 40) : await voiceKey(env, s.item, sex);
    const k2 = s.rest ? (await sha256(`${voice}|avo|${rate}|${s.rest}`)).slice(0, 40) : "";
    let chars = 0;
    for (const [k, text] of [[k1, s.first], [k2, s.rest]]) {
      if (!k || !text) continue;
      const have = await env.DB.prepare("SELECT length(data) AS n FROM tts_audio WHERE key=?").bind(k).first();
      if (have) { keys.push(k); bytes += have.n; continue; }
      const audio = await synthesize(env, text, voice, "bn-IN", rate);
      await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(k, voice, text.length, audio.buffer).run();
      keys.push(k); bytes += audio.byteLength; chars += text.length;
    }
    if (chars) await chargeVoice(env, chars);
  }
  // Pictures: a hand-written story keeps the ones given (searching for more only when it has
  // fewer than four and the desk asked for it).
  let photos = own ? JSON.parse(row.images || "[]") : [], log = [];
  if (!own || (photos.length < 4 && row.find_more)) {
    const found = await checkedPhotos(env, { id: a.id, title: a.title, at: a.published_at }, 6).catch(() => ({ photos: [], log: [] }));
    const seen = new Set(photos.map(x => x.url)); log = found.log;
    for (const x of found.photos) if (photos.length < 6 && !seen.has(x.url)) { photos.push(x); seen.add(x.url); }
  }
  await env.DB.prepare("UPDATE avo_stories SET script=?, sex=?, voice=?, secs=?, images=?, img_log=?, img_v=4, prepared_at=?, status='ready' WHERE article_id=?")
    .bind(JSON.stringify(s.lines), sex, JSON.stringify(keys), Math.round(bytes / 4000 * 10) / 10, JSON.stringify(photos), JSON.stringify(log.slice(0, 12)), new Date().toISOString(), row.article_id).run();
}

// The minute cron: choose new stories, then prepare up to two.
// Stories pictured before the news-only finder: their pictures are looked up again (two a minute,
// newest first, only those still in rotation; hand-written ones keep the pictures they were given).
async function repicture(env) {
  // Once: the image model's first verdicts (asked about the Bengali headline, which it cannot read)
  // are dropped, and every story is judged again.
  const ver = await env.DB.prepare("SELECT value FROM settings WHERE key='avo:img_rules'").first().catch(() => null);
  if (!["2", "3", "4"].includes(ver?.value)) {
    await env.DB.batch([env.DB.prepare("DELETE FROM photo_checks WHERE ai=1"), env.DB.prepare("UPDATE bulletin_images SET url='', credit='', query='', checked_at='2000-01-01T00:00:00Z'")]).catch(() => {});
  }
  // (3: the reports' other photos and the English search: every story is looked at again; the
  // model's verdicts so far stand.)
  if (ver?.value !== "4") {
    await env.DB.batch([env.DB.prepare("UPDATE avo_stories SET img_v=3 WHERE img_v=4 AND origin='auto'"),
      env.DB.prepare("INSERT INTO settings (key,value) VALUES ('avo:img_rules','4') ON CONFLICT(key) DO UPDATE SET value='4'")]).catch(() => {});
  }
  const { results } = await env.DB.prepare("SELECT article_id, title, published_at, images, json_array_length(images) AS n FROM avo_stories WHERE status IN ('ready','off') AND img_v<4 AND origin='auto' AND published_at>=? ORDER BY published_at DESC LIMIT 3")
    .bind(new Date(Date.now() - 24 * 3600e3).toISOString()).all().catch(() => ({ results: [] }));
  for (const r of results) {
    const got = await checkedPhotos(env, { id: r.article_id, title: r.title, at: r.published_at }, 6).catch(() => ({ photos: [], log: [], failed: 1 }));
    let { photos } = got;
    // A page that could not be read this time: the photos the story already had (judged before) stay.
    if (got.failed && photos.length < (r.n || 0)) { try { photos = JSON.parse(r.images || "[]"); } catch { /* none */ } }
    await env.DB.prepare("UPDATE avo_stories SET images=?, img_log=?, img_v=4 WHERE article_id=?").bind(JSON.stringify(photos), JSON.stringify(got.log.slice(0, 12)), r.article_id).run();
  }
  return results.length;
}
// A story whose report was updated after its voice and pictures were made is made again (two a
// run, at most once an hour each), and shows "নতুন তথ্য" on screen.
async function refreshUpdated(env) {
  const { results } = await env.DB.prepare(`SELECT v.article_id FROM avo_stories v JOIN articles a ON a.id=v.article_id
    WHERE v.status='ready' AND v.origin='auto' AND v.published_at>=? AND a.updated_at IS NOT NULL
      AND a.updated_at > COALESCE(v.prepared_at, v.published_at) AND (v.prepared_at IS NULL OR v.prepared_at < ?)
      AND (julianday(a.updated_at) - julianday(a.published_at)) * 1440 > 10
    ORDER BY a.updated_at DESC LIMIT 2`).bind(new Date(Date.now() - AVO_HOURS * 3600e3).toISOString(), new Date(Date.now() - 3600e3).toISOString()).all().catch(() => ({ results: [] }));
  for (const r of results) await env.DB.prepare("UPDATE avo_stories SET status='new' WHERE article_id=?").bind(r.article_id).run();
  return results.length;
}
export async function avoStep(env) {
  const added = await choose(env);
  await refreshUpdated(env).catch(e => console.error("avo refresh", e?.message || e));
  await repicture(env).catch(e => console.error("avo repicture", e?.message || e));
  const { results } = await env.DB.prepare("SELECT * FROM avo_stories WHERE status='new' ORDER BY score DESC, published_at DESC LIMIT 2").all();
  let prepared = 0;
  for (const row of results) {
    // The newsreaders take turns: the opposite of the last story read.
    const last = await env.DB.prepare("SELECT sex FROM avo_stories WHERE status='ready' ORDER BY created_at DESC LIMIT 1").first();
    try { await prepare(env, row, last?.sex === "f" ? "m" : "f"); prepared++; }
    catch (e) { console.error("avo prepare", row.article_id, e?.message || e); await env.DB.prepare("UPDATE avo_stories SET status='failed' WHERE article_id=? AND created_at < datetime('now','-30 minutes')").bind(row.article_id).run(); }
  }
  return { added, prepared };
}

// What the screens get: the stories in rotation, newest first.
export async function avoForScreens(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM avo_stories WHERE status='ready' AND published_at>=? AND aired<? ORDER BY published_at DESC LIMIT 12`)
    .bind(new Date(Date.now() - AVO_HOURS * 3600e3).toISOString(), AVO_MAX_AIRED).all().catch(() => ({ results: [] }));
  // Never an empty AVO segment: with fewer than four in rotation (the day's 45 used, the rest aged
  // out or aired four times), the most recent ready stories of the last day make up six.
  if (results.length < 4) {
    const have = new Set(results.map(r => r.article_id));
    const { results: more } = await env.DB.prepare(`SELECT * FROM avo_stories WHERE status='ready' AND published_at>=? ORDER BY published_at DESC LIMIT 12`)
      .bind(new Date(Date.now() - 24 * 3600e3).toISOString()).all().catch(() => ({ results: [] }));
    for (const r of more) if (results.length < 6 && !have.has(r.article_id)) { results.push(r); have.add(r.article_id); }
  }
  return results.map(screenStory);
}
export function screenStory(r) {
  const j = (v, d) => { try { return JSON.parse(v || d); } catch { return JSON.parse(d); } };
  return { id: r.article_id, title: r.title, desk: r.desk, region: r.region, sex: r.sex, lines: j(r.script, "[]"),
    voice: j(r.voice, "[]").map(k => `/api/tv/voice/${k}.mp3`), secs: r.secs,
    // (a story never yet judged under the picture rules shows none; one waiting to be judged again
    // keeps the photos it was given)
    images: (r.origin !== "manual" && (r.img_v || 0) < 4 && !j(r.img_log, "[]").length ? [] : j(r.images, "[]")).map((x, i) => ({ src: /^\/(media|brand)\//.test(x.url || "") ? x.url : `/api/tv/aimg/${encodeURIComponent(r.article_id)}/${i}`, credit: x.credit || "" })), at: r.published_at, origin: r.origin || "auto", score: r.score || 0,
    places: placesIn(`${r.title} ${j(r.script, "[]").slice(0, 2).join(" ")}`), topic: topicOf(`${r.title} ${j(r.script, "[]").slice(0, 2).join(" ")}`),
    imgLog: j(r.img_log, "[]"),
    upd: !!(r.prepared_at && r.created_at && Date.parse(r.prepared_at) - Date.parse(String(r.created_at).replace(" ", "T") + "Z") > 15 * 60e3),
    ...labelsOf(r.desk, `${r.title} ${j(r.script, "[]").join(" ")}`, (() => { try { return JSON.parse(r.labels || "null"); } catch { return null; } })()) };
}

// GET /api/tv/aimg/<id>/<n>: one of a story's pictures, fetched once and cached at the edge.
export async function avoImageRoute(env, id, n) {
  const row = await env.DB.prepare("SELECT images FROM avo_stories WHERE article_id=?").bind(id).first().catch(() => null);
  let url = ""; try { url = JSON.parse(row?.images || "[]")[Number(n)]?.url || ""; } catch { /* none */ }
  if (!url) return new Response("Not found", { status: 404 });
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; RashtrixTV/1.0)", accept: "image/*" }, cf: { cacheTtl: 86400, cacheEverything: true }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!r?.ok || !/^image\//.test(r.headers.get("content-type") || "")) return Response.redirect(url, 302);
  return new Response(r.body, { headers: { "content-type": r.headers.get("content-type"), "cache-control": "public, max-age=86400" } });
}

// POST /api/tv/avo/played {id, ch, key?}: a story went out. From the broadcast output (with its
// key) it counts as an airing, goes in the story's log and the as-run log; from the app or the
// site it counts as a view.
export async function avoPlayed(env, b, outputOk) {
  const row = await env.DB.prepare("SELECT article_id, title FROM avo_stories WHERE article_id=?").bind(String(b.id || "")).first();
  if (!row) return { ok: false };
  const ch = b.ch === "v" ? "v" : "h", now = new Date().toISOString();
  if (!outputOk) { await env.DB.prepare("UPDATE avo_stories SET views=views+1 WHERE article_id=?").bind(row.article_id).run(); return { ok: true }; }
  await env.DB.batch([
    env.DB.prepare("UPDATE avo_stories SET aired=aired+1, last_aired=? WHERE article_id=?").bind(now, row.article_id),
    env.DB.prepare("INSERT INTO avo_plays (id,article_id,channel,at,where_played) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), row.article_id, ch, now, "output"),
    env.DB.prepare("INSERT INTO asrun (id,channel,day,at,type,title,planned,how) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), ch, istDay(), now, "avo", row.title.slice(0, 200), AVO_SECONDS, "autopilot")
  ]);
  return { ok: true };
}

// The producer's AVO log: the last two days' stories with every airing.
export async function avoLog(env) {
  const { results } = await env.DB.prepare("SELECT * FROM avo_stories WHERE created_at>=datetime('now','-2 days') ORDER BY created_at DESC LIMIT 150").all();
  const plays = (await env.DB.prepare("SELECT article_id, channel, at FROM avo_plays WHERE at>=? ORDER BY at DESC LIMIT 2000").bind(new Date(Date.now() - 2 * 864e5).toISOString()).all()).results;
  const by = new Map(); plays.forEach(p => { if (!by.has(p.article_id)) by.set(p.article_id, []); by.get(p.article_id).push({ ch: p.channel, at: p.at }); });
  const day = istDay(), today = results.filter(r => r.day === day && (r.origin || "auto") === "auto");
  const count = Object.fromEntries(Object.keys(QUOTA).map(k => [k, today.filter(r => r.region === k).length]));
  return { quota: QUOTA, today: count, daily: AVO_DAILY, stories: results.map(r => ({ ...screenStory(r), labelsSet: (() => { try { return JSON.parse(r.labels || "null"); } catch { return null; } })(), status: r.status, origin: r.origin || "auto", createdBy: r.created_by || "", findMore: !!r.find_more, given: r.origin === "manual" ? (() => { try { return JSON.parse(r.images || "[]"); } catch { return []; } })() : [], score: r.score, aired: r.aired, views: r.views, lastAired: r.last_aired, createdAt: r.created_at, nImages: (() => { try { return JSON.parse(r.images || "[]").length; } catch { return 0; } })(), plays: by.get(r.article_id) || [], inRotation: r.status === "ready" && Date.parse(r.published_at) >= Date.now() - AVO_HOURS * 3600e3 && r.aired < AVO_MAX_AIRED })) };
}

// The AVO Story Desk (control room): a story written by hand. Headline, a brief to be read (up to
// 450 characters), pictures (uploaded or linked, each with an optional credit), its region and
// desk. It is voiced and given its pictures like any other (within the minute), skips the daily
// quota, and stays in rotation for six hours or four airings.
const DESK_OK = ["Kolkata", "West Bengal", "India", "Probashi Bangali", "World", "Sports", "Entertainment", "Lifestyle", "Breaking"];
function cleanManual(b) {
  const title = String(b.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const brief = String(b.brief || "").replace(/\s+/g, " ").trim();
  if (!title) throw new Error("Write the headline.");
  if (brief.length < 20) throw new Error("Write the brief to be read (at least a sentence).");
  if (brief.length > 450) throw new Error("The brief is longer than 450 characters.");
  const images = (Array.isArray(b.images) ? b.images : []).map(x => ({ url: String(x?.url || "").trim(), credit: String(x?.credit || "").replace(/\s+/g, " ").trim().slice(0, 120) }))
    .filter(x => /^(https:\/\/|\/media\/)/.test(x.url)).slice(0, 8)
    .map(x => ({ url: x.url, credit: x.credit ? (x.credit.startsWith("ছবি") ? x.credit : `ছবি: ${x.credit}`) : "" }));
  const region = ["bengal", "india", "neighbours", "world"].includes(b.region) ? b.region : "bengal";
  const desk = DESK_OK.includes(b.desk) ? b.desk : "Kolkata";
  return { title, brief, images, region, desk, findMore: b.findMore !== false };
}
export async function avoManualAdd(env, b, by) {
  const m = cleanManual(b), id = `man:${crypto.randomUUID()}`;
  const lines = sentencesOf(m.brief).length ? sentencesOf(m.brief) : [m.brief];
  await env.DB.prepare("INSERT INTO avo_stories (article_id,title,desk,region,score,script,images,status,day,published_at,origin,find_more,created_by) VALUES (?,?,?,?,?,?,?,'new',?,?,'manual',?,?)")
    .bind(id, m.title, m.desk, m.region, 50, JSON.stringify(lines), JSON.stringify(m.images), istDay(), new Date().toISOString(), m.findMore ? 1 : 0, String(by || "").slice(0, 80)).run();
  return { ok: true, id };
}
export async function avoManualEdit(env, id, b) {
  const row = await env.DB.prepare("SELECT origin FROM avo_stories WHERE article_id=?").bind(id).first();
  if (!row) throw new Error("No such story.");
  // Any story can be relabelled (desk and weight for the running order's variety rules).
  if (b.labels !== undefined && Object.keys(b).length === 1) {
    const DK = ["kolkata", "bengal", "india", "bangladesh", "world", "sports", "business", "other"], W = ["heavy", "mid", "light"];
    const l = b.labels && typeof b.labels === "object" ? { ...(DK.includes(b.labels.dk) ? { dk: b.labels.dk } : {}), ...(W.includes(b.labels.weight) ? { weight: b.labels.weight } : {}) } : {};
    await env.DB.prepare("UPDATE avo_stories SET labels=? WHERE article_id=?").bind(Object.keys(l).length ? JSON.stringify(l) : null, id).run();
    return { ok: true };
  }
  // Any story can be taken out of rotation, or put back.
  if (b.off !== undefined && Object.keys(b).length === 1) {
    await env.DB.prepare(`UPDATE avo_stories SET status=? WHERE article_id=? AND status IN ('ready','off')`).bind(b.off ? "off" : "ready", id).run();
    return { ok: true };
  }
  if (row.origin !== "manual") throw new Error("Only hand-written stories can be edited.");
  const m = cleanManual(b), lines = sentencesOf(m.brief).length ? sentencesOf(m.brief) : [m.brief];
  // Edited: voiced and pictured again, with the airings so far kept.
  await env.DB.prepare("UPDATE avo_stories SET title=?, desk=?, region=?, script=?, images=?, find_more=?, voice='[]', secs=0, status='new' WHERE article_id=?")
    .bind(m.title, m.desk, m.region, JSON.stringify(lines), JSON.stringify(m.images), m.findMore ? 1 : 0, id).run();
  return { ok: true };
}
export async function avoManualDelete(env, id) {
  const row = await env.DB.prepare("SELECT origin FROM avo_stories WHERE article_id=?").bind(id).first();
  if (!row) return { ok: true };
  if (row.origin !== "manual") throw new Error("Only hand-written stories can be deleted; take others out of rotation instead.");
  await env.DB.prepare("DELETE FROM avo_stories WHERE article_id=?").bind(id).run();
  return { ok: true };
}
