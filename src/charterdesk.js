// The Editorial Charter desk: the channel's tone, its stance subject by subject, the facts that
// must never be wrong, automatic corrections, words to avoid and prefer, special notes, and who has
// access. Binding on everything the system writes (src/charter.js). Only the owner, and the
// people they give access to, can open it.
import { shell, api, toast, fail, esc, $, $$ } from "./crshell.js";

let D = null;
const lines = v => String(v || "").split("\n").map(x => x.trim()).filter(Boolean);
function draw() {
  const c = D.charter;
  $("main").innerHTML = `<section class="panel pd ch-wrap">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>Editorial Charter</h2>
      <div class="row"><button class="btn sm" id="chReset" type="button">Restore the defaults</button><button class="btn green" id="chSave" type="button">Save the charter</button></div></div>
    <p class="muted" style="margin:0">Binding on everything the system writes: wire rewrites, briefs, AVO scripts, headlines, segments and the e-paper. Every writing job carries it in its instructions, and everything written, translations included, passes through the corrections below.</p>

    <h3>Tone</h3>
    <textarea id="chTone" rows="4" data-no-tr>${esc(c.tone)}</textarea>

    <h3>Stance, subject by subject</h3>
    <div class="ch-st">${D.subjects.map(([k, n]) => { const s = c.stances?.[k] || { stance: "neutral", note: "" }; return `<div class="ch-row"><b>${esc(n)}</b>
      <select data-st="${k}">${Object.entries(D.stances).map(([v, l]) => `<option value="${v}" ${s.stance === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <input data-sn="${k}" value="${esc(s.note)}" placeholder="Editorial note for this subject" data-no-tr></div>`; }).join("")}</div>

    <h3>Facts that must never be wrong</h3>
    <p class="muted" style="margin:0">One per line. The system never contradicts these, whatever a source says.</p>
    <textarea id="chFacts" rows="5" data-no-tr>${esc((c.facts || []).join("\n"))}</textarea>

    <h3>Automatic corrections</h3>
    <p class="muted" style="margin:0">Applied to everything written, in every language. “Find” becomes “Replace with”, unless the word in the last box already stands just before it.</p>
    <div class="ch-cor" id="chCor">${(c.corrections || []).map(r => corRow(r)).join("")}</div>
    <button class="btn sm" type="button" id="chCorAdd">+ Add a correction</button>

    <div class="ch-two"><div><h3>Never use these words</h3><textarea id="chAvoid" rows="5" data-no-tr placeholder="One per line">${esc((c.avoid || []).join("\n"))}</textarea></div>
      <div><h3>Prefer these words</h3><textarea id="chPrefer" rows="5" data-no-tr placeholder="One per line">${esc((c.prefer || []).join("\n"))}</textarea></div></div>

    <h3>Special editorial notes</h3>
    <textarea id="chNotes" rows="6" data-no-tr placeholder="Anything the writers must keep in mind">${esc(c.notes || "")}</textarea>

    ${D.owner ? `<h3>Who can open this desk</h3><p class="muted" style="margin:0">You always can. Tick the people who may read and change the charter.</p>
    <div class="row" style="flex-wrap:wrap;gap:14px">${D.staff.map(u => `<label class="row" style="gap:6px"><input type="checkbox" data-acc="${esc(u.id)}" ${(c.access || []).includes(u.id) ? "checked" : ""}> <span data-no-tr>${esc(u.name)}</span> <small class="muted">${u.role === "admin" ? "Admin" : "Editor"}</small></label>`).join("") || `<span class="muted">No editors yet.</span>`}</div>` : ""}
  </section>`;
  $("#chCorAdd").onclick = () => { $("#chCor").insertAdjacentHTML("beforeend", corRow({})); wireCor(); };
  wireCor();
  $("#chSave").onclick = save;
  $("#chReset").onclick = () => { if (!confirm("Restore the default charter? Your changes are replaced (save to keep it).")) return; D.charter = { ...structuredClone(D.defaults), access: D.charter.access }; draw(); toast("Defaults restored. Save to keep them."); };
}
const corRow = r => `<div class="ch-crow"><input data-c="find" value="${esc(r.find || "")}" placeholder="Find" data-no-tr><span>→</span><input data-c="replace" value="${esc(r.replace || "")}" placeholder="Replace with" data-no-tr><input data-c="unless" value="${esc(r.unless || "")}" placeholder="unless after (optional)" data-no-tr><button class="btn sm red" type="button" data-cdel>✕</button></div>`;
function wireCor() { $$("[data-cdel]").forEach(b => b.onclick = () => b.closest(".ch-crow").remove()); }
async function save() {
  const body = {
    tone: $("#chTone").value.trim(),
    stances: Object.fromEntries(D.subjects.map(([k]) => [k, { stance: $(`[data-st="${k}"]`).value, note: $(`[data-sn="${k}"]`).value.trim() }])),
    facts: lines($("#chFacts").value),
    corrections: $$(".ch-crow").map(r => ({ find: $('[data-c="find"]', r).value.trim(), replace: $('[data-c="replace"]', r).value.trim(), unless: $('[data-c="unless"]', r).value.trim() })).filter(r => r.find && r.replace),
    avoid: lines($("#chAvoid").value), prefer: lines($("#chPrefer").value),
    notes: $("#chNotes").value.trim(),
    access: D.owner ? $$("[data-acc]").filter(x => x.checked).map(x => x.dataset.acc) : D.charter.access
  };
  try { await api("/api/admin/charter", { method: "PUT", body }); toast("Charter saved. Everything written from now on follows it."); load(); } catch (e) { fail(e); }
}
async function load() {
  try { D = await api("/api/admin/charter"); draw(); }
  catch (e) { $("main").innerHTML = `<div class="cr-denied"><h2>Editorial Charter</h2><p>${esc(e.message)}</p></div>`; }
}
(async () => {
  const user = await shell("Editorial Charter");
  if (!user) return;
  $("main").innerHTML = `<p class="muted">Loading…</p>`;
  load();
})();
