// Raisina TV: the AI anchor on screen (live channel only; never inside the explainer videos).
// The anchor is a photoreal loop made offline from her portrait (public/anchors/<key>-idle.mp4 with
// blinks, <key>-talk.mp4 talking) set in the studio, with a name strap and an AI label. While a
// line plays the talking loop runs; between lines, the idle loop. Lips are approximate, not
// word-synced. Lines are written and voiced on the server (src/anchors.js) and fetched by id.
//
// Shots: "cam" the anchor full screen in the studio; "vo" her voice over the pictures, with only
// the strap on screen; "pip" the anchor in a window beside a title card.
const file = (key, kind) => `/anchors/${key}-${kind}.mp4`;

export function createAnchor(screen, { isPaused, hearing, label }) {
  const el = document.createElement("div");
  el.className = "tv-anchor"; el.hidden = true; el.setAttribute("aria-live", "polite");
  el.innerHTML = `<div class="ta-cam"><span class="ta-fill"></span>
      <span class="ta-frame"><video class="ta-v ta-idle" muted playsinline loop preload="auto"></video><video class="ta-v ta-talk" muted playsinline loop preload="auto"></video></span></div>
    <span class="ta-pick" hidden></span>
    <div class="ta-strap"><span class="ta-face"></span><span class="ta-who"><b></b><small></small></span><span class="ta-ai">AI</span><span class="ta-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
    <div class="ta-line" hidden></div>`;
  screen.querySelector(".tv-seq").after(el);
  const idle = el.querySelector(".ta-idle"), talk = el.querySelector(".ta-talk");
  let who = "", audio = null, speaking = false;

  function setWho(key, a) {
    if (who === key) return;
    who = key;
    el.querySelector(".ta-fill").style.backgroundImage = `url('/anchors/${key}.jpg')`;
    el.querySelector(".ta-face").style.backgroundImage = `url('/anchors/${key}.jpg')`;
    el.querySelector(".ta-who b").textContent = a?.name || "";
    el.querySelector(".ta-who small").textContent = label(a?.role || "AI Live Anchor");
    for (const [v, kind] of [[idle, "idle"], [talk, "talk"]]) { v.poster = `/anchors/${key}.jpg`; v.src = file(key, kind); }
  }
  function mouth(on) {
    speaking = on; el.classList.toggle("talking", on);
    const v = on ? talk : idle, other = on ? idle : talk;
    if (!isPaused()) v.play().catch(() => {});
    other.pause();
  }
  // Show the anchor in a shot (cam, vo or pip), with an optional "Editor's Pick" tag.
  function shot(kind, { key, roster, pick = "" } = {}) {
    if (key) setWho(key, roster?.[key]);
    el.dataset.shot = kind;
    const p = el.querySelector(".ta-pick"); p.hidden = !pick; p.textContent = pick;
    if (el.hidden) { el.hidden = false; void el.offsetWidth; }
    el.classList.add("on");
    mouth(speaking);
  }
  function hide() {
    stopAudio(); mouth(false); idle.pause(); talk.pause();
    el.classList.remove("on", "talking"); el.hidden = true; el.dataset.shot = "";
  }
  function stopAudio() { if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio.removeAttribute("src"); audio = null; } }

  // Say a line: resolves when the audio ends (or, without sound, after reading time), or early
  // if `alive()` turns false (a newer sequence took over). Pausing the TV pauses the line.
  function say(line, alive) {
    return new Promise(res => {
      if (!line?.text) return res(true);
      const cap = el.querySelector(".ta-line");
      cap.textContent = line.text; cap.hidden = hearing();
      const words = line.text.split(/\s+/).length, est = 600 + words / 2.55 * 1000;
      let done = false, left = est, last = performance.now(), started = false;
      const finish = ok => { if (done) return; done = true; mouth(false); stopAudio(); cap.hidden = true; res(ok); };
      if (hearing()) {
        stopAudio();
        audio = new Audio(`/api/tv/voice/${line.id}.mp3`);
        audio.onplaying = () => { started = true; mouth(true); };
        audio.onended = () => finish(true);
        audio.onerror = () => { audio = null; started = true; mouth(true); }; // no voice: fall back to reading time
        if (!isPaused()) audio.play().catch(() => { audio = null; started = true; mouth(true); });
      } else { started = true; mouth(true); }
      // Watchdog: the reading-time clock runs while there's no audio; a stalled voice is cut off.
      let waited = 0;
      const step = () => {
        if (done) return;
        if (!alive()) return finish(false);
        const now = performance.now(), d = now - last; last = now;
        if (!isPaused()) { if (audio && !started) waited += d; else if (!audio) left -= d; }
        if (audio && !started && waited > 6000) { stopAudio(); started = true; mouth(true); }
        if (!audio && left <= 0) return finish(true);
        setTimeout(step, 80);
      };
      step();
    });
  }
  function pause(p) {
    if (el.hidden) return;
    if (p) { audio?.pause(); idle.pause(); talk.pause(); }
    else { audio?.play().catch(() => {}); (speaking ? talk : idle).play().catch(() => {}); }
  }
  const shotNow = () => (el.hidden ? "" : el.dataset.shot || "");
  return { shot, say, hide, pause, shotNow };
}

// Warm the server's voice cache and the browser's for lines coming up.
export function prefetchLines(lines) { for (const l of lines) if (l?.id) fetch(`/api/tv/voice/${l.id}.mp3`, { priority: "low" }).catch(() => {}); }
