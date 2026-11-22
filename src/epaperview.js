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
const at = (l, t, w, h, inner, cls = "", attrs = "") => `<div class="g ${cls}" style="left:${l}px;top:${t}px;width:${w}px;height:${h}px" ${attrs}>${inner}</div>`;
const vr = (c, top, h) => `<div class="g vr" style="left:${X(c) - 7}px;top:${top}px;height:${h}px"></div>`;
const hr = (top, k = "hr") => `<div class="g ${k}" style="left:0;top:${top}px;width:1180px"></div>`;
const paras = t => String(t || "").split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean).map(s => `<p>${esc(s)}</p>`).join("");
const yt = id => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
// a picture that lives: it develops from sepia into colour when its page is shown, then drifts
function media(m, h, { lead = false } = {}) {
  if (!m) return "";
  const st = h ? `style="height:${h}px"` : `style="height:100%"`;
  if (m.kind === "video") return `<div class="ph" ${st}><video src="${esc(m.url)}" muted autoplay loop playsinline preload="metadata"></video>${lead ? `<span class="lv">▶ ${W.moving}</span><button class="snd" type="button" aria-label="Sound">🔇</button>` : ""}</div>`;
  if (m.kind === "yt") return `<div class="ph" ${st}><i style="background-image:url('${yt(m.id)}')"></i><b class="gleam"></b><span class="play">▶</span>${lead ? `<span class="lv">▶ ${W.moving}</span>` : ""}</div>`;
  return `<div class="ph" ${st}><i style="background-image:url('${esc(m.url)}')"></i><b class="gleam"></b></div>`;
}
const pic = x => (x?.media || []).find(m => m.kind === "video") || (x?.media || [])[0] || null;
const byline = (x, def = false) => x.byline ? `<p class="by">${esc(x.byline)}</p>` : def ? `<p class="by">${CORR} <span>· ${W.city}</span></p>` : "";
const desk = x => esc((DESKS[x.desk] || [])[LI] || x.desk || "");
const body = x => paras(x.text) || (x.dek ? `<p>${esc(x.dek)}</p>` : "");

