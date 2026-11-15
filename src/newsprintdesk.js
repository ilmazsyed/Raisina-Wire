// The Newsprint desk: the control room of the e-paper (src/epaper.js). Two editions a day, the
// morning one at 7:00 and the evening one at 17:00. Each is drafted on its own four hours before
// its deadline (45 minutes before the edition) from the stories the desks sent to the newsprint
// and the day's news; here the editor chooses the lead, moves, orders and removes stories and
// their pictures, adds others, and approves it. At the edition's time it is printed, approved or
// not. The owner chooses who is reminded.
import { shell, api, toast, fail, esc, $, $$, istClock } from "./crshell.js";
import { digits } from "./i18n.js";

const S = { list: null, id: "", ed: null, cands: [], dirty: false, showAdd: "" };
const SLOT = { morning: "Morning edition", evening: "Evening edition" };
const PAGE = { front: "Front page", kolkata: "Kolkata", bengal: "West Bengal", india: "India", world: "World", sports: "Sports", life: "Entertainment & Life", stars: "Horoscope" };
const STATUS = { draft: ["DRAFT", "amber"], approved: ["APPROVED", "green"], published: ["PRINTED", ""] };
const FROM = { breaking: "Breaking desk", avo: "AVO desk", wire: "Wire desk", article: "Article desk" };
const day = d => { try { return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); } catch { return d; } };
const left = t => { const m = Math.round((Date.parse(t) - Date.now()) / 60e3); if (m <= 0) return "passed"; const h = Math.floor(m / 60); return `${h ? `${digits(h)} h ` : ""}${digits(m % 60)} min`; };
const thumb = m => m.kind === "yt" ? `https://i.ytimg.com/vi/${encodeURIComponent(m.id)}/mqdefault.jpg` : m.kind === "img" ? m.url : "";

