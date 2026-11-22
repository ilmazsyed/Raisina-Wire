// The Content Library picker: one list for every desk that chooses something to air (Producer,
// Live Rundown, Breaking, AVO, Headlines). It reads the Content Library (src/library.js), so every
// desk sees the same 36 hours, with what is kept, what aired and what a rundown still has to air.
import { api, toast, esc, $, $$, fmt } from "./crshell.js";
import { digits } from "./i18n.js";

let cache = null, cacheAt = 0;
export async function libraryItems(force = false) {
  if (!force && cache && Date.now() - cacheAt < 30e3) return cache;
  const d = await api("/api/admin/library");
  const videos = d.playlists.flatMap(p => p.videos.map(v => ({ ...v, playlist: p.title }))).filter(v => !v.deleted && v.playable)
    .map(v => ({ type: "video", id: v.ytId, ch: v.ch, title: v.title, dur: v.dur || 0, thumb: v.thumb, url: `https://www.youtube.com/watch?v=${v.ytId}`, at: v.addedAt, keep: !!(v.keep || v.keepAll || v.evergreen), meta: v.playlist, aired: v.aired, vertical: v.vertical }));
  const avo = d.avo.filter(x => ["ready", "off"].includes(x.status)).map(x => ({ type: "avo", id: x.id, title: x.title, dur: Math.round(x.secs || 0), thumb: x.images?.[0]?.src || "", at: x.made, keep: x.keep, meta: `${x.desk || ""}`, kind: x.kind, aired: x.aired, story: x }));
  const clips = d.clips.map(c => ({ type: "clip", id: c.id, title: c.title, dur: c.dur || 0, url: c.url, at: c.at, keep: c.keep || c.ad, meta: c.audio ? "Audio" : "Video file", audio: c.audio, aired: c.aired }));
  cache = { videos, avo, clips, hours: d.hours }; cacheAt = Date.now();
  return cache;
}

const NAMES = { video: "YouTube videos", avo: "AVO stories", clip: "Clips" };
const ago = t => { const h = (Date.now() - (Date.parse(t) || Date.now())) / 3600e3; return h < 1 ? `${digits(Math.max(1, Math.round(h * 60)))} min ago` : `${digits(Math.round(h))} h ago`; };

// Opens the picker. types: some of "video", "avo", "clip"; channel: "h" or "v" to show only that
// channel's videos; onPick(item, button) is called for the item chosen (it may return a promise).
export async function libraryPicker({ title = "Content Library", note = "", types = ["video", "avo", "clip"], channel = null, onPick, keepOpen = false } = {}) {
  const d = document.createElement("dialog"); d.className = "lp-dialog";
  d.innerHTML = `<div class="lp"><div class="lp-head"><h3>${esc(title)}</h3><a class="btn sm" href="/library.html" target="_blank" rel="noopener">Open the Content Library</a><button class="btn sm" data-close>Close</button></div>
    ${note ? `<p class="muted lp-note">${esc(note)}</p>` : ""}
    <div class="lp-bar">${types.length > 1 ? types.map((t, i) => `<button class="btn sm${i ? "" : " on"}" data-lpt="${t}">${NAMES[t]}</button>`).join("") : ""}<input type="search" placeholder="Search" id="lpQ"></div>
    <div class="lp-list" id="lpList"><p class="muted">Loading…</p></div></div>`;
  document.body.append(d); d.showModal();
  $("[data-close]", d).onclick = () => d.close(); d.addEventListener("close", () => d.remove());
  let L; try { L = await libraryItems(true); } catch (e) { $("#lpList", d).innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  let tab = types[0], q = "";
  const pool = () => (tab === "video" ? L.videos.filter(v => !channel || v.ch === channel) : tab === "avo" ? L.avo : L.clips).filter(x => !q || `${x.title} ${x.meta}`.toLowerCase().includes(q));
  const draw = () => {
    const list = pool();
    $("#lpList", d).innerHTML = list.length ? list.map((x, i) => `<div class="lp-row">
        <span class="lp-th">${x.thumb ? `<img src="${esc(x.thumb)}" alt="" loading="lazy">` : `<i>${x.type === "clip" ? (x.audio ? "AUDIO" : "MP4") : "AVO"}</i>`}<em>${x.type === "avo" ? `${digits(x.dur)} s` : digits(fmt(x.dur || 0))}</em></span>
        <span class="lp-tx"><b data-no-tr>${esc(x.title)}</b><small data-no-tr>${esc(x.meta || "")}${x.meta ? " · " : ""}${ago(x.at)}${x.keep ? " · kept" : ""}${x.aired ? ` · aired ${digits(x.aired)}×` : ""}</small></span>
        <button class="btn sm green" data-lpuse="${i}">Use</button></div>`).join("")
      : `<p class="muted">Nothing in the library's ${digits(L.hours)} hours here. Keep items in the Content Library to hold them longer.</p>`;
    $$("[data-lpuse]", d).forEach(b => b.onclick = async () => {
      const x = pool()[+b.dataset.lpuse]; b.disabled = true;
      try { await onPick?.(x, b); if (!keepOpen) d.close(); else b.textContent = "Added"; } catch (e) { toast(e.message || String(e), true); b.disabled = false; }
    });
  };
  $$("[data-lpt]", d).forEach(b => b.onclick = () => { tab = b.dataset.lpt; $$("[data-lpt]", d).forEach(y => y.classList.toggle("on", y === b)); draw(); });
  $("#lpQ", d).oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
  draw();
}
