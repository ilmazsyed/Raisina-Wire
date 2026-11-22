// The LiveFeed desk (control room): cutting the channels to a YouTube or Facebook live.
//   - Add a live: paste its link, look at it in the preview first (with its sound, to check the
//     audio), then add it to a channel.
//   - Lives: each one previewed, cut on air, or taken off (back to the running order).
//   - On air: what each channel has on air now (muted, with a button to listen).
//   - The live split 60:40: the live at 60 (left on Rashtrix TV, top on Shorts) and the desk's
//     pointers at 40, up to 24 in eight sets of three; the line under the live.
// The page refreshes the lives and the monitors only: what is being typed is never redrawn.
import "./tv.css";
import { shell, api, toast, fail, esc, $, $$ } from "./crshell.js";
import { mountTV } from "./engine.js";
import { digits } from "./i18n.js";

const S = { d: null, sets: [], dirty: false, mon: {}, listen: {}, pv: null, sound: false };
const CH = { h: "Rashtrix TV", v: "Rashtrix Shorts" };
const SETS = 8, PER = 3, MAX = 24;
const blankSets = () => Array.from({ length: SETS }, (_, i) => ({ id: `s${i + 1}`, live: false, points: ["", "", ""] }));

// A link (or a saved live's id) as something the preview can play.
function playable(ref) {
  const u = String(ref || "").trim();
  if (u.startsWith("fb:")) return { kind: "fb", url: u.slice(3) };
  if (/^[\w-]{11}$/.test(u)) return { kind: "yt", id: u };
  const yt = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: "yt", id: yt[1] };
  if (/^https:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\/\S+$/i.test(u)) return { kind: "fb", url: u };
  return null;
}
const frameSrc = (p, sound) => p.kind === "yt"
  ? `https://www.youtube-nocookie.com/embed/${p.id}?autoplay=1&mute=${sound ? 0 : 1}&playsinline=1&rel=0&modestbranding=1`
  : `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(p.url)}&show_text=false&autoplay=true&mute=${sound ? 0 : 1}&width=1280`;

