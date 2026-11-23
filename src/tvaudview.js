// The TV audience in the control room (admin.js): the full section on the Audience tab and the
// live strip on Overview. Data from /api/admin/audience-tv (src/tvaudience.js).
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n = x => Number(x || 0).toLocaleString("en-IN");
const empty = m => `<div class="empty">${esc(m)}</div>`;
const SEG = { video: "Videos", avo: "AVO stories", xpl: "Explainers", bulletin: "Bulletins", heads: "HEADLINES", seg: "Segments", ad: "Ads", flash: "Flash cards", card: "Headline cards", upnext: "Up next", weather: "Weather", market: "Markets", poll: "Polls", promo: "Promos", ident: "Idents", other: "Other" };
const DEV = { mobile: "Phone", tablet: "Tablet", desktop: "Computer" };
const PAGE = { home: "Home page", watch: "Watch page" };
const KIND = { video: "Video", xpl: "Explainer", ad: "Ad" };
const CH = { h: "Rashtrix TV", v: "Rashtrix Shorts" };
const COL = { h: "#e1121a", v: "#2a78d6" };

function hbars(obj, labels = {}, unit = "") {
  const rows = Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]), m = Math.max(1, ...rows.map(r => r[1])), tot = rows.reduce((a, r) => a + r[1], 0);
  return rows.length ? `<ul class="hbars">${rows.map(([k, v]) => `<li><span>${esc(labels[k] || k)}</span><i><em style="width:${(100 * v / m).toFixed(1)}%"></em></i><b>${n(v)}${unit}<small> · ${Math.round(100 * v / tot)}%</small></b></li>`).join("")}</ul>` : empty("Nothing recorded yet.");
}
// "channel:dim" keys folded to dim, for both channels together
const fold = obj => { const o = {}; for (const [k, v] of Object.entries(obj || {})) { const d = k.split(":").slice(1).join(":") || k; o[d] = (o[d] || 0) + v; } return o; };

// Today, five minutes at a time: how many were watching at once (a line per channel).
function concChart(conc) {
  if (!conc.length) return empty("No one has watched yet today.");
  const W = 720, H = 170, slots = 288, x = slot => { const [h, m] = slot.split(":").map(Number); return (h * 12 + m / 5) / slots * W; };
  const max = Math.max(1, ...conc.flatMap(c => [c.h, c.v]));
  const line = ch => conc.map((c, i) => `${i ? "L" : "M"}${x(c.slot).toFixed(1)},${(H - (c[ch] / max) * (H - 14)).toFixed(1)}`).join(" ");
  const grid = [0, 6, 12, 18, 24].map(h => `<line x1="${h / 24 * W}" x2="${h / 24 * W}" y1="0" y2="${H}" class="grid"/>`).join("");
  return `<div class="chart-wrap"><svg class="aud-chart tva-line" viewBox="0 0 ${W} ${H + 1}" preserveAspectRatio="none" role="img" aria-label="Watching at once, today">${grid}<line x1="0" x2="${W}" y1="${H}" y2="${H}" class="base"/>
    ${["h", "v"].map(ch => `<path d="${line(ch)}" fill="none" stroke="${COL[ch]}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>${conc.length < 60 ? conc.filter(c => c[ch]).map(c => `<rect x="${(x(c.slot) - 2).toFixed(1)}" y="${(H - (c[ch] / max) * (H - 14) - 3).toFixed(1)}" width="4" height="6" rx="1" fill="${COL[ch]}"><title>${c.slot} · ${n(c[ch])} watching</title></rect>`).join("") : ""}`).join("")}</svg>
    <div class="xaxis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div><p class="muted" style="font-size:12px;margin:6px 0 0">Most at once: ${n(max)} · India time</p></div>`;
}
// Minutes watched by hour of the day (both channels, stacked).
function hourChart(hours) {
  const tot = Array.from({ length: 24 }, (_, i) => (hours.h?.[i] || 0) + (hours.v?.[i] || 0)), max = Math.max(1, ...tot);
  if (!tot.some(Boolean)) return empty("Nothing recorded yet.");
  const W = 720, H = 150, bw = W / 24;
  return `<div class="chart-wrap"><svg class="aud-chart" viewBox="0 0 ${W} ${H + 1}" preserveAspectRatio="none" role="img" aria-label="Minutes watched by hour">${tot.map((_, i) => {
    const hh = (hours.h?.[i] || 0) / max * (H - 12), hv = (hours.v?.[i] || 0) / max * (H - 12), X = (i * bw + bw * .15).toFixed(1), w = (bw * .7).toFixed(1);
    return `<g class="bar"><title>${String(i).padStart(2, "0")}:00 · ${n(hours.h?.[i])} min TV · ${n(hours.v?.[i])} min Shorts</title>${hh ? `<rect x="${X}" y="${(H - hh).toFixed(1)}" width="${w}" height="${hh.toFixed(1)}" rx="2" fill="${COL.h}"/>` : ""}${hv ? `<rect x="${X}" y="${(H - hh - hv).toFixed(1)}" width="${w}" height="${hv.toFixed(1)}" rx="2" fill="${COL.v}"/>` : ""}</g>`; }).join("")}<line x1="0" x2="${W}" y1="${H}" y2="${H}" class="base"/></svg>
    <div class="xaxis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></div>`;
}
const card = (label, value, sub = "") => `<div class="metric-card"><small>${label}</small><b>${value}</b>${sub}</div>`;
const delta = (now, before, days) => { if (!before) return now ? `<span class="delta">new this period</span>` : ""; const c = Math.round(100 * (now - before) / before); return `<span class="delta ${c >= 0 ? "up" : "down"}">${c >= 0 ? "▲" : "▼"} ${Math.abs(c)}% vs previous ${days} days</span>`; };
const liveDot = k => `<span class="tva-dot${k ? " on" : ""}"></span>`;

