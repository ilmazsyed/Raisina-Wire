// Audience and retention for the control room: returning readers, app installs, notification
// opt-ins, reading time and where readers arrive from (WhatsApp, social, search).
// Browsers report small anonymous events; only daily totals are kept (migration 0012). No IP
// addresses, account IDs or cookies are stored, and nothing identifies a reader.

export const SOURCES = ["whatsapp", "facebook", "instagram", "x", "linkedin", "telegram", "youtube", "reddit", "google", "bing", "news", "email", "share", "link", "push", "other", "direct"];
const SOCIAL = ["whatsapp", "facebook", "instagram", "x", "linkedin", "telegram", "youtube", "reddit"];
const DEVICES = ["mobile", "tablet", "desktop"];
const PLATFORMS = ["android", "ios", "desktop"];
const LANGS = ["en", "hi", "bn"];
const KINDS = ["story", "live", "wire"];

// Days in India time, so "today" matches the newsroom's day.
export const istDay = (t = Date.now()) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10);
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const pick = (v, list, dflt) => list.includes(v) ? v : dflt;

function bump(env, day, metric, dim = "", n = 1) {
  return env.DB.prepare("INSERT INTO metrics_daily (day,metric,dim,n) VALUES (?,?,?,?) ON CONFLICT(day,metric,dim) DO UPDATE SET n=n+excluded.n").bind(day, metric, dim, n);
}
export const countPush = (env, on) => bump(env, istDay(), "push", on ? "on" : "off").run().catch(() => {});

// POST /api/m — one event from a reader's browser.
export async function recordEvent(env, b) {
  const day = istDay(), q = [];
  if (b.t === "visit") {            // first page of the day in this browser
    const ret = b.returning === true;
    q.push(bump(env, day, "visitors", ret ? "returning" : "new"));
    q.push(bump(env, day, "device", pick(b.dev, DEVICES, "desktop")));
    q.push(bump(env, day, "lang", pick(b.lang, LANGS, "en")));
    if (b.app === true) q.push(bump(env, day, "app", "opens"));
    const gap = Number(b.gap);       // days since this browser's previous visit
    if (ret && Number.isFinite(gap) && gap > 0) q.push(bump(env, day, "gap", gap <= 1 ? "1" : gap <= 7 ? "2-7" : gap <= 30 ? "8-30" : "31+"));
    if (isDay(b.cohort) && Number.isInteger(b.week) && b.week >= 0 && b.week <= 26) q.push(bump(env, b.cohort, "cohort", String(b.week)));
  } else if (b.t === "arrive") {    // a reader landed on the site (new browser session)
    q.push(bump(env, day, "arrival", pick(b.src, SOURCES, "other")));
  } else if (b.t === "install") {
    q.push(bump(env, day, "install", pick(b.platform, PLATFORMS, "desktop")));
  } else if (b.t === "read") {
    const slug = String(b.slug || "").slice(0, 160), kind = pick(b.kind, KINDS, ""), s = Math.round(Number(b.s));
    if (!slug || !kind || !(s >= 5)) return;   // under five seconds is a bounce, not a read
    q.push(env.DB.prepare("INSERT INTO reading_daily (day,slug,kind,reads,seconds,finished) VALUES (?,?,?,1,?,?) ON CONFLICT(day,slug) DO UPDATE SET reads=reads+1,seconds=seconds+excluded.seconds,finished=finished+excluded.finished")
      .bind(day, slug, kind, Math.min(s, 3600), b.done === true ? 1 : 0));
  }
  if (q.length) await env.DB.batch(q);
}

