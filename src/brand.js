// Raisina Wire brand marks: the crimson dome tile, the Raisina Hill skyline as line art, and the tricolour as plain bars.
// The skyline is architecture only (central dome, colonnade, North and South Block domes);
// no seal, emblem or Ashoka Chakra is used anywhere.

const cols = (x0, x1, step, y0, y1) => { let d = ""; for (let x = x0; x <= x1; x += step) d += `M${x} ${y0}V${y1}`; return d; };
const sideBlock = (x0, x1) => {
  const c = (x0 + x1) / 2;
  return `<path d="M${x0} 112V82H${x1}V112M${x0 - 3} 82H${x1 + 3}M${x0} 86H${x1}"/>`
    + `<path d="${cols(x0 + 8, x1 - 8, 9, 91, 108)}" stroke-width="0.8"/>`
    + `<path d="M${c - 12} 82V72H${c + 12}V82M${c - 14} 72H${c + 14}"/>`
    + `<path d="M${c - 11} 72C${c - 11} 63 ${c - 6} 58 ${c} 58C${c + 6} 58 ${c + 11} 63 ${c + 11} 72"/>`
    + `<path d="M${c} 58V51M${c - 2} 51H${c + 2}"/>`
    + `<path d="M${x0 + 2} 82A6 6 0 0 1 ${x0 + 14} 82M${x1 - 14} 82A6 6 0 0 1 ${x1 - 2} 82M${x0 + 8} 76V73M${x1 - 8} 76V73"/>`;
};
const SKYLINE = '<path d="M0 112H600"/>' + sideBlock(36, 150) + sideBlock(450, 564)
  + '<path d="M150 112V97H200M400 97H450V112M150 100H200M400 100H450"/>'
  + '<path d="M200 112V84H400V112M194 84H406M200 88H400"/>'
  + `<path d="${cols(210, 390, 8, 92, 112)}" stroke-width="0.8"/>`
  + '<path d="M260 84V68H340V84M254 68H346M258 72H342"/>'
  + `<path d="${cols(266, 334, 8, 73, 84)}" stroke-width="0.8"/>`
  + '<path d="M264 68C264 41 281 25 300 25C319 25 336 41 336 68"/>'
  + '<path d="M300 25V68M285 30C278 41 276 55 276 68M315 30C322 41 324 55 324 68" stroke-width="0.8"/>'
  + '<path d="M294 25V17H306V25M291 17H309M300 17V8M297 8H303"/>'
  + '<path d="M204 84A9 9 0 0 1 222 84M378 84A9 9 0 0 1 396 84M213 75V71M387 75V71"/>';

const svg = (viewBox, cls, strokeWidth) =>
  `<svg class="${cls}" viewBox="${viewBox}" preserveAspectRatio="xMidYMax meet" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${SKYLINE}</svg>`;

// The app mark: Rashtrapati Bhavan's dome as bold line art on a crimson tile, tricolour bars beneath.
// Drawn on its own 100-unit grid so it stays legible down to favicon size.
const cols2 = (x0, x1, step, y0, y1) => { let d = ""; for (let x = x0; x <= x1 + 0.01; x += step) d += `M${+x.toFixed(1)} ${y0}V${y1}`; return d; };
export const MARK_DOME = '<path d="M50 12V22M47 12H53"/>'
  + '<path d="M27 46A23 22 0 0 1 73 46"/><path d="M33 37H67" stroke-width="2.2"/>'
  + `<path d="M24 46H76M26 51H74"/><path d="${cols2(31, 69, 6.3, 51, 61)}" stroke-width="2.4"/><path d="M23 61H77"/>`
  + '<path d="M14 66A5 4.5 0 0 1 24 66M76 66A5 4.5 0 0 1 86 66M12 66H26M74 66H88"/>'
  + `<path d="M8 70H92"/><path d="${cols2(14, 86, 6, 70, 81)}" stroke-width="2.4"/><path d="M6 81H94M4 86H96"/>`;
export const markDome = (cls = "mark-dome", strokeWidth = 3.6) =>
  `<svg class="${cls}" viewBox="1 7 98 82" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${MARK_DOME}</svg>`;
export const brandMark = (cls = "brand-mark") => `<span class="${cls}" aria-hidden="true">${markDome()}<span class="mark-tri"><i></i><i></i><i></i></span></span>`;
// The full skyline; `band` crops to the lower half for a horizon line under the masthead.
export const skyline = (cls = "skyline", band = false) => svg(band ? "0 60 600 54" : "0 0 600 120", cls, band ? 0.7 : 1.2);
export const tribar = (cls = "tribar") => `<span class="${cls}" aria-hidden="true"><i></i><i></i><i></i></span>`;
export const wordmark = () => `Raisina<em> Wire</em>`;
