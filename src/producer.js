// The bulletin producer (producer.html): each channel's rundowns for a day. Items are added,
// edited and dragged into order; running times, back-timing and the total against the slot are
// worked out as you go. Rundowns are archived at midnight India time (kept 90 days) and can be
// printed (PDF). A rundown goes on air from here; the PCR takes over from there.
import { shell, api, toast, fail, esc, $, $$, fmt, parseTime, istDay, istClock, printDoc } from "./crshell.js";
import { ITEM_TYPES, LAYOUTS, timings, autopilotOn } from "./scenes.js";
import { digits } from "./i18n.js";

const S = { ch: "h", day: istDay(), list: [], rd: null, sel: null, clips: [], templates: [], onair: null, archive: false };
const main = $("main");

const TYPE_ADD = Object.entries(ITEM_TYPES);
const SOURCE_KINDS = { continuity: "Running order", yt: "YouTube video", clip: "App clip", guest: "Studio guest", hls: "HLS stream", whep: "WebRTC (WHEP) stream", vdo: "VDO.Ninja view link", image: "Picture" };
const DEFAULTS = { video: 120, clip: 60, live: 300, breaking: 20, headlines: 40, lband: 60, promo: 15, adbreak: 60, slate: 10, bulletin: 120, segment: 70 };
const avoDur = x => Math.ceil((x.secs > 0 ? Math.max(8, x.secs + 2) : 20) + 4 + (x.bytes || []).reduce((n, b) => n + 1.2 + (Number(b.secs) || 30), 0));
const SEGS = { city: "শহরের খবর", kolkata10: "কলকাতা ১০", bangladesh: "বাংলাদেশ ডেস্ক", world: "এক মিনিটে বিশ্ব", numbers: "সংখ্যায় আজ", sports: "খেলার খবর", entertainment: "বিনোদন", lifestyle: "জীবনধারা", onthisday: "আজকের দিনে", soth: "এই ঘণ্টার বড় খবর" };