function draw() {
  const L = S.list, E = S.ed, ed = E?.edition, out = ed?.status === "published";
  const next = L.next || [];
  $("main").innerHTML = `<section class="panel pd">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>Newsprint desk</h2>
      <div class="row"><button class="btn sm" id="npR">Refresh</button></div></div>
    <p class="muted" style="margin:0">The e-paper: the morning edition at 7:00 and the evening edition at 17:00. Each is drafted on its own four hours before its deadline (45 minutes before the edition), from the stories sent to the newsprint and the day's news. Choose the lead, order the pages and approve. At the edition's time it is printed, approved or not.</p>
    <div class="np-next row" style="flex-wrap:wrap;gap:10px">${next.map(n => { const r = L.editions.find(x => x.id === n.id); const [s, c] = STATUS[r?.status || "draft"];
      return `<button type="button" class="np-slot ${S.id === n.id ? "on" : ""}" data-pick="${n.id}"><b>${SLOT[n.slot]}</b><small data-no-tr>${esc(day(n.day))}</small>
        <small><span>Deadline</span> <span data-no-tr>${istClock(Date.parse(n.deadline), false)}</span> · <span>in</span> <span data-no-tr>${left(n.deadline)}</span></small>
        <span class="tag ${r ? c : ""}">${r ? s : "NOT DRAFTED YET"}</span></button>`; }).join("")}</div>
    <div class="row" style="flex-wrap:wrap;gap:6px"><small class="muted">Earlier editions:</small>${L.editions.filter(x => !next.some(n => n.id === x.id)).slice(0, 8).map(x => `<button type="button" class="btn sm ${S.id === x.id ? "on" : ""}" data-pick="${x.id}"><span data-no-tr>${esc(day(x.day))}</span> · <span>${x.slot === "morning" ? "Morning" : "Evening"}</span></button>`).join("") || `<small class="muted">None yet.</small>`}</div>
  </section>
  ${ed ? `<section class="panel pd">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
      <h2 style="margin:0"><span>${SLOT[ed.slot]}</span> · <span data-no-tr>${esc(day(ed.day))}</span> <span class="tag ${STATUS[ed.status][1]}">${STATUS[ed.status][0]}</span></h2>
      <div class="row" style="flex-wrap:wrap">${out ? "" : `
        ${S.dirty ? `<button class="btn sm green" id="npSave">Save changes</button>` : ""}
        <button class="btn sm" id="npBuild" title="Draft it again from the latest news (your changes are lost)">Draft again</button>
        <button class="btn sm ${ed.status === "approved" ? "" : "green"}" id="npOk">${ed.status === "approved" ? "Withdraw approval" : "✓ Approve"}</button>
        <button class="btn sm red" id="npPrint">Print now</button>`}</div></div>
    <small class="muted">${out ? `<span>Printed at</span> <span data-no-tr>${istClock(Date.parse(ed.published_at), false)}</span>` : `<span>Deadline</span> <span data-no-tr>${istClock(Date.parse(E.deadline), false)}</span> · <span>prints at</span> <span data-no-tr>${istClock(Date.parse(E.at), false)}</span>`}
      ${ed.approved_by ? ` · <span>Approved by</span> <span data-no-tr>${esc(ed.approved_by)}</span>` : ""}${ed.built_at ? ` · <span>Drafted at</span> <span data-no-tr>${istClock(Date.parse(ed.built_at), false)}</span>` : ""}
      ${ed.touched ? " · <span>Edited by hand (no longer redrafted on its own)</span>" : out ? "" : " · <span>Untouched: redrafted every 20 minutes with the latest news</span>"}</small>
    <div class="np-pages">${ed.pages.map((p, pi) => page(p, pi, out)).join("")}</div>
  </section>` : S.id ? `<section class="panel pd"><p class="muted">Loading…</p></section>` : ""}
  <section class="panel pd">
    <h2>Sent to the newsprint <small class="muted">(${digits(L.pool.length)})</small></h2>
    <p class="muted" style="margin:0">Stories the desks sent for the paper. They go in the next edition first, by weight.</p>
    <div class="pd-list">${L.pool.map(p => `<div class="pd-card row" style="gap:10px;align-items:center"><span class="tag">${FROM[p.sent_from] || FROM[p.kind] || esc(p.sent_from)}</span>
      <b data-no-tr style="flex:1">${esc(p.content?.title || p.ref)}</b><small class="muted" data-no-tr>${istClock(Date.parse(p.created_at.replace(" ", "T") + "Z"), false)}</small>
      <button class="btn sm red" data-unpool="${p.id}">Remove</button></div>`).join("") || `<p class="muted">Nothing sent yet. Use “Send to newsprint” on the Breaking, AVO, Wire or article desk.</p>`}</div>
  </section>
  ${L.owner ? `<section class="panel pd"><h2>Who is reminded</h2>
    <p class="muted" style="margin:0">From four hours before each deadline until the edition is approved, every 30 minutes and every 10 in the last hour. You are always reminded; choose who else is.</p>
    <div class="row" style="flex-wrap:wrap;gap:12px">${L.users.map(u => `<label class="row" style="gap:6px"><input type="checkbox" data-rec="${esc(u.id)}" ${L.settings.recipients.includes(u.id) ? "checked" : ""}> <span data-no-tr>${esc(u.name)}</span> <small class="muted">${u.role === "admin" ? "Admin" : "Editor"}</small></label>`).join("")}</div>
    <div class="row"><button class="btn sm green" id="npRec">Save</button></div></section>` : ""}`;
  wire();
}

