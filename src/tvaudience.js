// The TV audience for the control room (the Audience and Overview tabs): who is watching Rashtrix
// TV (h) and Rashtrix Shorts (v) now, today and over the days chosen, when, on what, on which
// devices and with the sound on or off. The players send one beat a minute (src/engine.js audTick);
// the channel's control server adds them up and writes the day's totals once a minute
// (src/control.js audBeat, metrics_daily). Only totals are kept: nothing identifies a viewer.
//   tvv      ch             viewers of the day (one a device a day)
//   tvvdev   ch:device      viewers by device        tvvpage  ch:home|watch   viewers by page
//   tvs      ch             seconds watched          tvsound  ch:on|off       seconds with or without sound
//   tvhour   ch:0..23       seconds by hour (IST)    tvdevs   ch:device       seconds by device
//   tvpages  ch:page        seconds by page          tvseg    ch:kind         seconds by kind of item
//   tvitem   ch:kind:id     seconds by item (videos, explainers, ads)
//   tvconc   ch:HH:MM       the most watching at once in each five minutes (IST)
//   tvpeak   ch             the most watching at once in the day
import { istDay } from "./audience.js";
import { ctlStub } from "./controlroom.js";

const CHS = ["h", "v"];
export const TV_NAME = { h: "Rashtrix TV", v: "Rashtrix Shorts" };

// Watching now: the players that sent a beat in the last 90 seconds, from each channel's server.
export async function tvLive(env) {
  const out = { total: 0 };
  for (const ch of CHS) {
    let d = { now: 0, seg: {} };
    if (env.CONTROL) { try { const r = await ctlStub(env, `ctl:${ch}`).fetch("https://ctl/aud", { headers: { "x-ctl-name": `ctl:${ch}` } }); if (r.ok) d = await r.json(); } catch { /* not reachable */ } }
    out[ch] = { now: d.now || 0, seg: d.seg || {} }; out.total += d.now || 0;
  }
  return out;
}

const sum = (rows, metric, pred = () => true) => rows.filter(r => r.metric === metric && pred(r)).reduce((a, r) => a + Number(r.n || 0), 0);
const byDim = (rows, metric, ch, map = x => x) => { const o = {}; for (const r of rows) if (r.metric === metric && (!ch || r.dim.startsWith(`${ch}:`))) { const k = map(ch ? r.dim.slice(ch.length + 1) : r.dim.split(":").slice(1).join(":")); o[k] = (o[k] || 0) + Number(r.n || 0); } return o; };

