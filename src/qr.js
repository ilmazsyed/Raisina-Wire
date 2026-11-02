// QR codes made in the browser (no outside service): an SVG for pages, and the raw grid for the
// printable poster in the control room.
import qrcode from "qrcode-generator";

export function qrMatrix(text) {
  const q = qrcode(0, "M");
  q.addData(String(text));
  q.make();
  const n = q.getModuleCount();
  return { n, dark: (r, c) => q.isDark(r, c) };
}

export function qrSvg(text, { margin = 2, fg = "#0b0f1e", bg = "#fff", label = "QR code" } = {}) {
  const { n, dark } = qrMatrix(text), s = n + margin * 2;
  let d = "";
  // One path, with each run of dark squares in a row drawn as a single rectangle.
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark(r, c)) continue;
      let w = 1; while (c + w < n && dark(r, c + w)) w++;
      d += `M${c + margin} ${r + margin}h${w}v1h-${w}z`;
      c += w - 1;
    }
  }
  return `<svg class="qr" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" role="img" aria-label="${label}"><rect width="${s}" height="${s}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}
