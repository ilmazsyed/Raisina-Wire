// The Headlines desk: HEADLINES on air at :58 and :28, straight into the bulletin at :00 and :30
// (src/headlines.js, src/engine.js kind "heads"). The desk sets the times, how many headlines and
// how long each stays; rewrites, drops or adds a picture or a video to any headline from the wire;
// and adds its own, for every HEADLINES or only at the times it picks, for as many airings as it
// sets. The next HEADLINES can be previewed here, with its music and voices.
import "./tv.css";
import { lightenVideo } from "./lightclip.js";
import { shell, api, toast, fail, esc, $, $$ } from "./crshell.js";
import { mountTV } from "./engine.js";
import { digits } from "./i18n.js";

const S = { d: null, items: [], edits: {}, hidden: [], set: null, dirty: false, pv: null, open: null };
const pad = n => String(n).padStart(2, "0");
const IST = 5.5 * 3600e3;
const hhmm = t => { const d = new Date(t + IST); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
// The HEADLINES times of the day (India time), from the minutes past the hour.
const dayTimes = mins => Array.from({ length: 24 }, (_, h) => mins.map(m => `${pad(h)}:${pad(m)}`)).flat().sort();
function nextAt(mins) {
  const t = Date.now(), hr = Math.floor((t + IST) / 3600e3) * 3600e3 - IST; let best = Infinity;
  for (const h of [hr, hr + 3600e3]) for (const m of mins) { const x = h + m * 60e3; if (x > t - 4 * 60e3 && x < best) best = x; }
  return best;
}
// What goes on air at a time: the desk's own headlines (every HEADLINES, or that time), then the wire's.
function lineup(at) {
  const key = hhmm(at), per = S.set.secs;
  const own = S.items.filter(x => x.text && (!x.repeat || (x.aired || 0) < x.repeat) && (!x.when?.length || x.when.includes(key))).sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0)).map(x => ({ ...x, auto: false }));
  const auto = (S.d.auto || []).filter(a => !S.hidden.includes(a.id)).map(a => { const e = S.edits[a.id] || {}; const voice = (S.d.onAir || []).find(o => o.id === a.id); return { ...a, auto: true, text: e.text || a.orig, image: e.noimg ? "" : e.image || a.wireImage, video: e.video || "", voice: voice && voice.text === (e.text || a.orig) ? voice.voice : "", secs: voice?.secs || 0 }; });
  return [...own, ...auto].slice(0, S.set.count).map(x => ({ ...x, d: Math.max(per, x.secs ? x.secs + 1.5 : 0) }));
}

async function uploadImage(file) {
  const bmp = await createImageBitmap(file);
  for (const [max, q] of [[1920, .86], [1600, .8], [1400, .72]]) {
    const k = Math.min(1, max / bmp.width), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, "image/webp", q));
    if (blob && blob.size < 1_700_000) {
      const r = await fetch("/api/admin/images", { method: "POST", headers: { "content-type": blob.type, "x-image-width": String(w), "x-image-height": String(h) }, body: blob });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Upload failed."); return d.url;
    }
  }
  throw new Error("This picture is too large even after compression.");
}
async function uploadVideo(file, bar) {
  if (!/^video\/(mp4|quicktime|webm)$/.test(file.type)) throw new Error("Choose an MP4, MOV or WebM video.");
  // (made light first: 720p, about 2.5 Mbit/s, so it plays at once on a phone's data; src/lightclip.js)
  bar.hidden = false; const lit = await lightenVideo(file, { onProgress: k => { $("i", bar).style.width = `${Math.round(k * 50)}%`; } }); if (lit) file = lit;
  const start = await api("/api/admin/clips", { method: "POST", body: { title: `Headline: ${file.name.replace(/\.\w+$/, "")}`.slice(0, 150), filename: file.name, size: file.size, mime: file.type, duration: 0 } });
  const parts = [], n = Math.ceil(file.size / start.partSize);
  try {
    for (let i = 0; i < n; i++) {
      const blob = file.slice(i * start.partSize, (i + 1) * start.partSize); let tries = 0, out;
      while (true) { try { out = await api(`/api/admin/clips/${start.id}/part/${i + 1}`, { method: "PUT", body: blob, raw: true }); break; } catch (e) { if (++tries > 3) throw e; await new Promise(r => setTimeout(r, 1500 * tries)); } }
      parts.push(out.part); $("i", bar).style.width = `${50 + Math.round((i + 1) / n * 50)}%`;
    }
    const done = await api(`/api/admin/clips/${start.id}/complete`, { method: "POST", body: { parts } });
    await api(`/api/admin/clips/${start.id}`, { method: "PUT", body: { keep: true } }).catch(() => {});
    return done.url;
  } catch (e) { await api(`/api/admin/clips/${start.id}/abort`, { method: "POST" }).catch(() => {}); throw e; }
  finally { setTimeout(() => { bar.hidden = true; $("i", bar).style.width = "0"; }, 800); }
}

