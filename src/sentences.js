// Whole sentences, never a "…". The channel's text (the bulletin's lines, the AVO stories, the
// segments, the wire's headlines) is cut only at the end of a sentence, and a trailing "…" or
// "..." (from a source or a model) is taken off. Shared by the Worker and the TV engine.
export const plainText = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/[#*_>]+/g, " ").replace(/\s+/g, " ").trim();
// A headline or a line with no ellipsis: one at the end goes; one inside becomes a pause.
export const noDots = s => String(s || "").replace(/\s*(?:…|\.{3,}|।{2,})\s*$/u, "").replace(/\s*(?:…|\.{3,})\s*/gu, ", ").replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
// The text's sentences, each ending in a দাঁড়ি (or ? !).
export function sentencesIn(text) {
  const t = noDots(plainText(String(text || "").replace(/\s*\n+\s*/g, "। "))).replace(/\s*([,;:।!?])\s*/g, "$1 ").replace(/([।!?])\s*([।!?])+/g, "$1").replace(/\.(\s|$)/g, "।$1").trim();
  return t.split(/(?<=[।!?])\s+/).map(x => x.trim()).filter(Boolean).map(x => /[।!?]$/.test(x) ? x : `${x}।`);
}
// As many whole sentences as fit in max characters (always at least the first, whole).
export function wholeSentences(text, max = 600) {
  let out = "";
  for (const x of sentencesIn(text)) { const next = out ? `${out} ${x}` : x; if (out && next.length > max) break; out = next; }
  return out;
}