function page(p, pi, out) {
  const stars = p.key === "stars", hz = S.ed.edition.horoscope?.bn || [];
  return `<div class="np-page"><div class="row" style="justify-content:space-between"><h3 style="margin:0"><span>${PAGE[p.key] || esc(p.title)}</span> <small class="muted">${stars ? "" : `(${digits(p.items.length)})`}</small></h3>
    ${out || stars ? "" : `<button class="btn sm" data-add="${pi}">${S.showAdd === String(pi) ? "Close" : "+ Add a story"}</button>`}</div>
    ${stars ? (hz.length ? `<ol class="np-stars" data-no-tr>${hz.map(t => `<li>${esc(t)}</li>`).join("")}</ol>` : `<p class="muted">The horoscope is written with the draft.</p>`) : ""}
    ${S.showAdd === String(pi) ? addList(pi) : ""}
    ${p.items.map((x, i) => `<div class="np-item ${pi === 0 && i === 0 ? "lead" : ""}">
      ${pi === 0 && i === 0 ? `<span class="tag red">LEAD</span>` : ""}${x.sent ? `<span class="tag amber">SENT</span>` : ""}
      <div class="np-text"><b data-no-tr>${esc(x.title)}</b><small class="muted" data-no-tr>${esc(x.dek || "")}</small>
        <div class="np-media">${(x.media || []).map((m, mi) => `<span class="np-m">${thumb(m) ? `<img src="${esc(thumb(m))}" alt="" loading="lazy">` : `<i>▶</i>`}<small>${m.kind === "img" ? "Picture" : "Video"}</small>${out ? "" : `<button type="button" title="Remove" data-unmedia="${pi}:${i}:${mi}">×</button>`}</span>`).join("") || `<small class="muted">No pictures (set in type only)</small>`}</div></div>
      ${out ? "" : `<div class="np-tools">${pi === 0 && i === 0 ? "" : `<button class="btn sm" data-lead="${pi}:${i}">Make lead</button>`}
        <button class="btn sm" data-up="${pi}:${i}" ${i ? "" : "disabled"}>▲</button><button class="btn sm" data-down="${pi}:${i}" ${i < p.items.length - 1 ? "" : "disabled"}>▼</button>
        <select data-move="${pi}:${i}"><option value="">Move to…</option>${S.ed.edition.pages.map((q, qi) => qi === pi || q.key === "stars" ? "" : `<option value="${qi}">${PAGE[q.key]}</option>`).join("")}</select>
        <button class="btn sm red" data-drop="${pi}:${i}">Remove</button></div>`}
    </div>`).join("")}</div>`;
}
function addList(pi) {
  const used = new Set(S.ed.edition.pages.flatMap(p => p.items.map(x => x.ref)));
  const c = S.cands.filter(x => !used.has(x.ref)).slice(0, 40);
  return `<div class="np-add">${c.map((x, i) => `<div class="row" style="gap:8px"><button class="btn sm green" data-pickc="${pi}:${esc(x.ref)}">Add</button>${x.sent ? `<span class="tag amber">SENT</span>` : ""}<span data-no-tr>${esc(x.title)}</span>${x.media?.length ? `<small class="muted">${digits(x.media.length)} <span>pictures</span></small>` : ""}</div>`).join("") || `<p class="muted">No other stories in this edition's window.</p>`}</div>`;
}