async function loadList() {
  const q = S.archive ? `archived=1&from=${S.from || istDay(Date.now() - 30 * 864e5)}&to=${S.to || istDay()}` : `day=${S.day}`;
  const d = await api(`/api/admin/rundowns?${q}`);
  S.list = d.rundowns.filter(r => S.archive || r.channel === S.ch);
  drawList();
}
async function openRundown(id) {
  if (!id) { S.rd = null; S.sel = null; drawRundown(); return; }
  S.rd = (await api(`/api/admin/rundowns/${id}`)).rundown;
  if (!S.rd.items.some(i => i.id === S.sel)) S.sel = null;
  drawList(); drawRundown();
}
async function loadOnAir() {
  try { const d = await api(`/api/ctl/${S.ch}/state`); S.onair = d.state; } catch { S.onair = null; }
  drawAutopilot();
  if (S.rd) drawItems();
}
// AUTOPILOT (the same switch as in the PCR): on, the channel runs its own running order; putting
// a rundown on air (or a PCR take) switches it off; switching it on again brings the running
// order back at once.
function drawAutopilot() {
  const b = $("#apSwitch"); if (!b) return; const c = S.onair, on = autopilotOn(c);
  b.classList.toggle("on", on);
  $("#apState").textContent = !c ? "…" : on ? "ON: the channel runs itself" : c.standby?.on ? "OFF: standby on air" : c.rundown && c.mode === "auto" ? `OFF: "${c.rundown.title || "rundown"}" on air` : "OFF: a PCR take is on air";
}
async function autopilot() {
  if (autopilotOn(S.onair)) return toast("Autopilot is on. Put a rundown on air to go off it.");
  if (!confirm("Switch AUTOPILOT on? The channel's own running order goes on air now (any rundown stops).")) return;
  try { await api(`/api/ctl/${S.ch}/cmd`, { method: "POST", body: { cmd: "autopilot", args: { on: true } } }); toast("Autopilot on."); loadOnAir(); } catch (e) { fail(e); }
}
// The AVO engine: its switch (per channel) and its log (every story, its state and airings).
async function loadAvoState() { try { S.avoOn = (await api(`/api/tv/${S.ch}`)).avoOn !== false; } catch { S.avoOn = null; } drawAvoSwitch(); }
function drawAvoSwitch() { const b = $("#avoSwitch"); if (!b) return; b.classList.toggle("on", S.avoOn === true); $("#avoState").textContent = S.avoOn === null ? "…" : S.avoOn ? "ON: AVO stories between videos" : "OFF"; }
async function toggleAvo() {
  const on = !S.avoOn;
  if (!confirm(on ? "Switch the AVO engine on? AVO stories play in blocks between every three videos." : "Switch the AVO engine off? Only videos play between the bulletins.")) return;
  try { await api(`/api/admin/tv/${S.ch}`, { method: "PUT", body: { avoOn: on } }); S.avoOn = on; drawAvoSwitch(); toast(on ? "AVO engine on." : "AVO engine off."); } catch (e) { fail(e); }
}
const REGION = { bengal: "Bengal & Kolkata", india: "India", neighbours: "Bangladesh, USA, China, Russia, South Asia", world: "World" };
async function avoDialog() {
  const d = dialog(`<h3>AVO stories</h3><div id="al" class="clips-list"><p class="muted">Loading…</p></div>`);
  try {
    const L = await api("/api/admin/tv/avo"), t = s => new Date(s).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
    const head = `<p class="muted">Today: ${Object.entries(L.quota).map(([k, q]) => `${REGION[k]} ${L.today[k] || 0}/${q}`).join(" · ")} (of ${L.daily} a day). A story is in rotation for 6 hours or 4 airings.</p>`;
    $("#al", d).innerHTML = head + (L.stories.map(x => `<div class="clip"><img src="${x.images[0] ? esc(x.images[0].src) : "/partners/calibrex-mark.svg"}" alt="" style="width:120px;height:68px;object-fit:cover;border-radius:6px"><div style="flex:1">
      <b data-no-tr>${esc(x.title)}</b><br><small>${esc(REGION[x.region] || x.region)} · ${x.status === "ready" ? (x.inRotation ? '<span class="tag green">IN ROTATION</span>' : '<span class="tag">DONE</span>') : x.status === "new" ? '<span class="tag amber">PREPARING</span>' : '<span class="tag red">FAILED</span>'} · voice ${x.voice.length ? (x.sex === "m" ? "male" : "female") + ` ${digits(Math.round(x.secs))} s` : "none"} · pictures ${digits(x.nImages)} · score ${digits(x.score)} · chosen ${t(x.createdAt + "Z")}</small><br>
      <small>On air ${digits(x.aired)}×${x.plays.length ? ": " + x.plays.slice(0, 8).map(p => `${t(p.at)} ${p.ch === "h" ? "TV" : "Shorts"}`).join(", ") : ""} · app views ${digits(x.views)}</small>
      <details><summary class="muted">Script</summary><p data-no-tr>${x.lines.map(esc).join(" ")}</p></details></div>
      ${x.status === "ready" ? `<button class="btn sm" data-avoadd="${esc(x.id)}">Add to rundown</button>` : ""}</div>`).join("") || `<p class="muted">No AVO stories yet. Major stories become AVO stories as they arrive.</p>`);
    $$("[data-avoadd]", d).forEach(b => b.onclick = async () => {
      if (!S.rd) return toast("Open a rundown first.");
      const x = L.stories.find(y => y.id === b.dataset.avoadd), story = { id: x.id, title: x.title, desk: x.desk, region: x.region, sex: x.sex, lines: x.lines, voice: x.voice, secs: x.secs, images: x.images, videos: x.videos, bytes: x.bytes, at: x.at };
      try { await api(`/api/admin/rundowns/${S.rd.id}/items`, { method: "POST", body: { type: "avo", title: x.title.slice(0, 200), duration: avoDur(x), data: { story, avoId: x.id } } }); b.textContent = "Added"; b.disabled = true; openRundown(S.rd.id); } catch (e) { fail(e); }
    });
  } catch (e) { $("#al", d).innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}
// Stories: every video playing on the channel now, to pick into the open rundown.
async function storiesDialog() {
  if (!S.rd) return toast("Open a rundown first.");
  const d = dialog(`<h3>Channel videos: add as stories</h3><p class="muted">Every video now playing on ${S.ch === "h" ? "Rashtrix TV" : "Rashtrix Shorts"}. Add any to the rundown, then drag to arrange.</p><div id="sl" class="clips-list"><p class="muted">Loading…</p></div>`);
  try {
    const tv = await api(`/api/tv/${S.ch}`), vids = (tv.loop || []).filter(x => x.type === "video");
    $("#sl", d).innerHTML = vids.map(v => `<div class="clip"><img src="https://i.ytimg.com/vi/${esc(v.ytId)}/mqdefault.jpg" alt="" style="width:120px;border-radius:6px"><div style="flex:1"><b data-no-tr>${esc(v.line || v.title)}</b><br><small>${digits(fmt(v.dur || 0))}</small></div><button class="btn sm" data-add="${esc(v.ytId)}">Add</button></div>`).join("") || `<p class="muted">No videos on the channel right now.</p>`;
    $$("[data-add]", d).forEach(b => b.onclick = async () => { const v = vids.find(x => x.ytId === b.dataset.add);
      try { await api(`/api/admin/rundowns/${S.rd.id}/items`, { method: "POST", body: { type: "video", title: (v.line || v.title || "").slice(0, 200), duration: v.dur || 60, data: { ytId: v.ytId, text: v.line || v.title || "" } } }); b.textContent = "Added"; b.disabled = true; openRundown(S.rd.id); } catch (e) { fail(e); } });
  } catch (e) { $("#sl", d).innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

/* ---------- left: the day's rundowns ---------- */
function drawList() {
  const L = $(".pr-list");
  L.innerHTML = `<button class="ap-switch" id="apSwitch" type="button" style="margin-bottom:8px"><i></i><span><b>AUTOPILOT</b><small id="apState">…</small></span></button><button class="ap-switch" id="avoSwitch" type="button" style="margin-bottom:10px"><i></i><span><b>AVO ENGINE</b><small id="avoState">…</small></span></button><div class="chtabs"><button class="btn ${S.ch === "h" ? "on" : ""}" data-ch="h">Rashtrix TV</button><button class="btn ${S.ch === "v" ? "on" : ""}" data-ch="v">Rashtrix Shorts</button></div>
    <div class="row" style="margin-bottom:8px">${S.archive
      ? `<label>From<input type="date" id="aFrom" value="${S.from || istDay(Date.now() - 30 * 864e5)}"></label><label>To<input type="date" id="aTo" value="${S.to || istDay()}"></label>`
      : `<label style="flex:1">Day<input type="date" id="day" value="${S.day}"></label>`}</div>
    <div class="row" style="margin-bottom:10px"><button class="btn" id="archToggle">${S.archive ? "← Working rundowns" : "Archive"}</button>${S.archive ? "" : `<button class="btn green" id="newRd">+ New rundown</button>`}</div>
    ${S.archive ? "" : `<div class="row" style="margin-bottom:10px"><select id="fromTpl" style="flex:1"><option value="">From a template…</option>${S.templates.filter(t => t.channel === S.ch).map(t => `<option value="${t.id}">${esc(t.title)} · ${esc(t.slot_start || "")}</option>`).join("")}</select></div>`}
    <div>${S.list.length ? S.list.map(r => `<button class="rd" data-id="${r.id}"${S.rd?.id === r.id ? ' aria-current="true"' : ""}><b data-no-tr>${esc(r.title)}</b>${r.pcr_sent_at ? ` <span class="tag ${r.pcr_aired_at ? "" : "red"}">${r.pcr_aired_at ? "AIRED" : "PCR"}</span>` : ""}<small>${S.archive ? `${digits(r.day)} · ` : ""}${r.slot_start ? digits(r.slot_start) + " · " : ""}${digits(fmt(r.seconds))} / ${digits(r.slot_minutes)} min · ${digits(r.items)} items</small></button>`).join("") : `<p class="muted">No rundowns${S.archive ? " in these dates" : " for this day yet"}.</p>`}</div>
    <hr style="border-color:var(--line)"><div class="row"><button class="btn" id="avoBtn">AVO stories</button><button class="btn" id="storiesBtn">Channel videos</button><button class="btn" id="clipsBtn">Clips library</button><button class="btn" id="tplBtn">Templates</button><button class="btn" id="asrunBtn">As-run log</button></div>`;
  $$("[data-ch]", L).forEach(b => b.onclick = () => { S.ch = b.dataset.ch; S.rd = null; loadList().then(() => drawRundown()); loadOnAir(); });
  $$(".rd", L).forEach(b => b.onclick = () => openRundown(b.dataset.id).catch(fail));
  $("#apSwitch", L).onclick = autopilot; drawAutopilot();
  $("#avoSwitch", L).onclick = toggleAvo; loadAvoState();
  $("#avoBtn", L)?.addEventListener("click", avoDialog);
  $("#storiesBtn", L)?.addEventListener("click", storiesDialog);
  $("#day", L)?.addEventListener("change", e => { S.day = e.target.value; S.rd = null; loadList().then(drawRundown).catch(fail); });
  $("#aFrom", L)?.addEventListener("change", e => { S.from = e.target.value; loadList().catch(fail); });
  $("#aTo", L)?.addEventListener("change", e => { S.to = e.target.value; loadList().catch(fail); });
  $("#archToggle", L).onclick = () => { S.archive = !S.archive; S.rd = null; loadList().then(drawRundown).catch(fail); };
  $("#newRd", L)?.addEventListener("click", newRundown);
  $("#fromTpl", L)?.addEventListener("change", async e => { if (!e.target.value) return; try { const d = await api("/api/admin/rundowns", { method: "POST", body: { templateId: e.target.value, day: S.day } }); await loadList(); await openRundown(d.id); toast("Rundown made from the template."); } catch (x) { fail(x); } });
  $("#clipsBtn", L).onclick = () => clipsDialog();
  $("#tplBtn", L).onclick = () => templatesDialog();
  $("#asrunBtn", L).onclick = () => asrunDialog();
}
async function newRundown() {
  const dlg = document.createElement("dialog");
  dlg.innerHTML = `<form method="dialog" class="stack"><h3>New rundown</h3><label>Show<input name="title" required placeholder="e.g. সন্ধ্যার খবর"></label>
    <div class="grid2"><label>Starts (India time)<input name="slotStart" type="time"></label><label>Slot (minutes)<input name="slotMinutes" type="number" min="1" max="720" value="30"></label></div>
    <div class="row"><button class="btn green" value="ok">Create</button><button class="btn" value="cancel" formnovalidate>Cancel</button></div></form>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener("close", async () => {
    if (dlg.returnValue === "ok") { const f = new FormData($("form", dlg)); try { const d = await api("/api/admin/rundowns", { method: "POST", body: { channel: S.ch, day: S.day, title: f.get("title"), slotStart: f.get("slotStart"), slotMinutes: Number(f.get("slotMinutes")) } }); await loadList(); await openRundown(d.id); } catch (e) { fail(e); } }
    dlg.remove();
  });
}

/* ---------- centre: the rundown ---------- */
function drawRundown() {
  const C = $(".pr-rd");
  if (!S.rd) { C.innerHTML = `<div class="pr-empty"><p>Choose a rundown, or make a new one.</p><p class="muted">Each channel has its own rundowns for each day. At midnight (India time) they are archived with the as-run log.</p></div>`; drawItem(); return; }
  const r = S.rd, ro = r.status === "archived";
  C.innerHTML = `<div class="rd-head">${ro ? `<div class="title" data-no-tr>${esc(r.title)}</div>` : `<input class="title" id="rdTitle" value="${esc(r.title)}" data-no-tr>`}
      <label>Starts<input type="time" id="rdStart" value="${esc(r.slot_start)}" ${ro ? "disabled" : ""}></label>
      <label>Slot (min)<input type="number" id="rdSlot" min="1" max="720" value="${r.slot_minutes}" style="width:80px" ${ro ? "disabled" : ""}></label></div>
    <div class="row" style="margin-bottom:8px">${ro ? `<span class="tag amber">Archived</span><button class="btn" id="copyRd">Copy to today</button>` : `<button class="btn red" id="onAir">▶ On air from the top</button><button class="btn" id="onAirSel" ${S.sel ? "" : "disabled"}>▶ On air from selected</button><button class="btn" id="saveTpl">Save as template</button><button class="btn" id="copyRd">Copy</button><button class="btn" id="nrcs">Import from Command Centre</button>`}
      <button class="btn" id="print">Print (PDF)</button>${ro ? "" : `<button class="btn" id="libBtn">Library</button><button class="btn" id="fixedBtn" title="The channel's bulletins and segments at their times in this slot">Place bulletins &amp; segments</button>`}${ro ? "" : `<button class="btn" id="delRd">Delete</button>`}</div>
    ${ro ? "" : `<div class="rd-pcr ${r.pcr_sent_at ? "on" : ""}"><button class="btn ${r.pcr_sent_at ? "" : "red"}" id="pcrBtn">${r.pcr_sent_at ? "Take back from the PCR" : "Send to PCR"}</button><span>${r.pcr_sent_at ? (r.pcr_aired_at && r.pcr_aired_at !== "missed" && r.pcr_aired_at !== "empty" ? `<b>Went on air</b> at ${digits(istClock(Date.parse(r.pcr_aired_at), false))}` : r.pcr_aired_at === "missed" ? "Its start time passed" : `<b>Sent to the PCR.</b> It cuts to air at ${digits(r.slot_start || "—")} by itself, and the channel goes back to autopilot when it ends.`) : r.slot_start ? `Not sent. Send it and it goes on air at ${digits(r.slot_start)} by itself.` : "Give it a start time, then send it to the PCR."}</span></div>`}
    <div class="rd-time" id="rdTime"></div>
    <table class="items"><thead><tr><th></th><th>#</th><th>Type</th><th>Item</th><th>Length</th><th>From top</th><th>Back-time</th><th></th></tr></thead><tbody></tbody></table>
    ${ro ? "" : `<div class="add-row">${TYPE_ADD.map(([k, n]) => `<button class="btn sm" data-add="${k}">+ ${n}</button>`).join("")}</div>`}`;
  const save = async body => { try { await api(`/api/admin/rundowns/${r.id}`, { method: "PUT", body }); Object.assign(S.rd, { title: body.title ?? r.title, slot_start: body.slotStart ?? r.slot_start, slot_minutes: body.slotMinutes ?? r.slot_minutes }); drawTime(); loadList(); } catch (e) { fail(e); } };
  $("#rdTitle", C)?.addEventListener("change", e => save({ title: e.target.value }));
  $("#rdStart", C)?.addEventListener("change", e => save({ slotStart: e.target.value }));
  $("#rdSlot", C)?.addEventListener("change", e => save({ slotMinutes: Number(e.target.value) }));
  $$("[data-add]", C).forEach(b => b.onclick = () => addItem(b.dataset.add));
  $("#onAir", C)?.addEventListener("click", () => putOnAir(0));
  $("#onAirSel", C)?.addEventListener("click", () => putOnAir(r.items.findIndex(i => i.id === S.sel)));
  $("#saveTpl", C)?.addEventListener("click", async () => { const wd = prompt("Make this rundown every day? Days of the week as digits (0 = Sunday … 6 = Saturday):", "0123456"); if (wd === null) return; try { await api(`/api/admin/rundowns/${r.id}/template`, { method: "POST", body: { weekdays: wd } }); S.templates = (await api("/api/admin/templates")).templates; drawList(); toast("Saved as a template. It will be made every chosen day at midnight."); } catch (e) { fail(e); } });
  $("#copyRd", C)?.addEventListener("click", async () => { try { const d = await api(`/api/admin/rundowns/${r.id}/copy`, { method: "POST", body: { day: istDay() } }); S.archive = false; S.day = istDay(); await loadList(); await openRundown(d.id); toast("Copied to today."); } catch (e) { fail(e); } });
  $("#delRd", C)?.addEventListener("click", async () => { if (!confirm("Delete this rundown and all its items?")) return; try { await api(`/api/admin/rundowns/${r.id}`, { method: "DELETE" }); S.rd = null; await loadList(); drawRundown(); } catch (e) { fail(e); } });
  $("#print", C).onclick = () => printRundown();
  $("#libBtn", C)?.addEventListener("click", libraryDialog);
  $("#fixedBtn", C)?.addEventListener("click", async () => { try { const d = await api(`/api/admin/rundowns/${r.id}/fixed`, { method: "POST" }); toast(d.fixed ? `${d.fixed} bulletins and segments placed at their times.` : "Give the rundown a start time first."); openRundown(r.id); } catch (e) { fail(e); } });
  $("#pcrBtn", C)?.addEventListener("click", async () => { const on = !r.pcr_sent_at;
    if (on && !confirm(`Send "${r.title}" to the PCR? At ${r.slot_start || "its start time"} the channel leaves autopilot and runs this rundown; when it ends, autopilot comes back.`)) return;
    try { await api(`/api/admin/rundowns/${r.id}/pcr`, { method: "PUT", body: { sent: on } }); toast(on ? "Sent to the PCR." : "Taken back."); openRundown(r.id); loadList(); } catch (e) { fail(e); } });
  $("#nrcs", C)?.addEventListener("click", () => nrcsDialog());
  drawItems(); drawItem();
}
function drawTime() {
  const r = S.rd, t = timings(r.items, r.slot_minutes * 60), el = $("#rdTime"); if (!el) return;
  const diff = t.total - t.slot, cls = Math.abs(diff) <= 5 ? "ok" : diff > 0 ? "over" : "under";
  const end = r.startsAt ? istClock(Date.parse(r.startsAt) + t.total * 1000) : "";
  el.innerHTML = `<span>Total <b>${digits(fmt(t.total))}</b></span><span>Slot <b>${digits(fmt(t.slot))}</b></span><span class="${cls}">${diff > 0 ? "Over" : diff < 0 ? "Under" : "On time"} <b>${digits(fmt(diff))}</b></span>${end ? `<span>Ends <b>${digits(end)}</b></span>` : ""}`;
  return t;
}
function drawItems() {
  const r = S.rd, tb = $(".items tbody"); if (!tb) return;
  const t = drawTime(), ro = r.status === "archived";
  const air = S.onair?.rundown?.id === r.id ? S.onair.rundown.items[S.onair.rundown.index]?.id : null;
  const start = r.startsAt ? Date.parse(r.startsAt) : null;
  tb.innerHTML = r.items.map((it, i) => { const row = t.rows[i];
    const fx = !!it.data.fixed;
    return `<tr class="it ${it.status === "skipped" ? "skipped" : ""} ${air === it.id ? "onair" : ""} ${fx ? "fixed" : ""}" data-id="${it.id}" ${ro || fx ? "" : 'draggable="true"'}${S.sel === it.id ? ' aria-current="true"' : ""}>
      <td class="grip">${ro ? "" : fx ? `<span title="Fixed: the channel's clock">🔒</span>` : `<span class="mv"><button type="button" data-up="${it.id}" aria-label="Move up" ${i ? "" : "disabled"}>▲</button><button type="button" data-down="${it.id}" aria-label="Move down" ${i < r.items.length - 1 ? "" : "disabled"}>▼</button></span>`}</td><td class="num">${digits(i + 1)}</td><td><span class="type ${it.type}">${ITEM_TYPES[it.type] || it.type}</span>${fx ? `<br><small class="muted">at ${digits(it.data.at || "")}</small>` : ""}</td>
      <td><b data-no-tr>${esc(it.title || "—")}</b>${it.data.lowerThird ? `<br><small class="muted" data-no-tr>${esc(it.data.lowerThird)}</small>` : ""}${fx && !ro ? `<br><button type="button" class="btn sm" data-fskip="${it.id}">${it.status === "skipped" ? "Unskip" : "Skip"}</button>` : ""}</td>
      <td class="dur">${digits(fmt(row.dur))}</td><td class="t">${digits(fmt(row.start))}</td>
      <td class="t">${start ? digits(istClock(start + row.backStart * 1000)) : `−${digits(fmt(t.slot ? t.slot - row.backStart : t.total - row.start))}`}</td>
      <td>${air === it.id ? '<span class="tag red">ON AIR</span>' : ""}</td></tr>`; }).join("") || `<tr><td colspan="8" class="muted" style="padding:20px">No items yet. Add them with the buttons below.</td></tr>`;
  $$("[data-up],[data-down]", tb).forEach(b => b.onclick = e => { e.stopPropagation(); moveBy(b.dataset.up || b.dataset.down, b.dataset.up ? -1 : 1); });
  $$("[data-fskip]", tb).forEach(b => b.onclick = async e => { e.stopPropagation(); const it = r.items.find(x => x.id === b.dataset.fskip);
    try { await api(`/api/admin/rundowns/${r.id}/items/${it.id}`, { method: "PUT", body: { status: it.status === "skipped" ? "ready" : "skipped" } }); openRundown(r.id); } catch (x) { fail(x); } });
  $$("tr.it", tb).forEach(tr => {
    tr.onclick = () => { S.sel = tr.dataset.id; $$("tr.it", tb).forEach(x => x.toggleAttribute("aria-current", x === tr)); $("#onAirSel") && ($("#onAirSel").disabled = false); drawItem(); };
    if (ro) return;
    tr.addEventListener("dragstart", e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", tr.dataset.id); tr.classList.add("drag"); });
    tr.addEventListener("dragend", () => { tr.classList.remove("drag"); $$(".dropbefore", tb).forEach(x => x.classList.remove("dropbefore")); });
    tr.addEventListener("dragover", e => { e.preventDefault(); $$(".dropbefore", tb).forEach(x => x.classList.remove("dropbefore")); tr.classList.add("dropbefore"); });
    tr.addEventListener("drop", e => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id && id !== tr.dataset.id) reorder(id, tr.dataset.id); });
  });
  // Keyboard: Alt+↑ / Alt+↓ move the selected item.
}
// ▲ / ▼: one place up or down (past the fixed items, which keep their time).
async function moveBy(id, d) {
  const items = S.rd.items, i = items.findIndex(x => x.id === id); let j = i + d;
  while (j >= 0 && j < items.length && items[j].data.fixed) j += d;
  if (j < 0 || j >= items.length) return;
  const [it] = items.splice(i, 1); items.splice(j, 0, it); S.sel = id; drawItems();
  try { await api(`/api/admin/rundowns/${S.rd.id}/order`, { method: "PUT", body: { ids: items.map(x => x.id) } }); openRundown(S.rd.id); } catch (e) { fail(e); openRundown(S.rd.id); }
}
// The library: the channel's YouTube videos and the AVO stories of the last three days, by age.
async function libraryDialog() {
  if (!S.rd) return toast("Open a rundown first.");
  const d = dialog(`<h3>Library</h3><p class="muted">${S.ch === "h" ? "Rashtrix TV" : "Rashtrix Shorts"}: YouTube videos and AVO stories from the last three days. Add any to the rundown; it goes in after the selected item.</p>
    <div class="row lib-tabs"><button class="btn sm on" data-lt="all">All</button><button class="btn sm" data-lt="video">Videos</button><button class="btn sm" data-lt="avo">AVO</button></div><div id="lib" class="lib"><p class="muted">Loading…</p></div>`);
  let L; try { L = await api(`/api/admin/rundowns/library?channel=${S.ch}`); } catch (e) { $("#lib", d).innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const age = t => (Date.now() - Date.parse(t)) / 3600e3, BANDS = [[0, 24, "Last 24 hours"], [24, 48, "24 to 48 hours ago"], [48, 72, "48 to 72 hours ago"]];
  const t = s => new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const all = [...L.videos.map(v => ({ k: "video", id: v.ytId, at: v.at, v })), ...L.avo.map(x => ({ k: "avo", id: x.id, at: x.at, x }))].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  let tab = "all";
  const draw = () => { const list = all.filter(i => tab === "all" || i.k === tab);
    $("#lib", d).innerHTML = BANDS.map(([a, b, name]) => { const g = list.filter(i => age(i.at) >= a && age(i.at) < b);
      return `<section><h4>${name} <small class="muted">${digits(g.length)}</small></h4>${g.map(i => i.k === "video"
        ? `<div class="clip"><img src="${esc(i.v.thumb || `https://i.ytimg.com/vi/${i.v.ytId}/mqdefault.jpg`)}" alt=""><div style="flex:1"><span class="type video">Video</span> <b data-no-tr>${esc(i.v.title)}</b><br><small>${digits(fmt(i.v.dur || 0))} · ${t(i.at)}</small></div><button class="btn sm" data-lv="${esc(i.id)}">Add</button></div>`
        : `<div class="clip"><img src="${esc(i.x.images[0]?.src || "/partners/calibrex-mark.svg")}" alt=""><div style="flex:1"><span class="type avo">AVO</span> <b data-no-tr>${esc(i.x.title)}</b><br><small>${digits(Math.round(i.x.secs || 0))} s voice · ${digits(i.x.images.length)} pictures · ${t(i.at)}</small></div><button class="btn sm" data-la="${esc(i.id)}">Add</button></div>`).join("") || `<p class="muted">Nothing.</p>`}</section>`; }).join("");
    $$("[data-lv]", d).forEach(b => b.onclick = () => addFromLib(b, { type: "video", title: (L.videos.find(v => v.ytId === b.dataset.lv).title || "").slice(0, 200), duration: L.videos.find(v => v.ytId === b.dataset.lv).dur || 60, data: { ytId: b.dataset.lv } }));
    $$("[data-la]", d).forEach(b => b.onclick = () => { const x = L.avo.find(y => y.id === b.dataset.la); addFromLib(b, { type: "avo", title: x.title.slice(0, 200), duration: avoDur(x), data: { story: x, avoId: x.id } }); });
  };
  $$("[data-lt]", d).forEach(b => b.onclick = () => { tab = b.dataset.lt; $$("[data-lt]", d).forEach(x => x.classList.toggle("on", x === b)); draw(); });
  draw();
}
async function addFromLib(btn, body) {
  btn.disabled = true;
  try {
    const after = S.rd.items.findIndex(x => x.id === S.sel), d = await api(`/api/admin/rundowns/${S.rd.id}/items`, { method: "POST", body });
    await openRundown(S.rd.id);
    if (after >= 0) { const ids = S.rd.items.map(x => x.id).filter(x => x !== d.id); ids.splice(after + 1, 0, d.id); await api(`/api/admin/rundowns/${S.rd.id}/order`, { method: "PUT", body: { ids } }); }
    S.sel = d.id; await openRundown(S.rd.id); btn.textContent = "Added";
  } catch (e) { fail(e); btn.disabled = false; }
}
async function reorder(id, beforeId) {
  const items = S.rd.items, from = items.findIndex(x => x.id === id); const [it] = items.splice(from, 1);
  items.splice(items.findIndex(x => x.id === beforeId), 0, it);
  drawItems();
  try { await api(`/api/admin/rundowns/${S.rd.id}/order`, { method: "PUT", body: { ids: items.map(x => x.id) } }); } catch (e) { fail(e); openRundown(S.rd.id); }
}
async function addItem(type) {
  const after = S.rd.items.findIndex(x => x.id === S.sel);
  try {
    const d = await api(`/api/admin/rundowns/${S.rd.id}/items`, { method: "POST", body: { type, title: "", duration: DEFAULTS[type], data: type === "live" ? { layout: "full", sources: [{ kind: "continuity" }] } : {} } });
    if (after >= 0 && after < S.rd.items.length - 1) { await openRundown(S.rd.id); const ids = S.rd.items.map(x => x.id).filter(x => x !== d.id); ids.splice(after + 1, 0, d.id); await api(`/api/admin/rundowns/${S.rd.id}/order`, { method: "PUT", body: { ids } }); }
    S.sel = d.id; await openRundown(S.rd.id);
    $(".pr-item input[name=title]")?.focus();
  } catch (e) { fail(e); }
}
async function putOnAir(index) {
  if (!confirm(index > 0 ? "Put this rundown on air now, from the selected item?" : "Put this rundown on air now, from the top?")) return;
  try { await api(`/api/admin/rundowns/${S.rd.id}/onair`, { method: "POST", body: { index } }); toast("On air. The PCR has it now."); loadOnAir(); } catch (e) { fail(e); }
}

/* ---------- right: the selected item ---------- */
function drawItem() {
  const R = $(".pr-item"), it = S.rd?.items.find(x => x.id === S.sel);
  if (!it) { R.innerHTML = `<div class="pr-empty">Select an item to edit it.</div>`; return; }
  const d = it.data, ro = S.rd.status === "archived", dis = ro ? "disabled" : "";
  const timed = !["video", "clip", "adbreak"].includes(it.type) || !(Number(d.out) > Number(d.in));
  let specific = "";
  if (it.type === "video") specific = `<label>YouTube link or ID<input name="ytId" value="${esc(d.ytId || "")}" placeholder="https://youtu.be/…" ${dis}></label><div class="grid2"><label>In (m:ss)<input name="in" value="${fmt(d.in || 0)}" ${dis}></label><label>Out (m:ss, empty = to the end)<input name="out" value="${d.out ? fmt(d.out) : ""}" ${dis}></label></div>`;
  if (it.type === "clip") specific = `<label>Clip<select name="clip" data-no-tr ${dis}><option value="">Choose from the clips library…</option>${S.clips.filter(c => c.status === "ready").map(c => `<option value="${c.id}" data-url="${esc(c.url)}" ${d.clipId === c.id ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select></label><div class="grid2"><label>In (m:ss)<input name="in" value="${fmt(d.in || 0)}" ${dis}></label><label>Out (m:ss)<input name="out" value="${d.out ? fmt(d.out) : ""}" ${dis}></label></div>`;
  if (it.type === "live") specific = `<label>Layout<select name="layout" ${dis}>${Object.entries(LAYOUTS).filter(([k]) => k !== "graphic").map(([k, l]) => `<option value="${k}" ${d.layout === k ? "selected" : ""}>${l.name}</option>`).join("")}</select></label><div class="stack" id="srcs"></div>`;
  if (it.type === "breaking") specific = `<label>Breaking headline (on screen)<input name="text" value="${esc(d.text || "")}" data-no-tr ${dis}></label><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="music" ${d.music !== false ? "checked" : ""} ${dis}> Breaking music</label>`;
  if (it.type === "headlines") specific = `<label>Title<input name="htitle" value="${esc(d.title || "")}" placeholder="শিরোনাম" ${dis}></label><label>Headlines (one a line, up to 5; empty = the latest from the site)<textarea name="lines" rows="5" ${dis}>${esc(d.lines || "")}</textarea></label>`;
  if (it.type === "lband") specific = `<label>Band headline<input name="text" value="${esc(d.text || "")}" ${dis}></label><label>Band lines (one a line)<textarea name="lines" rows="4" ${dis}>${esc(d.lines || "")}</textarea></label><div class="src-row"><select name="lbKind" ${dis}>${["continuity", "yt", "clip", "hls", "whep", "image"].map(k => `<option value="${k}" ${(d.source?.kind || "continuity") === k ? "selected" : ""}>${SOURCE_KINDS[k]}</option>`).join("")}</select><input name="lbRef" value="${esc(d.source?.id || d.source?.url || "")}" placeholder="Link (not needed for the running order)" ${dis}></div>`;
  if (it.type === "promo" || it.type === "slate") specific = `<label>Picture (Google Drive link or https address; copied into the app)<input name="image" value="${esc(d.image || "")}" ${dis}></label>${it.type === "slate" ? `<label>Slate text<input name="text" value="${esc(d.text || "")}" ${dis}></label>` : ""}`;
  if (it.type === "bulletin") specific = `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="short" ${d.short ? "checked" : ""} ${dis}> Quick bulletin (খবর সংক্ষেপে)</label><p class="muted">The channel's bulletin: its stories, pictures and the newsreader, as it is at air time.${d.fixed ? ` Fixed at ${digits(d.at || "")} by the channel's clock.` : ""}</p>`;
  if (it.type === "segment") specific = `<label>Segment<select name="seg" ${dis}>${Object.entries(SEGS).map(([k, n]) => `<option value="${k}" ${d.name === k ? "selected" : ""}>${n}</option>`).join("")}</select></label><p class="muted">Built from the channel's material at air time.${d.fixed ? ` Fixed at ${digits(d.at || "")} by the channel's clock.` : ""}</p>`;
  if (it.type === "adbreak") specific = `<label>Ads (one a line: picture link, seconds)<textarea name="ads" rows="5" ${dis}>${esc((d.items || []).map(x => `${x.image}, ${x.seconds}`).join("\n"))}</textarea></label>`;
  R.innerHTML = `<form class="stack" autocomplete="off"><h3><span class="type ${it.type}">${ITEM_TYPES[it.type]}</span></h3>
    <label>Title (for the rundown)<input name="title" value="${esc(it.title)}" data-no-tr ${dis}></label>
    ${timed ? `<label>Length (m:ss)<input name="duration" value="${fmt(it.duration)}" ${dis}></label>` : `<p class="muted"><span>Length comes from the in and out points:</span> <span data-no-tr>${digits(fmt(it.duration))}</span></p>`}
    ${specific}
    <details ${d.lowerThird || d.ticker ? "open" : ""}><summary>On-screen text</summary><div class="stack" style="margin-top:8px">
      <div class="grid2"><label>Lower third: name<input name="lowerThird" value="${esc(d.lowerThird || "")}" ${dis}></label><label>Lower third: title<input name="lowerTitle" value="${esc(d.lowerTitle || "")}" ${dis}></label></div>
      <label>Ticker lines for this item (one a line; empty = the channel's)<textarea name="ticker" rows="3" ${dis}>${esc(d.ticker || "")}</textarea></label></div></details>
    <label>Script (teleprompter)<textarea name="script" rows="8" data-no-tr ${dis}>${esc(it.script || "")}</textarea></label>
    ${ro ? "" : `<div class="row"><button class="btn green" type="submit">Save item</button><button class="btn" type="button" id="skipIt">${it.status === "skipped" ? "Unskip" : "Skip"}</button><button class="btn" type="button" id="delIt">Delete</button></div>`}</form>`;
  const F = $("form", R);
  if (it.type === "live") drawSources(it);
  F.onsubmit = async e => { e.preventDefault(); await saveItem(it, F); };
  $("#delIt", R)?.addEventListener("click", async () => { if (!confirm("Delete this item?")) return; try { await api(`/api/admin/rundowns/${S.rd.id}/items/${it.id}`, { method: "DELETE" }); S.sel = null; openRundown(S.rd.id); } catch (e) { fail(e); } });
  $("#skipIt", R)?.addEventListener("click", async () => { try { await api(`/api/admin/rundowns/${S.rd.id}/items/${it.id}`, { method: "PUT", body: { status: it.status === "skipped" ? "ready" : "skipped" } }); openRundown(S.rd.id); } catch (e) { fail(e); } });
}
function drawSources(it) {
  const box = $("#srcs"), layout = $("[name=layout]").value, slots = Math.max(1, LAYOUTS[layout]?.slots || 1);
  const list = (it.data.sources || []).slice(0, slots); while (list.length < slots) list.push({ kind: "continuity" });
  box.innerHTML = list.map((s, i) => `<div class="src-row" data-i="${i}"><select data-k="kind">${Object.entries(SOURCE_KINDS).map(([k, n]) => `<option value="${k}" ${s.kind === k ? "selected" : ""}>${n}</option>`).join("")}</select>
    <input data-k="ref" value="${esc(s.url || s.id || "")}" placeholder="${i === 0 ? "Main source: link or guest" : `Box ${i + 1}: link or guest`}">
    <input class="full" data-k="name" value="${esc(s.name || "")}" placeholder="Name on screen (guests)"></div>`).join("");
  $("[name=layout]").onchange = () => { it.data.sources = readSources(); it.data.layout = $("[name=layout]").value; drawSources(it); };
}
function readSources() {
  return $$("#srcs .src-row").map(r => { const kind = $("[data-k=kind]", r).value, ref = $("[data-k=ref]", r).value.trim(), name = $("[data-k=name]", r).value.trim();
    return ["yt", "guest"].includes(kind) ? { kind, id: kind === "yt" ? (ref.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([\w-]{11})/)?.[1] || ref) : ref, name } : { kind, url: ref, name }; });
}
async function copyPic(v) {
  if (!v || /^\/(media|brand)\//.test(v)) return v;
  toast("Copying the picture into the app…");
  return (await api("/api/admin/copy-image", { method: "POST", body: { url: v } })).url;
}
async function saveItem(it, F) {
  const f = Object.fromEntries(new FormData(F)), d = { lowerThird: f.lowerThird, lowerTitle: f.lowerTitle, ticker: f.ticker };
  try {
    if (it.type === "video") Object.assign(d, { ytId: f.ytId, in: parseTime(f.in), out: f.out ? parseTime(f.out) : "" });
    if (it.type === "clip") { const o = F.elements.clip.selectedOptions[0]; Object.assign(d, { clipId: f.clip, url: o?.dataset.url || it.data.url || "", in: parseTime(f.in), out: f.out ? parseTime(f.out) : "" }); }
    if (it.type === "live") Object.assign(d, { layout: f.layout, sources: readSources() });
    if (it.type === "breaking") Object.assign(d, { text: f.text, music: !!F.elements.music.checked });
    if (it.type === "headlines") Object.assign(d, { title: f.htitle, lines: f.lines });
    if (it.type === "lband") { const k = f.lbKind, ref = f.lbRef.trim(); Object.assign(d, { text: f.text, lines: f.lines, source: k === "continuity" ? null : k === "yt" ? { kind: k, id: ref.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([\w-]{11})/)?.[1] || ref } : { kind: k, url: k === "image" ? await copyPic(ref) : ref } }); }
    if (it.type === "promo" || it.type === "slate") Object.assign(d, { image: await copyPic(f.image.trim()), text: f.text });
    if (it.type === "bulletin") Object.assign(d, { short: !!F.elements.short.checked, at: it.data.at || "", fixed: !!it.data.fixed });
    if (it.type === "segment") Object.assign(d, { name: f.seg, at: it.data.at || "", fixed: !!it.data.fixed });
    if (it.type === "avo") Object.assign(d, { avoId: it.data.avoId, story: it.data.story });
    if (it.type === "adbreak") d.items = await Promise.all(f.ads.split("\n").map(l => l.trim()).filter(Boolean).map(async l => { const [img, sec] = l.split(/,\s*(?=\d+\s*$)/); return { image: await copyPic(img.trim()), seconds: Number(sec) || 10 }; }));
    await api(`/api/admin/rundowns/${S.rd.id}/items/${it.id}`, { method: "PUT", body: { title: f.title, duration: f.duration ? parseTime(f.duration) : it.duration, script: f.script, data: d } });
    toast("Saved."); await openRundown(S.rd.id);
  } catch (e) { fail(e); }
}

/* ---------- print (the browser's PDF) ---------- */
function printRundown() {
  const r = S.rd, t = timings(r.items, r.slot_minutes * 60), start = r.startsAt ? Date.parse(r.startsAt) : null;
  printDoc(`${r.title} · ${r.day}${r.slot_start ? ` · ${r.slot_start}` : ""} · ${r.channel === "h" ? "Rashtrix TV" : "Rashtrix Shorts"}`,
    `<p>Total ${fmt(t.total)} · Slot ${fmt(t.slot)} · ${t.over > 0 ? `Over ${fmt(t.over)}` : t.over < 0 ? `Under ${fmt(t.over)}` : "On time"}</p>
    <table><thead><tr><th>#</th><th>Type</th><th>Item</th><th>Length</th><th>From top</th><th>Starts</th></tr></thead><tbody>${r.items.map((it, i) => `<tr><td>${i + 1}</td><td>${ITEM_TYPES[it.type]}</td><td><b>${esc(it.title)}</b>${it.data.lowerThird ? `<br>${esc(it.data.lowerThird)} — ${esc(it.data.lowerTitle || "")}` : ""}${it.script ? `<div class="script">${esc(it.script)}</div>` : ""}</td><td>${fmt(t.rows[i].dur)}</td><td>${fmt(t.rows[i].start)}</td><td>${start ? istClock(start + t.rows[i].backStart * 1000) : ""}</td></tr>`).join("")}</tbody></table>`);
}

/* ---------- dialogs: clips, templates, as-run, Command Centre ---------- */
function dialog(html) { const d = document.createElement("dialog"); d.innerHTML = `<div class="stack">${html}<div class="row"><button class="btn" data-close>Close</button></div></div>`; document.body.append(d); d.showModal(); $("[data-close]", d).onclick = () => d.close(); d.addEventListener("close", () => d.remove()); return d; }
async function loadClips() { try { S.clips = (await api("/api/admin/clips")).clips; S.clipsInfo = null; } catch (e) { S.clips = []; S.clipsInfo = e.message; } }
async function clipsDialog() {
  await loadClips();
  const d = dialog(`<div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">Clips library</h3><button class="btn red" type="button" id="cOld">Delete clips older than 24 hours</button></div><p class="muted">MP4 (H.264) plays everywhere. Clips are kept in Cloudflare R2 (10 GB free) and deleted after 30 days unused unless marked “keep”.</p>
    ${S.clipsInfo ? `<p class="tag amber">${esc(S.clipsInfo)}</p>` : `<div class="grid2"><label>Upload a video<input type="file" id="cf" accept="video/mp4,video/quicktime,video/webm"></label><label>Or paste a Google Drive link<span class="row"><input id="cd" placeholder="https://drive.google.com/file/d/…" style="flex:1"><button class="btn" id="cdGo">Copy</button></span></label></div><div class="bar" hidden><i></i></div><div class="clips-list"></div>`}`);
  const draw = () => { const L = $(".clips-list", d); if (!L) return; L.innerHTML = S.clips.map(c => `<div class="clip"><div><b data-no-tr>${esc(c.title)}</b><br><small>${digits((c.bytes / 1048576).toFixed(1))} MB${c.status === "ready" ? "" : ` · ${c.status}`}${c.keep ? " · Keep" : ""}</small></div><div class="row"><a class="btn sm" href="${esc(c.url)}" target="_blank">Play</a><button class="btn sm" data-keep="${c.id}">${c.keep ? "Unkeep" : "Keep"}</button><button class="btn sm" data-del="${c.id}">Delete</button></div></div>`).join("") || `<p class="muted">No clips yet.</p>`;
    $$("[data-keep]", L).forEach(b => b.onclick = async () => { const c = S.clips.find(x => x.id === b.dataset.keep); await api(`/api/admin/clips/${c.id}`, { method: "PUT", body: { keep: !c.keep } }).catch(fail); await loadClips(); draw(); });
    $$("[data-del]", L).forEach(b => b.onclick = async () => { if (!confirm("Delete this clip from storage?")) return; await api(`/api/admin/clips/${b.dataset.del}`, { method: "DELETE" }).catch(fail); await loadClips(); draw(); }); };
  draw();
  $("#cOld", d)?.addEventListener("click", async () => {
    if (!confirm("Delete every clip older than 24 hours from storage? Clips used by AVO stories still on air are kept.")) return;
    try { const r = await api("/api/admin/clips/cleanup", { method: "POST", body: { hours: 24 } }); toast(`${r.deleted} clips deleted (${(r.freedBytes / 1048576).toFixed(0)} MB freed)${r.spared ? `; ${r.spared} kept for stories on air` : ""}.`); await loadClips(); draw(); } catch (x) { fail(x); }
  });
  $("#cf", d)?.addEventListener("change", async e => { const file = e.target.files[0]; if (!file) return; try { await uploadClip(file, $(".bar", d)); await loadClips(); draw(); toast("Uploaded."); } catch (x) { fail(x); } e.target.value = ""; });
  $("#cdGo", d)?.addEventListener("click", async () => { try { toast("Copying from Drive… (large videos take a while)"); await api("/api/admin/clips/drive", { method: "POST", body: { url: $("#cd", d).value, title: "Drive clip" } }); await loadClips(); draw(); toast("Copied."); } catch (x) { fail(x); } });
}
// Big files go up in 20 MB parts (any size, and a dropped connection only repeats one part).
async function uploadClip(file, bar) {
  const dur = await new Promise(res => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => res(v.duration || 0); v.onerror = () => res(0); v.src = URL.createObjectURL(file); });
  const start = await api("/api/admin/clips", { method: "POST", body: { title: file.name.replace(/\.\w+$/, ""), filename: file.name, size: file.size, mime: file.type, duration: dur } });
  const parts = [], n = Math.ceil(file.size / start.partSize); bar.hidden = false;
  try {
    for (let i = 0; i < n; i++) {
      const blob = file.slice(i * start.partSize, (i + 1) * start.partSize);
      let tries = 0, out;
      while (true) { try { out = await api(`/api/admin/clips/${start.id}/part/${i + 1}`, { method: "PUT", body: blob, raw: true }); break; } catch (e) { if (++tries > 3) throw e; await new Promise(r => setTimeout(r, 1500 * tries)); } }
      parts.push(out.part); $("i", bar).style.width = `${Math.round((i + 1) / n * 100)}%`;
    }
    await api(`/api/admin/clips/${start.id}/complete`, { method: "POST", body: { parts } });
  } catch (e) { await api(`/api/admin/clips/${start.id}/abort`, { method: "POST" }).catch(() => {}); throw e; }
  finally { setTimeout(() => { bar.hidden = true; }, 800); }
}
async function templatesDialog() {
  S.templates = (await api("/api/admin/templates")).templates;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = dialog(`<h3>Rundown templates</h3><p class="muted">At midnight (India time) each active template makes that day's rundown. Save a rundown as a template from its page.</p><div class="clips-list"></div>`);
  const draw = () => { $(".clips-list", d).innerHTML = S.templates.map(t => `<div class="clip"><div><b data-no-tr>${esc(t.title)}</b><br><small>${t.channel === "h" ? "Rashtrix TV" : "Rashtrix Shorts"} · ${esc(t.slot_start || "any time")} · ${digits(t.items)} items · ${[...t.weekdays].map(x => DAYS[x]).join(" ")}</small></div><div class="row"><button class="btn sm" data-act="${t.id}">${t.active ? "Pause" : "Resume"}</button><button class="btn sm" data-del="${t.id}">Delete</button></div></div>`).join("") || `<p class="muted">No templates yet.</p>`;
    $$("[data-act]", d).forEach(b => b.onclick = async () => { const t = S.templates.find(x => x.id === b.dataset.act); await api(`/api/admin/templates/${t.id}`, { method: "PUT", body: { active: !t.active, weekdays: t.weekdays, title: t.title } }).catch(fail); S.templates = (await api("/api/admin/templates")).templates; draw(); drawList(); });
    $$("[data-del]", d).forEach(b => b.onclick = async () => { if (!confirm("Delete this template?")) return; await api(`/api/admin/templates/${b.dataset.del}`, { method: "DELETE" }).catch(fail); S.templates = (await api("/api/admin/templates")).templates; draw(); drawList(); }); };
  draw();
}
async function asrunDialog() {
  const d = dialog(`<h3>As-run log</h3><div class="row"><label>Day<input type="date" id="ad" value="${S.day}"></label><button class="btn" id="aPrint">Print (PDF)</button></div><div class="clips-list" id="al"></div>`);
  let rows = [];
  const load = async () => { rows = (await api(`/api/admin/asrun?day=${$("#ad", d).value}&channel=${S.ch}`)).asrun; $("#al", d).innerHTML = rows.map(r => `<div class="clip" data-no-tr><div><b data-no-tr>${esc(r.title || r.type)}</b><br><small>${digits(istClock(Date.parse(r.at)))} · ${esc(r.type)} · ${esc(r.how)}</small></div><small>${digits(fmt(r.actual || r.planned))}</small></div>`).join("") || `<p class="muted">Nothing logged.</p>`; };
  $("#ad", d).onchange = () => load().catch(fail); await load().catch(fail);
  $("#aPrint", d).onclick = () => printDoc(`As-run log · ${S.ch === "h" ? "Rashtrix TV" : "Rashtrix Shorts"} · ${$("#ad", d).value}`, `<table><thead><tr><th>Time (IST)</th><th>What</th><th>Type</th><th>How</th><th>Planned</th><th>Actual</th></tr></thead><tbody>${rows.map(r => `<tr><td>${istClock(Date.parse(r.at))}</td><td>${esc(r.title)}</td><td>${esc(r.type)}</td><td>${esc(r.how)}</td><td>${fmt(r.planned)}</td><td>${fmt(r.actual)}</td></tr>`).join("")}</tbody></table>`);
}
async function nrcsDialog() {
  const d = dialog(`<h3>Import from Rashtrix Command Centre</h3><div id="nl" class="clips-list"><p class="muted">Loading stories…</p></div>`);
  try {
    const { stories, configured } = await api("/api/admin/nrcs/stories");
    if (!configured) { $("#nl", d).innerHTML = `<p class="muted">The Command Centre is not connected yet. Set its address (NRCS_URL), user name (NRCS_USERNAME) and password (NRCS_PASSWORD secret): see the README.</p>`; return; }
    $("#nl", d).innerHTML = stories.map(s => `<div class="clip"><div><b data-no-tr>${esc(s.title)}</b><br><small>${esc(s.slug || "")} ${s.duration ? `· ${digits(fmt(s.duration))}` : ""}</small></div><button class="btn sm" data-imp="${esc(s.id)}">Add</button></div>`).join("") || `<p class="muted">No ready stories.</p>`;
    $$("[data-imp]", d).forEach(b => b.onclick = async () => { const s = stories.find(x => String(x.id) === b.dataset.imp);
      try { await api(`/api/admin/rundowns/${S.rd.id}/items`, { method: "POST", body: { type: s.video ? "video" : "slate", title: s.title, duration: s.duration || 60, script: s.script || "", data: { ytId: s.video || "", lowerThird: s.lowerThird || "", lowerTitle: s.lowerTitle || "", text: s.title } } }); b.disabled = true; b.textContent = "Added"; openRundown(S.rd.id); } catch (e) { fail(e); } });
  } catch (e) { $("#nl", d).innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

/* ---------- start ---------- */
(async () => {
  const user = await shell("Bulletin producer");
  if (!user) return;
  main.innerHTML = `<div class="pr"><aside class="pr-list panel"></aside><section class="pr-rd panel"></section><aside class="pr-item panel"></aside></div>`;
  await Promise.all([api("/api/admin/templates").then(d => { S.templates = d.templates; }).catch(() => {}), loadClips()]);
  await loadList().catch(fail);
  drawRundown(); loadOnAir(); setInterval(loadOnAir, 5000);
  setInterval(loadOnAir, 5000);
  const q = new URLSearchParams(location.search).get("rundown"); if (q) openRundown(q).catch(fail);
})();
