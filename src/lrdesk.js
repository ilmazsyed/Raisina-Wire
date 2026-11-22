// The Live Rundown: each channel's day as 48 half-hour wheels (India time). Past wheels show what
// aired (the as-run log); the wheel on air marks now; the wheels to come show the channel's clock
// (bulletins, HEADLINES, segments) and the desk's changes. A fixed item can be skipped (or put back),
// and an AVO story, a video or a segment put in at a minute of a wheel; autopilot follows within
// seconds (src/liverundown.js, src/engine.js). The as-run report prints or downloads any day's log.
import "./tv.css";
import { shell, api, toast, fail, esc, $, $$, istDay, printDoc } from "./crshell.js";
import { digits } from "./i18n.js";

const S = { ch: "h", day: istDay(), d: null, avo: [], videos: [], open: new Set(), form: null };
const IST = 5.5 * 3600e3;
const hm = t => { const d = new Date(t + IST); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const hms = v => { const t = Date.parse(v); return t ? new Date(t + IST).toISOString().slice(11, 19) : ""; };
const SEGS = { city: "শহরের খবর", kolkata10: "কলকাতা ১০", bangladesh: "বাংলাদেশ ডেস্ক", world: "এক মিনিটে বিশ্ব", numbers: "সংখ্যায় আজ", sports: "খেলার খবর", onthisday: "আজকের দিনে", soth: "এই ঘণ্টার বড় খবর", entertainment: "বিনোদনের খবর", lifestyle: "জীবনধারা" };
const KIND = { bulletin: ["BULLETIN", "red"], heads: ["HEADLINES", "red"], segment: ["SEGMENT", "amber"], avo: ["AVO", "green"], video: ["VIDEO", ""], seg: ["SEGMENT", "amber"] };
const dayStart = day => Date.parse(`${day}T00:00:00+05:30`);

async function save(edits) {
  try { await api("/api/admin/lrd", { method: "PUT", body: { ch: S.ch, ...edits } }); toast("Saved. The channel follows it within seconds."); await load(); }
  catch (e) { fail(e); }
}
function draw() {
  const d = S.d, t0 = dayStart(S.day), nowT = Date.now(), skip = new Set(d.edits.skip);
  const wheels = Array.from({ length: 48 }, (_, i) => {
    const a = t0 + i * 1800e3, b = a + 1800e3, state = nowT >= b ? "past" : nowT >= a ? "now" : "next";
    return { i, a, b, state, items: d.items.filter(x => x.at >= a && x.at < b), adds: d.edits.adds.filter(x => x.at >= a && x.at < b), ran: d.asrun.filter(r => { const t = Date.parse(r.at); return t >= a && t < b; }) };
  });
  if (!S.opened) { S.opened = true; wheels.filter(w => w.state === "now").forEach(w => S.open.add(w.i)); wheels.filter(w => w.state === "next").slice(0, 2).forEach(w => S.open.add(w.i)); }
  const row = (t, kind, title, extra = "", cls = "") => `<li class="lr-row ${cls}"><span class="lr-t" data-no-tr>${digits(t)}</span><span class="tag ${KIND[kind]?.[1] || ""}">${KIND[kind]?.[0] || esc(kind.toUpperCase())}</span><b data-no-tr>${esc(title)}</b>${extra}</li>`;
  $("main").innerHTML = `<section class="panel pd lr-wrap">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>Live Rundown</h2>
      <div class="row" style="flex-wrap:wrap"><div class="row ad-seg">${[["h", "Rashtrix TV"], ["v", "Rashtrix Shorts"]].map(([c, n]) => `<button class="btn sm ${S.ch === c ? "on" : ""}" data-ch="${c}">${n}</button>`).join("")}</div>
        <input type="date" id="lrDay" value="${S.day}"><button class="btn sm" id="lrRefresh">Refresh</button><button class="btn sm" id="lrPrint">As-run report (print)</button><a class="btn sm" href="/api/admin/lrd/report?ch=${S.ch}&day=${S.day}&format=csv">As-run report (CSV)</a></div></div>
    <p class="muted" style="margin:0">The day in 48 half-hours. Past half-hours show what aired; the ones to come show the channel's clock and your changes. Skip a bulletin, HEADLINES or a segment, or put an AVO story, a video or a segment in at a minute: the channel follows within seconds. A change is let go once its time has passed.</p>
    <div class="lr-wheels">${wheels.map(w => `<div class="lr-wheel ${w.state}${S.open.has(w.i) ? " open" : ""}" data-w="${w.i}">
      <button class="lr-head" type="button" data-wt="${w.i}"><b data-no-tr>${digits(hm(w.a))}–${digits(hm(w.b))}</b><span class="lr-st">${w.state === "past" ? `${digits(w.ran.length)} aired` : w.state === "now" ? "On air now" : `${digits(w.items.length + w.adds.length)} planned`}</span>${w.adds.length ? `<span class="tag green">${digits(w.adds.length)} added</span>` : ""}${w.items.some(x => skip.has(x.key)) ? `<span class="tag">SKIPS</span>` : ""}</button>
      ${S.open.has(w.i) ? `<div class="lr-body">
        ${w.state !== "next" ? `<h4>Aired</h4><ol class="lr-list">${w.ran.map(r => row(hms(r.at), r.type === "seg" ? "segment" : r.type, r.title || r.type, `<small class="muted">${esc(r.how)}${r.actual || r.planned ? ` · ${digits(r.actual || r.planned)} s` : ""}</small>`)).join("") || '<li class="muted">Nothing logged yet.</li>'}</ol>` : ""}
        ${w.state === "now" ? `<div class="lr-now"><i></i><span data-no-tr>${digits(hm(nowT))}</span> now</div>` : ""}
        ${w.state !== "past" ? `<h4>Planned</h4><ol class="lr-list">${[...w.items.map(x => ({ ...x, fixed: true })), ...w.adds].sort((a, b) => a.at - b.at).map(x => x.fixed
          ? row(hm(x.at), x.kind, x.title, x.at > nowT - 600e3 ? `<button class="btn sm ${skip.has(x.key) ? "green" : ""}" data-skip="${x.key}">${skip.has(x.key) ? "Bring back" : "Skip"}</button>` : "", skip.has(x.key) ? "skipped" : "")
          : row(hm(x.at), x.kind, x.title, `<button class="btn sm red" data-unadd="${esc(x.id)}">Remove</button>`, "added")).join("")}</ol>
        <div class="lr-add">${S.form === w.i ? `<div class="row" style="flex-wrap:wrap;gap:6px">
          <label>At <select id="lrMin">${Array.from({ length: 30 }, (_, m) => w.a + m * 60e3).filter(t => t > nowT - 60e3).map(t => `<option value="${t}">${digits(hm(t))}</option>`).join("")}</select></label>
          <select id="lrKind"><option value="avo">AVO story</option><option value="video">Video</option><option value="seg">Segment</option></select>
          <select id="lrRef" style="flex:1;min-width:220px" data-no-tr></select>
          <button class="btn sm green" id="lrAddGo" type="button">Put in</button><button class="btn sm" id="lrAddX" type="button">Cancel</button></div>`
          : `<button class="btn sm" type="button" data-addw="${w.i}">+ Put something in this half-hour</button>`}</div>` : ""}
      </div>` : ""}</div>`).join("")}</div></section>`;
  wire();
}
function refs(kind) {
  if (kind === "avo") return S.avo.map(x => [x.id, x.title]);
  if (kind === "video") return S.videos.map(v => [v.id, `${v.title} · ${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, "0")}`]);
  return Object.entries(SEGS);
}
function wire() {
  $$("[data-ch]").forEach(b => b.onclick = () => { S.ch = b.dataset.ch; S.opened = false; S.open.clear(); load(); });
  $("#lrDay").onchange = e => { S.day = e.target.value || istDay(); S.opened = false; S.open.clear(); load(); };
  $("#lrRefresh").onclick = load;
  $("#lrPrint").onclick = report;
  $$("[data-wt]").forEach(b => b.onclick = () => { const i = +b.dataset.wt; S.open.has(i) ? S.open.delete(i) : S.open.add(i); draw(); });
  $$("[data-skip]").forEach(b => b.onclick = () => { const k = b.dataset.skip, sk = new Set(S.d.edits.skip); sk.has(k) ? sk.delete(k) : sk.add(k); save({ skip: [...sk], adds: S.d.edits.adds }); });
  $$("[data-unadd]").forEach(b => b.onclick = () => save({ skip: S.d.edits.skip, adds: S.d.edits.adds.filter(a => a.id !== b.dataset.unadd) }));
  $$("[data-addw]").forEach(b => b.onclick = () => { S.form = +b.dataset.addw; draw(); fillRef(); });
  $("#lrAddX")?.addEventListener("click", () => { S.form = null; draw(); });
  $("#lrKind")?.addEventListener("change", fillRef);
  $("#lrAddGo")?.addEventListener("click", () => {
    const kind = $("#lrKind").value, ref = $("#lrRef").value, at = Number($("#lrMin").value);
    if (!ref || !at) return toast("Choose what to put in, and when.", true);
    const title = refs(kind).find(r => r[0] === ref)?.[1] || ref, v = S.videos.find(x => x.id === ref);
    S.form = null; save({ skip: S.d.edits.skip, adds: [...S.d.edits.adds, { kind, ref, at, title: kind === "video" ? v?.title || title : title, dur: kind === "video" ? v?.duration || 0 : 0 }] });
  });
}
function fillRef() { const sel = $("#lrRef"); if (!sel) return; sel.innerHTML = refs($("#lrKind").value).map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join("") || `<option value="">Nothing to choose</option>`; }

async function report() {
  try {
    const r = await api(`/api/admin/lrd/report?ch=${S.ch}&day=${S.day}`);
    const html = `<h2>As-run report · ${S.ch === "h" ? "Rashtrix TV" : "Rashtrix Shorts"} · ${esc(S.day)}</h2><p>${r.rows.length} items, India time.</p>
      <table><thead><tr><th>Time</th><th>Type</th><th>Title</th><th>Planned</th><th>Actual</th><th>How</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${hms(x.at)}</td><td>${esc(x.type)}</td><td>${esc(x.title)}</td><td>${x.planned || ""}</td><td>${x.actual || ""}</td><td>${esc(x.how)}</td></tr>`).join("")}</tbody></table>`;
    printDoc(`As-run ${S.day}`, html);
  } catch (e) { fail(e); }
}
async function load() {
  try {
    const [d, avo, vids] = await Promise.all([api(`/api/admin/lrd?ch=${S.ch}&day=${S.day}`), api("/api/admin/tv/avo").catch(() => ({ stories: [] })), api("/api/tv/videos").catch(() => ({ videos: [] }))]);
    S.d = d; S.avo = (avo.stories || []).filter(x => ["ready", "off"].includes(x.status)); S.videos = (vids.videos || []).filter(v => v.channel === S.ch).slice(0, 120);
    if (!document.activeElement?.closest?.(".lr-add")) draw();
  } catch (e) { $("main").innerHTML = `<div class="cr-denied"><h2>Live Rundown</h2><p>${esc(e.message)}</p></div>`; }
}
(async () => {
  const user = await shell("Live Rundown");
  if (!user) return;
  $("main").innerHTML = `<p class="muted">Loading…</p>`;
  await load();
  setInterval(() => { if (!document.hidden && S.form === null) load(); }, 30e3);
})();
