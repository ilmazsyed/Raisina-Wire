// The e-paper: Daily Rashtrix (দৈনিক রাষ্ট্রিক্স, दैनिक राष्ट्रिक्स), the printed edition of the
// Newsprint desk (src/epaper.js), laid out as a broadsheet: the front page with The Hindu's
// arrangement of the nameplate (the crest between the words), the inside pages section by
// section, and the horoscope. It opens half-folded, then unfolds; the pages turn; any story opens
// on its own (reader mode). Bengali for everyone; English and Hindi for signed-in readers.
import "./epaperview.css";

const q = new URLSearchParams(location.search);
const LANG = ["bn", "en", "hi"].includes(q.get("lang")) ? q.get("lang") : (location.pathname.match(/^\/(en|hi)\//) || [])[1] || "bn";
const W = {
  bn: { daily: "দৈনিক", name: "রাষ্ট্রিক্স", city: "কলকাতা", page: "পাতা", pages: "পাতা", free: "বিনামূল্যে", tag: "খবর দেখুন · শুনুন · পড়ুন", vol: "বর্ষ ১", inBrief: "এক নজরে", more: "আরও খবর", inside: "ভিতরের পাতায়", cont: "বাকি অংশ পড়ুন", stars: "রাশিফল", updated: "হালনাগাদ", moving: "চলমান ছবি",
    ad1: "খবর দেখুন,<br>শুনুন, পড়ুন", ad2: "রাষ্ট্রিক্স ২৪×৭ — চব্বিশ ঘণ্টা সরাসরি খবর, এখন আপনার ফোনে। লাইভ টিভি, ই-পেপার আর প্রতি মুহূর্তের খবর।", cta: "অ্যাপ ডাউনলোড করুন", imprint: "রাষ্ট্রিক্স ২৪×৭ নিউজ, কলকাতা থেকে প্রকাশিত।",
    unfold: "কাগজ খুলুন ▾", prev: "আগের পাতা", next: "পরের পাতা", listen: "পড়ে শোনান", bigger: "অক্ষর বড়", share: "শেয়ার", full: "পুরো খবর ওয়েবসাইটে", none: "প্রথম সংস্করণ এখনও বেরোয়নি", noneB: "প্রভাতী সংস্করণ সকাল ৭টায়, সান্ধ্য সংস্করণ বিকেল ৫টায়।", home: "রাষ্ট্রিক্স", epaper: "ই-পেপার",
    signs: ["মেষ", "বৃষ", "মিথুন", "কর্কট", "সিংহ", "কন্যা", "তুলা", "বৃশ্চিক", "ধনু", "মকর", "কুম্ভ", "মীন"] },
  en: { daily: "DAILY", name: "RASHTRIX", city: "Kolkata", page: "Page", pages: "pages", free: "Free", tag: "Watch · Listen · Read", vol: "Vol. I", inBrief: "In brief", more: "More news", inside: "Inside", cont: "Continued", stars: "Horoscope", updated: "UPDATED", moving: "MOVING PICTURE",
    ad1: "Watch, listen,<br>read the news", ad2: "Rashtrix 24×7: live news all day, now on your phone. Live TV, the e-paper and every update as it happens.", cta: "Download the app", imprint: "Published by Rashtrix 24×7 News, Kolkata.",
    unfold: "Open the paper ▾", prev: "Previous page", next: "Next page", listen: "Listen", bigger: "Larger text", share: "Share", full: "Full story on the website", none: "The first edition is not out yet", noneB: "The morning edition comes out at 7am and the evening edition at 5pm.", home: "Rashtrix", epaper: "E-paper",
    signs: ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] },
  hi: { daily: "दैनिक", name: "राष्ट्रिक्स", city: "कोलकाता", page: "पेज", pages: "पेज", free: "निःशुल्क", tag: "ख़बर देखें · सुनें · पढ़ें", vol: "वर्ष 1", inBrief: "सुर्खियाँ", more: "और ख़बरें", inside: "अंदर के पन्नों पर", cont: "शेष पढ़ें", stars: "राशिफल", updated: "अपडेट", moving: "चलती तस्वीर",
    ad1: "ख़बर देखें,<br>सुनें, पढ़ें", ad2: "राष्ट्रिक्स 24×7 — चौबीसों घंटे लाइव ख़बरें, अब आपके फ़ोन पर। लाइव टीवी, ई-पेपर और हर पल की ख़बर।", cta: "ऐप डाउनलोड करें", imprint: "राष्ट्रिक्स 24×7 न्यूज़, कोलकाता से प्रकाशित।",
    unfold: "अख़बार खोलें ▾", prev: "पिछला पेज", next: "अगला पेज", listen: "सुनें", bigger: "बड़े अक्षर", share: "शेयर", full: "पूरी ख़बर वेबसाइट पर", none: "पहला संस्करण अभी नहीं निकला", noneB: "प्रभात संस्करण सुबह 7 बजे और सांध्य संस्करण शाम 5 बजे निकलता है।", home: "राष्ट्रिक्स", epaper: "ई-पेपर",
    signs: ["मेष", "वृषभ", "मिथुन", "कर्क", "सिंह", "कन्या", "तुला", "वृश्चिक", "धनु", "मकर", "कुंभ", "मीन"] }
}[LANG];
const ZOD = "♈♉♊♋♌♍♎♏♐♑♒♓".split("");
const DESKS = { "Kolkata": ["কলকাতা", "Kolkata", "कोलकाता"], "West Bengal": ["পশ্চিমবঙ্গ", "West Bengal", "पश्चिम बंगाल"], "India": ["দেশ", "India", "देश"], "Probashi Bangali": ["প্রবাসী বাঙালি", "Bengalis Abroad", "प्रवासी बंगाली"], "World": ["বিদেশ", "World", "विदेश"], "Bangladesh": ["বাংলাদেশ", "Bangladesh", "बांग्लादेश"], "Sports": ["খেলা", "Sport", "खेल"], "Entertainment": ["বিনোদন", "Entertainment", "मनोरंजन"], "Lifestyle": ["জীবনধারা", "Lifestyle", "जीवनशैली"], "Business": ["বাণিজ্য", "Business", "कारोबार"], "Politics": ["রাজনীতি", "Politics", "राजनीति"] };
const LI = { bn: 0, en: 1, hi: 2 }[LANG];
const CORR = { bn: "নিজস্ব সংবাদদাতা", en: "Our Correspondent", hi: "हमारे संवाददाता" }[LANG];
const LOCALE = { bn: "bn-IN", en: "en-IN", hi: "hi-IN" }[LANG];
const D = n => LANG === "bn" ? String(n).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]) : String(n);
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const CW = 136.125, GUT = 13, X = c => c * (CW + GUT), WD = n => n * CW + (n - 1) * GUT;
const CREST = "/brand/epaper-crest.webp";
document.documentElement.lang = LANG;
document.title = `${W.daily} ${W.name} · ${W.epaper}`;

