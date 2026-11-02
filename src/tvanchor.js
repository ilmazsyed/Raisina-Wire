// Raisina TV: the AI anchor on screen (live channel only; never inside the explainer videos).
// The anchor is photoreal footage made offline from her portrait (anchors/README.md), set in the
// studio, with a broadcast aston:
//   <key>-idle.mp4         the resting face, blinking, mouth closed (loops between lines)
//   lips/<line id>.mp4     the face saying that line, lip-synced to its recording (Wav2Lip)
//   <key>-talk.mp4         a talking loop, for a line without a lip-synced clip
// While a line plays, its clip runs in step with the voice (kept within a tenth of a second), so
// her lips form the words. Lines are written on the server (src/anchors.js); their voices are
// Kokoro recordings in public/anchors/voice/.
//
// Shots: "cam" the anchor full screen in the studio; "vo" her voice over the explainer's pictures;
// "pip" the anchor in a window beside a title card.
const file = (key, kind) => `/anchors/${key}-${kind}.mp4`;

export function createAnchor(screen, { isPaused, hearing, label, onBlocked, onSpeak }) {
  const el = document.createElement("div");
  el.className = "tv-anchor"; el.hidden = true; el.setAttribute("aria-live", "polite");
  el.innerHTML = `<div class="ta-cam"><span class="ta-fill"></span>
      <span class="ta-frame"><video class="ta-v ta-idle" muted playsinline loop preload="auto"></video><video class="ta-v ta-talk" muted playsinline loop preload="auto"></video><video class="ta-v ta-clip" muted playsinline preload="auto"></video></span></div>
    <span class="ta-vo" aria-hidden="true"><i class="ta-vo-pic"></i><i class="ta-vo-pic"></i><i class="ta-wipe"></i></span>
    <span class="ta-pick" hidden></span>
    <div class="ta-aston"><b class="ta-aston-1"></b><span class="ta-aston-2"></span></div>
    <div class="ta-line" hidden></div>`;
  screen.querySelector(".tv-seq").after(el);
  const idle = el.querySelector(".ta-idle"), talk = el.querySelector(".ta-talk"), clip = el.querySelector(".ta-clip");
  idle.addEventListener("loadedmetadata", () => { if (idle.videoWidth) el.style.setProperty("--ta-aspect", idle.videoWidth / idle.videoHeight); });
  let who = "", audio = null, speaking = false, clipOn = false, clipLive = false;
  // The clip takes over from the talking loop only once it is actually playing (a phone may still be
  // loading it), so her mouth never freezes while the clip catches up.
  clip.addEventListener("playing", () => { if (clipOn && !clipLive) { clipLive = true; movedAt = frameAt = performance.now(); if (audio) clip.currentTime = voice.currentTime; if (frames) clip.requestVideoFrameCallback(onFrame); face(speaking); } });

  function setWho(key, a) {
    if (who === key) return;
    who = key;
    el.querySelector(".ta-fill").style.backgroundImage = `url('/anchors/${key}.jpg')`;
    // The aston, a broadcast lower third: "Tara, Raisina Wire" over "News Anchor (AI)".
    el.querySelector(".ta-aston-1").textContent = `${a?.name || ""}, Raisina Wire`;
    el.querySelector(".ta-aston-2").textContent = label(a?.role || "News Anchor (AI)");
    for (const [v, kind] of [[idle, "idle"], [talk, "talk"]]) { v.poster = `/anchors/${key}.jpg`; v.src = file(key, kind); }
  }
  const offScreen = () => el.dataset.shot === "vo" || el.hidden;
  // The face: the line's lip-synced clip, else the talking loop, while speaking; resting otherwise.
  function face(on) {
    speaking = on; el.classList.toggle("talking", on);
    const lips = on && clipOn && clipLive;
    el.classList.toggle("clipping", lips);
    for (const v of [idle, talk]) {
      const want = !offScreen() && !isPaused() && !lips && (on ? v === talk : v === idle); // one face video at a time
      if (want) v.play().catch(() => {}); else v.pause();
    }
  }
  // Keeps the clip in step with the voice: no speed changes (phones stall a video whose speed is
  // changed); it is lined up with the voice as it starts, and a gap over 0.08 s is closed by a jump, at most once every 1.5 s. If the picture stops
  // changing while she is still speaking (a phone can freeze the frame while the video's clock
  // runs on), she goes back to the talking loop for the rest of the line: her mouth never freezes.
  let seekAt = 0, lastT = -1, movedAt = 0, frameAt = 0;
  const frames = typeof clip.requestVideoFrameCallback === "function";
  const onFrame = () => { frameAt = performance.now(); if (clipOn) clip.requestVideoFrameCallback(onFrame); };
  function follow() {
    if (!clipOn || !audio || clip.ended) return;
    const over = clip.duration && voice.currentTime >= clip.duration - 0.05; // the clip has said it all
    const now = performance.now();
    if (voice.paused || over) { clip.pause(); movedAt = frameAt = now; return; }
    if (clip.paused && !offScreen()) clip.play().catch(() => {});
    if (clip.readyState < 2) return; // still loading: no seeking yet
    if (clipLive && !offScreen()) {
      if (clip.currentTime !== lastT) { lastT = clip.currentTime; movedAt = now; }
      const shown = frames ? frameAt : movedAt;
      if (now - Math.max(shown, seekAt) > 450 || now - movedAt > 450) { clipOn = clipLive = false; clip.pause(); face(speaking); return; }
    }
    if (Math.abs(clip.currentTime - voice.currentTime) > 0.08 && now - seekAt > 1500) { seekAt = now; clip.currentTime = voice.currentTime; }
  }



  // One voice player for every line, unlocked by the viewer's click (phones only let a player
  // that was started by a tap make sound), so two lines can never play over each other. It plays
  // as an ordinary media element (an iPhone's silent switch mutes Web Audio, not media).
  const voice = new Audio(); voice.preload = "auto";
  // A tenth of a second of real silence: playing it during the viewer's tap unlocks the player.
  const SILENCE = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
  function unlock() {
    // Her face too: iPhones (always in Low Power Mode) won't start a video that a tap never
    // started, so her mouth would stay shut. Each face player is started and stopped during the tap.
    for (const v of [idle, talk, clip]) {
      if (!v.getAttribute("src")) v.src = "/tv-unlock.mp4";
      if (v.paused) v.play().then(() => { if (v === clip) { if (!(clipOn && speaking)) v.pause(); } else face(speaking); }).catch(() => {});
    }
    if (audio) return;
    voice.src = SILENCE; voice.play().then(() => { if (!audio) voice.pause(); }).catch(() => {});
  }

  // Voice-over pictures: one after another, each pushing in slowly, changing with a Raisina Wire
  // wipe (a crimson band and a navy band sweeping across); at least three, looping if the read runs on.
  let slideT = 0;
  function slides(pics) {
    clearInterval(slideT); slideT = 0;
    const [a, b] = el.querySelectorAll(".ta-vo-pic"), wipe = el.querySelector(".ta-wipe");
    if (!pics.length) return;
    const url = u => `url('${String(u).replace(/'/g, "%27")}')`;
    let i = 0, front = a, back = b;
    const show = (layer, u) => { layer.style.backgroundImage = url(u); layer.style.animation = "none"; void layer.offsetWidth; layer.style.animation = ""; };
    show(front, pics[0]); front.classList.add("on"); back.classList.remove("on");
    pics.slice(1).forEach(u => { const im = new Image(); im.src = u; });
    if (pics.length < 2) return;
    slideT = setInterval(() => {
      if (isPaused()) return;
      i = (i + 1) % pics.length;
      wipe.classList.remove("go"); void wipe.offsetWidth; wipe.classList.add("go");
      setTimeout(() => { show(back, pics[i]); back.classList.add("on"); front.classList.remove("on"); [front, back] = [back, front]; }, 330);
    }, 3600);
  }
  // Show the anchor in a shot (cam, vo or pip), with an optional tag ("Editor's Pick", "LIVE").
  function shot(kind, { key, roster, pick = "", pics = [], aston = true } = {}) {
    if (key) setWho(key, roster?.[key]);
    el.dataset.shot = kind;
    const p = el.querySelector(".ta-pick"); p.hidden = !pick; p.textContent = pick;
    slides(kind === "vo" ? pics : []);
    // The aston animates in with each new on-camera shot, holds, and animates out.
    const t = el.querySelector(".ta-aston"); t.classList.remove("go");
    if (kind !== "vo" && aston) { void t.offsetWidth; t.classList.add("go"); }
    if (el.hidden) { el.hidden = false; void el.offsetWidth; }
    el.classList.add("on");
    face(speaking);
  }
  function hide() {
    slides([]); stopAudio(); face(false); idle.pause(); talk.pause(); clip.pause();
    el.classList.remove("on", "talking", "clipping"); el.hidden = true; el.dataset.shot = "";
  }
  function stopAudio() {
    if (!audio) return;
    voice.onended = voice.onerror = voice.onplaying = voice.onpause = null; voice.pause(); audio = null;
    clip.pause(); clipOn = clipLive = false; onSpeak?.(false);
  }

  // Say a line: resolves when the voice ends (or, without it, when the clip ends or after reading
  // time), or early if `alive()` turns false (a newer sequence took over). Pausing the TV pauses it.
  function say(line, alive) {
    return new Promise(res => {
      if (!line?.text) return res(true);
      const cap = el.querySelector(".ta-line");
      // A line with words of its own on screen (the breaking story, the live caption) always shows
      // them; otherwise the caption is the line itself, shown when the sound is off.
      cap.textContent = line.show || line.text; cap.hidden = hearing() && !line.show; cap.classList.toggle("show", Boolean(line.show));
      const words = Math.max(line.text.split(/\s+/).length, String(line.show || "").split(/\s+/).length), est = 600 + words / 2.55 * 1000;
      let done = false, left = est, last = performance.now(), started = false, waited = 0;
      const finish = ok => { if (done) return; done = true; stopAudio(); clipOn = false; face(false); cap.hidden = true; cap.classList.remove("show"); res(ok); };
      // The lip-synced clip, if this line has one, starts with the voice (or alone, without sound).
      clipOn = Boolean(line.clip);
      clipLive = false; lastT = -1; movedAt = seekAt = frameAt = 0;
      if (clipOn) { clip.src = line.clip; clip.currentTime = 0; clip.load(); }
      const fallback = () => {   // no voice: the clip (or the talking loop) and reading time
        if (audio) { voice.onended = voice.onerror = voice.onplaying = voice.onpause = null; voice.pause(); audio = null; onSpeak?.(false); }
        started = true; face(true);
        if (clipOn && !offScreen() && !isPaused()) { clip.currentTime = 0; clip.play().catch(() => {}); clip.onended = () => finish(true); }
      };
      if (line.audio && hearing()) {
        stopAudio(); clipOn = Boolean(line.clip);
        const a = audio = {};   // this line's turn on the voice player
        voice.muted = false; voice.src = line.audio;
        voice.onplaying = () => { if (a !== audio) return; started = true; face(true); onSpeak?.(true); follow(); };
        voice.onpause = () => { if (a === audio) clip.pause(); };
        voice.onended = () => { if (a === audio) finish(true); };
        voice.onerror = () => { if (a === audio) fallback(); };
        // A browser that still won't play sound: say so (the "Tap for sound" button comes back).
        if (!isPaused()) voice.play().catch(e => { if (a !== audio) return; if (e?.name === "NotAllowedError") onBlocked?.(); fallback(); });
      } else fallback();
      // Watchdog: keeps the clip with the voice; reading time runs while there's no voice; a voice
      // that never starts is cut off.
      const step = () => {
        if (done) return;
        if (!alive()) return finish(false);
        const now = performance.now(), d = now - last; last = now;
        if (!isPaused()) { if (audio && !started) waited += d; else if (!audio) left -= d; }
        if (audio && !started && waited > 6000) fallback();
        follow();
        if (!audio && left <= 0 && !(clipOn && !clip.paused && !clip.ended)) return finish(true);
        setTimeout(step, 80);
      };
      step();
    });
  }
  function pause(p) {
    if (el.hidden) return;
    if (p) { if (audio) voice.pause(); idle.pause(); talk.pause(); clip.pause(); }
    else { if (audio) voice.play().catch(() => {}); else if (clipOn && speaking) clip.play().catch(() => {}); face(speaking); }
  }
  const shotNow = () => (el.hidden ? "" : el.dataset.shot || "");
  // Sound switched on or off mid-line.
  const setHearing = h => { voice.muted = !h; };
  return { shot, say, hide, pause, shotNow, unlock, setHearing };
}

// Warm the browser's cache for lines coming up (voice and lip-synced clip).
export function prefetchLines(lines) { for (const l of lines) for (const u of [l?.audio, l?.clip]) if (u) fetch(u, { priority: "low" }).catch(() => {}); }