// ---- the preview ----
function drawPreview() {
  const host = $("#lfPv"), p = S.pv;
  if (!p) { host.innerHTML = `<div class="lf-empty">Paste a live link above and press Preview, or press Preview on a live below.</div>`; return; }
  const saved = p.srcId ? (S.d?.lives || []).find(x => x.id === p.srcId) : null;
  host.innerHTML = `<div class="lf-frame"><iframe src="${esc(frameSrc(p, S.sound))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Preview"></iframe></div>
    <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">
      <span class="tag ${p.kind === "fb" ? "" : "red"}">${p.kind === "fb" ? "FACEBOOK" : "YOUTUBE"}</span><b data-no-tr style="flex:1;min-width:160px">${esc(p.title || p.id || p.url)}</b>
      <button class="btn sm ${S.sound ? "green" : ""}" type="button" id="lfSound">${S.sound ? "🔊 Sound on: listening" : "🔇 Check the audio"}</button>
      ${saved ? (saved.on_air ? `<button class="btn sm" type="button" data-air="${esc(saved.id)}" data-v="0">Back to the running order</button>` : `<button class="btn sm red" type="button" data-air="${esc(saved.id)}" data-v="1">Cut to this live</button>`)
        : `<select id="lfPvCh"><option value="h">Rashtrix TV</option><option value="v">Rashtrix Shorts</option></select><button class="btn sm" type="button" id="lfPvAdd">Add</button><button class="btn sm red" type="button" id="lfPvCut">Add and cut live</button>`}
      <button class="btn sm" type="button" id="lfPvX">Close</button></div>
    <p class="muted" style="margin:0">${S.sound ? "Listen for a few seconds. If there is no sound, the live has none or has not started yet." : "The preview plays muted. Press Check the audio to hear it before you cut to it."}</p>`;
  $("#lfSound").onclick = () => { S.sound = !S.sound; drawPreview(); };
  $("#lfPvX").onclick = () => { S.pv = null; S.sound = false; drawPreview(); };
  $("#lfPvAdd")?.addEventListener("click", () => addLive(p.link, $("#lfPvCh").value, p.title, false));
  $("#lfPvCut")?.addEventListener("click", () => addLive(p.link, $("#lfPvCh").value, p.title, true));
  wireAir(host);
}
function preview(ref, extra = {}) {
  const p = playable(ref);
  if (!p) return toast("Paste a YouTube or Facebook live link.", true);
  S.pv = { ...p, ...extra }; S.sound = false; drawPreview();
  $("#lfPv").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
async function addLive(link, channel, title, cut) {
  if (cut && !confirm(`Cut every screen on ${CH[channel]} to this live now?`)) return;
  try {
    const r = await api("/api/admin/tv/sources", { method: "POST", body: { channel, ref: link, title: title || "", kind: "live" } });
    if (cut) await api(`/api/admin/tv/sources/${encodeURIComponent(r.id)}`, { method: "PUT", body: { onAir: true } });
    toast(cut ? "The live is on air." : "Live added.");
    $("#lfLink").value = ""; $("#lfTitle").value = "";
    await refresh(); if (S.pv) { S.pv.srcId = r.id; drawPreview(); }
  } catch (e) { fail(e); }
}
function wireAir(root) {
  $$("[data-air]", root).forEach(b => b.onclick = async () => {
    const on = b.dataset.v === "1", x = (S.d.lives || []).find(y => y.id === b.dataset.air);
    if (on && !confirm(`Cut every screen on ${CH[x?.channel] || "the channel"} to this live now?`)) return;
    try { await api(`/api/admin/tv/sources/${encodeURIComponent(b.dataset.air)}`, { method: "PUT", body: { onAir: on } }); toast(on ? "The live is on air." : "Back to the running order."); await refresh(); if (S.pv) drawPreview(); } catch (e) { fail(e); }
  });
}

// ---- the lives ----
function drawLives() {
  const L = S.d.lives || [];
  $("#lfList").innerHTML = L.map(x => `<div class="bd-live${x.on_air ? " on" : ""}"><div><b data-no-tr>${esc(x.title || x.yt_id)}</b><small class="muted">${String(x.yt_id).startsWith("fb:") ? '<span class="tag">FACEBOOK</span> ' : '<span class="tag">YOUTUBE</span> '}${CH[x.channel]} · ${String(x.yt_id).startsWith("fb:") ? "" : x.live_now ? '<span class="tag green">BROADCASTING</span>' : '<span class="tag">NOT LIVE</span>'}${x.on_air ? ' <span class="tag red">ON AIR</span>' : ""}${x.last_error ? ` · <span style="color:#ff6b6b">${esc(x.last_error)}</span>` : ""}</small></div>
    <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn sm" type="button" data-pv="${esc(x.id)}">Preview</button>
    ${x.on_air ? `<button class="btn sm" type="button" data-air="${esc(x.id)}" data-v="0">Back to the running order</button>` : `<button class="btn sm red" type="button" data-air="${esc(x.id)}" data-v="1">Cut live</button><button class="btn sm" type="button" data-rm="${esc(x.id)}">Remove</button>`}</div></div>`).join("")
    || `<p class="muted">No lives yet. Paste a YouTube or Facebook live link above.</p>`;
  $$("[data-pv]").forEach(b => b.onclick = () => { const x = L.find(y => y.id === b.dataset.pv); if (x) preview(x.yt_id, { title: x.title, srcId: x.id }); });
  $$("[data-rm]").forEach(b => b.onclick = async () => { if (!confirm("Remove this live from the list?")) return; try { await api(`/api/admin/tv/sources/${encodeURIComponent(b.dataset.rm)}`, { method: "DELETE" }); toast("Removed."); if (S.pv?.srcId === b.dataset.rm) { S.pv = null; drawPreview(); } refresh(); } catch (e) { fail(e); } });
  wireAir($("#lfList"));
}

// ---- the split and its pointers ----
function drawSplit() {
  const d = S.d.desk, n = S.sets.reduce((k, x) => k + x.points.filter(p => p.trim()).length, 0), live = S.sets.filter(x => x.live && x.points.some(p => p.trim())).length;
  $(".bd-split").innerHTML = `<div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>Live split 60:40</h2><span class="muted"><span data-no-tr>${digits(n)} / ${digits(MAX)}</span> pointers · <span data-no-tr>${digits(live)}</span> sets on air</span></div>
    <div class="row" style="flex-wrap:wrap;gap:10px">${Object.entries(CH).map(([ch, name]) => `<button class="btn ${d.split[ch] ? "green" : ""}" type="button" data-split="${ch}" data-v="${d.split[ch] ? 0 : 1}">${name}: ${d.split[ch] ? "Split on" : "Split off"}</button>`).join("")}
      <label style="flex-direction:row;align-items:center;gap:6px">Each set on screen<select id="spEvery">${[6, 8, 10, 12, 15, 20, 30].map(s => `<option value="${s}"${d.every === s ? " selected" : ""}>${digits(s)} s</option>`).join("")}</select></label></div>
    <label>Line under the live (optional; the live's name if empty)<input id="spTitle" maxlength="80" value="${esc(d.title || "")}" data-no-tr></label>
    <div class="bd-sets">${S.sets.map((x, i) => `<div class="bd-set${x.live ? " live" : ""}" data-set="${i}"><div class="row" style="justify-content:space-between"><b>Set <span data-no-tr>${digits(i + 1)}</span></b>${x.live ? '<span class="tag red">ON AIR</span>' : '<span class="tag">OFF</span>'}</div>
      ${x.points.map((p, j) => `<label class="bd-pt"><span data-no-tr>${digits(i * PER + j + 1)}</span><textarea rows="2" maxlength="160" data-pt="${i}:${j}" data-no-tr placeholder="পয়েন্টার লিখুন">${esc(p)}</textarea></label>`).join("")}
      <div class="row"><button class="btn sm ${x.live ? "" : "red"}" type="button" data-live="${i}">${x.live ? "Take off air" : "Put live"}</button><button class="btn sm" type="button" data-clr="${i}">Clear</button></div></div>`).join("")}</div>
    <div class="row" style="flex-wrap:wrap"><button class="btn green" type="button" id="spSave">Save pointers</button><button class="btn" type="button" id="spAll">Put all filled sets live</button><button class="btn" type="button" id="spNone">Take all off air</button></div>
    <p class="muted" style="margin:0">Write the pointers, then put a set live: it is on screen within a second. The sets on air take turns, three pointers at a time. Turn the split on for the channel the live is on.</p>`;
  $$("[data-pt]").forEach(t => t.oninput = () => { const [i, j] = t.dataset.pt.split(":").map(Number); S.sets[i].points[j] = t.value; S.dirty = true; $("#spSave").classList.add("red"); });
  $$("[data-live]").forEach(b => b.onclick = () => { const x = S.sets[+b.dataset.live]; if (!x.live && !x.points.some(p => p.trim())) return toast("Write a pointer in this set first.", true); x.live = !x.live; save(x.live ? "Set is on air." : "Set taken off air."); });
  $$("[data-clr]").forEach(b => b.onclick = () => { const x = S.sets[+b.dataset.clr]; x.points = ["", "", ""]; x.live = false; save("Set cleared."); });
  $$("[data-split]").forEach(b => b.onclick = () => saveRaw({ split: { [b.dataset.split]: b.dataset.v === "1" } }, b.dataset.v === "1" ? "Split on." : "Split off."));
  $("#spEvery").onchange = e => saveRaw({ every: Number(e.target.value) }, "Saved.");
  $("#spTitle").onchange = e => saveRaw({ title: e.target.value }, "Saved.");
  $("#spSave").onclick = () => save("Pointers saved. Sets on air update at once.");
  $("#spAll").onclick = () => { S.sets.forEach(x => { x.live = x.points.some(p => p.trim()); }); save("Every filled set is on air."); };
  $("#spNone").onclick = () => { S.sets.forEach(x => { x.live = false; }); save("All sets off air."); };
}
async function saveRaw(body, msg) { try { const r = await api("/api/admin/tv/desk/live", { method: "PUT", body }); S.d.desk = r.desk; toast(msg); drawSplit(); } catch (e) { fail(e); } }
async function save(msg) { try { const r = await api("/api/admin/tv/desk/live", { method: "PUT", body: { sets: S.sets } }); S.d.desk = r.desk; S.dirty = false; toast(msg); drawSplit(); } catch (e) { fail(e); } }

// ---- on air: each channel's program, muted; Listen turns its sound on ----
function monitors() {
  $(".bd-mons").innerHTML = Object.entries(CH).map(([ch, n]) => `<div class="bd-mon ${ch}"><div class="row" style="justify-content:space-between"><small class="muted">${n} · on air</small><button class="btn sm" type="button" data-listen="${ch}">🔇 Listen</button></div><div class="bd-screen" id="mon-${ch}"></div></div>`).join("");
  const mount = (ch, muted) => { S.mon[ch]?.destroy?.(); $(`#mon-${ch}`).innerHTML = ""; S.mon[ch] = mountTV($(`#mon-${ch}`), { channel: ch, mode: "program", muted }); };
  for (const ch of Object.keys(CH)) mount(ch, true);
  $$("[data-listen]").forEach(b => b.onclick = () => {
    const ch = b.dataset.listen; S.listen[ch] = !S.listen[ch];
    if (S.listen[ch] && S.mon[ch]?.unmute) S.mon[ch].unmute(); else mount(ch, !S.listen[ch]);
    b.textContent = S.listen[ch] ? "🔊 Listening" : "🔇 Listen"; b.classList.toggle("green", !!S.listen[ch]);
  });
}

// The lives and their state every fifteen seconds; the pointers only when nobody is writing.
async function refresh() {
  try {
    S.d = await api("/api/admin/tv/desk");
    drawLives();
    const g = S.d.desk.sets || [];
    if (!S.dirty && !document.activeElement?.closest?.(".bd-split")) { S.sets = blankSets().map((b, i) => g[i] ? { id: g[i].id || b.id, live: !!g[i].live, points: [0, 1, 2].map(j => g[i].points?.[j] || "") } : b); drawSplit(); }
  } catch (e) { fail(e); }
}

(async () => {
  const user = await shell("LiveFeed desk");
  if (!user) return;
  $("main").innerHTML = `<div class="bd-wrap lf-wrap"><div class="bd-col">
      <section class="panel"><h2>Add a live</h2>
        <form class="row" id="lfAdd" style="flex-wrap:wrap" autocomplete="off"><input id="lfLink" required placeholder="YouTube or Facebook live link" style="flex:3;min-width:220px" data-no-tr>
          <select id="lfCh"><option value="h">Rashtrix TV</option><option value="v">Rashtrix Shorts</option></select>
          <input id="lfTitle" placeholder="Name on screen (optional)" style="flex:2;min-width:160px" data-no-tr>
          <button class="btn" type="button" id="lfPrev">Preview</button><button class="btn green" type="submit">Add live</button></form>
        <p class="muted" style="margin:0">Preview a link first to see the picture and check its sound. A YouTube live goes on screen only while it is broadcasting; a Facebook live goes on screen when you cut to it.</p></section>
      <section class="panel"><h2>Preview</h2><div id="lfPv"></div></section>
      <section class="panel"><h2>Lives</h2><div class="bd-livelist" id="lfList"><p class="muted">Loading…</p></div></section>
    </div>
    <div class="bd-col"><section class="panel bd-monp"><h2>On air</h2><div class="bd-mons"></div></section><section class="panel bd-split"></section></div></div>`;
  $("#lfAdd").onsubmit = e => { e.preventDefault(); addLive($("#lfLink").value.trim(), $("#lfCh").value, $("#lfTitle").value.trim(), false); };
  $("#lfPrev").onclick = () => { const link = $("#lfLink").value.trim(); preview(link, { link, title: $("#lfTitle").value.trim() }); };
  drawPreview();
  await refresh(); monitors(); setInterval(() => { if (!document.hidden) refresh(); }, 15000);
})();