/* ---------- pieces ---------- */
const box = (c, n, top, h, inner, cls = "", attrs = "") => `<div class="g ${cls}" style="left:${X(c)}px;top:${top}px;width:${WD(n)}px;height:${h}px" ${attrs}>${inner}</div>`;
const at = (l, t, w, h, inner, cls = "") => `<div class="g ${cls}" style="left:${l}px;top:${t}px;width:${w}px;height:${h}px">${inner}</div>`;
const vr = (c, top, h) => `<div class="g vr" style="left:${X(c) - 7}px;top:${top}px;height:${h}px"></div>`;
const hr = (top, k = "hr") => `<div class="g ${k}" style="left:0;top:${top}px;width:1180px"></div>`;
const paras = t => String(t || "").split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean).map(s => `<p>${esc(s)}</p>`).join("");
const yt = id => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
function media(m, h, { cls = "", lead = false } = {}) {
  if (!m) return "";
  const st = h ? `style="height:${h}px"` : `style="height:100%"`;
  if (m.kind === "video") return `<div class="ph ${cls}" ${st}><video src="${esc(m.url)}" muted autoplay loop playsinline preload="metadata"></video>${lead ? `<span class="lv">▶ ${W.moving}</span><button class="snd" type="button">🔇</button>` : ""}</div>`;
  if (m.kind === "yt") return `<div class="ph ${cls}" ${st}><i style="background-image:url('${yt(m.id)}')"></i><span class="play">▶</span>${lead ? `<span class="lv">▶ ${W.moving}</span>` : ""}</div>`;
  return `<div class="ph ${cls}" ${st}><i style="background-image:url('${esc(m.url)}')"></i></div>`;
}
const pic = x => (x?.media || []).find(m => m.kind === "video") || (x?.media || [])[0] || null;
const byline = (x, def = false) => x.byline ? `<p class="by">${esc(x.byline)}</p>` : def ? `<p class="by">${CORR} <span>· ${W.city}</span></p>` : "";
const desk = x => esc((DESKS[x.desk] || [])[LI] || x.desk || "");
// a story: label, headline, picture, byline, text filling the rest of its space
function story(x, { size = 30, kbar = true, kcls = "", photo = 0, txtCols = 1, deck = false, stamp = true, jump = true } = {}) {
  if (!x) return "";
  return `${stamp && x.updated ? `<span class="stamp">${W.updated}</span>` : ""}${kbar && desk(x) ? `<div class="kbar ${kcls}">${desk(x)}</div>` : ""}<h2 class="hl" style="font-size:${size}px">${esc(x.title)}</h2>${deck && x.dek ? `<p class="deck">${esc(x.dek)}</p>` : ""}${photo && pic(x) ? `<div style="margin:9px 0 5px">${media(pic(x), photo, { cls: "b" })}</div>` : ""}${byline(x)}<div class="txt" style="column-count:${txtCols}">${paras(x.text || x.dek)}</div>${jump ? `<p class="jump">${W.cont} ›</p>` : ""}`;
}
const st = (c, n, top, h, x, opt, cls = "") => x ? box(c, n, top, h, story(x, opt), "story " + cls, `data-ref="${esc(x.ref)}"`) : "";