// A teaser beside the nameplate (the Bengali and Hindi editions): a colour picture, the page it is
// on and its headline.
function ear(x, side) {
  if (!x) return "";
  const m = pic(x), src = m?.kind === "yt" ? yt(m.id) : m?.kind === "video" ? "" : m?.url || "";
  return `<div class="ear ${side}" data-ref="${esc(x.ref || "")}"><div class="eph">${src ? `<i style="background-image:url('${esc(src)}')"></i>` : m ? `<video src="${esc(m.url)}" muted playsinline preload="metadata"></video>` : ""}</div><div class="et"><span class="ek">${W.inside} · ${W.page} ${D(x.pageNo)}</span><b>${esc(x.title || "")}</b></div></div>`;
}
function masthead(ed, y0, ears = []) {
  const day = new Date(ed.at).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const no = D(Math.max(1, (ed.editions || []).length));
  const left = `${W.city} · ${esc(day)}${LANG === "bn" && ed.bangabda ? ` · ${esc(ed.bangabda)}` : ""}`;
  return at(0, y0, 1180, 238, `<div class="mh"><div class="top"><span>${left}</span><span class="red">${esc(ed.name)}</span><span>${W.vol} · ${LANG === "en" ? "No." : LANG === "bn" ? "সংখ্যা" : "अंक"} ${no}</span></div>
<div class="row${ears.length ? " eared" : ""}">${ear(ears[0], "l")}<div class="np">${LANG === "en"
  // (the English paper's nameplate is the paper's own Old English lettering, the crest between the words)
  ? `<img class="olde d" src="/brand/mh-en-daily.webp" alt="Daily"><span class="crestw"><img class="crest" src="${CREST}" alt="Rashtrix"></span><img class="olde" src="/brand/mh-en-rashtrix.webp" alt="Rashtrix">`
  : `<div class="w d">${W.daily}</div><span class="crestw"><img class="crest" src="${CREST}" alt="Rashtrix"></span><div class="w">${W.name}</div>`}</div>${ear(ears[1], "r")}</div>
<div class="rules"><i class="gd"></i><i class="bk"></i></div>
<div class="bot"><span>rashtrix.live${ed.weather && ed.weather.temp != null ? ` · ${D(ed.weather.temp)}°` : ""}</span><span class="red">${W.tag}</span><span>${D(PAGES_N)} ${W.pages} · ${W.free}</span></div></div>`);
}
function ad(top, h) {
  const ih = Math.min(h - 56, 250), iw = Math.round(ih * 16 / 9);
  if (h < 260) return box(0, 8, top, h, `<div class="glow"></div><img class="a0" src="/brand/logo-sm.webp" style="left:28px;top:${(h - 134) / 2}px;width:94px" alt="Rashtrix 24×7 News"><div class="a1" style="left:148px;top:${h / 2 - 52}px;width:${1180 - 148 - iw - 60}px;font-size:44px">${W.ad1.replace("<br>", " ")}</div><div class="a2" style="left:148px;top:${h / 2 + 4}px;width:${1180 - 148 - iw - 60}px;font-size:16px">${W.ad2}</div><img src="/brand/studio-wide.webp" style="position:absolute;right:28px;top:${(h - ih) / 2}px;height:${ih}px;border:4px solid #fff" alt="">`, "ad");
  const fs = LANG === "en" ? 58 : 60;
  return box(0, 8, top, h, `<div class="glow"></div><img class="a0" src="/brand/logo-sm.webp" style="left:34px;top:28px;width:112px" alt="Rashtrix 24×7 News">
<div class="a1" style="left:180px;top:26px;width:${1180 - 180 - iw - 80}px;font-size:${fs}px">${W.ad1}</div><div class="a2" style="left:180px;top:${30 + fs * 2 + 22}px;width:${1180 - 180 - iw - 80}px">${W.ad2}</div>
<div class="cta" style="left:180px;bottom:26px">${W.cta} · rashtrix.live</div>
<img src="/brand/studio-wide.webp" style="position:absolute;right:40px;top:${(h - ih) / 2}px;height:${ih}px;border:4px solid #fff;box-shadow:0 14px 30px rgba(0,0,0,.4)" alt="">`, "ad");
}
const imprint = (top, n) => at(0, top, 1180, 20, `<div class="imprint"><span>${W.imprint} rashtrix.live</span><span>${esc(EDN.name)} · ${W.page} ${D(n)}</span></div>`);
const page = (html, cls = "") => { const el = document.createElement("div"); el.innerHTML = `<div class="ep-page ed-${LANG} ${cls}"><div class="ep-in">${html}</div></div>`; return el.firstChild; };

