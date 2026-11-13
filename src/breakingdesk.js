// The Breaking desk (control room): every breaking goes out from here, and the live desk.
//   - Break in: the headline on both channels or one (with music), cleared from here too; the
//     desk's log of every breaking. Each breaking is also read as an AVO story (src/avo.js).
//   - Lives: the YouTube lives (paste a link, cut it on air, back to the running order).
//   - The live split: a live on air at 60 (left on Rashtrix TV, top on Shorts) and the desk's
//     pointers at 40. Up to 24 pointers in eight sets of three; each set is put live or taken off,
//     and the sets on air take turns on screen. A change is on screen within a second
//     (src/worker.js saveLiveDesk, src/control.js "split", src/engine.js drawSplit).
import { shell, api, toast, fail, esc, $, $$, istClock } from "./crshell.js";
import { mountTV } from "./engine.js";
import { digits } from "./i18n.js";

const S = { d: null, sets: [], dirty: false, mon: {} };
const CH = { h: "Rashtrix TV", v: "Rashtrix Shorts" };
const SETS = 8, PER = 3, MAX = 24;
const blankSets = () => Array.from({ length: SETS }, (_, i) => ({ id: `s${i + 1}`, live: false, points: ["", "", ""] }));
const when = t => { try { return istClock(Date.parse(t), false); } catch { return ""; } };

function drawBreak() {
  const d = S.d, on = Object.entries(d.breaking || {}).filter(([, b]) => b);
  $(".bd-break").innerHTML = `<h2>Break in now</h2>
    ${on.length ? `<div class="bd-onair"><span class="tag red">BREAKING ON AIR</span>${on.map(([ch, b]) => `<span><b data-no-tr>${esc(b.text)}</b> <small class="muted">${CH[ch]} · ${when(b.at)}</small></span>`).join("")}</div>` : ""}
    <label>Breaking headline (Bengali, up to 160 characters)<textarea id="bText" rows="3" maxlength="160" data-no-tr placeholder="ব্রেকিং শিরোনাম লিখুন"></textarea><small class="muted" id="bCount"></small></label>
    <div class="row" style="flex-wrap:wrap;gap:14px">
      <label class="chk"><input type="checkbox" id="bH" checked> Rashtrix TV</label>
      <label class="chk"><input type="checkbox" id="bV" checked> Rashtrix Shorts</label>
      <label class="chk"><input type="checkbox" id="bMusic" checked> Music</label>
      <label style="flex-direction:row;align-items:center;gap:6px">Seconds<select id="bSec"><option>10</option><option>15</option><option selected>20</option><option>30</option><option>45</option><option>60</option></select></label>
    </div>
    <div class="row"><button class="btn red bd-fire" id="bGo">Break in</button><button class="btn" id="bClear">Clear breaking</button></div>
    <p class="muted" style="margin:0">It goes on every screen of the channels chosen at once, and is read as an AVO story within a minute.</p>
    <details ${d.log?.length ? "open" : ""}><summary class="muted">Breaking log (${digits(d.log?.length || 0)})</summary><ul class="bd-log">${(d.log || []).map(x => `<li><small class="muted">${when(x.at)} · ${(x.channels || []).map(c => CH[c]).join(", ")} · ${esc(x.by || "")}</small>${x.act === "clear" ? `<span class="muted">Cleared</span>` : `<b data-no-tr>${esc(x.text)}</b>`}</li>`).join("") || `<li class="muted">Nothing yet.</li>`}</ul></details>`;
  const t = $("#bText"), count = () => { $("#bCount").textContent = `${digits(t.value.trim().length)} / ${digits(160)}`; };
  t.oninput = count; count();
  const chans = () => [...($("#bH").checked ? ["h"] : []), ...($("#bV").checked ? ["v"] : [])];
  $("#bGo").onclick = async () => {
    const text = t.value.trim(), chs = chans();
    if (!text) return toast("Write the breaking headline.", true);
    if (!chs.length) return toast("Choose a channel.", true);
    if (!confirm("Break in on every screen now?")) return;
    try { await api("/api/admin/tv/desk/breaking", { method: "POST", body: { text, seconds: Number($("#bSec").value), music: $("#bMusic").checked, channels: chs } }); toast("Breaking news is going out to every screen."); t.value = ""; load(); } catch (e) { fail(e); }
  };
  $("#bClear").onclick = async () => { const chs = chans(); if (!chs.length) return toast("Choose a channel.", true); try { await api("/api/admin/tv/desk/breaking", { method: "POST", body: { clear: true, channels: chs } }); toast("Cleared."); load(); } catch (e) { fail(e); } };
}

