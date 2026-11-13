// Shared by src/tvchannel.js and src/control.js.
// A breaking: one to five lines (each up to 160 characters) read back to back, each on screen for
// `seconds`; and, if given, one picture, a muted video or a YouTube video with it.
export function breakingOf(b) {
  const lines = (Array.isArray(b?.lines) && b.lines.length ? b.lines : [b?.text]).map(x => String(x || "").replace(/\s+/g, " ").trim().slice(0, 160)).filter(Boolean).slice(0, 5);
  if (!lines.length) throw new Error("Write the breaking headline.");
  const seconds = Math.max(5, Math.min(60, Math.round(Number(b?.seconds) || 20)));
  let media = null; const u = String(b?.media?.url || "").trim();
  if (u && (/^https:\/\//.test(u) || /^\/(media|clips)\//.test(u))) {
    const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/);
    media = yt ? { kind: "yt", id: yt[1], url: u } : { kind: b.media.kind === "video" || /^\/clips\/|\.(mp4|webm|mov|m3u8)(\?|$)/i.test(u) ? "video" : "image", url: u };
  }
  return { text: lines[0], lines, seconds, total: seconds * lines.length, music: b?.music !== false, media };
}