const at = s => s.split(":").map(Number);
function change(fn) { fn(S.ed.edition.pages); S.dirty = true; draw(); }
function wire() {
  $("#npR").onclick = () => load();
  $$("[data-pick]").forEach(b => b.onclick = () => { if (S.dirty && !confirm("Leave without saving your changes?")) return; S.id = b.dataset.pick; S.dirty = false; S.showAdd = ""; openEd(); });
  $$("[data-unpool]").forEach(b => b.onclick = async () => { try { await api(`/api/admin/epaper/pool/${b.dataset.unpool}`, { method: "DELETE" }); load(); } catch (e) { fail(e); } });
  if ($("#npRec")) $("#npRec").onclick = async () => { try { await api("/api/admin/epaper/settings", { method: "PUT", body: { recipients: $$("[data-rec]").filter(x => x.checked).map(x => x.dataset.rec) } }); toast("Saved."); load(); } catch (e) { fail(e); } };
  if (!S.ed) return;
  const id = S.ed.edition.id;
  $$("[data-up]").forEach(b => b.onclick = () => change(P => { const [p, i] = at(b.dataset.up); const L = P[p].items; [L[i - 1], L[i]] = [L[i], L[i - 1]]; }));
  $$("[data-down]").forEach(b => b.onclick = () => change(P => { const [p, i] = at(b.dataset.down); const L = P[p].items; [L[i + 1], L[i]] = [L[i], L[i + 1]]; }));
  $$("[data-drop]").forEach(b => b.onclick = () => change(P => { const [p, i] = at(b.dataset.drop); P[p].items.splice(i, 1); }));
  $$("[data-lead]").forEach(b => b.onclick = () => change(P => { const [p, i] = at(b.dataset.lead); const [x] = P[p].items.splice(i, 1); P[0].items.unshift(x); }));
  $$("[data-move]").forEach(s => s.onchange = () => { if (s.value === "") return; change(P => { const [p, i] = at(s.dataset.move); const [x] = P[p].items.splice(i, 1); P[+s.value].items.push(x); }); });
  $$("[data-unmedia]").forEach(b => b.onclick = () => change(P => { const [p, i, m] = at(b.dataset.unmedia); P[p].items[i].media.splice(m, 1); }));
  $$("[data-add]").forEach(b => b.onclick = () => { S.showAdd = S.showAdd === b.dataset.add ? "" : b.dataset.add; draw(); });
  $$("[data-pickc]").forEach(b => b.onclick = () => { const [p, ...r] = b.dataset.pickc.split(":"), ref = r.join(":"), x = S.cands.find(c => c.ref === ref); if (x) change(P => P[+p].items.push(x)); });
  const save = async () => { if (!S.dirty) return; await api(`/api/admin/epaper/${id}`, { method: "PUT", body: { pages: S.ed.edition.pages } }); S.dirty = false; };
  if ($("#npSave")) $("#npSave").onclick = async () => { try { await save(); toast("Saved."); openEd(); } catch (e) { fail(e); } };
  if ($("#npBuild")) $("#npBuild").onclick = async () => { if (!confirm("Draft this edition again from the latest news? Changes made by hand are lost.")) return; try { await api(`/api/admin/epaper/${id}/build`, { method: "POST" }); S.dirty = false; toast("Drafted again."); openEd(); } catch (e) { fail(e); } };
  if ($("#npOk")) $("#npOk").onclick = async () => { const undo = S.ed.edition.status === "approved"; try { await save(); await api(`/api/admin/epaper/${id}/approve`, { method: "POST", body: { undo } }); toast(undo ? "Approval withdrawn." : "Approved: it prints at its time."); openEd(); load(true); } catch (e) { fail(e); } };
  if ($("#npPrint")) $("#npPrint").onclick = async () => { if (!confirm("Print this edition now? It goes out to readers at once.")) return; try { await save(); toast("Printing: the English and Hindi pages are being made…"); await api(`/api/admin/epaper/${id}/print`, { method: "POST" }); toast("Printed."); openEd(); load(true); } catch (e) { fail(e); } };
}

async function openEd() {
  S.ed = null; S.showAdd = ""; draw();
  try { const r = await api(`/api/admin/epaper/${S.id}`); S.ed = r; S.cands = r.candidates || []; draw(); } catch (e) { fail(e); }
}
async function load(quiet = false) {
  try {
    S.list = await api("/api/admin/epaper");
    if (!S.id) S.id = S.list.next?.[0]?.id || S.list.editions[0]?.id || "";
    if (!S.ed && S.id && !quiet) return openEd();
    if (!quiet || !S.dirty) draw();
  } catch (e) { fail(e); }
}

(async () => {
  const user = await shell("Newsprint desk");
  if (!user) return;
  $("main").innerHTML = `<p class="muted">Loading…</p>`;
  await load(); setInterval(() => { if (!S.dirty && !S.showAdd) load(true); }, 60000);
})();