function drawLives() {
  const L = S.d.lives || [];
  $(".bd-lives").innerHTML = `<h2>Lives</h2>
    <form class="row" id="lAdd" style="flex-wrap:wrap"><input name="ref" required placeholder="YouTube live link or channel address" style="flex:3;min-width:220px" data-no-tr><select name="channel"><option value="h">Rashtrix TV</option><option value="v">Rashtrix Shorts</option></select><input name="title" placeholder="Name on screen (optional)" style="flex:2;min-width:160px" data-no-tr><button class="btn">Add live</button></form>
    <div class="bd-livelist">${L.map(x => `<div class="bd-live${x.on_air ? " on" : ""}"><div><b data-no-tr>${esc(x.title || x.yt_id)}</b><small class="muted">${CH[x.channel]} · ${x.live_now ? '<span class="tag green">BROADCASTING</span>' : '<span class="tag">NOT LIVE</span>'}${x.on_air ? ' <span class="tag red">ON AIR</span>' : ""}${x.last_error ? ` · <span style="color:#ff6b6b">${esc(x.last_error)}</span>` : ""}</small></div>
      ${x.on_air ? `<button class="btn" data-air="${esc(x.id)}" data-v="0">Back to the running order</button>` : `<button class="btn red" data-air="${esc(x.id)}" data-v="1">Cut live</button>`}</div>`).join("") || `<p class="muted">No lives yet. Paste a YouTube live link above.</p>`}</div>
    <p class="muted" style="margin:0">A live goes on screen only while it is broadcasting. With the split on, it plays at 60 and the pointers at 40.</p>`;
  $("#lAdd").onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.currentTarget)); try { await api("/api/admin/tv/sources", { method: "POST", body: { channel: v.channel, ref: v.ref, title: v.title, kind: "live" } }); toast("Live added."); load(); } catch (err) { fail(err); } };
  $$("[data-air]").forEach(b => b.onclick = async () => { const on = b.dataset.v === "1"; if (on && !confirm("Cut every screen on this channel to this live now?")) return;
    try { await api(`/api/admin/tv/sources/${encodeURIComponent(b.dataset.air)}`, { method: "PUT", body: { onAir: on } }); toast(on ? "The live is on air." : "Back to the running order."); load(); } catch (e) { fail(e); } });
}

function drawSplit() {
  const d = S.d.desk, n = S.sets.reduce((k, x) => k + x.points.filter(p => p.trim()).length, 0), live = S.sets.filter(x => x.live && x.points.some(p => p.trim())).length;
  $(".bd-split").innerHTML = `<div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>Live split 60:40</h2><span class="muted">${digits(n)} / ${digits(MAX)} pointers · ${digits(live)} sets on air</span></div>
    <div class="row" style="flex-wrap:wrap;gap:10px">${Object.entries(CH).map(([ch, name]) => `<button class="btn ${d.split[ch] ? "green" : ""}" data-split="${ch}" data-v="${d.split[ch] ? 0 : 1}">${name}: ${d.split[ch] ? "Split on" : "Split off"}</button>`).join("")}
      <label style="flex-direction:row;align-items:center;gap:6px">Each set on screen<select id="spEvery">${[6, 8, 10, 12, 15, 20, 30].map(s => `<option value="${s}"${d.every === s ? " selected" : ""}>${digits(s)} s</option>`).join("")}</select></label></div>
    <label>Line under the live (optional; the live's name if empty)<input id="spTitle" maxlength="80" value="${esc(d.title || "")}" data-no-tr></label>
    <div class="bd-sets">${S.sets.map((x, i) => `<div class="bd-set${x.live ? " live" : ""}" data-set="${i}"><div class="row" style="justify-content:space-between"><b>Set ${digits(i + 1)}</b>${x.live ? '<span class="tag red">ON AIR</span>' : '<span class="tag">OFF</span>'}</div>
      ${x.points.map((p, j) => `<label class="bd-pt"><span>${digits(i * PER + j + 1)}</span><textarea rows="2" maxlength="160" data-pt="${i}:${j}" data-no-tr placeholder="পয়েন্টার লিখুন">${esc(p)}</textarea></label>`).join("")}
      <div class="row"><button class="btn sm ${x.live ? "" : "red"}" data-live="${i}">${x.live ? "Take off air" : "Put live"}</button><button class="btn sm" data-clr="${i}">Clear</button></div></div>`).join("")}</div>
    <div class="row" style="flex-wrap:wrap"><button class="btn green" id="spSave">Save pointers${S.dirty ? " •" : ""}</button><button class="btn" id="spAll">Put all filled sets live</button><button class="btn" id="spNone">Take all off air</button></div>
    <p class="muted" style="margin:0">Write the pointers, then put a set live: it is on screen within a second. The sets on air take turns, three pointers at a time. Turn the split on for the channel the live is on.</p>`;
  $$("[data-pt]").forEach(t => t.oninput = () => { const [i, j] = t.dataset.pt.split(":").map(Number); S.sets[i].points[j] = t.value; S.dirty = true; $("#spSave").textContent = "Save pointers •"; });
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

// Program monitors: what each channel has on air now (muted).
function monitors() {
  $(".bd-mons").innerHTML = Object.entries(CH).map(([ch, n]) => `<div class="bd-mon ${ch}"><small class="muted">${n} · on air</small><div class="bd-screen" id="mon-${ch}"></div></div>`).join("");
  for (const ch of Object.keys(CH)) S.mon[ch] = mountTV($(`#mon-${ch}`), { channel: ch, mode: "program", muted: true });
}

async function load() {
  try {
    S.d = await api("/api/admin/tv/desk");
    if (!S.dirty) { const g = S.d.desk.sets || []; S.sets = blankSets().map((b, i) => g[i] ? { id: g[i].id || b.id, live: !!g[i].live, points: [0, 1, 2].map(j => g[i].points?.[j] || "") } : b); }
    drawBreak(); drawLives();
    if (!document.activeElement?.closest?.(".bd-split")) drawSplit();
  } catch (e) { fail(e); }
}

(async () => {
  const user = await shell("Breaking desk");
  if (!user) return;
  $("main").innerHTML = `<div class="bd-wrap"><div class="bd-col"><section class="panel bd-break"><p class="muted">Loading…</p></section><section class="panel bd-lives"></section><section class="panel bd-monp"><h2>On air</h2><div class="bd-mons"></div></section></div>
    <section class="panel bd-split"></section></div>`;
  await load(); monitors(); setInterval(load, 20000);
})();
