// Raisina TV: the AI anchor on screen (live channel only; never inside the explainer videos).
// The anchor is photoreal footage made offline from her portrait (anchors/README.md), set in the
// studio, with a name strap and an AI label:
//   <key>-idle.mp4   the resting face, blinking, mouth closed (loops all the time)
//   <key>-mouth.jpg  a dozen mouth shapes from closed to wide open, cut from her talking footage,
//   <key>-mouth.json where they sit on the face and how open each is
//   <key>-talk.mp4   a talking loop, used only when the voice can't be measured
// Lip movement follows the voice: while a line plays, the browser measures its loudness about 60
// times a second and lays the matching mouth shape over the resting face, so the mouth opens and
// closes with the words. (When the sound can't be analysed, e.g. before the viewer has tapped for
// sound, the talking loop plays instead.) Lines are written and voiced on the server
// (src/anchors.js) and fetched by id.
//
// Shots: "cam" the anchor full screen in the studio; "vo" her voice over the pictures, with only
// the strap on screen; "pip" the anchor in a window beside a title card.
const file = (key, kind) => `/anchors/${key}-${kind}.mp4`;
const mouths = {};
function loadMouth(key) {
  return (mouths[key] ||= fetch(`/anchors/${key}-mouth.json`).then(r => r.ok ? r.json() : null).then(meta => meta && new Promise(res => {
    const img = new Image(); img.onload = () => res({ meta, img }); img.onerror = () => res(null); img.src = `/anchors/${key}-mouth.jpg`;
  })).catch(() => null));
}

