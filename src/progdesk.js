// The Segment & bulletin desk: every news bulletin and segment the channels have aired today and
// yesterday, with their stories. Each can be edited, played at once on TV and/or Shorts, archived
// or deleted (src/progs.js).
import { shell, api, toast, fail, esc, $, $$, istClock } from "./crshell.js";
import { digits } from "./i18n.js";

const S = { list: [], tab: "all", archived: false, open: null, edit: null, segNames: {} };
const CH = { h: "Rashtrix TV", v: "Rashtrix Shorts" };
const SEG = { world: "দুনিয়ার খবর", sports: "খেলার খবর", entertainment: "বিনোদন", lifestyle: "লাইফস্টাইল", kolkata10: "শহরের দশ", bangladesh: "বাংলাদেশ", numbers: "খবরের অঙ্ক", onthisday: "আজকের দিনে", soth: "এই ঘণ্টার বড় খবর", markets: "বাজার", weather: "আবহাওয়া" };
const when = t => { try { return istClock(Date.parse(t), false); } catch { return ""; } };
const dayOf = t => new Date(Date.parse(t) + 5.5 * 3600e3).toISOString().slice(0, 10);
const nameOf = p => p.kind === "bulletin" ? (p.short ? "News bulletin (short)" : "News bulletin") : (p.title || SEG[p.name] || p.name);
// A story's headline and line, whatever kind of item it is.
const head = (p, x) => p.kind === "bulletin" ? x.title : x.t || x.lead?.t || x.title || x.quote || x.notice || x.text || (x.map ? "Map" : x.wx ? "Weather" : x.timeline ? "Timeline" : x.pts ? "Key points" : x.photo ? "Photo" : "");
const line = (p, x) => p.kind === "bulletin" ? x.text || "" : x.line || "";
const editable = (p, x) => p.kind === "bulletin" || !(x.lead || x.map || x.wx || x.timeline || x.pts || x.photo);

function draw() {
  const L = S.list.filter(p => S.tab === "all" || p.kind === S.tab);
  const days = [...new Set(L.map(p => dayOf(p.slot)))];
  const today = dayOf(new Date().toISOString());
  $("main").innerHTML = `<section class="panel pd">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>Segment &amp; bulletin desk <small class="muted">(${S.archived ? "archived" : "today and yesterday"} · ${digits(L.length)})</small></h2><button class="btn sm" id="pdR">Refresh</button></div>
    <div class="row ad-filters" style="flex-wrap:wrap;gap:6px">${[["all", "All"], ["bulletin", "News bulletins"], ["segment", "Segments"]].map(([k, l]) => `<button type="button" class="btn sm ${S.tab === k ? "on" : ""}" data-tab="${k}"><span>${l}</span> <small data-no-tr>${digits(S.list.filter(p => k === "all" || p.kind === k).length)}</small></button>`).join("")}
      <button type="button" class="btn sm ${S.archived ? "on" : ""}" id="pdA">${S.archived ? "Back to today and yesterday" : "Archived"}</button></div>
    <p class="muted" style="margin:0">Every bulletin and segment the channels air is recorded here with its stories. Edit one, play it again at once, archive it (kept, out of this list) or delete it. A story whose words are edited is read without its recorded voice.</p>
    ${days.map(d => `<h3 class="ad-group">${d === today ? "Today" : "Yesterday"} <small class="muted" data-no-tr>${esc(new Date(d + "T12:00:00Z").toLocaleDateString("bn-IN", { day: "numeric", month: "long" }))}</small></h3>
      <div class="pd-list">${L.filter(p => dayOf(p.slot) === d).map(card).join("")}</div>`).join("") || `<p class="muted">${S.archived ? "Nothing archived." : "Nothing recorded yet. Bulletins and segments are recorded as the broadcast output airs them."}</p>`}
  </section>`;
  $("#pdR").onclick = load;
  $("#pdA").onclick = () => { S.archived = !S.archived; S.open = null; S.edit = null; load(); };
  $$("[data-tab]").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; draw(); });
  $$("[data-open]").forEach(b => b.onclick = () => { S.open = S.open === b.dataset.open ? null : b.dataset.open; S.edit = null; draw(); });
  $$("[data-edit]").forEach(b => b.onclick = () => { const p = S.list.find(x => x.id === b.dataset.edit); S.open = p.id; S.edit = { id: p.id, items: p.items.map((x, i) => ({ i, title: head(p, x), text: line(p, x) })) }; draw(); });
  $$("[data-play]").forEach(b => b.onclick = () => play(b.dataset.play));
  $$("[data-arch]").forEach(b => b.onclick = async () => { try { await api(`/api/admin/progs/${b.dataset.arch}/archive`, { method: "POST", body: { on: !S.archived } }); toast(S.archived ? "Back in the list." : "Archived."); load(); } catch (e) { fail(e); } });
  $$("[data-del]").forEach(b => b.onclick = async () => { if (!confirm("Delete this for good?")) return; try { await api(`/api/admin/progs/${b.dataset.del}`, { method: "DELETE" }); toast("Deleted."); load(); } catch (e) { fail(e); } });
  if (S.edit) {
    const E = S.edit;
    $$("[data-et]").forEach(t => t.oninput = () => { E.items[+t.dataset.et].title = t.value; });
    $$("[data-ex]").forEach(t => t.oninput = () => { E.items[+t.dataset.ex].text = t.value; });
    $$("[data-erm]").forEach(b => b.onclick = () => { E.items.splice(+b.dataset.erm, 1); draw(); });
    $$("[data-eup]").forEach(b => b.onclick = () => { const k = +b.dataset.eup; if (k > 0) { [E.items[k - 1], E.items[k]] = [E.items[k], E.items[k - 1]]; draw(); } });
    $("#peCancel").onclick = () => { S.edit = null; draw(); };
    $("#peSave").onclick = async () => { try { await api(`/api/admin/progs/${E.id}`, { method: "PUT", body: { items: E.items } }); toast("Saved."); S.edit = null; load(); } catch (e) { fail(e); } };
  }
}