function masthead(ed, y0) {
  const day = new Date(ed.at).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const no = D(Math.max(1, (ed.editions || []).length));
  const pagesN = D((ed.pages || []).length + 1);
  const left = `${W.city} · ${esc(day)}${LANG === "bn" && ed.bangabda ? ` · ${esc(ed.bangabda)}` : ""}`;
  return at(0, y0, 1180, 238, `<div class="mh"><div class="top"><span>${left}</span><span class="red">${esc(ed.name)}</span><span>${W.vol} · ${LANG === "en" ? "No." : LANG === "bn" ? "সংখ্যা" : "अंक"} ${no}</span></div>
<div class="row"><div class="w">${W.daily}</div><img class="crest" src="${CREST}" alt="Rashtrix"><div class="w">${W.name}</div></div>
<div class="rules"><i class="gd"></i><i class="bk"></i></div>
<div class="bot"><span>rashtrix.live${ed.weather && ed.weather.temp != null ? ` · ${D(ed.weather.temp)}°` : ""}</span><span class="red">${W.tag}</span><span>${pagesN} ${W.pages} · ${W.free}</span></div></div>`);
}
function ad(top, h) {
  if (h < 260) return box(0, 8, top, h, `<div class="glow"></div><img class="a0" src="/brand/logo-sm.webp" style="left:28px;top:${(h - 140) / 2}px;width:98px" alt="Rashtrix 24×7 News"><div class="a1" style="left:150px;top:30px;width:620px;font-size:46px">${W.ad1.replace("<br>", " ")}</div><div class="a2" style="left:150px;top:${h - 72}px;width:560px;font-size:16px">${W.ad2}</div><div class="cta" style="right:${h * 16 / 9 + 64}px;top:${h / 2 - 24}px;display:none">${W.cta}</div><img src="/brand/studio-wide.webp" style="position:absolute;right:30px;top:20px;height:${h - 40}px;border:4px solid #fff" alt="">`, "ad");
  const fs = LANG === "en" ? 58 : 60;
  return box(0, 8, top, h, `<div class="glow"></div><img class="a0" src="/brand/logo-sm.webp" style="left:34px;top:28px;width:112px" alt="Rashtrix 24×7 News">
<div class="a1" style="left:180px;top:26px;width:520px;font-size:${fs}px">${W.ad1}</div><div class="a2" style="left:180px;top:${30 + fs * 2 + 22}px;width:500px">${W.ad2}</div>
<div class="cta" style="left:180px;bottom:26px">${W.cta} · rashtrix.live</div>
<img src="/brand/studio-wide.webp" style="position:absolute;right:40px;top:${(h - Math.min(h - 60, 250)) / 2}px;height:${Math.min(h - 60, 250)}px;border:4px solid #fff;box-shadow:0 14px 30px rgba(0,0,0,.4)" alt="">`, "ad");
}
const imprint = (top, n) => at(0, top, 1180, 20, `<div class="imprint"><span>${W.imprint} rashtrix.live</span><span>${esc(EDN.name)} · ${W.page} ${D(n)}</span></div>`);
const page = (html, cls = "") => `<div class="ep-page ed-${LANG} ${cls}"><div class="ep-in">${html}</div></div>`;