const mark = () => { S.dirty = true; const b = $("#hdSave"); if (b) b.classList.add("pulse"); };
// The picture and video of a headline: upload, paste a link, or take it off.
const mediaRow = (k, x) => `<div class="hd-media">
  ${x.image ? `<img src="${esc(x.image)}" alt="">` : ""}${x.video ? `<video src="${esc(x.video)}" muted playsinline></video>` : ""}
  <label class="btn sm">Picture<input type="file" accept="image/*" data-up-img="${k}" hidden></label>
  <label class="btn sm">Video<input type="file" accept="video/mp4,video/quicktime,video/webm" data-up-vid="${k}" hidden></label>
  <button class="btn sm" type="button" data-link="${k}">Link</button>
  ${x.image || x.video ? `<button class="btn sm red" type="button" data-unmedia="${k}">Remove media</button>` : ""}</div>`;

function draw() {
  const set = S.set, nx = nextAt(set.mins), list = lineup(nx), times = dayTimes(set.mins);
  $("main").innerHTML = `<section class="panel pd hd-wrap">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>Headlines desk</h2>
      <div class="row"><button class="btn sm" id="hdReload" type="button">Refresh</button><button class="btn green" id="hdSave" type="button">Save</button></div></div>
    <p class="muted" style="margin:0">HEADLINES goes on air at these minutes past every hour (India time) and leads straight into the bulletin at :00 and :30. It never cuts into a video: it starts as soon as the item on air ends. A five-second stinger, then each headline, read by the newsreaders.</p>
    <div class="row hd-set" style="flex-wrap:wrap;gap:14px">
      <label class="row" style="gap:6px"><input type="checkbox" id="hdOn" ${set.on ? "checked" : ""}> On air</label>
      <label>Minutes past the hour <input id="hdMins" value="${esc(set.mins.join(", "))}" style="width:110px" data-no-tr></label>
      <label>Headlines <input id="hdCount" type="number" min="6" max="15" value="${set.count}" style="width:70px"></label>
      <label>Seconds each <input id="hdSecs" type="number" min="6" max="20" value="${set.secs}" style="width:70px"></label>
    </div>
  </section>
  <section class="panel pd hd-wrap">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">Next HEADLINES <small class="muted" data-no-tr>${digits(hhmm(nx))} IST · ${digits(list.length)} · ${digits(Math.round(5 + list.reduce((n, x) => n + x.d, 0)))} s</small></h3>
      <button class="btn sm red" id="hdPv" type="button">▶ Preview with sound</button></div>
    <div class="hd-screen" ${S.pv ? "" : "hidden"}></div>
    <ol class="hd-next">${list.map(x => `<li><b data-no-tr>${esc(x.text)}</b> ${x.auto ? "" : '<span class="tag amber">DESK</span>'}${x.image || x.video ? '<span class="tag">MEDIA</span>' : ""}${x.voice ? "" : '<span class="tag">NO VOICE YET</span>'}</li>`).join("") || '<li class="muted">No headlines yet.</li>'}</ol>
  </section>
  <section class="panel pd hd-wrap">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">The desk's own headlines</h3><button class="btn sm green" id="hdAdd" type="button">+ Add a headline</button></div>
    <p class="muted" style="margin:0">They go before the wire's headlines (those marked First in line come first). Choose every HEADLINES or particular times, and how many times it airs (0: until you remove it).</p>
    <div class="hd-own">${S.items.map((x, i) => `<div class="hd-row${(x.repeat && (x.aired || 0) >= x.repeat) ? " done" : ""}">
      <div class="stack" style="flex:1;gap:6px;min-width:0">
        <input data-own="${i}" value="${esc(x.text)}" placeholder="The headline (Bengali)" maxlength="160" data-no-tr>
        <div class="row" style="flex-wrap:wrap;gap:10px">
          <label>Desk <input data-odesk="${i}" value="${esc(x.desk || "")}" placeholder="রাজ্য" style="width:110px" data-no-tr></label>
          <label>Airs <input type="number" min="0" max="999" data-orep="${i}" value="${x.repeat || 0}" style="width:70px"> times</label>
          <small class="muted">aired ${digits(x.aired || 0)}${x.repeat ? ` of ${digits(x.repeat)}` : ""}</small>
          <label class="row" style="gap:6px"><input type="checkbox" data-otop="${i}" ${x.top ? "checked" : ""}> First in line</label>
          <label class="row" style="gap:6px"><input type="checkbox" data-oall="${i}" ${x.when?.length ? "" : "checked"}> Every HEADLINES</label>
          ${x.aired ? `<button class="btn sm" type="button" data-oreset="${i}">Reset count</button>` : ""}
          <button class="btn sm red" type="button" data-odel="${i}">Delete</button>
        </div>
        ${x.when?.length || S.open === `t${i}` ? `<div class="hd-times">${times.map(tm => `<label><input type="checkbox" data-otime="${i}" value="${tm}" ${(x.when || []).includes(tm) ? "checked" : ""}> <span data-no-tr>${digits(tm)}</span></label>`).join("")}</div>` : ""}
        ${mediaRow(`o${i}`, x)}
      </div></div>`).join("") || '<p class="muted">None yet.</p>'}</div>
  </section>
  <section class="panel pd hd-wrap">
    <h3 style="margin:0">From the wire, by priority</h3>
    <p class="muted" style="margin:0">Made from the latest stories, West Bengal politics first. Rewrite one (it is read again in the new words), drop it, or give it a picture or a video.</p>
    <div class="hd-auto">${(S.d.auto || []).map((a, i) => { const e = S.edits[a.id] || {}, off = S.hidden.includes(a.id), x = { image: e.noimg ? "" : e.image || a.wireImage, video: e.video || "" }; return `<div class="hd-row${off ? " off" : ""}">
      <span class="hd-n">${digits(i + 1)}</span><div class="stack" style="flex:1;gap:6px;min-width:0">
        <input data-auto="${esc(a.id)}" value="${esc(e.text || a.orig)}" maxlength="160" data-no-tr ${off ? "disabled" : ""}>
        <div class="row" style="flex-wrap:wrap;gap:8px"><small class="muted" data-no-tr>${esc(a.desk || "")}</small>${e.text ? `<span class="tag">EDITED</span><button class="btn sm" type="button" data-arev="${esc(a.id)}">Back to the wire's words</button>` : ""}
          <button class="btn sm ${off ? "green" : "red"}" type="button" data-ahide="${esc(a.id)}">${off ? "Bring back" : "Drop"}</button></div>
        ${off ? "" : mediaRow(`a${esc(a.id)}`, x)}
      </div></div>`; }).join("") || '<p class="muted">No wire stories yet.</p>'}</div>
  </section>
  <div class="hd-bar" hidden><i></i></div>`;
  wire();
}

