// The OAP desk: animated graphics made from the desk's own words, pictures and videos (show
// promos, news infographics, market price boards, daily commodity prices, weather boards and
// tiles), horizontal or vertical, in a style of the channel's look, with or without music, as long
// as asked. Nothing goes on air: the graphic is played and recorded in this browser into a video
// file (MP4 where the browser can make one, else WebM) to download. Pictures and videos never leave
// this computer.
import { shell, toast, fail, esc, $, $$ } from "./crshell.js";
import { digits } from "./i18n.js";
import { draw, guides, sizeOf, STYLES, MUSIC, KINDS, SKIES } from "./oap.js";
import { newsBed } from "./engine.js";

const FIELDS = {
  promo: [["kicker", "Kicker (e.g. NEW SHOW)"], ["title", "Show name"], ["tagline", "Tagline"], ["when", "Day and time"], ["host", "Presenter"]],
  info: [["kicker", "Kicker"], ["title", "Headline"], ["note", "Footnote"]],
  market: [["kicker", "Kicker"], ["title", "Board title"], ["date", "Date / time line"], ["note", "Footnote"]],
  commodity: [["kicker", "Kicker"], ["title", "Board title"], ["date", "Date / market"], ["note", "Footnote"]],
  weather: [["kicker", "Kicker"], ["title", "Board title"], ["date", "Date line"], ["note", "Footnote"]],
  tile: [["kicker", "Kicker"], ["title", "Headline"], ["text", "Text or quote"], ["byline", "Name (for a quote)"], ["note", "Footnote"]]
};
const ROWS = {
  info: [["label", "Label"], ["value", "Value"], ["unit", "Unit"]],
  market: [["name", "Name"], ["value", "Value"], ["change", "Change (+/−)"]],
  commodity: [["item", "Item"], ["unit", "Unit"], ["price", "Price"], ["change", "Change (+/−)"]],
  weather: [["city", "Place"], ["sky", "Sky"], ["max", "Max °"], ["min", "Min °"], ["note", "Note"]]
};
const SAMPLE = {
  promo: { kicker: "নতুন অনুষ্ঠান", title: "রাতের খবর", tagline: "দিনের সব বড় খবর, এক জায়গায়", when: "প্রতিদিন রাত ৯টা", host: "সঞ্চালনায় রাষ্ট্রিক্স ডেস্ক" },
  info: { kicker: "সংখ্যায় খবর", title: "রাজ্যের বাজেটে কোন খাতে কত বরাদ্দ", note: "অঙ্ক কোটি টাকায়", rows: [{ label: "শিক্ষা", value: "৪২,৫০০", unit: "কোটি" }, { label: "স্বাস্থ্য", value: "২১,৩০০", unit: "কোটি" }, { label: "কৃষি", value: "১৮,২০০", unit: "কোটি" }, { label: "পরিকাঠামো", value: "৩৫,৮০০", unit: "কোটি" }] },
  market: { kicker: "শেয়ার বাজার", title: "আজ বাজার বন্ধের সময়", date: "শুক্রবার, বিকেল ৩টে ৩০", rows: [{ name: "সেনসেক্স", value: "৮১,২৪৫.৩০", change: "+৪১২.৬০" }, { name: "নিফটি", value: "২৪,৮৬৫.১০", change: "+১২৮.৪০" }, { name: "সোনা (১০ গ্রাম)", value: "₹৭৬,৪২০", change: "−২১০" }, { name: "রুপো (কেজি)", value: "₹৯২,১০০", change: "+৩৫০" }, { name: "ডলার", value: "₹৮৪.১২", change: "−০.০৬" }] },
  commodity: { kicker: "বাজারদর", title: "কলকাতার বাজারে আজকের দাম", date: "মানিকতলা বাজার, সকাল ৮টা", rows: [{ item: "আলু (জ্যোতি)", unit: "প্রতি কেজি", price: "₹৩২", change: "+২" }, { item: "পেঁয়াজ", unit: "প্রতি কেজি", price: "₹৫৫", change: "−৫" }, { item: "ইলিশ (১ কেজি)", unit: "প্রতি কেজি", price: "₹১,৬০০", change: "+১০০" }, { item: "রুই", unit: "প্রতি কেজি", price: "₹৩২০", change: "" }, { item: "ডিম", unit: "প্রতি হালি", price: "₹২৮", change: "+১" }] },
  weather: { kicker: "আবহাওয়া", title: "আজ রাজ্যের আবহাওয়া", date: "শনিবার, ১৫ নভেম্বর", rows: [{ city: "কলকাতা", sky: "partly", max: "২৯", min: "১৯", note: "আকাশ আংশিক মেঘলা" }, { city: "দার্জিলিং", sky: "fog", max: "১৪", min: "৭", note: "কুয়াশা" }, { city: "শিলিগুড়ি", sky: "sun", max: "২৬", min: "১৫" }, { city: "দিঘা", sky: "rain", max: "২৭", min: "২১", note: "হালকা বৃষ্টি" }] },
  tile: { kicker: "উদ্ধৃতি", title: "খবর শুধু দেখার নয়, পড়ারও", text: "দেখুন ঘটনার ছবি। শুনুন ঘটনার বিবরণ। আর পড়ে জানুন ঘটনার সম্পূর্ণ প্রেক্ষাপট।", byline: "রাষ্ট্রিক্স" }
};
const KEY = "rx-oap-v1";
const S = (() => { let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { /* none */ } return { kind: "promo", orient: "h", style: "red", dur: 12, music: true, mood: "", data: { ...structuredClone(SAMPLE), ...(saved.data || {}) }, ...saved, media: null, busy: false }; })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ kind: S.kind, orient: S.orient, style: S.style, dur: S.dur, music: S.music, mood: S.mood, data: S.data })); } catch { /* full or blocked */ } };
const A = { logo: new Image(), map: new Image(), media: null };
A.logo.src = "/brand/logo.webp"; A.map.src = "/brand/worldmap-dots.webp";
const spec = () => ({ ...S.data[S.kind], kind: S.kind, orient: S.orient, style: S.style, dur: S.dur });