/* ---------- the front page ---------- */
let EDN = null;
function front(ed) {
  const fp = ed.pages[0] || { items: [] }, items = fp.items.slice(), lead = items.shift();
  const len = x => (x.text || "").length, longest = arr => arr.slice().sort((a, b) => len(b) - len(a));
  const withPic = longest(items.filter(pic)), take = arr => { const x = arr.shift(); if (x) items.splice(items.indexOf(x), 1); return x; };
  const right = take(withPic.length ? withPic : longest(items)), left = take(longest(items)), b1 = take(items.filter(pic).length ? longest(items.filter(pic)) : longest(items)), b2 = take(longest(items)), rest = items;
  // headlines from the inside pages, for the briefs column and the teasers
  const inside = ed.pages.slice(1).flatMap((p, i) => p.items.map(x => ({ ...x, pageNo: i + 2, pageName: p.title })));
  let h = "", y = 0;
  if (LANG === "en") {   // The Telegraph: a strip of teasers above the nameplate
    inside.filter(pic).slice(0, 4).forEach((x, i) => { const m = pic(x), src = m.kind === "yt" ? yt(m.id) : m.kind === "img" ? m.url : ""; h += at(i * 298, 0, 286, 78, `<div class="story" data-ref="${esc(x.ref)}" style="flex-direction:row;gap:10px;align-items:center;height:78px"><div class="ph b" style="width:96px;height:70px;flex:none">${src ? `<i style="background-image:url('${esc(src)}')"></i>` : `<video src="${esc(m.url)}" muted autoplay loop playsinline></video>`}</div><div><div class="kick" style="margin:0">${esc(x.pageName)}</div><div style="font:700 16px/1.15 var(--hd);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(x.title)}</div><div style="font:700 11px var(--lab);color:var(--grey)">${W.page} ${D(x.pageNo)}</div></div></div>`); });
    h += hr(86); y = 96;
  }
  h += masthead(ed, y); y += 246;
  const lp = pic(lead);
  if (LANG === "bn") {   // Sangbad Pratidin: the banner over the big picture, stories either side
    h += st(0, 2, y, 760, left, { size: 40, txtCols: 2 });
    h += vr(2, y, 760);
    h += box(2, 4, y - 4, 128, `<h1 class="hl inkme fit" style="font-size:96px;text-align:center">${esc(lead?.title || "")}</h1>`, "story", `data-ref="${esc(lead?.ref || "")}"`);
    h += box(2, 4, y + 128, 410, media(lp, 0, { lead: true }), "story", `data-ref="${esc(lead?.ref || "")}"`);
    h += box(2, 4, y + 546, 214, `${lead?.dek ? `<p class="deck" style="font-size:20px;margin-top:0">${esc(lead.dek)}</p>` : ""}${byline(lead || {}, true)}<div class="txt" style="column-count:4">${paras(lead?.text)}</div><p class="jump">${W.cont} ›</p>`, "story", `data-ref="${esc(lead?.ref || "")}"`);
    h += vr(6, y, 760);
    h += st(6, 2, y, 760, right, { size: 40, photo: 190, txtCols: 2, kcls: "blk" });
  } else if (LANG === "hi") {   // Dainik Bhaskar: the long red headline across the page
    h += box(0, 8, y, 74, `<h1 class="hl inkme fit1" style="font-size:58px;color:var(--red);text-align:center;white-space:nowrap">${esc(lead?.title || "")}</h1>`, "story", `data-ref="${esc(lead?.ref || "")}"`);
    h += hr(y + 80); const y1 = y + 90;
    h += box(0, 2, y1, 670, `<div class="kbar">${W.inBrief}</div><div class="txt briefs"></div>`, "story nofill");
    h += vr(2, y1, 670);
    h += box(2, 4, y1, 400, media(lp, 0, { lead: true }), "story", `data-ref="${esc(lead?.ref || "")}"`);
    h += box(2, 4, y1 + 410, 260, `${lead?.dek ? `<p class="deck" style="margin-top:0">${esc(lead.dek)}</p>` : ""}${byline(lead || {}, true)}<div class="txt" style="column-count:4">${paras(lead?.text)}</div><p class="jump">${W.cont} ›</p>`, "story", `data-ref="${esc(lead?.ref || "")}"`);
    h += vr(6, y1, 670);
    h += st(6, 2, y1, 400, right, { size: 34, photo: 160, txtCols: 2, kcls: "blk" });
    h += st(6, 2, y1 + 410, 260, left, { size: 28, txtCols: 2, kbar: false });
    y += 10;
  } else {   // The Telegraph: In Brief, the headline over one big picture
    h += box(0, 2, y, 660, `<div class="kbar" style="font-family:Inter;text-transform:uppercase;letter-spacing:.06em">${W.inBrief}</div><div class="txt briefs"></div>`, "story nofill");
    h += vr(2, y, 660);
    h += box(2, 6, y, 170, `<div class="kick">${esc(lead?.desk || "")}</div><h1 class="hl inkme fit2" style="font-size:72px">${esc(lead?.title || "")}</h1>`, "story", `data-ref="${esc(lead?.ref || "")}"`);
    h += box(2, 6, y + 176, 484, media(lp, 0, { lead: true }), "story", `data-ref="${esc(lead?.ref || "")}"`);
  }
  // the second band
  let Y2 = LANG === "en" ? y + 676 : y + 776;
  h += hr(Y2, "hr2"); Y2 += 12;
  if (LANG === "en") {
    h += box(0, 4, Y2, 470, `${lead?.dek ? `<p class="deck" style="font-size:22px;margin-top:0">${esc(lead.dek)}</p>` : ""}${byline(lead || {}, true)}<div class="txt" style="column-count:4">${paras(lead?.text)}</div><p class="jump">${W.cont} ›</p>`, "story", `data-ref="${esc(lead?.ref || "")}"`);
    h += vr(4, Y2, 470) + st(4, 2, Y2, 470, right, { size: 30, photo: 150, txtCols: 2, kbar: false });
    h += vr(6, Y2, 470) + st(6, 2, Y2, 470, left || b1, { size: 28, photo: left ? 0 : 150, txtCols: 2, kbar: false });
    Y2 += 482;
  } else {
    const H2 = 1966 - Y2 - 360 - 34;
    h += st(0, 3, Y2, H2, b1, { size: 34, photo: 200, txtCols: 3 });
    h += vr(3, Y2, H2) + st(3, 3, Y2, H2, b2, { size: 34, photo: b2 && pic(b2) ? 180 : 0, txtCols: 3, kcls: "blk" });
    h += vr(6, Y2, H2) + box(6, 2, Y2, H2, `<h3 class="hl" style="font-size:28px;margin-bottom:8px">${LANG === "hi" ? W.more : W.inBrief}</h3><div class="txt briefs" style="font-size:14px;line-height:1.5"></div>`, "story nofill redbox");
    Y2 += H2 + 14;
  }
  const adH = 1966 - Y2 - 30;
  h += ad(Y2, adH) + imprint(Y2 + adH + 8, 1);
  const el = document.createElement("div"); el.innerHTML = page(h, "front");
  // the briefs: what is left of the front page, then the inside pages' headlines
  const used = new Set([lead, right, left, ...(LANG === "en" ? (left ? [] : [b1]) : [b1, b2])].filter(Boolean).map(x => x.ref));
  const briefs = [...fp.items.filter(x => !used.has(x.ref)), ...inside].filter((x, i, a) => x && !used.has(x.ref) && a.findIndex(y => y.ref === x.ref) === i);
  el.firstChild._briefs = briefs;
  return el.firstChild;
}