export function createAnchor(screen, { isPaused, hearing, label, audioCtx }) {
  const el = document.createElement("div");
  el.className = "tv-anchor"; el.hidden = true; el.setAttribute("aria-live", "polite");
  el.innerHTML = `<div class="ta-cam"><span class="ta-fill"></span>
      <span class="ta-frame"><video class="ta-v ta-idle" muted playsinline loop preload="auto"></video><video class="ta-v ta-talk" muted playsinline loop preload="auto"></video><canvas class="ta-mouth" aria-hidden="true"></canvas></span></div>
    <span class="ta-pick" hidden></span>
    <div class="ta-strap"><span class="ta-face"></span><span class="ta-who"><b></b><small></small></span><span class="ta-ai">AI</span><span class="ta-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
    <div class="ta-line" hidden></div>`;
  screen.querySelector(".tv-seq").after(el);
  const idle = el.querySelector(".ta-idle"), talk = el.querySelector(".ta-talk"), cv = el.querySelector(".ta-mouth");
  let who = "", audio = null, speaking = false, mouth = null, lip = null;

  function setWho(key, a) {
    if (who === key) return;
    who = key; mouth = null;
    el.querySelector(".ta-fill").style.backgroundImage = `url('/anchors/${key}.jpg')`;
    el.querySelector(".ta-face").style.backgroundImage = `url('/anchors/${key}.jpg')`;
    el.querySelector(".ta-who b").textContent = a?.name || "";
    el.querySelector(".ta-who small").textContent = label(a?.role || "AI Live Anchor");
    for (const [v, kind] of [[idle, "idle"], [talk, "talk"]]) { v.poster = `/anchors/${key}.jpg`; v.src = file(key, kind); }
    loadMouth(key).then(m => {
      if (who !== key || !m) return;
      mouth = m; const { meta, img } = m;
      el.style.setProperty("--ta-aspect", meta.aspect);
      Object.assign(cv.style, { left: `${meta.x * 100}%`, top: `${meta.y * 100}%`, width: `${meta.w * 100}%`, height: `${meta.h * 100}%` });
      cv.width = img.naturalWidth; cv.height = Math.round(img.naturalHeight / meta.n);
    });
  }
  // The face: talking (lip-synced shapes over the resting face, or the talking loop) or resting.
  function face(on) {
    speaking = on; el.classList.toggle("talking", on);
    const synced = on && Boolean(lip);
    el.classList.toggle("lipsync", synced);
    const v = on && !synced ? talk : idle, other = v === talk ? idle : talk;
    if (!isPaused()) v.play().catch(() => {});
    other.pause();
  }
  // Draws the mouth for an openness between two neighbouring shapes, blended, so it never snaps.
  function draw(o) {
    const { meta, img } = mouth, h = cv.height, lv = meta.open;
    let i = 0; while (i < lv.length - 2 && lv[i + 1] <= o) i++;
    const f = Math.min(1, Math.max(0, (o - lv[i]) / Math.max(lv[i + 1] - lv[i], 1e-3)));
    const c = cv.getContext("2d"); c.globalAlpha = 1; c.clearRect(0, 0, cv.width, h);
    c.drawImage(img, 0, i * h, cv.width, h, 0, 0, cv.width, h);
    if (f > 0.02) { c.globalAlpha = f; c.drawImage(img, 0, (i + 1) * h, cv.width, h, 0, 0, cv.width, h); }
  }
  // Lip sync: loudness -> how open -> the mouth, blended between shapes. Eased both ways (opening a
  // touch quicker than closing) and capped short of the widest shape, so the movement stays soft
  // and natural rather than flickering; scaled to the line's own loudest moments.
  function lipLoop() {
    if (!lip || !mouth) return;
    const { an, buf, gain } = lip;
    gain.gain.value = hearing() ? 1 : 0;
    an.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    lip.peak = Math.max(lip.peak * 0.998, rms, 0.015);
    const floor = lip.peak * 0.14, t = Math.min(1, Math.max(0, (rms - floor) / (lip.peak * 0.8 - floor))) ** 0.85;
    const now = performance.now(), dt = Math.min(0.1, (now - (lip.t || now)) / 1000); lip.t = now;
    const target = t * 0.85;
    lip.o += (target - lip.o) * (1 - Math.exp(-dt * (target > lip.o ? 22 : 13)));
    if (Math.abs(lip.o - lip.shown) > 0.01) { lip.shown = lip.o; draw(lip.o); }
    lip.raf = requestAnimationFrame(lipLoop);
  }
  function startLip(a) {
    const ctx = audioCtx?.();
    if (!ctx || ctx.state !== "running" || !mouth) return false;
    try {
      const src = ctx.createMediaElementSource(a), an = ctx.createAnalyser(), gain = ctx.createGain();
      an.fftSize = 1024; an.smoothingTimeConstant = 0;
      src.connect(an); an.connect(gain); gain.connect(ctx.destination);
      lip = { src, an, gain, buf: new Float32Array(an.fftSize), peak: 0.05, o: 0, shown: -1, raf: 0, t: 0 };
      draw(0);
      return true;
    } catch { lip = null; return false; }
  }
  function stopLip() { if (!lip) return; cancelAnimationFrame(lip.raf); try { lip.src.disconnect(); lip.gain.disconnect(); } catch { /* gone */ } lip = null; el.classList.remove("lipsync"); }
  // Show the anchor in a shot (cam, vo or pip), with an optional "Editor's Pick" tag.
  function shot(kind, { key, roster, pick = "" } = {}) {
    if (key) setWho(key, roster?.[key]);
    el.dataset.shot = kind;
    const p = el.querySelector(".ta-pick"); p.hidden = !pick; p.textContent = pick;
    if (el.hidden) { el.hidden = false; void el.offsetWidth; }
    el.classList.add("on");
    face(speaking);
  }
  function hide() {
    stopAudio(); face(false); idle.pause(); talk.pause();
    el.classList.remove("on", "talking"); el.hidden = true; el.dataset.shot = "";
  }
  function stopAudio() { stopLip(); if (audio) { audio.onended = audio.onerror = audio.onplaying = null; audio.pause(); audio.removeAttribute("src"); audio = null; } }

  // Say a line: resolves when the audio ends (or, without it, after reading time), or early if
  // `alive()` turns false (a newer sequence took over). Pausing the TV pauses the line. The voice
  // is fetched whenever it can be heard or measured (a muted viewer who has tapped once still gets
  // lips that follow it, silently).
  function say(line, alive) {
    return new Promise(res => {
      if (!line?.text) return res(true);
      const cap = el.querySelector(".ta-line");
      cap.textContent = line.text; cap.hidden = hearing();
      const words = line.text.split(/\s+/).length, est = 600 + words / 2.55 * 1000;
      let done = false, left = est, last = performance.now(), started = false, waited = 0;
      const finish = ok => { if (done) return; done = true; face(false); stopAudio(); cap.hidden = true; res(ok); };
      const fallback = () => { stopAudio(); started = true; face(true); }; // no voice: reading time, talking loop
      const ctx = audioCtx?.(), measurable = Boolean(ctx && ctx.state === "running" && mouth);
      if (hearing() || measurable) {
        stopAudio();
        audio = new Audio(`/api/tv/voice/${line.id}.mp3`);
        const a = audio, synced = startLip(a);
        if (!synced && !hearing()) { fallback(); }
        else {
          a.onplaying = () => { if (a !== audio) return; started = true; face(true); if (lip && !lip.raf) lipLoop(); };
          a.onended = () => { if (a === audio) finish(true); };
          a.onerror = () => { if (a === audio) fallback(); };
          if (!isPaused()) a.play().catch(() => { if (a === audio) fallback(); });
        }
      } else fallback();
      // Watchdog: reading time runs while there's no audio; a voice that never starts is cut off.
      const step = () => {
        if (done) return;
        if (!alive()) return finish(false);
        const now = performance.now(), d = now - last; last = now;
        if (!isPaused()) { if (audio && !started) waited += d; else if (!audio) left -= d; }
        if (audio && !started && waited > 6000) fallback();
        if (!audio && left <= 0) return finish(true);
        setTimeout(step, 80);
      };
      step();
    });
  }
  function pause(p) {
    if (el.hidden) return;
    if (p) { audio?.pause(); idle.pause(); talk.pause(); }
    else { audio?.play().catch(() => {}); (speaking && !lip ? talk : idle).play().catch(() => {}); }
  }
  const shotNow = () => (el.hidden ? "" : el.dataset.shot || "");
  return { shot, say, hide, pause, shotNow };
}

// Warm the server's voice cache and the browser's for lines coming up.
export function prefetchLines(lines) { for (const l of lines) if (l?.id) fetch(`/api/tv/voice/${l.id}.mp3`, { priority: "low" }).catch(() => {}); }