function form() {
  const d = S.data[S.kind] ||= {}, rows = ROWS[S.kind];
  return `<div class="stack" style="gap:12px">
    <div class="row" style="gap:6px;flex-wrap:wrap">${Object.entries(KINDS).map(([k, l]) => `<button class="btn sm ${S.kind === k ? "on" : ""}" data-kind="${k}" type="button">${l}</button>`).join("")}</div>
    <div class="row" style="gap:10px;flex-wrap:wrap">
      <label>Shape<select id="oOr"><option value="h" ${S.orient === "h" ? "selected" : ""}>Horizontal 16:9 (1920×1080)</option><option value="v" ${S.orient === "v" ? "selected" : ""}>Vertical 9:16 (1080×1920)</option></select></label>
      <label>Length <b data-no-tr id="oDurV">${digits(S.dur)} s</b><input type="range" id="oDur" min="5" max="60" step="1" value="${S.dur}"></label>
      <label class="row" style="gap:6px;align-items:center"><input type="checkbox" id="oMus" ${S.music ? "checked" : ""}> <span>Music</span></label>
      <label class="row" style="gap:6px;align-items:center" title="Where the channel's logo, LIVE dock and ticker sit on air. Graphics keep these places clear. The guides are never in the video."><input type="checkbox" id="oGuide" ${S.guides !== false ? "checked" : ""}> <span>Show jacket guides</span></label>
      <label>Music mood<select id="oMood" ${S.music ? "" : "disabled"}><option value="">Matches the graphic</option>${["headlines", "upnext", "market", "weather", "avo", "bulletin"].map(m => `<option value="${m}" ${S.mood === m ? "selected" : ""}>${{ headlines: "Headlines", upnext: "Promo", market: "Markets", weather: "Weather", avo: "Calm", bulletin: "Bulletin" }[m]}</option>`).join("")}</select></label></div>
    <div><small class="muted">Style</small><div class="row" style="gap:8px;flex-wrap:wrap;margin-top:4px">${Object.entries(STYLES).map(([k, s]) => `<button type="button" class="oap-sw ${S.style === k ? "on" : ""}" data-style="${k}" title="${s.name}"><i style="background:linear-gradient(135deg,${s.bg[1]},${s.bg[0]} 60%,${s.bg[2]})"><b style="background:${s.acc}"></b><b style="background:${s.gold}"></b></i><span>${s.name}</span></button>`).join("")}</div></div>
    ${FIELDS[S.kind].map(([k, l]) => `<label>${l}${k === "text" ? `<textarea rows="3" data-f="${k}" data-no-tr>${esc(d[k] || "")}</textarea>` : `<input data-f="${k}" value="${esc(d[k] || "")}" data-no-tr>`}</label>`).join("")}
    ${S.kind === "market" || S.kind === "commodity" || S.kind === "weather" ? "" : `<div class="row" style="gap:8px;align-items:center"><label class="btn sm"><input type="file" id="oMedia" accept="image/*,video/*" hidden><span>${A.media ? "Change picture or video" : "Add a picture or video"}</span></label>${A.media ? `<small class="muted">${A.media.video ? "Video" : "Picture"}: <span data-no-tr>${esc(A.media.name)}</span></small><button class="btn sm red" type="button" id="oMediaX">Remove</button>` : `<small class="muted">Optional. It stays on this computer.</small>`}</div>`}
    ${rows ? `<div class="stack" style="gap:6px"><small class="muted">Rows</small>${(d.rows ||= []).map((r, i) => `<div class="row oap-row" style="gap:6px;flex-wrap:nowrap">${rows.map(([k, l]) => k === "sky" ? `<select data-r="${i}" data-k="${k}" title="${l}">${Object.entries(SKIES).map(([v, n]) => `<option value="${v}" ${r.sky === v ? "selected" : ""}>${n}</option>`).join("")}</select>` : `<input data-r="${i}" data-k="${k}" placeholder="${l}" value="${esc(r[k] || "")}" data-no-tr>`).join("")}<button class="btn sm red" type="button" data-rx="${i}" aria-label="Remove">✕</button></div>`).join("")}
      <div class="row"><button class="btn sm" type="button" id="oAdd" ${d.rows.length >= (S.kind === "commodity" ? 10 : S.kind === "info" ? 6 : 8) ? "disabled" : ""}>+ Add a row</button><button class="btn sm" type="button" id="oSample">Fill with an example</button></div></div>` : `<div class="row"><button class="btn sm" type="button" id="oSample">Fill with an example</button></div>`}
  </div>`;
}