/* ---------- the stories a zone is filled with ---------- */
// A zone is a box of columns. Stories go in one after another, in order, as many as fit; the last is
// shortened to fit; then (when the edition's stories run out) teasers for the inside pages; then the
// type grows a little until the columns are full. No blank space, whatever the day's news.
function zsStory(x, { size = 26, photo = 0, kbar = true, teaser = false, first = false } = {}) {
  const k = teaser ? `<div class="kick">${esc(x.pageName || desk(x))}${x.pageNo ? ` · ${W.page} ${D(x.pageNo)}` : ""}</div>` : kbar && desk(x) ? `<div class="kick">${desk(x)}</div>` : "";
  const ph = photo && pic(x) ? `<div class="zph" style="--ph:${photo}px">${media(pic(x), 0)}</div>` : "";
  return `<div class="zs${teaser ? " tz" : ""}${first ? " first" : ""}" data-ref="${esc(x.ref)}">${x.updated ? `<span class="stamp">${W.updated}</span>` : ""}<div class="zh">${k}<h3 class="hl" style="--hs:${teaser ? Math.min(size, 21) : size}px">${esc(x.title)}</h3>${ph}${teaser ? "" : byline(x)}</div><div class="txt">${teaser ? (x.dek ? `<p>${esc(x.dek)}</p>` : "") : body(x)}</div>${teaser ? "" : `<p class="jump">${W.cont} ›</p>`}</div>`;
}
const over = el => {
  let m = el.querySelector(":scope > i.zend"); if (!m) { m = document.createElement("i"); m.className = "zend"; }
  el.appendChild(m);
  const a = el.getBoundingClientRect(), b = m.getBoundingClientRect();
  return b.left > a.right - 2 || b.top > a.bottom + 1 || el.scrollHeight > el.clientHeight + 4;
};
const lastItem = el => { const k = [...el.children].filter(c => !c.classList.contains("zend")); return k[k.length - 1]; };
function fillZone(z, lists, opt = {}) {
  const put = (x, teaser) => { z.insertAdjacentHTML("beforeend", zs(x, { ...opt, teaser, photo: teaser ? 0 : opt.photo && z.querySelectorAll(".zph").length < (opt.photos || 1) ? opt.photo : 0 })); return z.lastElementChild; };
  const shorten = el => { const t = el.querySelector(".txt"); while (over(z) && t && t.children.length > 1) t.lastElementChild.remove(); if (over(z) && t?.firstElementChild) { const p = t.firstElementChild, words = p.textContent.split(" "); while (over(z) && words.length > 12) { words.splice(-6); p.textContent = words.join(" ") + "…"; } } return !over(z); };
  outer: for (const [list, teaser] of lists) {
    while (list.length) {
      const el = put(list[0], teaser);
      if (!over(z)) { list.shift(); continue; }
      if (!teaser && shorten(el)) { list.shift(); break outer; }
      el.remove(); break outer;
    }
  }
  lines(z, lists); grow(z);
}
// (a gap too small for a story: one-line headlines, from the stories still waiting, until it is full)
function lines(z, lists) {
  for (const [list] of lists) {
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      z.insertAdjacentHTML("beforeend", `<p class="zl" data-ref="${esc(x.ref)}"><b>${esc(x.pageName || desk(x))}${x.pageNo ? ` · ${W.page} ${D(x.pageNo)}` : ""}</b>${esc(x.title)}</p>`);
      if (over(z)) { lastItem(z)?.remove(); continue; }
      list.splice(i--, 1);
    }
  }
}
// (the type, a touch larger, until the columns are full)
function grow(z) {
  let k = 1;
  const set = v => z.style.setProperty("--k", v);
  while (k < 1.5) { set(k + .04); if (over(z)) { set(k); break; } k += .04; }
}
function fitHeadline(h, box, min = 26) { let s = parseFloat(h.style.fontSize); while ((h.scrollWidth > box.clientWidth + 1 || h.scrollHeight > box.clientHeight + 1) && s > min) { s -= 2; h.style.fontSize = s + "px"; } }