// The headline a media control belongs to: "o<i>" (the desk's own) or "a<id>" (the wire's).
const target = k => k[0] === "o" ? S.items[+k.slice(1)] : (S.edits[k.slice(1)] ||= {});
function wire() {
  $("#hdSave").onclick = save;
  $("#hdReload").onclick = () => { if (S.dirty && !confirm("Discard your changes?")) return; load(); };
  $("#hdOn").onchange = e => { S.set.on = e.target.checked; mark(); };
  $("#hdMins").onchange = e => { const v = [...new Set(e.target.value.split(/[^\d]+/).map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 59))].slice(0, 4); if (v.length) { S.set.mins = v; mark(); draw(); } else toast("Give the minutes past the hour, like 58, 28.", true); };
  $("#hdCount").onchange = e => { S.set.count = Math.max(6, Math.min(15, +e.target.value || 12)); mark(); draw(); };
  $("#hdSecs").onchange = e => { S.set.secs = Math.max(6, Math.min(20, +e.target.value || 10)); mark(); draw(); };
  $("#hdAdd").onclick = () => { S.items.unshift({ id: crypto.randomUUID(), text: "", desk: "", image: "", video: "", when: [], top: false, repeat: 0, aired: 0 }); mark(); draw(); $("[data-own='0']")?.focus(); };
  $("#hdPv").onclick = preview;
  $$("[data-own]").forEach(t => t.oninput = () => { S.items[+t.dataset.own].text = t.value; mark(); });
  $$("[data-odesk]").forEach(t => t.oninput = () => { S.items[+t.dataset.odesk].desk = t.value; mark(); });
  $$("[data-orep]").forEach(t => t.onchange = () => { S.items[+t.dataset.orep].repeat = Math.max(0, +t.value || 0); mark(); draw(); });
  $$("[data-otop]").forEach(t => t.onchange = () => { S.items[+t.dataset.otop].top = t.checked; mark(); });
  $$("[data-oall]").forEach(t => t.onchange = () => { const i = +t.dataset.oall; if (t.checked) { S.items[i].when = []; S.open = null; } else S.open = `t${i}`; mark(); draw(); });
  $$("[data-otime]").forEach(t => t.onchange = () => { const x = S.items[+t.dataset.otime]; x.when = $$(`[data-otime="${t.dataset.otime}"]`).filter(c => c.checked).map(c => c.value); mark(); });
  $$("[data-oreset]").forEach(b => b.onclick = () => { const x = S.items[+b.dataset.oreset]; x.aired = 0; x.resetCount = true; mark(); draw(); });
  $$("[data-odel]").forEach(b => b.onclick = () => { if (!confirm("Delete this headline?")) return; S.items.splice(+b.dataset.odel, 1); mark(); draw(); });
  $$("[data-auto]").forEach(t => t.oninput = () => { const a = S.d.auto.find(x => x.id === t.dataset.auto), e = S.edits[t.dataset.auto] ||= {}; e.text = t.value.trim() === a.orig ? "" : t.value; mark(); });
  $$("[data-arev]").forEach(b => b.onclick = () => { S.edits[b.dataset.arev].text = ""; mark(); draw(); });
  $$("[data-ahide]").forEach(b => b.onclick = () => { const id = b.dataset.ahide; S.hidden = S.hidden.includes(id) ? S.hidden.filter(x => x !== id) : [...S.hidden, id]; mark(); draw(); });
  $$("[data-up-img]").forEach(f => f.onchange = async () => { const file = f.files[0]; if (!file) return; try { toast("Uploading the picture…"); const x = target(f.dataset.upImg); x.image = await uploadImage(file); x.video = ""; x.noimg = false; mark(); draw(); } catch (e) { fail(e); } });
  $$("[data-up-vid]").forEach(f => f.onchange = async () => { const file = f.files[0]; if (!file) return; try { toast("Uploading the video…"); const x = target(f.dataset.upVid); x.video = await uploadVideo(file, $(".hd-bar")); mark(); draw(); toast("Video uploaded."); } catch (e) { fail(e); } });
  $$("[data-link]").forEach(b => b.onclick = () => {
    const v = prompt("Paste a picture link (https://…jpg, png or webp) or a video file link (https://…mp4). Videos play muted, behind the headline.");
    if (!v) return; const u = v.trim(); if (!/^https:\/\//.test(u)) return toast("The link must start with https://", true);
    const x = target(b.dataset.link); if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) x.video = u; else { x.image = u; x.noimg = false; } mark(); draw();
  });
  $$("[data-unmedia]").forEach(b => b.onclick = () => { const k = b.dataset.unmedia, x = target(k); x.image = ""; x.video = ""; if (k[0] === "a") x.noimg = true; mark(); draw(); });
}