/* ---------- an inside page: the section's stories down six columns ---------- */
function inside(ed, p, n) {
  const items = p.items.slice(), lead = items.shift();
  const day = new Date(ed.at).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  let h = at(0, 0, 1180, 64, `<div class="rh"><div class="nm"><img src="${CREST.replace(".webp", "-sm.webp")}" alt="">${W.daily} ${W.name}</div><div class="meta">${W.city} · ${esc(day)}<br><b>${esc(ed.name)}</b> · ${W.page} ${D(n)}</div></div>`);
  h += at(0, 72, 1180, 50, `<div class="sec"><b>${esc(p.title)}</b><i></i></div>`);
  const lp = pic(lead);
  const leadHtml = lead ? `<div class="lead story" data-ref="${esc(lead.ref)}">${lp ? media(lp, 380, { lead: true }) : ""}<div style="display:flex;flex-direction:column;min-width:0">${lead.updated ? `<span class="stamp" style="position:relative;align-self:flex-end;top:0;right:0">${W.updated}</span>` : ""}<h2 class="hl" style="font-size:${lp ? 44 : 56}px">${esc(lead.title)}</h2>${lead.dek ? `<p class="deck">${esc(lead.dek)}</p>` : ""}${byline(lead)}<div class="txt">${paras(lead.text)}</div></div></div>` : "";
  const rest = items.map((x, i) => `<div class="st story" data-ref="${esc(x.ref)}">${x.updated ? `<span class="kick">${W.updated}</span>` : ""}<h3 class="hl" style="font-size:${i < 2 ? 30 : 24}px">${esc(x.title)}</h3>${pic(x) && i < 4 ? `<div style="margin:7px 0 5px">${media(pic(x), 150, { cls: i % 2 ? "b" : "" })}</div>` : ""}${byline(x)}<div class="txt">${paras(x.text || x.dek)}</div></div>`).join("");
  h += at(0, 132, 1180, 1590, `<div class="flow" style="height:1590px">${leadHtml}${rest}</div>`);
  h += ad(1736, 196) + imprint(1942, n);
  const el = document.createElement("div"); el.innerHTML = page(h, "inside"); return el.firstChild;
}
function horoscope(ed, n) {
  const day = new Date(ed.at).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  let h = at(0, 0, 1180, 64, `<div class="rh"><div class="nm"><img src="${CREST.replace(".webp", "-sm.webp")}" alt="">${W.daily} ${W.name}</div><div class="meta">${W.city} · ${esc(day)}<br><b>${esc(ed.name)}</b> · ${W.page} ${D(n)}</div></div>`);
  h += at(0, 72, 1180, 50, `<div class="sec"><b>${W.stars}</b><i></i></div>`);
  const hz = ed.horoscope || [];
  h += at(0, 136, 1180, 1580, `<div class="stars" style="height:1580px;grid-template-rows:repeat(4,1fr)">${W.signs.map((s, i) => `<div class="star"><div class="s"><i>${ZOD[i]}&#xFE0E;</i><b>${s}</b></div><div class="txt" style="font-size:16px;line-height:1.55">${paras(hz[i] || "")}</div></div>`).join("")}</div>`);
  h += ad(1730, 202) + imprint(1942, n);
  const el = document.createElement("div"); el.innerHTML = page(h, "inside"); return el.firstChild;
}

/* ---------- no blank space: columns filled, never overflowing ---------- */
const over = el => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
function fillFront(pg) {
  const pool = (pg._briefs || []).slice();
  const line = x => `<p class="fill" data-ref="${esc(x.ref)}"><b>${esc(x.pageName || W.more)}${x.pageNo ? ` · ${W.page} ${D(x.pageNo)}` : ""}:</b> ${esc(x.title)}</p>`;
  // the briefs columns first, then any story whose text runs short
  const targets = [...$$(".txt.briefs", pg), ...$$(".story:not(.nofill) .txt", pg)];
  for (const t of targets) {
    if (!t.clientHeight) continue;
    for (let guard = 0; guard < 40 && pool.length && !over(t); guard++) { t.insertAdjacentHTML("beforeend", line(pool.shift())); if (over(t)) { if (t.classList.contains("briefs")) { const l = t.lastElementChild; pool.unshift({ ref: l.dataset.ref, title: l.textContent }); l.remove(); } break; } }
  }
  // headlines fitted to their space
  $$(".fit, .fit1, .fit2", pg).forEach(h => { const box = h.parentElement; let s = parseFloat(h.style.fontSize); while ((h.scrollWidth > box.clientWidth + 1 || h.offsetHeight > box.clientHeight) && s > 26) { s -= 2; h.style.fontSize = s + "px"; } });
}
function fillFlow(pg, ed) {
  const f = $(".flow", pg); if (!f) return;
  // too much: the last stories' text trimmed, then the last stories dropped
  for (let guard = 0; guard < 60 && over(f); guard++) {
    const sts = $$(".st", f), last = sts[sts.length - 1];
    if (!last) { const t = $(".lead .txt", f); if (t?.lastElementChild) t.lastElementChild.remove(); else break; continue; }
    const t = $(".txt", last);
    if (t && t.children.length > 1) t.lastElementChild.remove(); else last.remove();
  }
  // too little: other pages' headlines, then the app, until the columns are full
  const pool = ed.pages.flatMap((p, i) => p.items.slice(0, 4).map(x => ({ ...x, pageNo: i + 1, pageName: p.title }))).filter(x => !f.querySelector(`[data-ref="${CSS.escape(x.ref)}"]`));
  let added = 0;
  while (!over(f) && pool.length && added < 30) {
    const x = pool.shift();
    f.insertAdjacentHTML("beforeend", `<div class="st story box" data-ref="${esc(x.ref)}"><div class="kick">${esc(x.pageName)} · ${W.page} ${D(x.pageNo)}</div><h3 class="hl" style="font-size:20px">${esc(x.title)}</h3>${x.dek ? `<div class="txt"><p>${esc(x.dek)}</p></div>` : ""}</div>`);
    added++;
    if (over(f)) { f.lastElementChild.remove(); break; }
  }
}

/* ---------- the reader ---------- */
let pages = [], cur = 0, scale = 1, zoom = 0;
const app = $("#ep");
function bar(ed) {
  const langs = [["bn", "বাংলা"], ["en", "English"], ["hi", "हिन्दी"]].map(([l, n]) => `<a class="lang ${l === LANG ? "on" : ""}" href="/epaper?lang=${l}">${n}</a>`).join("");
  const opts = (ed?.editions || []).map(e => { const [y, m, d] = e.day.split("-"); const dt = new Date(Date.UTC(+y, m - 1, +d, 6)); return `<option value="${e.day}/${e.slot}" ${ed && e.id === ed.id ? "selected" : ""}>${esc(dt.toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" }))} · ${e.slot === "morning" ? (LANG === "en" ? "Morning" : LANG === "bn" ? "প্রভাতী" : "प्रभात") : (LANG === "en" ? "Evening" : LANG === "bn" ? "সান্ধ্য" : "सांध्य")}</option>`; }).join("");
  return `<div class="ep-bar"><a class="home" href="${LANG === "bn" ? "/" : `/${LANG}/`}"><img src="/brand/logo-xs.webp" alt="Rashtrix 24×7 News"><span class="hide-s">${W.epaper}</span></a>
${opts ? `<select id="epEd" aria-label="Edition">${opts}</select>` : ""}<span class="sp"></span>
${ed ? `<button id="epPrev" aria-label="${W.prev}">‹</button><span class="pg" id="epPg"></span><button id="epNext" aria-label="${W.next}">›</button><button id="epZo" class="hide-s">−</button><button id="epZi" class="hide-s">+</button>` : ""}
${langs}</div>`;
}
function fit() {
  const w = Math.min(window.innerWidth - (window.innerWidth < 700 ? 12 : 40), 1400);
  scale = zoom || w / 1240;
  const sheet = $(".ep-sheet"); if (!sheet) return;
  sheet.style.transform = `scale(${scale})`;
  $(".ep-holder").style.width = 1240 * scale + "px"; $(".ep-holder").style.height = 2010 * scale + "px";
}
function show(i, dir = 0) {
  if (i < 0 || i >= pages.length) return;
  const sheet = $(".ep-sheet");
  const swap = () => {
    cur = i; sheet.innerHTML = ""; sheet.appendChild(pages[i]);
    $("#epPg").textContent = `${W.page} ${D(i + 1)} / ${D(pages.length)}`;
    sheet.classList.remove("turn-out"); if (dir) { sheet.classList.add(dir > 0 ? "turn-in" : "turn-back"); setTimeout(() => sheet.classList.remove("turn-in", "turn-back"), 600); }
    pages[i].querySelectorAll("video").forEach(v => v.play().catch(() => {}));
    try { history.replaceState(null, "", `/epaper?lang=${LANG}&ed=${EDN.day}/${EDN.slot}&p=${i + 1}`); } catch { /* none */ }
  };
  if (dir > 0) { sheet.classList.add("turn-out"); setTimeout(swap, 380); } else swap();
  if (dir) window.scrollTo({ top: 0, behavior: "smooth" });
}
// The front page, half-folded at first: the top half lies on the table, the lower half beneath.
function folded(pg) {
  const f = document.createElement("div"); f.className = "ep-fold folded";
  const top = document.createElement("div"); top.className = "half top"; top.appendChild(pg);
  const bot = document.createElement("div"); bot.className = "half bot"; const clone = pg.cloneNode(true); clone.querySelectorAll(".inkme").forEach(x => x.classList.remove("inkme")); bot.appendChild(clone);
  f.innerHTML = `<div class="stack"><i></i><i></i></div>`; f.append(top, bot);
  f.insertAdjacentHTML("beforeend", `<i class="crease"></i><button class="unfold" type="button">${W.unfold}</button>`);
  const open = () => { if (!f.classList.contains("folded")) return; f.classList.remove("folded"); setTimeout(() => { const s = f.parentElement; if (!s) return; s.innerHTML = ""; s.appendChild(pg); }, 1600); };
  $(".unfold", f).onclick = open; setTimeout(open, 4500);
  return f;
}
function inkHeadlines(pg) {
  $$(".inkme", pg).forEach(h => { const words = h.textContent.trim().split(/\s+/); h.classList.add("ink"); h.innerHTML = words.map((w, i) => `<span class="w" style="animation-delay:${.4 + i * .2}s">${esc(w)}</span>`).join(" "); });
}

/* ---------- reader mode ---------- */
function findItem(ref) { for (const p of EDN.pages) { const x = p.items.find(y => y.ref === ref); if (x) return x; } return null; }
async function openStory(ref) {
  const x = findItem(ref); if (!x) return;
  const rd = $("#epReader"), body = $("#epRbody", rd), m = pic(x);
  const mediaHtml = m ? (m.kind === "yt" ? `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(m.id)}?autoplay=1&mute=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : m.kind === "video" ? `<div class="ph"><video src="${esc(m.url)}" controls autoplay muted playsinline></video></div>` : `<div class="ph"><i style="background-image:url('${esc(m.url)}')"></i></div>`) : "";
  body.className = `ed-${LANG}`;
  body.innerHTML = `${desk(x) ? `<div class="kbar">${desk(x)}</div>` : ""}<h2 class="hl">${esc(x.title)}</h2>${x.dek ? `<p class="deck">${esc(x.dek)}</p>` : ""}${byline(x)}
<div class="tools"><button type="button" id="epListen">🔊 ${W.listen}</button><button type="button" id="epBig">A+ ${W.bigger}</button><button type="button" id="epShare">${W.share}</button>${x.slug ? `<a href="${LANG === "bn" ? "" : `/${LANG}`}/article/${encodeURIComponent(x.slug)}" target="_blank" rel="noopener">${W.full} ↗</a>` : ""}</div>
${mediaHtml}<div class="txt" id="epRtext">${paras(x.body || x.text || x.dek)}</div>`;
  rd.classList.add("on"); rd.scrollTop = 0;
  // the whole story, in this language, when it is one of the site's
  if (x.ref.startsWith("a:") && x.slug && !x.edited) {
    try { const r = await fetch(`/api/articles/${encodeURIComponent(x.slug)}?lang=${LANG}`); const a = (await r.json()).article; if (a?.body && rd.classList.contains("on")) { const t = $("#epRtext"); t.className = "body"; t.innerHTML = a.body; } } catch { /* the paper's text stays */ }
  }
  $("#epBig").onclick = () => $(".ep-clip").classList.toggle("big");
  $("#epShare").onclick = () => { const u = location.href; if (navigator.share) navigator.share({ title: x.title, url: u }).catch(() => {}); else navigator.clipboard?.writeText(u); };
  $("#epListen").onclick = () => { const s = window.speechSynthesis; if (!s) return; if (s.speaking) { s.cancel(); return; } const u = new SpeechSynthesisUtterance(`${x.title}. ${($("#epRtext")?.innerText || "")}`); u.lang = LOCALE; s.speak(u); };
}

/* ---------- start ---------- */
async function start() {
  const path = q.get("ed") || "";
  let r, data;
  try { r = await fetch(`/api/epaper${/^\d{4}-\d{2}-\d{2}\/(morning|evening)$/.test(path) ? `/${path}` : ""}?lang=${LANG}`); data = await r.json(); } catch { data = {}; }
  if (r?.status === 401 && data.signin) {
    app.innerHTML = bar(null) + `<div class="ep-msg ed-${LANG}"><h2>${LANG === "hi" ? "हिन्दी ई-पेपर पढ़ने के लिए साइन इन करें" : "Sign in to read the English e-paper"}</h2><p>${LANG === "hi" ? "बांग्ला ई-पेपर सभी के लिए निःशुल्क है।" : "The Bengali e-paper is free for everyone."}</p><a href="/${LANG}/?signin=1">${LANG === "hi" ? "साइन इन करें" : "Sign in"}</a></div>`; return;
  }
  if (!data.edition) { app.innerHTML = bar(null) + `<div class="ep-msg"><h2>${W.none}</h2><p>${W.noneB}</p></div>`; return; }
  EDN = data.edition;
  app.innerHTML = bar(EDN) + `<div class="ep-stage"><div class="ep-holder"><div class="ep-sheet"></div></div></div><div class="ep-reader" id="epReader"><div class="ep-clip"><button class="x" type="button" aria-label="Close">×</button><div id="epRbody"></div></div></div>`;
  fit();
  // every page built and fitted (off screen, at full size), then shown
  const stage = document.createElement("div"); stage.style.cssText = "position:absolute;left:-99999px;top:0;width:1240px;height:2010px;visibility:hidden"; document.body.appendChild(stage);
  await document.fonts.ready.catch(() => {});
  const fp = front(EDN); stage.appendChild(fp); fillFront(fp);
  pages = [fp];
  EDN.pages.slice(1).forEach((p, i) => { if (p.key === "stars") { if ((EDN.horoscope || []).some(Boolean)) { const s = horoscope(EDN, pages.length + 1); stage.appendChild(s); pages.push(s); } return; } if (!p.items.length) return; const el = inside(EDN, p, pages.length + 1); stage.appendChild(el); fillFlow(el, EDN); pages.push(el); });
  if (!EDN.pages.some(p => p.key === "stars") && (EDN.horoscope || []).some(Boolean)) { const s = horoscope(EDN, pages.length + 1); pages.push(s); }
  // page numbers in the imprints, now that the count is known
  pages.forEach(p => p.remove());
  stage.remove();
  inkHeadlines(fp);
  const want = Math.max(0, Math.min(pages.length - 1, (+q.get("p") || 1) - 1));
  if (want === 0 && !q.has("p")) { const sheet = $(".ep-sheet"); sheet.appendChild(folded(fp)); cur = 0; $("#epPg").textContent = `${W.page} ${D(1)} / ${D(pages.length)}`; }
  else show(want);
  // controls
  $("#epPrev").onclick = () => show(cur - 1, -1); $("#epNext").onclick = () => show(cur + 1, 1);
  $("#epZi").onclick = () => { zoom = Math.min(2.5, scale * 1.25); fit(); }; $("#epZo").onclick = () => { zoom = Math.max(.25, scale / 1.25); fit(); };
  $("#epEd")?.addEventListener("change", e => { location.href = `/epaper?lang=${LANG}&ed=${e.target.value}`; });
  window.addEventListener("resize", () => { zoom = 0; fit(); });
  document.addEventListener("keydown", e => { if ($("#epReader").classList.contains("on")) { if (e.key === "Escape") $("#epReader").classList.remove("on"); return; } if (e.key === "ArrowRight") show(cur + 1, 1); if (e.key === "ArrowLeft") show(cur - 1, -1); });
  let sx = null; $(".ep-stage").addEventListener("touchstart", e => { sx = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  $(".ep-stage").addEventListener("touchend", e => { if (sx == null || zoom) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 70) show(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); sx = null; });
  document.addEventListener("click", e => {
    const snd = e.target.closest(".snd"); if (snd) { e.stopPropagation(); const v = snd.parentElement.querySelector("video"); if (v) { v.muted = !v.muted; snd.textContent = v.muted ? "🔇" : "🔊"; } return; }
    if (e.target.closest(".unfold")) return;
    const s = e.target.closest("[data-ref]"); if (s && s.dataset.ref && e.target.closest(".ep-sheet")) openStory(s.dataset.ref);
  });
  $("#epReader .x").onclick = () => { $("#epReader").classList.remove("on"); window.speechSynthesis?.cancel(); };
  $("#epReader").onclick = e => { if (e.target.id === "epReader") { e.target.classList.remove("on"); window.speechSynthesis?.cancel(); } };
}
start();