/* ---------- the front page ---------- */
let EDN = null, PAGES_N = 1;
function teasers(ed) { return ed.pages.slice(1).flatMap((p, i) => p.items.map(x => ({ ...x, pageNo: i + 2, pageName: p.title }))); }
function front(ed) {
  const items = (ed.pages[0]?.items || []).slice(), lead = items.shift() || {};
  const ri = items.findIndex(pic), right = ri >= 0 ? items.splice(ri, 1)[0] : null;   // the right column opens with a picture
  const q1 = items, tq = teasers(ed), allT = tq.slice();
  const lp = pic(lead), ref = `data-ref="${esc(lead.ref || "")}"`;
  let h = "", y = 0;
  if (LANG === "en") {   // The Telegraph: a strip of teasers above the nameplate
    tq.filter(pic).slice(0, 4).forEach((x, i) => { const m = pic(x), src = m.kind === "yt" ? yt(m.id) : m.kind === "img" ? m.url : ""; h += at(i * 298, 0, 286, 78, `<div class="sky" data-ref="${esc(x.ref)}"><div class="ph">${src ? `<i style="background-image:url('${esc(src)}')"></i>` : `<video src="${esc(m.url)}" muted autoplay loop playsinline></video>`}</div><div><div class="kick">${esc(x.pageName)} · ${W.page} ${D(x.pageNo)}</div><div class="skyt">${esc(x.title)}</div></div></div>`); });
    h += hr(86); y = 96;
  }
  h += masthead(ed, y, LANG === "en" ? [] : tq.filter(pic).slice(0, 2)); y += 246;
  const zones = [];   // [selector, queue, options] filled in order after the page is built
  if (LANG === "bn" || LANG === "hi") {
    const Y = y, H1 = 770;
    if (LANG === "bn") {   // Sangbad Pratidin: the banner over the big picture, stories either side
      h += box(0, 2, Y, H1, "", "zone z2", 'data-z="L"') + vr(2, Y, H1);
      h += box(2, 4, Y, 120, `<h1 class="hl banner" style="font-size:60px">${esc(lead.title || "")}</h1>`, "story fitbox", ref);
      h += box(2, 4, Y + 128, 410, media(lp, 0, { lead: true }), "story", ref);
      h += box(2, 4, Y + 546, H1 - 546, "", "zone z4", 'data-z="C"');
      h += vr(6, Y, H1) + box(6, 2, Y, H1, "", "zone z2", 'data-z="R"');
    } else {   // Dainik Bhaskar: the long red headline across the page
      h += box(0, 8, Y, 76, `<h1 class="hl banner" style="font-size:56px;color:var(--red);text-align:center">${esc(lead.title || "")}</h1>`, "story fitbox", ref);
      h += hr(Y + 84);
      const Y1 = Y + 94, H = H1 - 94;
      h += box(0, 2, Y1, H, `<div class="kbar">${W.inBrief}</div><div class="zone z1 briefs" data-z="B" style="position:relative;height:${H - 34}px"></div>`, "");
      h += vr(2, Y1, H) + box(2, 4, Y1, 380, media(lp, 0, { lead: true }), "story", ref);
      h += box(2, 4, Y1 + 388, H - 388, "", "zone z4", 'data-z="C"');
      h += vr(6, Y1, H) + box(6, 2, Y1, H, "", "zone z2", 'data-z="R"');
    }
    const Y2 = Y + H1 + 12; h += hr(Y2 - 6, "hr2");
    const H2 = 1966 - Y2 - 340 - 34;
    h += box(0, 6, Y2 + 6, H2, "", "zone z6", 'data-z="M"');
    h += vr(6, Y2 + 6, H2) + box(6, 2, Y2 + 6, H2, `<h3 class="hl" style="font-size:26px;margin-bottom:8px;color:#fff">${W.inside}</h3><div class="zone z1 briefs" data-z="B2" style="position:relative;height:${H2 - 66}px"></div>`, "redbox");
    const adY = Y2 + 6 + H2 + 14; h += ad(adY, 1966 - adY - 30) + imprint(1942, 1);
    zones.push(["R", [[right ? [right] : [], false], [q1, false], [tq, true]], { size: 25, photo: 170 }], ["L", [[q1, false], [tq, true]], { size: 25 }], ["C", [[[{ ...lead, lead: true }], false], [q1, false], [tq, true]], { size: 24 }], ["M", [[q1, false], [tq, true]], { size: 25, photo: 140, photos: 2 }]);
  } else {   // The Telegraph: In Brief, the headline over one big picture
    const Y = y, H1 = 662;
    h += box(0, 2, Y, H1, `<div class="kbar" style="font-family:Inter;text-transform:uppercase;letter-spacing:.06em">${W.inBrief}</div><div class="zone z1 briefs" data-z="B" style="position:relative;height:${H1 - 34}px"></div>`, "");
    h += vr(2, Y, H1);
    h += box(2, 6, Y, 168, `<div class="kick">${desk(lead)}</div><h1 class="hl banner" style="font-size:70px">${esc(lead.title || "")}</h1>`, "story fitbox", ref);
    h += box(2, 6, Y + 176, H1 - 176, media(lp, 0, { lead: true }), "story", ref);
    const Y2 = Y + H1 + 12; h += hr(Y2 - 6, "hr2");
    const H2 = 1966 - Y2 - 360 - 34;
    h += box(0, 4, Y2 + 6, H2, "", "zone z4", 'data-z="C"');
    h += vr(4, Y2 + 6, H2) + box(4, 4, Y2 + 6, H2, "", "zone z4", 'data-z="R"');
    const adY = Y2 + 6 + H2 + 14; h += ad(adY, 1966 - adY - 30) + imprint(1942, 1);
    zones.push(["C", [[[{ ...lead, lead: true }], false], [q1, false], [tq, true]], { size: 26 }], ["R", [[right ? [right] : [], false], [q1, false], [tq, true]], { size: 26, photo: 160, photos: 2 }]);
  }
  const pg = page(h, "front");
  pg._fill = () => {
    $$(".fitbox", pg).forEach(b => fitHeadline($(".hl", b), b));
    for (const [z, lists, opt] of zones) { const el = $(`[data-z="${z}"]`, pg); if (el) fillZone(el, lists, opt); }
    // the briefs: one line for each story inside, until the box is full
    // (what the columns did not take first; then, if the day is thin, every page's headlines)
    for (const b of $$(".briefs", pg)) {
      const list = tq.length ? tq : allT;
      while (list.length) { const x = list.shift(); b.insertAdjacentHTML("beforeend", `<p class="brief" data-ref="${esc(x.ref)}"><b>${esc(x.pageName)} · ${W.page} ${D(x.pageNo)}</b>${esc(x.title)}</p>`); if (over(b)) { lastItem(b)?.remove(); list.unshift(x); break; } }
      grow(b);
    }
  };
  return pg;
}
// the lead's own text in its zone: no headline, the deck first
const zsLead = x => `<div class="zs lead" data-ref="${esc(x.ref)}"><div class="zh">${x.dek ? `<p class="deck">${esc(x.dek)}</p>` : ""}${byline(x, true)}</div><div class="txt">${paras(x.text)}</div>${x.text ? `<p class="jump">${W.cont} ›</p>` : ""}</div>`;
const zs = (x, o) => x.lead ? zsLead(x) : zsStory(x, o);