function preview() {
  const box = $(".hd-screen"); box.hidden = false;
  S.pv?.destroy?.();
  const items = lineup(Date.now());
  S.pv = mountTV(box, { channel: "h", mode: "scene", sound: true, muted: false, tapUnmute: false,
    scene: { layout: "graphic", sources: [], full: true, dur: Math.ceil(5 + items.reduce((n, x) => n + x.d, 0) + 1), startAt: Date.now(), key: `pv:heads:${Date.now()}`, graphic: { kind: "heads", items, at: Date.now(), replay: 1 } } });
  S.pv?.unmute?.();
}

async function save() {
  for (const x of S.items) if (!x.text.trim()) return toast("Give every headline of the desk its words (or delete it).", true);
  try {
    await api("/api/admin/heads", { method: "PUT", body: { ...S.set, items: S.items, hidden: S.hidden, edits: S.edits } });
    S.dirty = false; toast("Saved. HEADLINES uses it from the next airing."); load();
  } catch (e) { fail(e); }
}
async function load() {
  try {
    S.d = await api("/api/admin/heads");
    S.set = { ...S.d.settings }; S.items = structuredClone(S.d.items || []);
    S.hidden = [...(S.d.hidden || [])]; S.edits = structuredClone(S.d.edits || {});
    S.dirty = false; draw();
  } catch (e) { $("main").innerHTML = `<div class="cr-denied"><h2>Headlines desk</h2><p>${esc(e.message)}</p></div>`; }
}
window.addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });
(async () => {
  const user = await shell("Headlines desk");
  if (!user) return;
  $("main").innerHTML = `<p class="muted">Loading…</p>`;
  load();
})();