// The Overview tab: watching now and today, in one strip.
export function tvOverviewStrip(t) {
  if (!t) return "";
  const T = t.today, v = T.viewers.h + T.viewers.v, m = T.minutes.h + T.minutes.v;
  return `<div class="panel tva-strip"><div class="list-head"><h2>${liveDot(t.live.total)} TV audience</h2><a href="#audience" data-jump="audience">Full TV audience report →</a></div>
    <div class="cards">${card("Watching now", n(t.live.total), `<span class="delta">TV ${n(t.live.h.now)} · Shorts ${n(t.live.v.now)}</span>`)}${card("TV viewers today", n(v), `<span class="delta">TV ${n(T.viewers.h)} · Shorts ${n(T.viewers.v)}</span>`)}${card("Minutes watched today", n(m), `<span class="delta">about ${n(v ? Math.round(m / v * 10) / 10 : 0)} min a viewer</span>`)}${card("Most at once today", n(Math.max(T.peak.h, T.peak.v)), `<span class="delta">TV ${n(T.peak.h)} · Shorts ${n(T.peak.v)}</span>`)}</div></div>`;
}

// The Audience tab: the full section.
export function tvSection(t, days) {
  const T = t.today, P = t.period;
  const liveSeg = fold(Object.fromEntries(["h", "v"].flatMap(ch => Object.entries(t.live[ch].seg || {}).map(([k, v]) => [`${ch}:${k}`, v]))));
  const dayRows = t.series.slice().reverse();
  return `<section class="tva">
    <div class="list-head"><h2 style="margin:0">${liveDot(t.live.total)} TV audience <small class="muted">· Rashtrix TV and Rashtrix Shorts, in the app and on the site</small></h2><span class="muted" style="font-size:12px">Updated <span id="tvaAt">${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> · every 30 s</span></div>
    <div class="cards">
      ${card("Watching now", `<span id="tvaNow">${n(t.live.total)}</span>`, `<span class="delta">TV ${n(t.live.h.now)} · Shorts ${n(t.live.v.now)}</span>`)}
      ${card("Viewers today", n(T.viewers.h + T.viewers.v), `<span class="delta">TV ${n(T.viewers.h)} · Shorts ${n(T.viewers.v)}</span>`)}
      ${card("Minutes watched today", n(T.minutes.h + T.minutes.v), `<span class="delta">TV ${n(T.minutes.h)} · Shorts ${n(T.minutes.v)}</span>`)}
      ${card("Most at once today", n(Math.max(T.peak.h, T.peak.v)), `<span class="delta">TV ${n(T.peak.h)} · Shorts ${n(T.peak.v)}</span>`)}
      ${card("Average minutes a viewer, today", `${n(T.avgMinutes.h)} / ${n(T.avgMinutes.v)}`, `<span class="delta">TV / Shorts</span>`)}
      ${card(`Viewers, ${days} days`, n(P.viewers), delta(P.viewers, P.before.viewers, days))}
      ${card(`Minutes watched, ${days} days`, n(P.minutes), delta(P.minutes, P.before.minutes, days))}
      ${card("Watched with the sound on", `${P.soundPct}%`, `<span class="delta">of the minutes watched, ${days} days</span>`)}
    </div>
    <div class="split"><div class="panel"><div class="list-head"><h2>Watching at once, today</h2><div class="legend"><span><i style="background:${COL.h}"></i>Rashtrix TV</span><span><i style="background:${COL.v}"></i>Rashtrix Shorts</span></div></div>${concChart(t.conc)}</div>
      <div class="panel"><h2>Watching now, on</h2>${t.live.total ? hbars(liveSeg, SEG) : empty("No one is watching right now.")}<p class="muted" style="font-size:12px">What the screens of the people watching now are showing.</p></div></div>
    <div class="panel"><div class="list-head"><h2>Minutes watched by hour, ${days} days</h2><div class="legend"><span><i style="background:${COL.h}"></i>TV</span><span><i style="background:${COL.v}"></i>Shorts</span></div></div>${hourChart(t.hours)}<p class="muted" style="font-size:12px">India time. The busiest hours are when the newsroom's best work should be on air.</p></div>
    <div class="split"><div class="panel"><h2>What they watched</h2>${hbars(fold(t.segs), SEG, " min")}</div>
      <div class="panel"><h2>Most watched</h2>${t.top.length ? `<ol class="top-list">${t.top.map(x => `<li><span><span class="pill">${KIND[x.kind] || x.kind}</span> ${esc(x.title)}</span><b>${n(x.minutes)} min</b></li>`).join("")}</ol>` : empty("Nothing recorded yet.")}</div></div>
    <div class="split"><div class="panel"><h2>Devices</h2>${hbars(fold(t.devices), DEV, " viewers")}<h2 style="margin-top:18px">Where they watch</h2>${hbars(fold(t.pages), PAGE, " viewers")}</div>
      <div class="panel"><h2>Day by day</h2>${dayRows.some(d => d.hViewers || d.vViewers) ? `<div class="table-scroll"><table><thead><tr><th>Day</th><th>TV viewers</th><th>TV minutes</th><th>TV most at once</th><th>Shorts viewers</th><th>Shorts minutes</th><th>Shorts most at once</th></tr></thead><tbody>${dayRows.map(d => `<tr><td>${esc(d.day)}</td><td>${n(d.hViewers)}</td><td>${n(d.hMinutes)}</td><td>${n(d.hPeak)}</td><td>${n(d.vViewers)}</td><td>${n(d.vMinutes)}</td><td>${n(d.vPeak)}</td></tr>`).join("")}</tbody></table></div>` : empty("The days appear here as viewers come in.")}</div></div>
    <p class="muted" style="font-size:12px">A viewer is one phone, tablet or computer on one day. A player counts only while it is on the screen with the page in front (not in a background tab, not scrolled away). No names, accounts, cookies or IP addresses: the channel keeps the day's totals only. The newsroom's own signed-in screens are not counted.</p>
  </section>`;
}
