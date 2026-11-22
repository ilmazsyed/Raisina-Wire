// The Rashtrix TV player in the reader app. The program engine (src/engine.js) and its graphics
// (src/tv.css) are about 370 KB: they load only when a player is about to come on screen, so a
// reader who opens a story never downloads them. A player starts when it scrolls into view
// (or 300 px before). With `offscreen` set (the home page's players), one that has been out of
// view for 20 seconds is stopped and its memory freed (on a phone, the channel running unseen
// under the news costs graphics memory); it starts again, where the channel is, when it comes back.
let engine = null;
const load = () => engine ||= import("./engine.js").catch(e => { engine = null; throw e; });
// (warm the engine in the background once the page is idle, so the first player starts at once)
export function preloadTV() { (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => load().catch(() => {})); }

export function mountTV(host, opts = {}) {
  const { offscreen = false, ...rest } = opts;
  let real = null, dead = false, outT = 0, starting = false;
  const start = () => {
    if (real || starting || dead) return;
    starting = true;
    load().then(m => { starting = false; if (dead || !host.isConnected || real) return; real = m.mountTV(host, rest); })
      .catch(() => { starting = false; if (!dead) host.innerHTML = `<div class="tv-safe-start"><span>▶</span></div>`; });
  };
  const stop = () => { clearTimeout(outT); outT = 0; try { real?.destroy(); } catch { /* gone */ } real = null; };
  let io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(es => {
      const vis = es.some(e => e.isIntersecting);
      if (vis) { clearTimeout(outT); outT = 0; start(); }
      else if (offscreen && real && !outT) outT = setTimeout(() => { outT = 0; if (!document.querySelector(".tvp-fsfix")) stop(); }, 20e3);
    }, { rootMargin: "300px 0px" });
    io.observe(host);
  } else start();
  return {
    destroy() { dead = true; io?.disconnect(); stop(); },
    get engine() { return real; }
  };
}
export async function breakingSting(...a) { return (await load()).breakingSting(...a); }
