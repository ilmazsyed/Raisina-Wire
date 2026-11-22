// The Content Library desk: everything the channels can air from the last 36 hours, in one place
// (src/library.js). YouTube playlist by playlist (playlists are added here and only here), the
// lives, every AVO story and the uploaded clips; each with a preview, Keep and Delete. Anything not
// kept clears after 36 hours (a video counts from when it came into the library).
import { shell, api, toast, fail, esc, $, $$, fmt } from "./crshell.js";
import { digits } from "./i18n.js";
import { mountTV } from "./engine.js";
import "./library.css";

const S = { d: null, tab: "yt", ch: "all", age: "all", q: "", kind: "all", showDel: false, sel: new Set(), open: new Set() };
const CH = { h: "TV", v: "Shorts" };
const KIND = { avo: "AVO", byte: "AVO + byte", "byte-phone": "AVO + byte + phone-in", phone: "AVO + phone-in", explainer: "Explainer AVO", full: "Full-video AVO", breaking: "Breaking AVO" };
const H = 3600e3;
const hoursAgo = t => (Date.now() - (Date.parse(t) || Date.now())) / H;
const ago = t => { const h = hoursAgo(t); return h < 1 ? `${digits(Math.max(1, Math.round(h * 60)))} min ago` : `${digits(Math.round(h))} h ago`; };
const clears = t => { if (!t) return `<span class="lb-kept">Kept</span>`; const h = (Date.parse(t) - Date.now()) / H; return `<span class="lb-clear${h < 6 ? " soon" : ""}">${h <= 0 ? "Clears now" : `Clears in ${digits(Math.max(1, Math.round(h)))} h`}</span>`; };
const band = t => { const h = hoursAgo(t); return h < 12 ? "0-12" : h < 24 ? "12-24" : h < 36 ? "24-36" : "old"; };
const used = x => `${x.aired ? `<span class="lb-use">Aired ${digits(x.aired)}×${x.lastAired ? ` · last ${ago(x.lastAired)}` : ""}</span>` : ""}${(x.inRundowns || []).map(r => `<span class="lb-use rd" title="Still to air in this rundown" data-no-tr>${esc(r)}</span>`).join("")}`;
const ageOk = (t, kept) => S.age === "all" || (S.age === "kept" ? kept : band(t) === S.age);
const qOk = t => !S.q || String(t || "").toLowerCase().includes(S.q);

async function load() {
  try { S.d = await api("/api/admin/library"); draw(); } catch (e) { fail(e); }
}

