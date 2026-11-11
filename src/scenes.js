// Scenes: what a channel shows at one moment. Shared by the Worker (rundown items → scenes) and
// the screens (the program engine draws them). A scene is
//   { layout, sources: [source…], graphic, lower, ticker, label, dur }
// layouts: full, pip, 2up, 1big2, 3eq, host4, grid6, lband, graphic
// sources: { kind: "yt", id, in, out } · { kind: "clip", url, in, out } · { kind: "hls", url }
//          { kind: "whep", url } · { kind: "vdo", url } · { kind: "guest", id, name, title }
//          { kind: "image", url } · { kind: "continuity" } (the channel's own running order)
// graphics: { kind: "breaking", text, music } · { kind: "headlines", title, lines }
//           { kind: "slate", text, image } · { kind: "promo", image } · { kind: "ads", items }
//           { kind: "poll", id } · { kind: "results", id } · { kind: "standby" }

export const LAYOUTS = {
  full: { name: "Full screen", slots: 1 },
  pip: { name: "Picture in picture", slots: 2 },
  "2up": { name: "Two up", slots: 2 },
  "1big2": { name: "One big, two small", slots: 3 },
  "3eq": { name: "Three equal", slots: 3 },
  host4: { name: "Host and four", slots: 5 },
  grid6: { name: "Six grid", slots: 6 },
  lband: { name: "L-band", slots: 1 },
  graphic: { name: "Full graphic", slots: 0 }
};
export const ITEM_TYPES = {
  video: "YouTube video", clip: "App clip", live: "Live segment", breaking: "Full-screen breaking",
  headlines: "Headline set", lband: "L-band", promo: "Promo card", adbreak: "Ad break", slate: "Slate"
};
export const TRANSITIONS = { cut: "Cut", mix: "Mix", wipe: "Red slash wipe", stinger: "Stinger" };

const lines = v => (Array.isArray(v) ? v : String(v || "").split("\n")).map(x => String(x).trim()).filter(Boolean).slice(0, 12);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// The planned length of an item (a trimmed video runs from its in point to its out point).
export function itemDuration(item) {
  const d = item.data || {};
  if ((item.type === "video" || item.type === "clip") && num(d.out) > num(d.in)) return Math.round(num(d.out) - num(d.in));
  if (item.type === "adbreak") return Math.max(5, (d.items || []).reduce((n, x) => n + num(x.seconds, 10), 0)) || item.duration;
  return Math.max(1, Math.round(num(item.duration, 30)));
}

// One rundown item → the scene that goes on air for it.
export function itemScene(item) {
  const d = item.data || {}, base = { label: item.title || "", lower: d.lowerThird ? { name: d.lowerThird, title: d.lowerTitle || "" } : null, ticker: lines(d.ticker), dur: itemDuration(item), itemId: item.id };
  switch (item.type) {
    case "video": return { ...base, layout: "full", sources: [{ kind: "yt", id: d.ytId, in: num(d.in), out: num(d.out) || null, title: item.title }] };
    case "clip": return { ...base, layout: "full", sources: [{ kind: "clip", url: d.url, in: num(d.in), out: num(d.out) || null }] };
    case "live": return { ...base, layout: d.layout || "full", sources: (d.sources || []).slice(0, 6) };
    case "breaking": return { ...base, layout: "graphic", sources: [], graphic: { kind: "breaking", text: d.text || item.title, music: d.music !== false } };
    case "headlines": return { ...base, layout: "graphic", sources: [], graphic: { kind: "headlines", title: d.title || item.title, lines: lines(d.lines).slice(0, 5) } };
    case "lband": return { ...base, layout: "lband", sources: d.source ? [d.source] : [{ kind: "continuity" }], graphic: { kind: "lband", text: d.text || item.title, lines: lines(d.lines).slice(0, 5) } };
    case "promo": return { ...base, layout: "graphic", sources: [], graphic: { kind: "promo", image: d.image } };
    case "adbreak": return { ...base, layout: "graphic", sources: [], graphic: { kind: "ads", items: (d.items || []).map(x => ({ image: x.image, url: x.url, seconds: num(x.seconds, 10), sponsorId: x.sponsorId || null })) } };
    case "slate": return { ...base, layout: "graphic", sources: [], graphic: { kind: "slate", text: d.text || item.title, image: d.image || "" } };
    default: return { ...base, layout: "graphic", sources: [], graphic: { kind: "slate", text: item.title } };
  }
}

// Running times: each item's start from the top of the show, the total, and the time left in
// the slot (back-timing: when each item must start for the show to end on time).
export function timings(items, slotSeconds = 0) {
  let t = 0;
  const rows = items.map(it => { const d = itemDuration(it); const r = { id: it.id, start: t, dur: d }; t += d; return r; });
  const total = t;
  let back = slotSeconds || total;
  for (let i = rows.length - 1; i >= 0; i--) { back -= rows[i].dur; rows[i].backStart = back; }
  return { rows, total, slot: slotSeconds, over: slotSeconds ? total - slotSeconds : 0 };
}
export const fmtDur = s => { s = Math.round(Math.abs(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(x).padStart(2, "0")}`; };

// AUTOPILOT: the channel's own running order is on air (no rundown, and no take other than it).
// It is on by default; taking a scene or putting a rundown on air switches it off.
export const autopilotOn = c => !!c && !c.standby?.on && ((c.mode === "auto" && !c.rundown) || (c.mode === "manual" && !c.program?.graphic && (c.program?.sources || []).length === 1 && c.program.sources[0].kind === "continuity"));
