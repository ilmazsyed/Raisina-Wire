// The share card's page (1200×630), drawn as HTML and photographed by src/ogcard.js.
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bnDigits = s => String(s).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
const DESK = {
  Kolkata: ["কলকাতা", "Kolkata", "कोलकाता", "#AA0404", "#ff3b3b"],
  "West Bengal": ["পশ্চিমবঙ্গ", "West Bengal", "पश्चिम बंगाल", "#8e2a35", "#ff6a5c"],
  India: ["ভারত", "India", "भारत", "#b4570e", "#ffb347"],
  "Probashi Bangali": ["প্রবাসী বাঙালি", "Probashi Bangali", "प्रवासी बंगाली", "#5b2d91", "#c084fc"],
  World: ["বিশ্ব", "World", "दुनिया", "#0f5c8c", "#38bdf8"],
  Entertainment: ["বিনোদন", "Entertainment", "मनोरंजन", "#a3166f", "#ff5fb8"],
  Sports: ["খেলা", "Sports", "खेल", "#1d7a3a", "#4ade80"],
  Lifestyle: ["জীবনধারা", "Lifestyle", "जीवनशैली", "#b8740a", "#fcd34d"]
};
const LI = { bn: 0, en: 1, hi: 2 };
const KIND = { brief: ["সংক্ষেপে", "In brief", "संक्षेप में"], rewrite: ["এইমাত্র", "Just in", "अभी-अभी"], article: ["বিশেষ প্রতিবেদন", "Report", "रिपोर्ट"] };
const BRAND = ["রাষ্ট্রিক্স ২৪x৭ নিউজ", "RASHTRIX 24X7 NEWS", "राष्ट्रिक्स 24x7 न्यूज़"];

export const CARD_PATH = slug => `/og/${encodeURIComponent(slug)}.jpg`;

function dateLine(iso, lang) {
  try {
    const s = new Date(iso || Date.now()).toLocaleDateString({ bn: "bn-IN", en: "en-IN", hi: "hi-IN" }[lang] || "bn-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
    return lang === "bn" ? bnDigits(s) : s;
  } catch { return ""; }
}

// The card page: the browser photographs this at 1200×630.
export function cardHTML(a) {
  const lang = LI[a.lang] !== undefined ? a.lang : "bn", li = LI[lang];
  const d = DESK[a.category] || DESK.Kolkata, photo = a.image || "";
  const title = String(a.title || ""), len = [...title].length;
  const size = len < 36 ? 76 : len < 60 ? 64 : len < 90 ? 54 : 46;
  const kind = (KIND[a.kind] || KIND.article)[li];
  const font = lang === "hi" ? `"Noto Serif Devanagari","Hind",serif` : lang === "en" ? `"Merriweather","Georgia",serif` : `"Noto Serif Bengali","Hind Siliguri",serif`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@700;800&family=Hind+Siliguri:wght@600;700&family=Noto+Serif+Devanagari:wght@700;800&family=Merriweather:wght@900&family=Montserrat:wght@800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#0b0507}
.c{position:relative;width:1200px;height:630px;overflow:hidden;color:#fff;font-family:"Hind Siliguri",sans-serif;--d:${d[3]};--g:${d[4]}}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ph .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,2,4,.96) 0%,rgba(10,2,4,.86) 42%,rgba(10,2,4,.35) 72%,rgba(10,2,4,.1) 100%),linear-gradient(0deg,rgba(0,0,0,.65),transparent 40%)}
.np{background:radial-gradient(ellipse 80% 90% at 85% 15%,var(--g) 0%,transparent 55%),radial-gradient(ellipse 70% 80% at 0% 100%,var(--d) 0%,transparent 60%),linear-gradient(135deg,var(--d) 0%,#170306 70%,#0b0507 100%)}
.np .rays{position:absolute;inset:-40%;background:repeating-conic-gradient(from 10deg at 80% 20%,rgba(255,255,255,.07) 0 4deg,transparent 4deg 14deg)}
.np .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.14) 1.5px,transparent 1.5px);background-size:26px 26px;mask-image:linear-gradient(120deg,transparent 30%,#000 100%)}
.wm{position:absolute;right:-20px;bottom:40px;font:900 210px/1 ${font};color:rgba(255,255,255,.08);white-space:nowrap;letter-spacing:-2px}
.ring{position:absolute;right:70px;top:60px;width:300px;height:300px;border-radius:50%;border:3px solid rgba(255,255,255,.18);box-shadow:0 0 0 30px rgba(255,255,255,.04),0 0 0 70px rgba(255,255,255,.03)}
.sl{position:absolute;top:-10%;height:120%;transform:skewX(-16deg)}
.s1{left:-60px;width:26px;background:var(--g)}
.s2{left:-14px;width:8px;background:#D4A017}
.top{position:absolute;left:64px;right:56px;top:44px;display:flex;align-items:center;gap:18px}
.logo{padding:10px 16px;background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.logo img{height:62px;display:block}
.kind{display:inline-flex;align-items:center;gap:10px;padding:9px 18px;border-radius:999px;background:#e00;font:800 24px "Hind Siliguri",sans-serif;box-shadow:0 8px 24px rgba(224,0,0,.45)}
.kind i{width:12px;height:12px;border-radius:50%;background:#fff}
.desk{margin-left:auto;padding:9px 20px;border-radius:999px;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.35);font:800 26px "Hind Siliguri",sans-serif}
.main{position:absolute;left:64px;bottom:118px;width:${photo ? 690 : 1020}px}
.main .tag{display:inline-block;margin-bottom:16px;padding:6px 16px;background:var(--d);border-left:8px solid #D4A017;font:800 26px "Hind Siliguri",sans-serif}
h1{font:800 ${size}px/1.28 ${font};text-shadow:0 6px 24px rgba(0,0,0,.45);display:-webkit-box;-webkit-line-clamp:${photo ? 4 : 3};-webkit-box-orient:vertical;overflow:hidden}
.bar{position:absolute;left:0;right:0;bottom:0;height:78px;display:flex;align-items:center;gap:22px;padding:0 56px 0 64px;background:linear-gradient(90deg,#AA0404,#d10a0a 60%,#7a0000)}
.bar b{font:900 26px Montserrat,"Hind Siliguri",sans-serif;letter-spacing:.06em}
.bar span{font:700 24px "Hind Siliguri",sans-serif;opacity:.92}
.bar em{margin-left:auto;font:800 22px Montserrat,sans-serif;font-style:normal;padding:8px 16px;border-radius:10px;background:rgba(0,0,0,.25)}
</style></head><body>
<div class="c ${photo ? "ph" : "np"}">
${photo ? `<img class="bg" src="${esc(photo)}" alt="">` : `<div class="rays"></div><div class="dots"></div><div class="ring"></div><div class="wm">${esc(d[li])}</div>`}
<div class="shade"></div><i class="sl s1"></i><i class="sl s2"></i>
<div class="top"><span class="logo"><img src="/brand/logo.webp" alt=""></span><span class="kind"><i></i>${esc(kind)}</span><span class="desk">${esc(d[li])}</span></div>
<div class="main">${photo ? `<span class="tag">${esc(d[li])}</span>` : ""}<h1>${esc(title)}</h1></div>
<div class="bar"><b>${esc(BRAND[li])}</b><span>${esc(dateLine(a.publishedAt, lang))}</span><em>LIVE · 24×7</em></div>
</div></body></html>`;
}