function draw() {
  const d = S.d; if (!d) return;
  const vids = d.playlists.flatMap(p => p.videos).filter(v => !v.deleted);
  $("main").innerHTML = `<div class="lb">
    <section class="lb-top">
      <div class="lb-stats">
        <div><b>${digits(vids.length)}</b><span>YouTube videos</span></div>
        <div><b>${digits(d.avo.length)}</b><span>AVO stories</span></div>
        <div><b>${digits(d.clips.length)}</b><span>Clips</span></div>
        <div><b>${digits(d.lives.length)}</b><span>Lives</span></div>
        <div class="lb-rule"><b>${digits(d.hours)} h</b><span>Everything not kept clears after ${digits(d.hours)} hours</span></div>
      </div>
      <div class="lb-tabs" role="tablist">${[["yt", "YouTube playlists"], ["avo", "AVO stories"], ["clips", "Clips"], ["lives", "Lives"]].map(([k, l]) => `<button class="btn${S.tab === k ? " on" : ""}" data-tab="${k}" role="tab">${l}</button>`).join("")}</div>
      <div class="lb-filters">
        <input type="search" id="lbQ" placeholder="Search" value="${esc(S.q)}">
        <select id="lbCh"><option value="all">TV and Shorts</option><option value="h" ${S.ch === "h" ? "selected" : ""}>TV only</option><option value="v" ${S.ch === "v" ? "selected" : ""}>Shorts only</option></select>
        <select id="lbAge">${[["all", "Any age"], ["0-12", "0 to 12 hours"], ["12-24", "12 to 24 hours"], ["24-36", "24 to 36 hours"], ["kept", "Kept"]].map(([k, l]) => `<option value="${k}" ${S.age === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${S.tab === "yt" ? `<label class="lb-chk"><input type="checkbox" id="lbDel" ${S.showDel ? "checked" : ""}> Show deleted</label>` : ""}
        <button class="btn" id="lbReload">Refresh list</button>
      </div>
      <div class="lb-bulk" ${S.sel.size ? "" : "hidden"}><b>${digits(S.sel.size)} selected</b><button class="btn sm green" data-bulk="keep">Keep</button><button class="btn sm" data-bulk="unkeep">Stop keeping</button><button class="btn sm red" data-bulk="del">Delete</button><button class="btn sm" data-bulk="none">Clear selection</button></div>
    </section>
    <section class="lb-body">${S.tab === "yt" ? drawYT() : S.tab === "avo" ? drawAvo() : S.tab === "clips" ? drawClips() : drawLives()}</section></div>`;
  wire();
}

/* ---------- YouTube ---------- */
function drawYT() {
  const d = S.d;
  const pls = d.playlists.filter(p => S.ch === "all" || p.ch === S.ch);
  return `<form class="panel lb-add" id="addPl"><h2>Add a playlist</h2><p class="muted">Playlists are added here and only here. Paste a playlist (or a channel's) address from the Rashtrix YouTube channel; its videos come in within a minute.</p>
      <div class="row"><select name="channel"><option value="h">Rashtrix TV (16:9)</option><option value="v">Rashtrix Shorts (9:16)</option></select><input name="ref" required placeholder="https://www.youtube.com/playlist?list=…" style="flex:2"><input name="title" placeholder="Name (optional)"><button class="btn red">Add playlist</button></div></form>
    ${pls.length ? pls.map(p => {
      const list = p.videos.filter(v => (S.showDel || !v.deleted) && qOk(v.title) && ageOk(v.addedAt, !!v.keep || p.keepAll));
      const open = S.open.has(p.id) || S.q || pls.length <= 3;
      return `<article class="panel lb-pl${p.active ? "" : " off"}">
        <header><span class="lb-badge ${p.ch}">${CH[p.ch]}</span><h3 data-no-tr>${esc(p.title)}</h3>
          <small class="muted">${digits(p.videos.filter(v => !v.deleted).length)} in the library · ${digits(p.count || 0)} in the playlist${p.lastRefresh ? ` · read ${ago(p.lastRefresh)}` : ""}</small>
          <span class="spacer"></span>
          <label class="lb-chk" title="Its videos never clear"><input type="checkbox" data-keepall="${esc(p.id)}" ${p.keepAll ? "checked" : ""}> Keep everything</label>
          <button class="btn sm" data-plact="${esc(p.id)}" data-v="${p.active ? 0 : 1}">${p.active ? "Switch off" : "Switch on"}</button>
          <button class="btn sm" data-plref="${p.ch}">Read now</button>
          <button class="btn sm red" data-pldel="${esc(p.id)}">Remove</button>
          <button class="btn sm" data-fold="${esc(p.id)}">${open ? "Hide videos" : `Show ${digits(list.length)} videos`}</button></header>
        ${p.error ? `<p class="lb-err">${esc(p.error)}</p>` : ""}
        ${open ? `<div class="lb-grid">${list.map(vCard).join("") || `<p class="muted">Nothing here for these filters.</p>`}</div>` : ""}</article>`;
    }).join("") : `<p class="muted">No playlists yet. Add the first one above.</p>`}`;
}
const vKey = v => `v|${v.ch}|${v.ytId}`;
function vCard(v) {
  const k = vKey(v);
  return `<div class="lb-card${v.deleted ? " del" : ""}${S.sel.has(k) ? " sel" : ""}">
    <button class="lb-thumb${v.vertical ? " vert" : ""}" data-pv="${esc(v.ytId)}" data-vert="${v.vertical ? 1 : 0}" aria-label="Preview"><img src="${esc(v.thumb)}" alt="" loading="lazy"><i>▶</i><em>${digits(fmt(v.dur || 0))}</em></button>
    <label class="lb-pick"><input type="checkbox" data-sel="${esc(k)}" ${S.sel.has(k) ? "checked" : ""}></label>
    <div class="lb-meta"><b data-no-tr>${esc(v.title)}</b>
      <small>Came in ${ago(v.addedAt)}${v.publishedAt ? ` · uploaded ${ago(v.publishedAt)}` : ""}</small>
      <div class="lb-tags">${v.deleted ? `<span class="lb-clear soon">Deleted</span>` : clears(v.clearsAt)}${v.playable ? "" : `<span class="lb-clear soon" title="YouTube does not let this video play inside other sites">Cannot play</span>`}${used(v)}</div></div>
    <div class="lb-acts">${v.deleted ? `<button class="btn sm" data-vdel="${esc(k)}" data-v="0">Restore</button>` : `<button class="btn sm${v.keep ? " green" : ""}" data-vkeep="${esc(k)}" data-v="${v.keep ? 0 : 1}">${v.keep ? "Kept" : "Keep"}</button><button class="btn sm red" data-vdel="${esc(k)}" data-v="1">Delete</button>`}</div></div>`;
}

/* ---------- AVO ---------- */
function drawAvo() {
  const list = S.d.avo.filter(x => (S.kind === "all" || x.kind === S.kind) && qOk(x.title) && ageOk(x.made, x.keep));
  const counts = k => S.d.avo.filter(x => k === "all" || x.kind === k).length;
  return `<div class="lb-kinds">${[["all", "All"], ...Object.entries(KIND)].map(([k, l]) => `<button class="btn sm${S.kind === k ? " on" : ""}" data-kind="${k}">${l} <small>${digits(counts(k))}</small></button>`).join("")}</div>
    <div class="lb-grid">${list.map(aCard).join("") || `<p class="muted">No AVO stories for these filters.</p>`}</div>`;
}
function aCard(x) {
  const k = `a|${x.id}`, img = x.images?.[0]?.src;
  return `<div class="lb-card${S.sel.has(k) ? " sel" : ""}">
    <button class="lb-thumb" data-pa="${esc(x.id)}" aria-label="Preview">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="lb-noimg">AVO</span>`}<i>▶</i><em>${digits(Math.round(x.secs || 0))} s</em></button>
    <label class="lb-pick"><input type="checkbox" data-sel="${esc(k)}" ${S.sel.has(k) ? "checked" : ""}></label>
    <div class="lb-meta"><div class="lb-tags"><span class="lb-kind k-${x.kind}">${KIND[x.kind] || "AVO"}</span>${x.desk ? `<span class="lb-badge">${esc(x.desk)}</span>` : ""}${x.status !== "ready" ? `<span class="lb-badge warn">${esc(x.status === "new" ? "Being made" : x.status === "off" ? "Paused" : x.status)}</span>` : ""}</div>
      <b data-no-tr>${esc(x.title)}</b>
      <small>Made ${ago(x.made)} · ${digits(x.images?.length || 0)} pictures${x.bytes?.length ? ` · ${digits(x.bytes.length)} bytes` : ""}${x.phone?.url ? " · phone-in" : ""}${x.views ? ` · ${digits(x.views)} plays in the app` : ""}</small>
      <div class="lb-tags">${clears(x.clearsAt)}${used(x)}</div></div>
    <div class="lb-acts"><button class="btn sm${x.keep ? " green" : ""}" data-akeep="${esc(x.id)}" data-v="${x.keep ? 0 : 1}">${x.keep ? "Kept" : "Keep"}</button>
      ${x.status === "ready" || x.status === "off" ? `<button class="btn sm" data-aplay="${esc(x.id)}">Play now</button>` : ""}
      <a class="btn sm" href="/avodesk.html#${encodeURIComponent(x.id)}">Edit</a><button class="btn sm red" data-adel="${esc(x.id)}">Delete</button></div></div>`;
}

/* ---------- Clips ---------- */
function drawClips() {
  const list = S.d.clips.filter(c => qOk(c.title) && ageOk(c.at, c.keep || c.ad));
  return `<p class="muted">Video and audio files uploaded for AVO stories, bytes, phone-ins and ads. A clip an ad uses never clears.</p>
    <div class="lb-grid">${list.map(c => { const k = `c|${c.id}`; return `<div class="lb-card${S.sel.has(k) ? " sel" : ""}">
      <button class="lb-thumb" data-pc="${esc(c.id)}" aria-label="Preview"><span class="lb-noimg">${c.audio ? "AUDIO" : "MP4"}</span><i>▶</i><em>${digits(fmt(c.dur || 0))}</em></button>
      <label class="lb-pick"><input type="checkbox" data-sel="${esc(k)}" ${S.sel.has(k) ? "checked" : ""}></label>
      <div class="lb-meta"><b data-no-tr>${esc(c.title)}</b><small>${ago(c.at)} · ${digits((c.bytes / 1048576).toFixed(1))} MB${c.ad ? " · used by an ad" : ""}</small>
        <div class="lb-tags">${clears(c.clearsAt)}${used(c)}</div></div>
      <div class="lb-acts"><button class="btn sm${c.keep ? " green" : ""}" data-ckeep="${esc(c.id)}" data-v="${c.keep ? 0 : 1}">${c.keep ? "Kept" : "Keep"}</button><button class="btn sm red" data-cdel="${esc(c.id)}" ${c.ad ? "disabled title=\"An ad uses it\"" : ""}>Delete</button></div></div>`; }).join("") || `<p class="muted">No clips for these filters.</p>`}</div>`;
}

/* ---------- Lives ---------- */
function drawLives() {
  const list = S.d.lives.filter(l => (S.ch === "all" || l.ch === S.ch) && qOk(l.title + l.ref));
  return `<form class="panel lb-add" id="addLive"><h2>Add a live</h2><p class="muted">A YouTube live (any channel) or a Facebook live video. Lives never clear; remove one when it is over.</p>
      <div class="row"><select name="channel"><option value="h">Rashtrix TV</option><option value="v">Rashtrix Shorts</option></select><input name="ref" required placeholder="YouTube live or Facebook video address" style="flex:2"><input name="title" placeholder="Name (optional)"><button class="btn red">Add live</button></div></form>
    <div class="lb-lives">${list.map(l => `<div class="panel lb-live${l.onAir ? " air" : ""}"><span class="lb-badge ${l.ch}">${CH[l.ch]}</span><span class="lb-badge">${l.fb ? "Facebook" : "YouTube"}</span>
      <b data-no-tr>${esc(l.title || l.ref)}</b><small class="muted" data-no-tr>${esc(l.ref)}</small>
      <span>${l.onAir ? `<span class="lb-clear soon">ON AIR</span>` : l.liveNow ? `<span class="lb-kept">Broadcasting now</span>` : `<span class="lb-use">Not broadcasting</span>`}</span>
      <span class="spacer"></span><button class="btn sm${l.onAir ? " red" : ""}" data-lair="${esc(l.id)}" data-v="${l.onAir ? 0 : 1}">${l.onAir ? "Take off air" : "Put on air"}</button><button class="btn sm" data-lrm="${esc(l.id)}">Remove</button></div>`).join("") || `<p class="muted">No lives yet.</p>`}</div>`;
}

/* ---------- previews ---------- */
let pv = null;
function dialogBox(inner, cls = "") {
  const d = document.createElement("dialog"); d.className = `lb-preview ${cls}`;
  d.innerHTML = `<div class="stack">${inner}<div class="row"><span class="spacer"></span><button class="btn" data-close>Close</button></div></div>`;
  document.body.append(d); d.showModal();
  const close = () => { try { pv?.destroy(); } catch { /* gone */ } pv = null; d.remove(); };
  $("[data-close]", d).onclick = () => d.close(); d.addEventListener("close", close);
  return d;
}
function previewVideo(id, vert) {
  dialogBox(`<div class="lb-screen${vert ? " vert" : ""}"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title=""></iframe></div>`, vert ? "vert" : "");
}
function previewAvo(x) {
  const d = dialogBox(`<div class="lb-screen"></div>`);
  const own = x.full?.url ? Math.min(45, x.full.sound ? x.full.secs || 30 : Math.max(x.full.secs || 30, x.secs > 0 ? x.secs + 2 : 20)) : x.len ? Math.min(45, Math.max(x.len, x.secs > 0 ? x.secs + 2 : 0)) : Math.min(45, x.secs > 0 ? Math.max(8, x.secs + 2) : 20);
  const len = own + (x.bytes || []).reduce((n, y) => n + 1.2 + Math.max(3, Number(y.secs) || 30), 0) + (x.phone?.url ? 1.2 + Math.max(3, Number(x.phone.secs) || 30) : 0);
  pv = mountTV($(".lb-screen", d), { channel: "h", mode: "scene", sound: true, muted: false, tapUnmute: false, scene: { layout: "graphic", sources: [], full: true, dur: Math.ceil(len + 4), startAt: Date.now(), key: `lb:${x.id}:${Date.now()}`, graphic: { kind: "avo", stories: [x] } } });
}
function previewClip(c) {
  dialogBox(c.audio ? `<audio src="${esc(c.url)}" controls autoplay style="width:100%"></audio>` : `<div class="lb-screen"><video src="${esc(c.url)}" controls autoplay playsinline></video></div>`);
}

/* ---------- actions ---------- */
const findV = k => { const [, ch, id] = k.split("|"); return S.d.playlists.flatMap(p => p.videos).find(v => v.ch === ch && v.ytId === id); };
async function setVideo(k, body) { const [, ch, id] = k.split("|"); await api(`/api/admin/tv/${ch}/items/${encodeURIComponent(id)}`, { method: "PUT", body }); }
async function act(fn, msg) { try { await fn(); if (msg) toast(msg); await load(); } catch (e) { fail(e); } }
async function bulk(what) {
  if (what === "none") { S.sel.clear(); return draw(); }
  if (what === "del" && !confirm(`Delete ${S.sel.size} items? Videos go off the channels; AVO stories and clips are deleted for good.`)) return;
  const keys = [...S.sel];
  await act(async () => {
    for (const k of keys) {
      const [t, a] = k.split("|");
      if (t === "v") await setVideo(k, what === "del" ? { excluded: true } : { keep: what === "keep" });
      if (t === "a") await (what === "del" ? api(`/api/admin/tv/avo/${encodeURIComponent(a)}`, { method: "DELETE" }) : api(`/api/admin/library/avo/${encodeURIComponent(a)}`, { method: "PUT", body: { keep: what === "keep" } }));
      if (t === "c") await (what === "del" ? api(`/api/admin/clips/${encodeURIComponent(a)}`, { method: "DELETE" }) : api(`/api/admin/clips/${encodeURIComponent(a)}`, { method: "PUT", body: { keep: what === "keep" } }));
    }
    S.sel.clear();
  }, "Done.");
}
function wire() {
  $$("[data-tab]").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.sel.clear(); draw(); });
  const q = $("#lbQ"); if (q) q.oninput = () => { S.q = q.value.trim().toLowerCase(); const at = q.selectionStart; draw(); const n = $("#lbQ"); n.focus(); n.setSelectionRange(at, at); };
  $("#lbCh").onchange = e => { S.ch = e.target.value; draw(); };
  $("#lbAge").onchange = e => { S.age = e.target.value; draw(); };
  $("#lbDel")?.addEventListener("change", e => { S.showDel = e.target.checked; draw(); });
  $("#lbReload").onclick = load;
  $$("[data-sel]").forEach(c => c.onchange = () => { c.checked ? S.sel.add(c.dataset.sel) : S.sel.delete(c.dataset.sel); draw(); });
  $$("[data-bulk]").forEach(b => b.onclick = () => bulk(b.dataset.bulk));
  $$("[data-kind]").forEach(b => b.onclick = () => { S.kind = b.dataset.kind; draw(); });
  $$("[data-fold]").forEach(b => b.onclick = () => { const id = b.dataset.fold; S.open.has(id) ? S.open.delete(id) : S.open.add(id); draw(); });
  // previews
  $$("[data-pv]").forEach(b => b.onclick = () => previewVideo(b.dataset.pv, b.dataset.vert === "1"));
  $$("[data-pa]").forEach(b => b.onclick = () => previewAvo(S.d.avo.find(x => x.id === b.dataset.pa)));
  $$("[data-pc]").forEach(b => b.onclick = () => previewClip(S.d.clips.find(x => x.id === b.dataset.pc)));
  // playlists
  $("#addPl")?.addEventListener("submit", e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.currentTarget)); const btn = $("button", e.currentTarget); btn.disabled = true; btn.textContent = "Adding…";
    act(() => api("/api/admin/tv/sources", { method: "POST", body: { channel: v.channel, ref: v.ref, title: v.title } }), "Playlist added. Its videos are coming in."); });
  $$("[data-keepall]").forEach(c => c.onchange = () => act(() => api(`/api/admin/tv/sources/${encodeURIComponent(c.dataset.keepall)}`, { method: "PUT", body: { keepAll: c.checked } }), c.checked ? "Its videos are kept." : "Its videos clear after 36 hours."));
  $$("[data-plact]").forEach(b => b.onclick = () => act(() => api(`/api/admin/tv/sources/${encodeURIComponent(b.dataset.plact)}`, { method: "PUT", body: { active: b.dataset.v === "1" } }), "Playlist updated."));
  $$("[data-plref]").forEach(b => b.onclick = () => { b.disabled = true; b.textContent = "Reading…"; act(() => api("/api/admin/tv/refresh", { method: "POST", body: { channel: b.dataset.plref } }), "Read from YouTube."); });
  $$("[data-pldel]").forEach(b => b.onclick = () => { if (confirm("Remove this playlist and its videos from the channel and the library?")) act(() => api(`/api/admin/tv/sources/${encodeURIComponent(b.dataset.pldel)}`, { method: "DELETE" }), "Playlist removed."); });
  // videos
  $$("[data-vkeep]").forEach(b => b.onclick = () => act(() => setVideo(b.dataset.vkeep, { keep: b.dataset.v === "1" }), b.dataset.v === "1" ? "Kept: it stays on the channel and in the library." : "It clears with the rest."));
  $$("[data-vdel]").forEach(b => b.onclick = () => { const del = b.dataset.v === "1"; if (del && !confirm(`Delete “${findV(b.dataset.vdel)?.title || "this video"}”? It goes off both channels at once (it stays on YouTube).`)) return; act(() => setVideo(b.dataset.vdel, { excluded: del, ...(del ? { keep: false } : {}) }), del ? "Deleted from the channels." : "Restored."); });
  // AVO
  $$("[data-akeep]").forEach(b => b.onclick = () => act(() => api(`/api/admin/library/avo/${encodeURIComponent(b.dataset.akeep)}`, { method: "PUT", body: { keep: b.dataset.v === "1" } }), b.dataset.v === "1" ? "Kept." : "It clears with the rest."));
  $$("[data-adel]").forEach(b => b.onclick = () => { if (confirm("Delete this AVO story for good? It goes off air at once.")) act(() => api(`/api/admin/tv/avo/${encodeURIComponent(b.dataset.adel)}`, { method: "DELETE" }), "Deleted."); });
  $$("[data-aplay]").forEach(b => b.onclick = () => { const ch = prompt("Play it now on which channel? Type TV, Shorts or both.", "both"); if (ch === null) return; const chs = /^tv$/i.test(ch.trim()) ? ["h"] : /^shorts$/i.test(ch.trim()) ? ["v"] : ["h", "v"];
    act(() => api(`/api/admin/tv/avo/${encodeURIComponent(b.dataset.aplay)}/play`, { method: "POST", body: { channels: chs } }), "On air now."); });
  // clips
  $$("[data-ckeep]").forEach(b => b.onclick = () => act(() => api(`/api/admin/clips/${encodeURIComponent(b.dataset.ckeep)}`, { method: "PUT", body: { keep: b.dataset.v === "1" } }), "Updated."));
  $$("[data-cdel]").forEach(b => b.onclick = () => { if (confirm("Delete this clip for good?")) act(() => api(`/api/admin/clips/${encodeURIComponent(b.dataset.cdel)}`, { method: "DELETE" }), "Deleted."); });
  // lives
  $("#addLive")?.addEventListener("submit", e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.currentTarget)); act(() => api("/api/admin/tv/sources", { method: "POST", body: { channel: v.channel, ref: v.ref, title: v.title, kind: "live" } }), "Live added."); });
  $$("[data-lair]").forEach(b => b.onclick = () => { const on = b.dataset.v === "1"; if (on && !confirm("Cut every screen on this channel to this live now?")) return; act(() => api(`/api/admin/tv/sources/${encodeURIComponent(b.dataset.lair)}`, { method: "PUT", body: { onAir: on } }), on ? "On air." : "Back to the running order."); });
  $$("[data-lrm]").forEach(b => b.onclick = () => { if (confirm("Remove this live?")) act(() => api(`/api/admin/tv/sources/${encodeURIComponent(b.dataset.lrm)}`, { method: "DELETE" }), "Removed."); });
}

(async () => {
  const user = await shell("Content Library"); if (!user) return;
  const t = location.hash.slice(1); if (["yt", "avo", "clips", "lives"].includes(t)) S.tab = t;
  $("main").innerHTML = `<p class="muted" style="padding:20px">Loading the library…</p>`;
  await load();
  setInterval(() => { if (!document.hidden && !document.querySelector("dialog[open]") && document.activeElement?.id !== "lbQ") load(); }, 60e3);
})();
