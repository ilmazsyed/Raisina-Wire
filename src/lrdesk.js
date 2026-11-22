// The Live Rundown: each channel's day as 48 half-hour wheels (India time). Past wheels show what
// aired (the as-run log); the wheel on air marks now; the wheels to come show the channel's clock
// (bulletins, HEADLINES, segments) and the desk's changes. The desk can:
//  - put in a story from the pools already made (an AVO story, a headline card, a video or a
//    segment), at a minute or to play next;
//  - move and reorder what it put in (drag on a computer, ▲▼ on a phone, or a new time);
//  - skip a fixed item or move it later by some minutes; write a note on any item;
//  - change an added item's length, copy it, repeat it daily or take it out;
//  - undo, see who changed what, and copy a half-hour to tomorrow.
// Autopilot follows within seconds (src/liverundown.js, src/engine.js). The as-run report prints
// or downloads any day's log.
import "./tv.css";
import { shell, api, toast, fail, esc, $, $$, istDay, printDoc } from "./crshell.js";
import { digits } from "./i18n.js";
import { libraryItems } from "./libpick.js";

const S = { ch: "h", day: istDay(), d: null, avo: [], videos: [], heads: [], open: new Set(), pick: null, edit: null, noteFor: null, undo: [], drag: null };
const IST = 5.5 * 3600e3, DAY = 864e5;
const hm = t => { const d = new Date(t + IST); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const hms = v => { const t = Date.parse(v); return t ? new Date(t + IST).toISOString().slice(11, 19) : ""; };
const SEGS = { city: "শহরের খবর", kolkata10: "কলকাতা ১০", bangladesh: "বাংলাদেশ ডেস্ক", world: "এক মিনিটে বিশ্ব", numbers: "সংখ্যায় আজ", sports: "খেলার খবর", onthisday: "আজকের দিনে", soth: "এই ঘণ্টার বড় খবর", entertainment: "বিনোদনের খবর", lifestyle: "জীবনধারা" };
const KIND = { bulletin: ["BULLETIN", "red"], heads: ["HEADLINES", "red"], segment: ["SEGMENT", "amber"], avo: ["AVO", "green"], video: ["VIDEO", ""], seg: ["SEGMENT", "amber"], card: ["HEADLINE CARD", "red"] };
const KINDS = [["avo", "AVO story"], ["card", "Headline card"], ["video", "Video"], ["seg", "Segment"]];
const dayStart = day => Date.parse(`${day}T00:00:00+05:30`);
const base = id => String(id || "").split("@")[0];
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// ---- the desk's changes ----
const cur = () => { const e = S.d.edits || {}; return JSON.parse(JSON.stringify({ skip: e.skip || [], adds: e.adds || [], shift: e.shift || {}, notes: e.notes || {} })); };
// (a daily item comes back as a copy for each day; it is saved once)
const collapse = adds => { const seen = new Set(); return adds.filter(a => { if (!a.daily) return true; const b = base(a.id); if (seen.has(b)) return false; seen.add(b); return true; }); };
async function save(next, what, { undo = true } = {}) {
  const prev = cur();
  try {
    await api("/api/admin/lrd", { method: "PUT", body: { ch: S.ch, skip: next.skip, adds: collapse(next.adds), shift: next.shift, notes: next.notes, what } });
    if (undo) S.undo = [...S.undo, { ch: S.ch, e: prev, what }].slice(-20);
    toast("Saved. The channel follows it within seconds.");
    S.edit = null; S.noteFor = null; await load(true);
  } catch (e) { fail(e); }
}
const shiftOf = k => Number(S.d.edits.shift?.[k]) || 0;
const eff = x => x.fixed ? x.at + shiftOf(x.key) * 60e3 : x.at;
// Every item of the day, fixed and added, in the order it goes on air.
const dayList = () => [...S.d.items.map(x => ({ ...x, fixed: true, id: x.key })), ...S.d.edits.adds].map(x => ({ ...x, t: eff(x) })).sort((a, b) => a.t - b.t);
// The time that puts an item just before the item at j of a list (or after the last).
function slotBefore(list, j) {
  const now = Date.now() + 5e3;
  let at = j < list.length ? Math.max(j > 0 ? list[j - 1].t + 1000 : -Infinity, list[j].t - 30e3) : (list.length ? list[list.length - 1].t + 30e3 : now);
  return Math.round(Math.max(at, now));
}
function moveAdd(id, at, what) {
  const n = cur(), a = n.adds.find(x => x.id === id); if (!a) return;
  const delta = at - a.at;
  n.adds = n.adds.map(x => base(x.id) === base(id) ? { ...x, at: x.at + delta } : x);
  save(n, what || `Moved: ${a.title} to ${hm(at)}`);
}

function draw() {
  const d = S.d, t0 = dayStart(S.day), nowT = Date.now(), skip = new Set(d.edits.skip), notes = d.edits.notes || {}, all = dayList();
  const wheels = Array.from({ length: 48 }, (_, i) => {
    const a = t0 + i * 1800e3, b = a + 1800e3, state = nowT >= b ? "past" : nowT >= a ? "now" : "next";
    return { i, a, b, state, list: all.filter(x => x.t >= a && x.t < b), ran: d.asrun.filter(r => { const t = Date.parse(r.at); return t >= a && t < b; }) };
  });
  if (!S.opened) { S.opened = true; wheels.filter(w => w.state === "now").forEach(w => S.open.add(w.i)); wheels.filter(w => w.state === "next").slice(0, 2).forEach(w => S.open.add(w.i)); }
  const tag = kind => `<span class="tag ${KIND[kind]?.[1] || ""}">${KIND[kind]?.[0] || esc(String(kind).toUpperCase())}</span>`;
  const aired = r => `<li class="lr-row"><span class="lr-t" data-no-tr>${digits(hms(r.at))}</span>${tag(r.type === "seg" ? "segment" : r.type)}<b data-no-tr>${esc(r.title || r.type)}</b><small class="muted">${esc(r.how)}${r.actual || r.planned ? ` · ${digits(r.actual || r.planned)} s` : ""}</small></li>`;
  const noteEd = k => S.noteFor === k ? `<div class="lr-ed row"><input id="lrNote" maxlength="300" value="${esc(notes[k] || "")}" placeholder="A note for the desk (not on air)" style="flex:1;min-width:200px"><button class="btn sm green" type="button" data-notesave="${esc(k)}">Save note</button><button class="btn sm" type="button" data-notex>Cancel</button></div>` : "";
  const noteLine = k => notes[k] ? `<small class="lr-note"><span>Note</span> <span data-no-tr>${esc(notes[k])}</span></small>` : "";
  const fixedRow = x => {
    const live = x.t > nowT - 60e3, sh = shiftOf(x.key), canShift = live && /^[bhs]:/.test(x.key);
    return `<li class="lr-row ${skip.has(x.key) ? "skipped" : ""}" data-drop="${esc(x.id)}"><span class="lr-grip off"></span><span class="lr-t" data-no-tr>${digits(hm(x.t))}</span>${tag(x.kind)}<b data-no-tr>${esc(x.title)}</b>
      ${sh ? `<span class="tag amber"><span data-no-tr>+${digits(sh)}</span> min</span>` : ""}
      <span class="lr-act">${live ? `<button class="btn sm ${skip.has(x.key) ? "green" : ""}" data-skip="${x.key}">${skip.has(x.key) ? "Bring back" : "Skip"}</button>` : ""}
      ${canShift ? `<button class="btn sm" data-sh="${x.key}" data-by="-1" ${sh ? "" : "disabled"} title="1 minute earlier">−1 min</button><button class="btn sm" data-sh="${x.key}" data-by="1" ${sh >= 10 ? "disabled" : ""} title="1 minute later">+1 min</button>` : ""}
      ${live ? `<button class="btn sm" data-note="${x.key}">Note</button>` : ""}</span>${noteLine(x.key)}${noteEd(x.key)}</li>`;
  };
  const addRow = x => {
    const live = x.t > nowT - 30e3, k = base(x.id), open = S.edit === x.id;
    return `<li class="lr-row added" data-drop="${esc(x.id)}" ${live ? `draggable="true" data-drag="${esc(x.id)}"` : ""}><span class="lr-grip">${live ? "⋮⋮" : ""}</span><span class="lr-t" data-no-tr>${digits(hm(x.t))}</span>${tag(x.kind)}<b data-no-tr>${esc(x.title)}</b>
      ${x.daily ? `<span class="tag">DAILY</span>` : ""}${x.dur && ["card", "video"].includes(x.kind) ? `<small class="muted" data-no-tr>${digits(mmss(x.dur))}</small>` : ""}
      <span class="lr-act">${live ? `<button class="btn sm" data-up="${esc(x.id)}" title="Move up" aria-label="Move up">▲</button><button class="btn sm" data-down="${esc(x.id)}" title="Move down" aria-label="Move down">▼</button><button class="btn sm ${open ? "on" : ""}" data-edit="${esc(x.id)}">Edit</button>` : ""}<button class="btn sm red" data-unadd="${esc(x.id)}">Remove</button></span>
      ${noteLine(k)}
      ${open ? `<div class="lr-ed row">
        <label>Time <input type="time" step="60" id="lrEdT" value="${hm(x.t)}"></label>
        ${["card", "video"].includes(x.kind) ? `<label>Length (seconds) <input type="number" id="lrEdD" min="${x.kind === "card" ? 6 : 10}" max="${x.kind === "card" ? 60 : Math.max(10, x.full || x.dur)}" value="${x.dur}" style="width:90px"></label>` : ""}
        <label class="row" style="gap:6px"><input type="checkbox" id="lrEdDaily" ${x.daily ? "checked" : ""}> Repeat daily at this time</label>
        <input id="lrEdN" maxlength="300" value="${esc(notes[k] || "")}" placeholder="A note for the desk (not on air)" style="flex:1;min-width:200px">
        <button class="btn sm green" type="button" data-edsave="${esc(x.id)}">Save</button><button class="btn sm" type="button" data-dup="${esc(x.id)}">Duplicate</button><button class="btn sm" type="button" data-edx>Cancel</button></div>` : ""}</li>`;
  };
  const undoN = S.undo.filter(u => u.ch === S.ch).length;
  $("main").innerHTML = `<section class="panel pd lr-wrap">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>Live Rundown</h2>
      <div class="row" style="flex-wrap:wrap"><div class="row ad-seg">${[["h", "Rashtrix TV"], ["v", "Rashtrix Shorts"]].map(([c, n]) => `<button class="btn sm ${S.ch === c ? "on" : ""}" data-ch="${c}">${n}</button>`).join("")}</div>
        <input type="date" id="lrDay" value="${S.day}"><button class="btn sm" id="lrUndo" ${undoN ? "" : "disabled"}>Undo</button><button class="btn sm" id="lrRefresh">Refresh</button><button class="btn sm" id="lrPrint">As-run report (print)</button><a class="btn sm" href="/api/admin/lrd/report?ch=${S.ch}&day=${S.day}&format=csv">As-run report (CSV)</a></div></div>
    <p class="muted" style="margin:0">The day in 48 half-hours. Put in a story from the pools already made, move what you put in (drag it, or use ▲▼), skip a fixed item or move it later by some minutes, and write notes. The channel follows within seconds. A change is let go once its time has passed.</p>
    <details class="lr-log"><summary>Change history</summary><ol class="lr-list">${(d.log || []).map(l => `<li class="lr-row"><span class="lr-t" data-no-tr>${digits(hms(l.at))}</span><small class="muted" data-no-tr>${esc(String(l.at).slice(0, 10))}</small><b data-no-tr>${esc(l.what)}</b><small data-no-tr>${esc(l.by)}</small></li>`).join("") || '<li class="muted">No changes yet.</li>'}</ol></details>
    <div class="lr-wheels">${wheels.map(w => `<div class="lr-wheel ${w.state}${S.open.has(w.i) ? " open" : ""}" data-w="${w.i}">
      <button class="lr-head" type="button" data-wt="${w.i}"><b data-no-tr>${digits(hm(w.a))}–${digits(hm(w.b))}</b><span class="lr-st">${w.state === "past" ? `<span data-no-tr>${digits(w.ran.length)}</span> aired` : w.state === "now" ? "On air now" : `<span data-no-tr>${digits(w.list.length)}</span> planned`}</span>${w.list.some(x => !x.fixed) ? `<span class="tag green"><span data-no-tr>${digits(w.list.filter(x => !x.fixed).length)}</span> added</span>` : ""}${w.list.some(x => x.fixed && skip.has(x.key)) ? `<span class="tag">SKIPS</span>` : ""}</button>
      ${S.open.has(w.i) ? `<div class="lr-body">
        ${w.state !== "next" ? `<h4>Aired</h4><ol class="lr-list">${w.ran.map(aired).join("") || '<li class="muted">Nothing logged yet.</li>'}</ol>` : ""}
        ${w.state === "now" ? `<div class="lr-now"><i></i><span data-no-tr>${digits(hm(nowT))}</span> now</div>` : ""}
        ${w.state !== "past" ? `<h4>Planned</h4><ol class="lr-list">${w.list.map(x => x.fixed ? fixedRow(x) : addRow(x)).join("") || '<li class="muted">Nothing planned.</li>'}</ol>
        <div class="lr-add" data-dropw="${w.i}">${S.pick?.w === w.i ? pickHTML(w) : `<button class="btn sm" type="button" data-addw="${w.i}">+ Put in a story</button>${w.list.length ? `<button class="btn sm" type="button" data-copyw="${w.i}">Copy this half-hour to tomorrow</button>` : ""}`}</div>` : ""}
      </div>` : ""}</div>`).join("")}</div></section>`;
  wire();
}

// ---- the picker: a story from the pools already made ----
function pool(kind) {
  if (kind === "avo") return S.avo.map(x => ({ ref: x.id, title: x.title, meta: x.desk || "" }));
  if (kind === "card") return S.heads.map(x => ({ ref: x.text, title: x.text, meta: x.desk || "" }));
  if (kind === "video") return S.videos.map(v => ({ ref: v.id, title: v.title, meta: mmss(v.duration), dur: v.duration }));
  return Object.entries(SEGS).map(([ref, title]) => ({ ref, title, meta: "" }));
}
function poolHTML() {
  const k = S.pick?.kind; if (!k) return `<p class="muted" style="margin:0">Choose what kind of story to put in.</p>`;
  const q = (S.pick.q || "").trim().toLowerCase(), list = pool(k).filter(x => !q || `${x.title} ${x.meta}`.toLowerCase().includes(q)).slice(0, 60);
  return list.length ? `<ul class="lr-pool">${list.map((x, i) => `<li><b data-no-tr>${esc(x.title)}</b>${x.meta ? `<small class="muted" data-no-tr>${esc(x.meta)}</small>` : ""}<span class="lr-act"><button class="btn sm green" type="button" data-put="${i}">Put in</button><button class="btn sm" type="button" data-pnext="${i}">Play next</button></span></li>`).join("")}</ul>`
    : `<p class="muted" style="margin:0">Nothing in this pool.</p>`;
}
function pickHTML(w) {
  const nowT = Date.now(), mins = Array.from({ length: 30 }, (_, m) => w.a + m * 60e3).filter(t => t > nowT - 60e3);
  return `<div class="lr-pick">
    <div class="row ad-seg" style="flex-wrap:wrap">${KINDS.map(([k, n]) => `<button class="btn sm ${S.pick.kind === k ? "on" : ""}" type="button" data-pk="${k}">${n}</button>`).join("")}</div>
    ${S.pick.kind ? `<div class="row" style="flex-wrap:wrap;gap:6px"><input id="lrQ" type="search" placeholder="Search" value="${esc(S.pick.q || "")}" style="flex:1;min-width:180px">
      <label>At <select id="lrMin">${mins.map(t => `<option value="${t}" ${S.pick.at === t ? "selected" : ""}>${digits(hm(t))}</option>`).join("")}</select></label>
      ${S.pick.kind === "card" ? `<label>Length (seconds) <input type="number" id="lrCardD" min="6" max="60" value="${S.pick.cardD || 10}" style="width:80px"></label>` : ""}</div>` : ""}
    <div id="lrPool">${poolHTML()}</div>
    <div class="row"><button class="btn sm" type="button" id="lrPickX">Close</button></div></div>`;
}
function putIn(i, next) {
  const x = pool(S.pick.kind).filter(y => { const q = (S.pick.q || "").trim().toLowerCase(); return !q || `${y.title} ${y.meta}`.toLowerCase().includes(q); })[i]; if (!x) return;
  const kind = S.pick.kind, at = next ? Date.now() + 2e3 : Number($("#lrMin")?.value);
  if (!at) return toast("Choose a time.", true);
  const dur = kind === "video" ? x.dur || 0 : kind === "card" ? Math.max(6, Math.min(60, Number($("#lrCardD")?.value) || 10)) : 0;
  const n = cur(); n.adds.push({ kind, ref: x.ref, at, title: x.title, dur, ...(kind === "video" ? { full: x.dur } : {}) });
  const name = KINDS.find(k => k[0] === kind)?.[1] || kind;
  S.pick = null; save(n, next ? `Play next: ${name}: ${x.title}` : `Put in ${name}: ${x.title} at ${hm(at)}`);
}
function wirePool() {
  $$("[data-put]").forEach(b => b.onclick = () => putIn(+b.dataset.put, false));
  $$("[data-pnext]").forEach(b => b.onclick = () => putIn(+b.dataset.pnext, true));
}

function wire() {
  $$("[data-ch]").forEach(b => b.onclick = () => { S.ch = b.dataset.ch; S.opened = false; S.open.clear(); S.pick = S.edit = S.noteFor = null; load(true); });
  $("#lrDay").onchange = e => { S.day = e.target.value || istDay(); S.opened = false; S.open.clear(); S.pick = S.edit = S.noteFor = null; load(true); };
  $("#lrRefresh").onclick = () => load(true);
  $("#lrPrint").onclick = report;
  $("#lrUndo").onclick = () => { const i = S.undo.map(u => u.ch).lastIndexOf(S.ch); if (i < 0) return; const u = S.undo.splice(i, 1)[0]; save(u.e, `Undid: ${u.what}`, { undo: false }); };
  $$("[data-wt]").forEach(b => b.onclick = () => { const i = +b.dataset.wt; S.open.has(i) ? S.open.delete(i) : S.open.add(i); draw(); });
  const itemOf = id => dayList().find(x => x.id === id);
  // fixed items
  $$("[data-skip]").forEach(b => b.onclick = () => { const k = b.dataset.skip, n = cur(), sk = new Set(n.skip), x = itemOf(k), on = !sk.has(k); on ? sk.add(k) : sk.delete(k); n.skip = [...sk]; save(n, `${on ? "Skipped" : "Brought back"}: ${x?.title || k} ${x ? hm(x.at) : ""}`); });
  $$("[data-sh]").forEach(b => b.onclick = () => { const k = b.dataset.sh, n = cur(), v = Math.max(0, Math.min(10, (Number(n.shift[k]) || 0) + Number(b.dataset.by))), x = itemOf(k); if (v) n.shift[k] = v; else delete n.shift[k]; save(n, `Moved ${x?.title || k} ${x ? hm(x.at) : ""} to ${x ? hm(x.at + v * 60e3) : ""}`); });
  $$("[data-note]").forEach(b => b.onclick = () => { S.noteFor = b.dataset.note; draw(); $("#lrNote")?.focus(); });
  $$("[data-notex]").forEach(b => b.onclick = () => { S.noteFor = null; draw(); });
  $$("[data-notesave]").forEach(b => b.onclick = () => { const k = b.dataset.notesave, n = cur(), v = $("#lrNote").value.trim(), x = itemOf(k); if (v) n.notes[k] = v; else delete n.notes[k]; save(n, `Note on ${x?.title || k}`); });
  // added items
  $$("[data-unadd]").forEach(b => b.onclick = () => { const id = b.dataset.unadd, n = cur(), x = n.adds.find(a => a.id === id); n.adds = n.adds.filter(a => base(a.id) !== base(id)); save(n, `Removed: ${x?.title || ""}`); });
  const step = (id, by) => { const all = dayList(), i = all.findIndex(x => x.id === id); if (i < 0) return; const rest = all.filter(x => x.id !== id), j = Math.max(0, Math.min(rest.length, i + by)); if (j === i) return; moveAdd(id, slotBefore(rest, j)); };
  $$("[data-up]").forEach(b => b.onclick = () => step(b.dataset.up, -1));
  $$("[data-down]").forEach(b => b.onclick = () => step(b.dataset.down, 1));
  $$("[data-edit]").forEach(b => b.onclick = () => { S.edit = S.edit === b.dataset.edit ? null : b.dataset.edit; draw(); });
  $$("[data-edx]").forEach(b => b.onclick = () => { S.edit = null; draw(); });
  $$("[data-edsave]").forEach(b => b.onclick = () => {
    const id = b.dataset.edsave, n = cur(), a = n.adds.find(x => x.id === id); if (!a) return;
    const [h, m] = ($("#lrEdT").value || hm(a.at)).split(":").map(Number), at = dayStart(istDay(a.at)) + (h * 60 + m) * 60e3;
    if (!a.daily && at < Date.now() - 30e3) return toast("That time has passed.", true);
    const delta = at - a.at, dur = $("#lrEdD") ? Math.max(a.kind === "card" ? 6 : 10, Math.min(a.kind === "card" ? 60 : a.full || 7200, Number($("#lrEdD").value) || a.dur)) : a.dur, daily = $("#lrEdDaily").checked, note = $("#lrEdN").value.trim();
    if (a.daily && !daily) n.adds = n.adds.filter(x => base(x.id) !== base(id) || x.id === id).map(x => x.id === id ? { ...x, id: base(id), daily: false } : x);
    n.adds = n.adds.map(x => base(x.id) === base(id) ? { ...x, at: x.at + delta, dur, daily } : x);
    if (note) n.notes[base(id)] = note; else delete n.notes[base(id)];
    save(n, `Changed: ${a.title} (${hm(at)}${daily ? ", daily" : ""})`);
  });
  $$("[data-dup]").forEach(b => b.onclick = () => { const id = b.dataset.dup, n = cur(), a = n.adds.find(x => x.id === id); if (!a) return; const { id: _, ...rest } = a; n.adds.push({ ...rest, daily: false, at: Math.max(Date.now() + 5e3, a.at + 60e3) }); save(n, `Duplicated: ${a.title}`); });
  // drag (a computer): drop on an item to go before it, or on a half-hour's add area to go last
  $$("[data-drag]").forEach(el => {
    el.ondragstart = e => { S.drag = el.dataset.drag; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", S.drag); };
    el.ondragend = () => { S.drag = null; el.classList.remove("dragging"); $$(".over").forEach(x => x.classList.remove("over")); };
  });
  const over = el => { el.ondragover = e => { if (!S.drag) return; e.preventDefault(); el.classList.add("over"); }; el.ondragleave = () => el.classList.remove("over"); };
  $$("[data-drop]").forEach(el => { over(el); el.ondrop = e => { e.preventDefault(); const id = S.drag, to = el.dataset.drop; if (!id || id === to) return; const rest = dayList().filter(x => x.id !== id); moveAdd(id, slotBefore(rest, rest.findIndex(x => x.id === to))); }; });
  $$("[data-dropw]").forEach(el => { over(el); el.ondrop = e => { e.preventDefault(); const id = S.drag; if (!id) return; const a0 = dayStart(S.day) + Number(el.dataset.dropw) * 1800e3, rest = dayList().filter(x => x.id !== id), inW = rest.filter(x => x.t >= a0 && x.t < a0 + 1800e3); moveAdd(id, inW.length ? slotBefore(rest, rest.indexOf(inW[inW.length - 1]) + 1) : Math.max(Date.now() + 5e3, a0 + 60e3)); }; });
  // the picker
  $$("[data-addw]").forEach(b => b.onclick = () => { S.pick = { w: +b.dataset.addw, kind: null, q: "" }; S.edit = S.noteFor = null; draw(); });
  $$("[data-pk]").forEach(b => b.onclick = () => { S.pick.kind = b.dataset.pk; S.pick.q = ""; draw(); $("#lrQ")?.focus(); });
  $("#lrPickX")?.addEventListener("click", () => { S.pick = null; draw(); });
  $("#lrMin")?.addEventListener("change", e => { S.pick.at = Number(e.target.value); });
  $("#lrCardD")?.addEventListener("change", e => { S.pick.cardD = Number(e.target.value) || 10; });
  $("#lrQ")?.addEventListener("input", e => { S.pick.q = e.target.value; $("#lrPool").innerHTML = poolHTML(); wirePool(); });
  wirePool();
  // a half-hour copied to tomorrow: what was put in, the skips, the moves and the notes
  $$("[data-copyw]").forEach(b => b.onclick = () => {
    const a0 = dayStart(S.day) + Number(b.dataset.copyw) * 1800e3, n = cur(), inW = dayList().filter(x => x.t >= a0 && x.t < a0 + 1800e3);
    const plus = k => `${k.split(":")[0]}:${Number(k.split(":")[1]) + DAY}`;
    let c = 0;
    for (const x of inW) {
      if (!x.fixed && !x.daily) { const { id: _, t: __, ...rest } = x; n.adds.push({ ...rest, at: x.at + DAY }); c++; }
      if (x.fixed) {
        if (n.skip.includes(x.key)) { n.skip.push(plus(x.key)); c++; }
        if (n.shift[x.key]) { n.shift[plus(x.key)] = n.shift[x.key]; c++; }
        if (n.notes[x.key]) n.notes[plus(x.key)] = n.notes[x.key];
      }
    }
    if (!c) return toast("Nothing to copy: no changes in this half-hour.", true);
    save(n, `Copied ${hm(a0)}–${hm(a0 + 1800e3)} to tomorrow`);
  });
}

async function report() {
  try {
    const r = await api(`/api/admin/lrd/report?ch=${S.ch}&day=${S.day}`);
    const html = `<h2>As-run report · ${S.ch === "h" ? "Rashtrix TV" : "Rashtrix Shorts"} · ${esc(S.day)}</h2><p>${r.rows.length} items, India time.</p>
      <table><thead><tr><th>Time</th><th>Type</th><th>Title</th><th>Planned</th><th>Actual</th><th>How</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${hms(x.at)}</td><td>${esc(x.type)}</td><td>${esc(x.title)}</td><td>${x.planned || ""}</td><td>${x.actual || ""}</td><td>${esc(x.how)}</td></tr>`).join("")}</tbody></table>`;
    printDoc(`As-run ${S.day}`, html);
  } catch (e) { fail(e); }
}
const busy = () => S.pick || S.edit || S.noteFor || S.drag || document.activeElement?.closest?.(".lr-ed, .lr-pick");
async function load(force) {
  try {
    // (AVO stories and videos: the Content Library's, the same 36 hours every desk sees)
    const [d, lib, heads] = await Promise.all([api(`/api/admin/lrd?ch=${S.ch}&day=${S.day}`), libraryItems(force).catch(() => ({ avo: [], videos: [] })), api("/api/admin/heads").catch(() => ({ onAir: [] }))]);
    S.d = d; S.avo = lib.avo.map(x => ({ id: x.id, title: x.title, desk: x.meta })); S.videos = lib.videos.filter(v => v.ch === S.ch).slice(0, 160).map(v => ({ id: v.id, title: v.title, duration: v.dur }));
    S.heads = [...(heads.onAir || []), ...(heads.items || [])].filter((x, i, all) => x?.text && all.findIndex(y => y.text === x.text) === i);
    if (force || !busy()) draw();
  } catch (e) { $("main").innerHTML = `<div class="cr-denied"><h2>Live Rundown</h2><p>${esc(e.message)}</p></div>`; }
}
(async () => {
  const user = await shell("Live Rundown");
  if (!user) return;
  $("main").innerHTML = `<p class="muted">Loading…</p>`;
  await load(true);
  setInterval(() => { if (!document.hidden && !busy()) load(); }, 30e3);
})();