/* ---------- an inside page: the section's lead, then its stories down six columns ---------- */
function runningHead(ed, title, n) {
  const day = new Date(ed.at).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  return at(0, 0, 1180, 64, `<div class="rh"><div class="nm"><img src="${CREST.replace(".webp", "-sm.webp")}" alt="">${LANG === "en" ? `<img class="olde-s" src="/brand/mh-en-daily.webp" alt="Daily"><img class="olde-s" src="/brand/mh-en-rashtrix.webp" alt="Rashtrix">` : `${W.daily} ${W.name}`}</div><div class="meta">${W.city} · ${esc(day)}<br><b>${esc(ed.name)}</b> · ${W.page} ${D(n)}</div></div>`)
    + at(0, 72, 1180, 50, `<div class="sec"><b>${esc(title)}</b><i></i></div>`);
}
function inside(ed, p, n) {
  const items = p.items.slice(), lead = items.shift(), lp = pic(lead);
  let h = runningHead(ed, p.title, n);
  const leadBlock = `<div class="ilead${lp ? "" : " nopic"}" data-ref="${esc(lead.ref)}">${lp ? `<div class="ilp">${media(lp, 0, { lead: true })}</div>` : ""}<div class="ilt">${lead.updated ? `<span class="stamp">${W.updated}</span>` : ""}<div class="kick">${desk(lead)}</div><h2 class="hl" style="font-size:${lp ? 50 : 60}px">${esc(lead.title)}</h2>${lead.dek ? `<p class="deck">${esc(lead.dek)}</p>` : ""}${byline(lead, true)}</div></div>`;
  h += at(0, 134, 1180, lp ? 400 : 230, leadBlock, "story fitlead");
  const zt = lp ? 548 : 378;
  h += hr(zt - 7) + at(0, zt, 1180, 1722 - zt, "", "zone z6", 'data-z="M"');
  h += ad(1736, 196) + imprint(1942, n);
  const pg = page(h, "inside");
  const others = teasers(ed).filter(x => x.pageNo !== n);
  pg._fill = () => {
    const lh = $(".ilead .hl", pg); fitHeadline(lh, $(".ilt", pg));
    fillZone($('[data-z="M"]', pg), [[[{ ...lead, lead: true, dek: "", byline: "" }], false], [items, false], [others, true]], { size: 25, photo: 140, photos: 3 });
  };
  return pg;
}
function horoscope(ed, n) {
  let h = runningHead(ed, W.stars, n);
  const hz = ed.horoscope || [];
  h += at(0, 136, 1180, 1580, `<div class="stars">${W.signs.map((s, i) => `<div class="star"><div class="s"><i>${ZOD[i]}&#xFE0E;</i><b>${s}</b></div><div class="txt">${paras(hz[i] || "")}</div></div>`).join("")}</div>`);
  h += ad(1730, 202) + imprint(1942, n);
  const pg = page(h, "inside"); pg._fill = () => {}; return pg;
}

/* ---------- the living paper: ink, developing pictures, stamps ---------- */
// Headlines are written in ink each time their page is shown; pictures develop from sepia.
function prepareInk(pg) {
  let n = 0;
  for (const h of $$(".hl", pg)) {
    if (!h.textContent.trim() || h.closest(".ep-clip")) continue;
    const words = h.textContent.trim().split(/\s+/), base = Math.min(n, 14) * .18;
    h.innerHTML = words.map((w, i) => `<span class="w" style="--d:${(base + i * .09).toFixed(2)}s">${esc(w)}</span>`).join(" ");
    n++;
  }
  $$(".ph", pg).forEach((p, i) => p.style.setProperty("--pd", `${(.15 + i * .18).toFixed(2)}s`));
}
function alive(pg) { pg.classList.remove("alive"); void pg.offsetWidth; pg.classList.add("alive"); pg.querySelectorAll("video").forEach(v => v.play().catch(() => {})); }

/* ---------- the reader ---------- */
let pages = [], cur = 0, scale = 1, zoom = 0;
const app = $("#ep");
function bar(ed) {
  const L3 = [["bn", "বাংলা"], ["en", "English"], ["hi", "हिन्दी"]];
  const opts = (ed?.editions || []).map(e => { const [y, m, d] = e.day.split("-"); const dt = new Date(Date.UTC(+y, m - 1, +d, 6)); return `<option value="${e.day}/${e.slot}" ${ed && e.id === ed.id ? "selected" : ""}>${esc(dt.toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" }))} · ${e.slot === "morning" ? (LANG === "en" ? "Morning" : LANG === "bn" ? "প্রভাতী" : "प्रभात") : (LANG === "en" ? "Evening" : LANG === "bn" ? "সান্ধ্য" : "सांध्य")}</option>`; }).join("");
  return `<div class="ep-bar"><a class="home" href="${LANG === "bn" ? "/" : `/${LANG}/`}" aria-label="Rashtrix"><img src="/brand/logo-xs.webp" alt="Rashtrix 24×7 News"><span class="hide-s">${W.epaper}</span></a>
${opts ? `<select id="epEd" aria-label="Edition">${opts}</select>` : ""}<span class="sp"></span>
${ed ? `<div class="nav"><button id="epPrev" aria-label="${W.prev}">‹</button><span class="pg" id="epPg"></span><button id="epNext" aria-label="${W.next}">›</button></div><button id="epZo" class="hide-s" aria-label="Zoom out">−</button><button id="epZi" class="hide-s" aria-label="Zoom in">+</button>` : ""}
${ed ? `<select id="epPrint" class="hide-s" aria-label="${W2.print}"><option value="">🖨 ${W2.print}</option><option value="A4">A4</option><option value="A3">A3</option></select><button id="epShareEd" type="button">⤴ ${W2.share}</button>` : ""}
<select id="epLang" aria-label="Language">${L3.map(([l, n]) => `<option value="${l}" ${l === LANG ? "selected" : ""}>${n}</option>`).join("")}</select></div>`;
}
function fit() {
  // (the screen's own width: a page wider than the screen must not make itself wider still)
  const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || 1e5, screen.width || 1e5, window.visualViewport?.width || 1e5);
  const w = Math.min(vw - (vw < 700 ? 12 : 40), 1400);
  scale = zoom || w / 1240;
  const sheet = $(".ep-sheet"); if (!sheet) return;
  // (zoom, not a scaled picture of the page: the type is set again at the size it is read, so it
  //  stays sharp on a phone)
  sheet.style.transform = ""; sheet.style.zoom = String(scale);
  $(".ep-holder").style.width = 1240 * scale + "px"; $(".ep-holder").style.height = 2010 * scale + "px";
}
function show(i, dir = 0) {
  if (i < 0 || i >= pages.length) return;
  const sheet = $(".ep-sheet");
  const swap = () => {
    cur = i; sheet.innerHTML = ""; sheet.appendChild(pages[i]); alive(pages[i]);
    $("#epPg").textContent = `${W.page} ${D(i + 1)} / ${D(pages.length)}`;
    sheet.classList.remove("turn-out"); if (dir) { sheet.classList.add(dir > 0 ? "turn-in" : "turn-back"); setTimeout(() => sheet.classList.remove("turn-in", "turn-back"), 600); }
    try { history.replaceState(null, "", `/epaper?lang=${LANG}&ed=${EDN.day}/${EDN.slot}&p=${i + 1}`); } catch { /* none */ }
  };
  if (dir > 0) { sheet.classList.add("turn-out"); setTimeout(swap, 380); } else swap();
  if (dir) window.scrollTo({ top: 0, behavior: "smooth" });
}
// The front page, half-folded at first: the top half lies flat on the table, the lower half beneath.
function folded(pg) {
  const f = document.createElement("div"); f.className = "ep-fold folded";
  const top = document.createElement("div"); top.className = "half top"; top.appendChild(pg);
  const bot = document.createElement("div"); bot.className = "half bot"; bot.appendChild(pg.cloneNode(true));
  f.innerHTML = `<div class="stack"><i></i><i></i></div>`; f.append(top, bot);
  f.insertAdjacentHTML("beforeend", `<i class="crease"></i><button class="unfold" type="button">${W.unfold}</button>`);
  const open = () => { if (!f.classList.contains("folded")) return; f.classList.remove("folded"); setTimeout(() => { const s = f.parentElement; if (!s) return; s.innerHTML = ""; s.appendChild(pg); }, 1600); };
  $(".unfold", f).onclick = open; setTimeout(open, 5000);
  alive(pg);
  return f;
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

function fitMast(pg) {
  const np = pg.querySelector(".mh .eared .np"); if (!np) return;
  const ws = [...np.querySelectorAll(".w")], cr = np.querySelector(".crest"); let s = parseFloat(getComputedStyle(ws[0]).fontSize);
  while (np.scrollWidth > np.clientWidth + 1 && s > 56) { s -= 3; ws.forEach(w => { w.style.fontSize = s + "px"; }); if (cr) cr.style.height = Math.round(s * 1.5) + "px"; }
}

/* ---------- print (A4, A3; the owner's full-size press sheet, 22×34 inches) and the share card ---------- */
const W2 = { bn: { print: "প্রিন্ট", press: "ছাপাখানার জন্য (২২×৩৪ ইঞ্চি)", share: "শেয়ার" }, en: { print: "Print", press: "For the press (22×34 in)", share: "Share" }, hi: { print: "प्रिंट", press: "प्रेस के लिए (22×34 इंच)", share: "शेयर" } }[LANG];
function printAs(size) {
  const [w, h, u] = { A4: [210, 297, "mm"], A3: [297, 420, "mm"], press: [22, 34, "in"] }[size], k = u === "mm" ? 3.7795 : 96;
  const margin = size === "press" ? 0 : 6 * 3.7795, sw = w * k, sh = h * k, sc = Math.min((sw - 2 * margin) / 1240, (sh - 2 * margin) / 2010);
  document.querySelector(".ep-print")?.remove(); document.getElementById("epPrintCss")?.remove();
  const box = document.createElement("div"); box.className = "ep-print";
  for (const pg of pages) { const wrap = document.createElement("div"); wrap.className = "pp"; const c = pg.cloneNode(true); c.style.zoom = sc.toFixed(4); wrap.append(c); box.append(wrap); }
  const css = document.createElement("style"); css.id = "epPrintCss";
  css.textContent = `@page{size:${w}${u} ${h}${u};margin:0}@media print{.ep-print .pp{width:${w}${u};height:${h}${u}}}`;
  document.head.append(css); document.body.append(box); document.body.classList.add("printing");
  const done = () => { box.remove(); css.remove(); document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 300);
}

/* ---------- the faces, loaded before the pages are measured (else they are laid out in a stand-in) ---------- */
async function loadFaces() {
  const S = { bn: "বাংলা খবর", hi: "हिन्दी ख़बर", en: "Daily News" }[LANG];
  const want = {
    bn: ['850 40px "Noto Serif Bengali"', '600 20px "Noto Serif Bengali"', '16px "Tiro Bangla"', '700 14px "Noto Sans Bengali"', '800 14px "Noto Sans Bengali"'],
    hi: ['40px "Tiro Devanagari Hindi"', '700 14px "Noto Sans Devanagari"', '800 14px "Noto Sans Devanagari"'],
    en: ['700 40px Tinos', '16px Tinos', '700 14px Inter', '800 14px Inter']
  }[LANG];
  await Promise.race([Promise.all(want.map(f => document.fonts.load(f, S).catch(() => null))), new Promise(r => setTimeout(r, 6000))]);
  await document.fonts.ready.catch(() => {});
}

/* ---------- start ---------- */
async function start() {
  const path = q.get("ed") || "";
  let r, data;
  try { r = await fetch(`/api/epaper${/^\d{4}-\d{2}-\d{2}\/(morning|evening)$/.test(path) ? `/${path}` : ""}?lang=${LANG}`); data = await r.json(); } catch { data = {}; }
  const langPick = () => $("#epLang")?.addEventListener("change", e => { location.href = `/epaper?lang=${e.target.value}`; });
  if (r?.status === 401 && data.signin) {
    app.innerHTML = bar(null) + `<div class="ep-msg ed-${LANG}"><h2>${LANG === "hi" ? "हिन्दी ई-पेपर पढ़ने के लिए साइन इन करें" : "Sign in to read the English e-paper"}</h2><p>${LANG === "hi" ? "बांग्ला ई-पेपर सभी के लिए निःशुल्क है।" : "The Bengali e-paper is free for everyone."}</p><a href="/${LANG}/?signin=1">${LANG === "hi" ? "साइन इन करें" : "Sign in"}</a></div>`; langPick(); return;
  }
  if (!data.edition) { app.innerHTML = bar(null) + `<div class="ep-msg"><h2>${W.none}</h2><p>${W.noneB}</p></div>`; langPick(); return; }
  EDN = data.edition;
  app.innerHTML = bar(EDN) + `<div class="ep-stage"><div class="ep-holder"><div class="ep-sheet"></div></div></div><div class="ep-reader" id="epReader"><div class="ep-clip"><button class="x" type="button" aria-label="Close">×</button><div id="epRbody"></div></div></div>`;
  langPick(); fit();
  // every page built and filled off screen, at full size, then shown
  const stage = document.createElement("div"); stage.style.cssText = "position:absolute;left:-99999px;top:0;width:1240px;height:2010px;visibility:hidden"; document.body.appendChild(stage);
  await loadFaces();
  const inner = EDN.pages.slice(1).filter(p => p.key === "stars" ? (EDN.horoscope || []).some(Boolean) : p.items.length);
  PAGES_N = 1 + inner.length;
  pages = [front(EDN)];
  inner.forEach(p => pages.push(p.key === "stars" ? horoscope(EDN, pages.length + 1) : inside(EDN, p, pages.length + 1)));
  for (const pg of pages) { stage.appendChild(pg); try { pg._fill(); } catch (e) { console.error(e); } fitMast(pg); prepareInk(pg); }
  pages.forEach(p => p.remove()); stage.remove();
  // The share card's view (src/ogcard.js): the front page alone, at full size, finished.
  if (q.has("card")) { app.innerHTML = ""; document.body.classList.add("ep-card"); app.appendChild(pages[0]); window.__epReady = true; return; }
  const want = Math.max(0, Math.min(pages.length - 1, (+q.get("p") || 1) - 1));
  if (want === 0 && !q.has("p")) { $(".ep-sheet").appendChild(folded(pages[0])); cur = 0; $("#epPg").textContent = `${W.page} ${D(1)} / ${D(pages.length)}`; }
  else show(want);
  // controls
  $("#epPrev").onclick = () => show(cur - 1, -1); $("#epNext").onclick = () => show(cur + 1, 1);
  $("#epZi").onclick = () => { zoom = Math.min(2.5, scale * 1.25); fit(); }; $("#epZo").onclick = () => { zoom = Math.max(.25, scale / 1.25); fit(); };
  $("#epEd")?.addEventListener("change", e => { location.href = `/epaper?lang=${LANG}&ed=${e.target.value}`; });
  $("#epPrint")?.addEventListener("change", e => { const v = e.target.value; e.target.value = ""; if (v) printAs(v); });
  $("#epShareEd")?.addEventListener("click", () => { const u = `${location.origin}/epaper`, t = "Today's Rashtrix News e-papers: Bengali, English and Hindi"; if (navigator.share) navigator.share({ title: t, text: t, url: u }).catch(() => {}); else navigator.clipboard?.writeText(u).then(() => { $("#epShareEd").textContent = "✓"; }); });
  // The owner: the whole paper at full size for the press (22×34 inches), saved as a PDF from the print dialog.
  fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.user?.owner) $("#epPrint")?.insertAdjacentHTML("beforeend", `<option value="press">${W2.press}</option>`); }).catch(() => {});
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
