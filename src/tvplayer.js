// Rashtrix TV player. One renderer for both channels and both uses:
//   - the OBS / vMix outputs (tv.html?ch=h|v&key=…): the clean picture at 1920×1080 or
//     1080×1920, with sound, nothing to click;
//   - the app's own player (Watch page): the same picture scaled to the screen, muted until the
//     viewer taps for sound.
// The running order comes from /api/tv/<ch> (every screen computes the same position from the
// channel clock). YouTube plays with its controls hidden (controls=0) under a layer that takes
// every click, so viewers never reach YouTube's own buttons or links.
// On-air graphics are in Bengali whatever the reader's language.

const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bnDigits = s => String(s).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
const DESK_BN = { Kolkata: "কলকাতা", "West Bengal": "পশ্চিমবঙ্গ", India: "ভারত", "Probashi Bangali": "প্রবাসী বাঙালি", World: "বিশ্ব" };
const SIZE = { h: [1920, 1080], v: [1080, 1920] };
const LOGO = "/brand/logo.webp";

/* ---------- YouTube, controls hidden ---------- */
let ytReady = null;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise(res => {
    if (window.YT?.Player) return res(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.async = true;
    s.onerror = () => res(null);
    document.head.append(s);
    setTimeout(() => res(window.YT?.Player ? window.YT : null), 8000);
  });
  return ytReady;
}

/* ---------- Music: an original breaking sting, made in the browser (nothing licensed) ---------- */
function breakingSting(ctx, seconds = 6) {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05, out = ctx.createGain(); out.gain.value = 0.22; out.connect(ctx.destination);
  const tone = (f, at, len, type = "sawtooth", vol = 0.5) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = 2400;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.02); g.gain.exponentialRampToValueAtTime(0.001, at + len);
    o.connect(lp).connect(g).connect(out); o.start(at); o.stop(at + len + 0.05);
  };
  // Three urgent hits, then a held minor chord with a pulse underneath.
  [0, 0.32, 0.64].forEach((d, i) => { tone(110, t0 + d, 0.28, "square", 0.6); tone(220 * (i === 2 ? 1.19 : 1), t0 + d, 0.25, "sawtooth", 0.35); });
  [220, 261.6, 329.6, 440].forEach(f => tone(f, t0 + 1.0, seconds - 1.2, "sawtooth", 0.18));
  for (let b = 1.0; b < seconds - 0.3; b += 0.5) tone(55, t0 + b, 0.3, "triangle", 0.7);
}