function page() {
  const [W, H] = sizeOf(S.orient);
  $("main").innerHTML = `<section class="panel oap">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>OAP desk</h2><small class="muted">Graphics are made in this browser and downloaded. Nothing goes on air.</small></div>
    <div class="oap-grid"><div class="oap-form" id="oForm">${form()}</div>
      <div class="oap-view stack"><div class="oap-stage ${S.orient}"><canvas id="oCan" width="${W}" height="${H}"></canvas></div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="oPlay">▶ Play from the start</button><button class="btn green" type="button" id="oMake">Make the video</button><span class="muted" id="oMsg"></span></div>
        <div class="oap-bar" id="oBar" hidden><i></i></div><div id="oOut"></div>
        <small class="muted">Making the video takes as long as the graphic itself: keep this tab open and in front until it is done.</small></div></div></section>`;
  bind(); restart();
}

function bind() {
  const re = () => { $("#oForm").innerHTML = form(); bind(); save(); };
  $$("[data-kind]").forEach(b => b.onclick = () => { S.kind = b.dataset.kind; S.data[S.kind] ||= structuredClone(SAMPLE[S.kind]); re(); restart(); });
  $$("[data-style]").forEach(b => b.onclick = () => { S.style = b.dataset.style; re(); });
  $("#oOr").onchange = e => { S.orient = e.target.value; save(); page(); };
  $("#oDur").oninput = e => { S.dur = +e.target.value; $("#oDurV").textContent = `${digits(S.dur)} s`; save(); };
  $("#oMus").onchange = e => { S.music = e.target.checked; re(); };
  $("#oGuide").onchange = e => { S.guides = e.target.checked; save(); };
  $("#oMood").onchange = e => { S.mood = e.target.value; save(); };
  const d = S.data[S.kind];
  $$("[data-f]").forEach(i => i.oninput = () => { d[i.dataset.f] = i.value; save(); });
  $$("[data-r]").forEach(i => { i[i.tagName === "SELECT" ? "onchange" : "oninput"] = () => { d.rows[+i.dataset.r][i.dataset.k] = i.value; save(); }; });
  $$("[data-rx]").forEach(b => b.onclick = () => { d.rows.splice(+b.dataset.rx, 1); re(); });
  if ($("#oAdd")) $("#oAdd").onclick = () => { d.rows.push(S.kind === "weather" ? { sky: "sun" } : {}); re(); };
  $("#oSample").onclick = () => { S.data[S.kind] = structuredClone(SAMPLE[S.kind]); re(); restart(); };
  if ($("#oMedia")) $("#oMedia").onchange = e => { const f = e.target.files[0]; if (f) loadMedia(f).then(re).catch(fail); };
  if ($("#oMediaX")) $("#oMediaX").onclick = () => { if (A.media?.url) URL.revokeObjectURL(A.media.url); A.media = null; re(); };
  if ($("#oPlay")) $("#oPlay").onclick = restart;
  if ($("#oMake")) $("#oMake").onclick = make;
}