function card(p) {
  const open = S.open === p.id, ed = S.edit?.id === p.id ? S.edit : null;
  return `<div class="ad-story pd-card${open ? " open" : ""}"><div class="ad-body">
    <div class="row" style="gap:6px;flex-wrap:wrap"><span class="tag ${p.kind === "bulletin" ? "red" : "amber"}">${p.kind === "bulletin" ? "BULLETIN" : "SEGMENT"}</span>${p.edited ? '<span class="tag">EDITED</span>' : ""}${p.plays ? `<span class="tag green">PLAYED AGAIN ${digits(p.plays)}×</span>` : ""}<small class="muted">${when(p.slot)} · ${CH[p.channel] || p.channel} · ${digits(p.items.length)} ${p.kind === "bulletin" ? "stories" : "items"}</small></div>
    <b data-no-tr>${esc(nameOf(p))}</b>
    <small class="muted" data-no-tr>${esc(p.items.slice(0, 3).map(x => head(p, x)).filter(Boolean).join(" · "))}${p.items.length > 3 ? " …" : ""}</small>
    ${open && !ed ? `<ol class="pd-items">${p.items.map((x, i) => `<li><b data-no-tr>${esc(head(p, x))}</b>${line(p, x) ? `<small data-no-tr>${esc(line(p, x))}</small>` : ""}${(p.kind === "bulletin" ? x.voice : x.voice || x.lead?.voice?.length) ? "" : '<span class="tag">NO VOICE</span>'}</li>`).join("")}</ol>` : ""}
    ${ed ? `<div class="pd-edit">${ed.items.map((x, k) => { const o = p.items[x.i]; return `<div class="pd-erow"><span class="pd-n">${digits(k + 1)}</span><div class="stack" style="flex:1;gap:6px">${editable(p, o) ? `<input data-et="${k}" value="${esc(x.title)}" data-no-tr><textarea rows="2" data-ex="${k}" data-no-tr>${esc(x.text)}</textarea>` : `<b data-no-tr>${esc(x.title)}</b><small class="muted">(this item is kept as it is)</small>`}</div><div class="stack" style="gap:4px">${k ? `<button class="btn sm" type="button" data-eup="${k}" aria-label="Move up">▲</button>` : ""}<button class="btn sm red" type="button" data-erm="${k}" aria-label="Remove">✕</button></div></div>`; }).join("")}
      <div class="row"><button class="btn green" type="button" id="peSave">Save</button><button class="btn" type="button" id="peCancel">Cancel</button></div></div>` : ""}
    <div class="row" style="flex-wrap:wrap"><button class="btn sm red" data-play="${p.id}">▶ Play now</button><select data-playch="${p.id}" title="Where it plays"><option value="${p.channel}">${CH[p.channel]}</option><option value="hv">TV + Shorts</option><option value="${p.channel === "h" ? "v" : "h"}">${CH[p.channel === "h" ? "v" : "h"]}</option></select>
      <button class="btn sm" data-open="${p.id}">${open ? "Hide stories" : "Stories"}</button><button class="btn sm" data-edit="${p.id}">Edit</button><button class="btn sm" data-arch="${p.id}">${S.archived ? "Unarchive" : "Archive"}</button><button class="btn sm red" data-del="${p.id}">Delete</button></div>
  </div></div>`;
}

async function play(id) {
  const v = $(`[data-playch="${CSS.escape(id)}"]`)?.value || "h", chs = v === "hv" ? ["h", "v"] : [v];
  if (!confirm(`Play this now on ${chs.map(c => CH[c]).join(" and ")}? It cuts in at once (anything on air, a rundown too, stops) and the channel goes back to autopilot after it.`)) return;
  try { const r = await api(`/api/admin/progs/${id}/play`, { method: "POST", body: { channels: chs } }); toast(`On air now (${digits(r.seconds)} s), then back to autopilot.`); load(); } catch (e) { fail(e); }
}

async function load() {
  try { S.list = (await api(`/api/admin/progs${S.archived ? "?archived=1" : ""}`)).progs || []; if (!document.activeElement?.closest?.(".pd-edit")) draw(); } catch (e) { fail(e); }
}

(async () => {
  const user = await shell("Segment & bulletin desk");
  if (!user) return;
  $("main").innerHTML = `<p class="muted">Loading…</p>`;
  await load(); setInterval(() => { if (!S.edit) load(); }, 30000);
})();