/* ---------- The player ---------- */
export function mountTV(host, { channel = "h", output = false, onState } = {}) {
  const [W, H] = SIZE[channel];
  host.innerHTML = `<div class="tvp-fit"><div class="tvp tvp-${channel}" style="width:${W}px;height:${H}px">
      <div class="tvp-bg"><i class="dots"></i><i class="arc a1"></i><i class="arc a2"></i><i class="sheen"></i></div>
      <div class="tvp-video"><div class="tvp-yt"></div><img class="tvp-poster" alt="" hidden onerror="this.hidden=true"><div class="tvp-shield"></div></div>
      <div class="tvp-pkg" hidden></div>
      <div class="tvp-gfx"></div>
      <div class="tvp-off" hidden><img src="${LOGO}" alt=""><b>শিগগির ফিরছি</b></div>
    </div></div>${output ? "" : `<button class="tvp-sound" type="button">🔇 শব্দ চালু করতে ট্যাপ করুন</button>`}`;
  const fit = host.querySelector(".tvp-fit"), stage = host.querySelector(".tvp");
  const $ = s => stage.querySelector(s);
  const scale = () => { const k = Math.min(fit.clientWidth / W, (fit.clientHeight || fit.clientWidth * H / W) / H); stage.style.transform = `scale(${k})`; fit.style.height = output ? "" : `${H * (fit.clientWidth / W)}px`; };
  const ro = new ResizeObserver(scale); ro.observe(fit); scale();

  const st = { state: null, skew: 0, seg: null, segKey: "", player: null, ytOk: false, muted: !output, audio: null, shownBreaking: "", pkgTimer: null, flash: 0, alive: true };
  const now = () => Date.now() + st.skew;

  /* sound: outputs play with sound; app viewers tap once */
  const soundBtn = host.querySelector(".tvp-sound");
  const unmute = () => {
    st.muted = false; soundBtn?.remove();
    try { st.audio ||= new (window.AudioContext || window.webkitAudioContext)(); st.audio.resume(); } catch { /* no audio */ }
    try { st.player?.unMute?.(); st.player?.setVolume?.(100); } catch { /* not ready */ }
  };
  soundBtn?.addEventListener("click", unmute);
  if (output) { try { st.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* none */ } }
  if (!output) host.querySelector(".tvp-shield").addEventListener("click", () => st.muted && unmute());

  /* YouTube player */
  loadYT().then(YT => {
    if (!YT || !st.alive) return;
    st.player = new YT.Player($(".tvp-yt"), {
      width: "100%", height: "100%",
      playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1, fs: 0, autoplay: 1, mute: st.muted ? 1 : 0, cc_load_policy: 0, origin: location.origin },
      events: {
        onReady: () => { st.ytOk = true; if (st.muted) st.player.mute(); st.segKey = ""; tick(); },
        onError: () => { $(".tvp-poster").hidden = false; },
        onStateChange: e => { if (e.data === 1) $(".tvp-poster").hidden = true; }
      }
    });
  });

  function playVideo(ytId, offset, thumb, live = false) {
    const poster = $(".tvp-poster");
    poster.src = thumb || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`; poster.hidden = false;
    if (!st.ytOk) return;
    try { st.player.loadVideoById(live ? { videoId: ytId } : { videoId: ytId, startSeconds: Math.max(0, offset) }); if (st.muted) st.player.mute(); else st.player.unMute(); } catch { /* keep the poster */ }
  }
  function stopVideo() { try { st.player?.pauseVideo?.(); } catch { /* none */ } }

  /* ---------- graphics ---------- */
  const ist = () => bnDigits(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }));
  const tickerHTML = list => { const items = list.map(t => `<span>${esc(t)}</span>`).join("<i>◆</i>"); return `<div class="tk-move" style="--dur:${Math.max(40, list.length * 9)}s"><div>${items}<i>◆</i></div><div aria-hidden="true">${items}<i>◆</i></div></div>`; };
  const adBox = ad => ad?.image ? `<div class="tv-ad img"><img src="${esc(ad.image)}" alt=""></div>` : `<div class="tv-ad"><b>${esc(ad?.line1 || "")}</b><hr><small>${esc(ad?.line2 || "")}</small><hr><small>${esc(ad?.line3 || "")}</small></div>`;
  function drawJacket() {
    const s = st.state; if (!s) return;
    const seg = st.seg, isVideo = seg?.type === "video" || s.live, title = s.live ? s.live.title : seg?.title || "";
    if (channel === "h") {
      const lb = s.lband?.on;
      stage.classList.toggle("lband", !!lb);
      $(".tvp-gfx").innerHTML = `
        <div class="tv-bug"><img src="${LOGO}" alt=""></div>
        <div class="tv-live"><i></i>LIVE</div><div class="tv-clock">${ist()}</div>
        ${lb ? `<div class="lb-side"><span class="lb-kicker">শিরোনাম</span>${s.headlines.slice(0, 5).map(h => `<p><small>${esc(DESK_BN[h.desk] || "")}</small>${esc(h.text)}</p>`).join("")}</div><div class="lb-bottom"><b>${esc(s.lband.text || s.headlines[0]?.text || "")}</b>${adBox(s.ad)}</div>` : ""}
        ${!lb && isVideo ? `<div class="tv-l3"><span class="lt-tag">রাষ্ট্রিক্স</span><span class="lt-text">${esc(s.lowerThird || title)}</span></div>${adBox(s.ad)}` : ""}
        <div class="tv-ticker"><span class="tk-label">শিরোনাম</span><div class="tk-track">${tickerHTML(s.ticker)}</div></div>`;
    } else {
      // Vertical: a Short carries its own jacket, so graphics stay in its safe zones: the headline
      // flash over the left of the portrait strip, LIVE in the video's corner, the ticker below.
      if (seg?.type === "promo" && !s.live) { $(".tvp-gfx").innerHTML = ""; return; }   // promo cards are full screen
      const flash = s.band || s.headlines[st.flash % Math.max(1, s.headlines.length)]?.text || "";
      $(".tvp-gfx").innerHTML = `
        ${isVideo ? `<div class="v-flash"><span>${s.band ? "রাষ্ট্রিক্স" : "শিরোনাম"}</span><b>${esc(flash)}</b></div><div class="tv-live v"><i></i>LIVE</div>` : ""}
        <div class="tv-ticker v"><span class="tk-label">খবর</span><div class="tk-track">${tickerHTML(s.ticker)}</div></div>`;
    }
  }
  // The app-drawn vertical jacket, in the same positions as the Shorts jacket.
  const vJacket = (inner, band) => `<div class="vj"><img class="vj-strip" src="/brand/jacket-strip.webp" alt=""><div class="vj-logo"><img src="${LOGO}" alt=""></div>
    <div class="vj-frame">${inner}</div><div class="vj-band"><b>${esc(band)}</b>${adBox(st.state?.ad)}</div></div>`;

  /* ---------- packages: News Update / Bulletin, breaking, promo cards ---------- */
  function headlineSets(s) {
    const H = s.headlines, sets = [], used = new Set();
    const take = (pred, label) => { const l = H.filter(h => !used.has(h.text) && pred(h)).slice(0, 5); l.forEach(h => used.add(h.text)); if (l.length >= 3) sets.push({ label, items: l }); };
    take(() => true, "সর্বশেষ");
    take(h => h.desk === "Kolkata" || h.desk === "West Bengal", "কলকাতা ও রাজ্য");
    take(h => h.desk === "India" || h.desk === "Probashi Bangali", "দেশ");
    take(h => h.desk === "World", "বিশ্ব");
    take(() => true, "আরও খবর");
    return sets.slice(0, s.sets);
  }
  function showNews(seg) {
    const s = st.state, pkg = $(".tvp-pkg"), bulletin = new Date(seg.start).getMinutes() < 5, sets = headlineSets(s);
    const name = bulletin ? "বুলেটিন" : "নিউজ আপডেট";
    stopVideo(); pkg.hidden = false; stage.classList.add("pkg-on");
    const elapsed = (now() - seg.start) / 1000, step = s.setSeconds;
    let i = Math.floor(Math.max(0, elapsed - 5) / step);
    const card = () => channel === "h"
      ? `<div class="nu-title"><img src="${LOGO}" alt=""><b>${name}</b><small>${bnDigits(new Date().toLocaleDateString("bn-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long" }))} · ${ist()}</small></div>`
      : vJacket(`<div class="nu-title v"><b>${name}</b><small>${ist()}</small></div>`, name);
    const set = k => { const x = sets[k]; if (!x) return card();
      const list = `<div class="nu-set"><div class="nu-head"><span>${name}</span><b>${esc(x.label)}</b><i style="--d:${step}s"></i></div><ol>${x.items.map((h, n) => `<li style="--n:${n}"><em>${bnDigits(n + 1)}</em><span>${esc(h.text)}</span></li>`).join("")}</ol></div>`;
      return channel === "h" ? list : vJacket(list, x.label); };
    const draw = () => { const e = (now() - seg.start) / 1000; pkg.innerHTML = e < 5 || !sets.length ? card() : set(Math.min(sets.length - 1, Math.floor((e - 5) / step))); };
    draw(); clearInterval(st.pkgTimer); st.pkgTimer = setInterval(draw, 1000);
  }
  function showPromo(seg) {
    stopVideo(); const pkg = $(".tvp-pkg"); pkg.hidden = false; stage.classList.add("pkg-on");
    clearInterval(st.pkgTimer);
    pkg.innerHTML = `<div class="tv-promo"><img src="${esc(seg.image)}" alt=""></div>`;
  }
  function hidePkg() { clearInterval(st.pkgTimer); $(".tvp-pkg").hidden = true; $(".tvp-pkg").innerHTML = ""; stage.classList.remove("pkg-on"); }
  function showBreaking(b) {
    const el = document.createElement("div"); el.className = "tv-breaking";
    el.innerHTML = channel === "h"
      ? `<div class="br-slash"></div><div class="br-in"><span class="br-tag">ব্রেকিং নিউজ</span><b>${esc(b.text)}</b><img src="${LOGO}" alt=""></div><div class="br-bar"></div>`
      : vJacket(`<div class="br-v"><span class="br-tag">ব্রেকিং নিউজ</span><b>${esc(b.text)}</b></div>`, "ব্রেকিং নিউজ");
    stage.append(el);
    if (b.music && st.audio && !st.muted) breakingSting(st.audio, Math.min(b.seconds, 8));
    const wasMuted = st.muted; try { st.player?.mute?.(); } catch { /* none */ }
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 600); if (!wasMuted && !st.muted) try { st.player?.unMute?.(); } catch { /* none */ } }, b.seconds * 1000);
  }

  /* ---------- the clock: what should be on screen now ---------- */
  function tick() {
    const s = st.state; if (!s || !st.alive) return;
    $(".tvp-off").hidden = s.on; if (!s.on) { stopVideo(); hidePkg(); return; }
    // Break-in: once per breaking line on every screen.
    if (s.breaking && st.shownBreaking !== s.breaking.at && now() - Date.parse(s.breaking.at) < 90e3) { st.shownBreaking = s.breaking.at; showBreaking(s.breaking); }
    if (s.live) {
      const key = `live:${s.live.ytId}`;
      if (st.segKey !== key) { st.segKey = key; st.seg = null; hidePkg(); playVideo(s.live.ytId, 0, "", true); }
      drawJacket(); return;
    }
    const t = now(), seg = s.schedule.find(x => x.start <= t && t < x.start + x.dur * 1000) || null;
    const key = seg ? `${seg.type}:${seg.ytId || seg.id || ""}:${seg.start}` : "";
    if (key !== st.segKey) {
      st.segKey = key; st.seg = seg; st.flash++;
      if (!seg) { stopVideo(); hidePkg(); }
      else if (seg.type === "video") { hidePkg(); playVideo(seg.ytId, (t - seg.start) / 1000, seg.thumb); }
      else if (seg.type === "news") showNews(seg);
      else if (seg.type === "promo") showPromo(seg);
    } else if (seg?.type === "video" && st.ytOk) {
      // Keep in step with the channel clock (a stalled or slow start).
      try { const want = (t - seg.start) / 1000, cur = st.player.getCurrentTime?.() || 0; if (Math.abs(cur - want) > 6 && st.player.getPlayerState?.() === 1) st.player.seekTo(want, true); } catch { /* not ready */ }
    }
    drawJacket();
  }
  async function load() {
    try {
      const r = await fetch(`/api/tv/${channel}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const s = await r.json(); st.skew = s.serverTime - Date.now(); st.state = s; onState?.(s);
    } catch { /* keep the last state */ }
    tick();
  }
  load();
  const t1 = setInterval(load, 5000), t2 = setInterval(tick, 1000), t3 = setInterval(() => { st.flash++; }, 8000);
  return { destroy() { st.alive = false; clearInterval(t1); clearInterval(t2); clearInterval(t3); clearInterval(st.pkgTimer); ro.disconnect(); try { st.player?.destroy?.(); } catch { /* none */ } host.innerHTML = ""; }, unmute };
}