// A picture or video from this computer (it never leaves it).
function loadMedia(f) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(f), video = /^video\//.test(f.type);
    const el = video ? Object.assign(document.createElement("video"), { muted: true, loop: true, playsInline: true, preload: "auto" }) : new Image();
    el[video ? "onloadeddata" : "onload"] = () => { if (A.media?.url) URL.revokeObjectURL(A.media.url); A.media = { el, url, video, name: f.name }; if (video) el.play().catch(() => {}); res(); };
    el.onerror = () => rej(new Error("This file cannot be read as a picture or a video."));
    el.src = url;
  });
}

// The preview: the graphic plays on a loop (a short pause at the end).
let t0 = performance.now(), raf = 0, recording = false;
function restart() { t0 = performance.now(); if (A.media?.video) { A.media.el.currentTime = 0; A.media.el.play().catch(() => {}); } }
function frame() {
  const c = $("#oCan");
  if (c && !recording) { const t = ((performance.now() - t0) / 1000) % (S.dur + .8); const g = c.getContext("2d"); draw(g, spec(), A, Math.min(t, S.dur)); if (S.guides !== false) guides(g, S.orient); }
  raf = requestAnimationFrame(frame);
}

// The video: the canvas and the music recorded in real time.
function pickType() {
  for (const m of ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1.4d002a,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"])
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return "";
}
async function make() {
  if (recording) return;
  const type = pickType(); if (!type) return toast("This browser cannot make videos. Use Chrome or Edge on a computer.", true);
  const c = $("#oCan"), sp = spec(), D = sp.dur, fps = 30;
  recording = true; $("#oMake").disabled = true; $("#oPlay").disabled = true; $("#oOut").innerHTML = ""; const bar = $("#oBar"); bar.hidden = false;
  const stream = c.captureStream(fps); let ac = null, stopMusic = () => {};
  try {
    if (S.music) {
      ac = new AudioContext(); await ac.resume();
      const dest = ac.createMediaStreamDestination(), comp = ac.createDynamicsCompressor(), gain = ac.createGain();
      comp.threshold.value = -16; comp.ratio.value = 5; gain.gain.value = 1.1; comp.connect(gain); gain.connect(dest); gain.connect(ac.destination);
      ac.__bus = comp;   // newsBed plays into this bus (src/engine.js busOf)
      stopMusic = newsBed(ac, D, { style: S.mood || MUSIC[S.kind] }) || (() => {});
      dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
    }
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 10e6, audioBitsPerSecond: 192e3 }), chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    if (A.media?.video) { A.media.el.currentTime = 0; await A.media.el.play().catch(() => {}); }
    const ctx = c.getContext("2d"); draw(ctx, sp, A, 0);
    rec.start(500); const start = performance.now();
    await new Promise(res => { const step = () => { const t = (performance.now() - start) / 1000; draw(ctx, sp, A, Math.min(t, D)); $("i", bar).style.width = `${Math.min(100, t / D * 100)}%`; $("#oMsg").textContent = `${digits(Math.min(D, Math.floor(t)))} / ${digits(D)} s`; if (t >= D) res(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
    rec.stop(); await done;
    const ext = type.startsWith("video/mp4") ? "mp4" : "webm", blob = new Blob(chunks, { type: type.split(";")[0] }), url = URL.createObjectURL(blob);
    const name = `rashtrix-${S.kind}-${S.orient === "v" ? "vertical" : "horizontal"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
    $("#oOut").innerHTML = `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><a class="btn green" href="${url}" download="${name}">⬇ Download the video</a><small class="muted"><span data-no-tr>${esc(name)}</span> · <span data-no-tr>${digits((blob.size / 1048576).toFixed(1))} MB</span></small></div>
      <video src="${url}" controls playsinline style="width:100%;max-height:360px;margin-top:8px;background:#000;border-radius:8px"></video>`;
    toast("The video is ready.");
  } catch (e) { fail(e); }
  finally { try { stopMusic(); } catch { /* none */ } try { ac?.close(); } catch { /* none */ } stream.getTracks().forEach(tr => tr.stop()); recording = false; $("#oMake").disabled = false; $("#oPlay").disabled = false; bar.hidden = true; $("#oMsg").textContent = ""; restart(); }
}

(async () => {
  const user = await shell("OAP desk");
  if (!user) return;
  await Promise.all(['800 40px "Noto Serif Bengali"', '700 40px "Hind Siliguri"', '500 40px "Hind Siliguri"', '800 40px Montserrat'].map(f => document.fonts.load(f, "অআকখ RX").catch(() => {})));
  page(); frame();
})();
