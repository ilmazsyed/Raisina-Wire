// AVO video download (avorec.html?id=<story>): the story is played full frame exactly as it goes on
// air (the NEWS NOW sting, its voice and music, its pictures and videos, each byte with its name
// super), and recorded in this browser into a video file to keep and post elsewhere. Nothing goes
// on air. The browser asks which tab to record: "This tab", with its sound. Chrome or Edge on a
// computer; the picture is recorded at the size of the window (a maximised window on a full-HD
// screen gives full HD).
import { shell, api, toast, fail, esc, $ } from "./crshell.js";
import "./tv.css";
import { mountTV } from "./engine.js";
import { digits } from "./i18n.js";
import { hasYouTube, makeAvoFile } from "./avofile.js";

const id = new URLSearchParams(location.search).get("id") || "";
const S = { story: null, ch: "h", rec: null, tv: null };
// The story's length on air, without the slack the running order leaves for a byte to load.
const baseSecs = x => (x.secs > 0 ? Math.max(8, x.secs + 2) : 20) + 4 + (x.bytes || []).reduce((n, b) => n + 1.2 + (Number(b.secs) || 30), 0);
const pickType = () => ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1.4d002a,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
const clock = s => digits(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

// A story with no YouTube link is made straight into a file (src/avofile.js); one with a YouTube
// link (a video or a byte) is recorded as it plays, since YouTube's video cannot be read into a file.
function panel() {
  const x = S.story, n = (x.bytes || []).length;
  if (!hasYouTube(x)) return filePanel();
  $("main").innerHTML = `<section class="panel" style="max-width:720px;margin:24px auto">
    <h2>AVO video download</h2>
    <div class="stack" style="gap:12px">
      <b data-no-tr style="font-size:18px">${esc(x.title)}</b>
      <small class="muted"><span>${n ? `AVO + ${digits(n)} byte` : "AVO"}</span> · <span data-no-tr>${clock(baseSecs(x))}</span></small>
      <label>Shape<select id="rCh"><option value="h">Rashtrix TV · horizontal 16:9</option><option value="v">Rashtrix Shorts · vertical 9:16</option></select></label>
      <ol class="muted" style="margin:0;padding-left:20px;line-height:1.7">
        <li>Maximise this window (the video is recorded at the window's size).</li>
        <li>Press Start recording. The browser asks what to share: choose “This tab” and keep “Also share tab audio” on.</li>
        <li>The story plays once, with its sound. Leave this tab in front until it ends.</li>
        <li>The video file is then ready to download.</li></ol>
      <div class="row"><button class="btn green" type="button" id="rGo">● Start recording</button><a class="btn" href="/avodesk.html">Back to the AVO desk</a></div>
      <div id="rOut"></div>
    </div></section>`;
  $("#rCh").value = S.ch; $("#rCh").onchange = e => { S.ch = e.target.value; };
  $("#rGo").onclick = record;
}

function filePanel() {
  const x = S.story, n = (x.bytes || []).length;
  $("main").innerHTML = `<section class="panel" style="max-width:720px;margin:24px auto">
    <h2>AVO video download</h2>
    <div class="stack" style="gap:12px">
      <b data-no-tr style="font-size:18px">${esc(x.title)}</b>
      <small class="muted"><span>${n ? `AVO + ${digits(n)} byte` : "AVO"}</span></small>
      <label>Shape<select id="rCh"><option value="h">Rashtrix TV · horizontal 16:9</option><option value="v">Rashtrix Shorts · vertical 9:16</option></select></label>
      <p class="muted" style="margin:0">The video file is made in this browser: the NEWS NOW opener, the story with its pictures, videos, voice and music, each byte with its name, and the end card. Full HD. Keep this tab open until it is done.</p>
      <div class="row"><button class="btn green" type="button" id="rMake">⬇ Make the video file</button><a class="btn" href="/avodesk.html">Back to the AVO desk</a></div>
      <div class="oap-bar" id="rBar" hidden><i></i></div><small class="muted" id="rMsg"></small>
      <div id="rOut"></div>
    </div></section>`;
  $("#rCh").value = S.ch; $("#rCh").onchange = e => { S.ch = e.target.value; };
  $("#rMake").onclick = async () => {
    const btn = $("#rMake"), bar = $("#rBar"); btn.disabled = true; bar.hidden = false; $("#rOut").innerHTML = "";
    try {
      const t0 = Date.now(), r = await makeAvoFile(x, { orient: S.ch, onProgress: (k, label) => { $("i", bar).style.width = `${Math.round(k * 100)}%`; $("#rMsg").textContent = `${label} · ${digits(Math.round(k * 100))}%`; } });
      const url = URL.createObjectURL(r.blob), name = `rashtrix-avo-${S.ch === "v" ? "vertical" : "horizontal"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${r.ext}`;
      $("#rOut").innerHTML = `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><a class="btn green" href="${url}" download="${name}">⬇ Download the video</a><small class="muted"><span data-no-tr>${esc(name)}</span> · <span data-no-tr>${clock(r.seconds)} · ${digits((r.blob.size / 1048576).toFixed(1))} MB</span></small></div>
        <video src="${url}" controls playsinline style="width:100%;max-height:420px;margin-top:8px;background:#000;border-radius:8px"></video>`;
      $("#rMsg").textContent = ""; toast("The video is ready."); void t0;
    } catch (e) { fail(e); $("#rMsg").textContent = ""; }
    finally { btn.disabled = false; bar.hidden = true; }
  };
}

async function record() {
  const type = pickType();
  if (!type || !navigator.mediaDevices?.getDisplayMedia) return toast("This browser cannot record. Use Chrome or Edge on a computer.", true);
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser", frameRate: 30, cursor: "never" }, audio: { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      preferCurrentTab: true, selfBrowserSurface: "include", systemAudio: "exclude", surfaceSwitching: "exclude", monitorTypeSurfaces: "exclude" });
  } catch { return toast("Recording was not allowed.", true); }
  const x = S.story, V = S.ch === "v";
  // The stage: the story alone, as large as the window allows, on black.
  document.body.classList.add("rec-on");
  const stage = document.createElement("div"); stage.className = "rec-stage";
  stage.innerHTML = `<div class="rec-frame ${V ? "v" : "h"}"></div><div class="rec-bar"><span class="rec-dot"></span><span id="rT" data-no-tr></span><button class="btn sm" type="button" id="rStop">Stop and save</button></div>`;
  document.body.append(stage);
  const frame = $(".rec-frame", stage), track = stream.getVideoTracks()[0];
  // Only the story's frame is recorded (not the bar under it), where the browser can crop a tab.
  try { if (window.CropTarget && track.cropTo) await track.cropTo(await CropTarget.fromElement(frame)); } catch { /* the whole tab is recorded */ }
  if (!stream.getAudioTracks().length) toast("No tab audio was shared: the video will be silent. Stop, and tick “Also share tab audio” next time.", true);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6, audioBitsPerSecond: 192e3 }), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => { rec.onstop = r; });
  await new Promise(r => setTimeout(r, 400));
  rec.start(1000);
  const t0 = Date.now();
  S.tv = mountTV(frame, { channel: S.ch, mode: "scene", sound: true, muted: false, tapUnmute: false,
    scene: { layout: "graphic", sources: [], full: true, dur: Math.ceil(baseSecs(x)) + 30, startAt: Date.now() + 300, key: `rec:${x.id}:${Date.now()}`, graphic: { kind: "avo", stories: [x] } } });
  let over = false; const stop = () => { if (over) return; over = true; clearInterval(tick); try { rec.stop(); } catch { /* stopped */ } };
  // (the story is over when its own clock, which waits for each byte to play in full, has run out)
  const tick = setInterval(() => { const el = (Date.now() - t0) / 1000, total = baseSecs(x) + (S.tv?.avoExtra?.() || 0) / 1000; $("#rT").textContent = `${clock(el)} / ${clock(total)}`; if (el >= total + 0.6) stop(); }, 250);
  $("#rStop").onclick = stop; track.addEventListener("ended", stop);
  await done;
  try { S.tv?.destroy(); } catch { /* gone */ } S.tv = null; stream.getTracks().forEach(t => t.stop()); stage.remove(); document.body.classList.remove("rec-on");
  const ext = type.startsWith("video/mp4") ? "mp4" : "webm", blob = new Blob(chunks, { type: type.split(";")[0] }), url = URL.createObjectURL(blob);
  const name = `rashtrix-avo-${V ? "vertical" : "horizontal"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
  panel();
  $("#rOut").innerHTML = `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><a class="btn green" href="${url}" download="${name}">⬇ Download the video</a><small class="muted"><span data-no-tr>${esc(name)}</span> · <span data-no-tr>${digits((blob.size / 1048576).toFixed(1))} MB</span></small></div>
    <video src="${url}" controls playsinline style="width:100%;max-height:420px;margin-top:8px;background:#000;border-radius:8px"></video>`;
  toast("The video is ready.");
}

(async () => {
  const user = await shell("AVO video download");
  if (!user) return;
  try {
    const d = await api("/api/admin/tv/avo"); S.story = (d.stories || []).find(s => s.id === id);
    if (!S.story) { $("main").innerHTML = `<p class="muted" style="padding:24px">This AVO story was not found. Open it from the AVO desk.</p>`; return; }
    if (!["ready", "off"].includes(S.story.status)) { $("main").innerHTML = `<p class="muted" style="padding:24px">This AVO story is not ready yet.</p>`; return; }
    panel();
  } catch (e) { fail(e); }
})();