// GET /api/admin/audience-tv?days=7
export async function tvAudienceReport(env, days = 7) {
  days = Math.min(Math.max(Number(days) || 7, 1), 90);
  const today = istDay(), from = istDay(Date.now() - (days - 1) * 864e5), prevFrom = istDay(Date.now() - (2 * days - 1) * 864e5);
  const [live, rows, prev] = await Promise.all([
    tvLive(env),
    env.DB.prepare("SELECT day, metric, dim, n FROM metrics_daily WHERE day>=? AND metric LIKE 'tv%' AND metric<>'tv'").bind(from).all().then(r => r.results).catch(() => []),
    env.DB.prepare("SELECT metric, dim, SUM(n) AS n FROM metrics_daily WHERE day>=? AND day<? AND metric IN ('tvv','tvs') GROUP BY metric, dim").bind(prevFrom, from).all().then(r => r.results).catch(() => [])
  ]);
  const T = rows.filter(r => r.day === today);
  const per = (list, metric) => Object.fromEntries(CHS.map(ch => [ch, sum(list, metric, r => r.dim === ch)]));
  const viewers = per(T, "tvv"), secs = per(T, "tvs"), peak = Object.fromEntries(CHS.map(ch => [ch, Math.max(0, ...T.filter(r => r.metric === "tvpeak" && r.dim === ch).map(r => r.n))]));
  // the days: viewers, minutes and the most at once, per channel
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = istDay(Date.now() - i * 864e5), R = rows.filter(r => r.day === d);
    series.push({ day: d, ...Object.fromEntries(CHS.flatMap(ch => [[`${ch}Viewers`, sum(R, "tvv", r => r.dim === ch)], [`${ch}Minutes`, Math.round(sum(R, "tvs", r => r.dim === ch) / 60)], [`${ch}Peak`, Math.max(0, ...R.filter(r => r.metric === "tvpeak" && r.dim === ch).map(r => r.n))]])) });
  }
  // today, five minutes at a time: how many were watching at once
  const conc = {};
  for (const r of T.filter(r => r.metric === "tvconc")) { const [ch, ...hm] = r.dim.split(":"), slot = hm.join(":"); (conc[slot] ||= { slot, h: 0, v: 0 })[ch] = r.n; }
  // the period: by hour, kind of item, device, page, sound
  const hours = Object.fromEntries(CHS.map(ch => [ch, Array.from({ length: 24 }, (_, h) => Math.round((byDim(rows, "tvhour", ch)[String(h)] || 0) / 60))]));
  const segs = byDim(rows, "tvseg", null), devices = byDim(rows, "tvvdev", null), devMinutes = byDim(rows, "tvdevs", null), pages = byDim(rows, "tvvpage", null);
  const soundOn = sum(rows, "tvsound", r => r.dim.endsWith(":on")), soundAll = soundOn + sum(rows, "tvsound", r => r.dim.endsWith(":off"));
  // what was watched most: videos, explainers and ads, with their names
  const items = {};
  for (const r of rows.filter(r => r.metric === "tvitem")) { const [ch, kind, ...id] = r.dim.split(":"), k = `${kind}:${id.join(":")}`; (items[k] ||= { kind, id: id.join(":"), seconds: 0, ch: {} }).seconds += r.n; items[k].ch[ch] = (items[k].ch[ch] || 0) + r.n; }
  const top = Object.values(items).sort((a, b) => b.seconds - a.seconds).slice(0, 15);
  const ids = kind => top.filter(x => x.kind === kind).map(x => x.id);
  const names = new Map();
  const look = async (kind, sql) => { const list = ids(kind); if (!list.length) return; const { results } = await env.DB.prepare(sql.replace("?", list.map(() => "?").join(","))).bind(...list).all().catch(() => ({ results: [] })); results.forEach(r => names.set(`${kind}:${r.id}`, r.title)); };
  await Promise.all([look("video", "SELECT yt_id AS id, MAX(title) AS title FROM tv_items WHERE yt_id IN (?) GROUP BY yt_id"), look("xpl", "SELECT id, title FROM explainers WHERE id IN (?)"), look("ad", "SELECT id, title FROM tv_ads WHERE id IN (?)")]);
  const allSecs = sum(rows, "tvs"), allViewers = sum(rows, "tvv");
  return {
    days, from, to: today, live,
    today: { viewers, minutes: Object.fromEntries(CHS.map(ch => [ch, Math.round(secs[ch] / 60)])), peak, avgMinutes: Object.fromEntries(CHS.map(ch => [ch, viewers[ch] ? Math.round(secs[ch] / 60 / viewers[ch] * 10) / 10 : 0])) },
    period: { viewers: allViewers, minutes: Math.round(allSecs / 60), avgMinutes: allViewers ? Math.round(allSecs / 60 / allViewers * 10) / 10 : 0, soundPct: soundAll ? Math.round(100 * soundOn / soundAll) : 0,
      before: { viewers: sum(prev, "tvv"), minutes: Math.round(sum(prev, "tvs") / 60) } },
    series, conc: Object.values(conc).sort((a, b) => a.slot.localeCompare(b.slot)), hours,
    segs: Object.fromEntries(Object.entries(segs).map(([k, v]) => [k, Math.round(v / 60)])),
    devices, devMinutes: Object.fromEntries(Object.entries(devMinutes).map(([k, v]) => [k, Math.round(v / 60)])), pages,
    top: top.map(x => ({ kind: x.kind, id: x.id, title: names.get(`${x.kind}:${x.id}`) || (x.kind === "video" ? `YouTube ${x.id}` : x.id), minutes: Math.round(x.seconds / 60 * 10) / 10, ch: Object.keys(x.ch) }))
  };
}