// GET /api/admin/audience?days=30
export async function audienceReport(env, days = 30) {
  days = Math.min(Math.max(Number(days) || 30, 7), 180);
  const today = istDay(), from = istDay(Date.now() - (days - 1) * 864e5), prevFrom = istDay(Date.now() - (2 * days - 1) * 864e5);
  const [rows, prev, reading, titles, subs, coverage] = await Promise.all([
    env.DB.prepare("SELECT day,metric,dim,n FROM metrics_daily WHERE day>=? AND metric<>'cohort'").bind(from).all(),
    env.DB.prepare("SELECT metric,dim,SUM(n) AS n FROM metrics_daily WHERE day>=? AND day<? AND metric<>'cohort' GROUP BY metric,dim").bind(prevFrom, from).all(),
    env.DB.prepare("SELECT slug,kind,SUM(reads) AS reads,SUM(seconds) AS seconds,SUM(finished) AS finished FROM reading_daily WHERE day>=? GROUP BY slug,kind ORDER BY seconds DESC LIMIT 200").bind(from).all(),
    env.DB.prepare("SELECT slug,title,kind FROM articles").all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").first(),
    env.DB.prepare("SELECT slug,title FROM live_coverage").all()
  ]);
  // Retention: the last eight weekly cohorts, weeks 0 to 7.
  const cohortFrom = istDay(Date.now() - 8 * 7 * 864e5);
  const cohorts = await env.DB.prepare("SELECT day,dim,n FROM metrics_daily WHERE metric='cohort' AND day>=? ORDER BY day").bind(cohortFrom).all();

  const series = [];
  for (let i = days - 1; i >= 0; i--) series.push({ day: istDay(Date.now() - i * 864e5), new: 0, returning: 0, app: 0, installs: 0, pushOn: 0, pushOff: 0 });
  const byDay = new Map(series.map(s => [s.day, s]));
  const total = (list, metric, dim) => list.filter(r => r.metric === metric && (dim === undefined || r.dim === dim)).reduce((a, r) => a + Number(r.n), 0);
  const breakdown = (list, metric) => { const m = {}; for (const r of list) if (r.metric === metric) m[r.dim] = (m[r.dim] || 0) + Number(r.n); return m; };
  for (const r of rows.results) {
    const s = byDay.get(r.day); if (!s) continue;
    if (r.metric === "visitors") s[r.dim === "returning" ? "returning" : "new"] += r.n;
    else if (r.metric === "app") s.app += r.n;
    else if (r.metric === "install") s.installs += r.n;
    else if (r.metric === "push") s[r.dim === "on" ? "pushOn" : "pushOff"] += r.n;
  }
  const pair = (metric, dim) => ({ now: total(rows.results, metric, dim), before: total(prev.results, metric, dim) });

  const names = new Map([...titles.results.map(t => [t.slug, t.title]), ...coverage.results.map(c => [`live:${c.slug}`, c.title])]);
  const read = reading.results.map(r => ({ slug: r.slug, kind: r.kind, title: names.get(r.slug) || r.slug.replace(/^(wire|live):/, ""), reads: r.reads, avgSeconds: Math.round(r.seconds / Math.max(r.reads, 1)), finishedPct: Math.round(100 * r.finished / Math.max(r.reads, 1)), minutes: Math.round(r.seconds / 60) }));
  const readTotals = read.reduce((a, r) => ({ reads: a.reads + r.reads, seconds: a.seconds + r.avgSeconds * r.reads }), { reads: 0, seconds: 0 });

  const cohortMap = new Map();
  for (const r of cohorts.results) { const c = cohortMap.get(r.day) || { week: r.day, weeks: [] }; c.weeks[Number(r.dim)] = r.n; cohortMap.set(r.day, c); }

  return {
    days, from, to: today,
    totals: {
      visitors: pair("visitors"),
      returning: pair("visitors", "returning"), newVisitors: pair("visitors", "new"),
      appOpens: pair("app"), installs: pair("install"), pushOn: pair("push", "on"), pushOff: pair("push", "off"),
      arrivals: pair("arrival"), social: { now: SOCIAL.reduce((a, d) => a + total(rows.results, "arrival", d), 0), before: SOCIAL.reduce((a, d) => a + total(prev.results, "arrival", d), 0) },
      whatsapp: pair("arrival", "whatsapp"),
      subscribers: subs?.n || 0,
      reads: readTotals.reads, avgReadSeconds: Math.round(readTotals.seconds / Math.max(readTotals.reads, 1))
    },
    series,
    sources: breakdown(rows.results, "arrival"),
    devices: breakdown(rows.results, "device"),
    languages: breakdown(rows.results, "lang"),
    installs: breakdown(rows.results, "install"),
    gaps: breakdown(rows.results, "gap"),
    reading: read.slice(0, 25),
    cohorts: [...cohortMap.values()].map(c => ({ week: c.week, size: c.weeks[0] || 0, weeks: Array.from({ length: 8 }, (_, i) => c.weeks[i] || 0) }))
  };
}
