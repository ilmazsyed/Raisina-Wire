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


// The site's own share card (src/ogcard.js renderSiteCard): Rashtrix TV live, 24×7, as the hero:
// a TV screen showing the channel now (the newest story's checked photo, or the studio), with
// the channel's own graphics on it (the logo bug, LIVE and the time, the lower third with the top
// headline, the ticker with the next ones), and beside it the full logo, "২৪×৭ লাইভ টিভি", the
// tagline and the address. Redrawn through the day, so a shared link always shows what is on.
export function siteCardHTML({ photo = "/brand/studio-wide.webp", headlines = [], at = Date.now() } = {}) {
  const h0 = headlines[0] || "রাষ্ট্রিক্স ২৪×৭ নিউজ: কলকাতা, বাংলা, দেশ আর দুনিয়ার খবর", rest = headlines.slice(1, 3);
  const time = at ? bnDigits(new Date(at).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })) : "";
  const len = [...h0].length, hs = len < 40 ? 34 : len < 64 ? 30 : 26;
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@700;800;900&family=Hind+Siliguri:wght@600;700&family=Montserrat:wght@800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#140304}
.c{position:relative;width:1200px;height:630px;overflow:hidden;color:#fff;font-family:"Hind Siliguri",sans-serif;
  background:radial-gradient(ellipse 60% 80% at 30% 45%,#7a0709 0%,transparent 70%),radial-gradient(ellipse 50% 70% at 100% 0%,#3d0507 0%,transparent 70%),linear-gradient(135deg,#2a0405,#120203 70%)}
.rays{position:absolute;inset:-40%;background:repeating-conic-gradient(from 0deg at 34% 48%,rgba(255,255,255,.045) 0 3deg,transparent 3deg 12deg)}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(242,193,78,.16) 1.4px,transparent 1.4px);background-size:24px 24px;mask-image:linear-gradient(100deg,transparent 45%,#000 100%)}
.glow{position:absolute;left:40px;top:120px;width:760px;height:430px;border-radius:40px;background:#ff2a2a;filter:blur(70px);opacity:.28}
/* the TV */
.tv{position:absolute;left:44px;top:96px;width:744px;height:420px;border-radius:22px;padding:10px;background:linear-gradient(145deg,#f2c14e,#a8780e 55%,#f7d77a);box-shadow:0 30px 70px rgba(0,0,0,.6)}
.scr{position:relative;width:100%;height:100%;border-radius:14px;overflow:hidden;background:#000}
.scr>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.scr .sh{position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.78) 0%,rgba(0,0,0,.1) 46%,transparent 60%),linear-gradient(180deg,rgba(0,0,0,.45),transparent 22%)}
.bug{position:absolute;left:16px;top:14px;padding:6px 9px;background:#fff;border-radius:9px;box-shadow:0 4px 14px rgba(0,0,0,.4)}
.bug img{height:44px;display:block}
.live{position:absolute;right:14px;top:16px;display:flex;align-items:center;gap:8px}
.live b{display:flex;align-items:center;gap:7px;padding:5px 12px;border-radius:7px;background:#e10b0b;font:900 19px Montserrat,sans-serif;letter-spacing:.08em;box-shadow:0 0 0 2px rgba(255,255,255,.25)}
.live b i{width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.3)}
.live span{padding:5px 11px;border-radius:7px;background:rgba(0,0,0,.6);font:800 19px "Hind Siliguri",sans-serif}
.l3{position:absolute;left:16px;right:16px;bottom:52px;display:flex;align-items:stretch;border-radius:8px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.45)}
.l3 em{flex:none;display:flex;align-items:center;padding:0 14px;background:#c8100f;font:800 21px "Hind Siliguri",sans-serif;font-style:normal}
.l3 h1{flex:1;padding:9px 14px;background:#fff;color:#14080a;font:800 ${hs}px/1.3 "Noto Serif Bengali",serif;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;border-bottom:4px solid #D4A017}
.tk{position:absolute;left:0;right:0;bottom:0;height:40px;display:flex;align-items:center;background:#0d0d10;border-top:2px solid #D4A017}
.tk b{flex:none;height:100%;display:flex;align-items:center;padding:0 12px;background:#D4A017;color:#1a0405;font:800 17px "Hind Siliguri",sans-serif}
.tk span{padding:0 14px;font:700 17px "Hind Siliguri",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tk span+span:before{content:"◆";color:#D4A017;margin-right:14px}
.stand{position:absolute;left:360px;top:516px;width:112px;height:22px;background:linear-gradient(#a8780e,#5c3f06);clip-path:polygon(18% 0,82% 0,100% 100%,0 100%);border-radius:0 0 6px 6px}
/* the side */
.side{position:absolute;left:822px;right:36px;top:70px;bottom:44px;display:flex;flex-direction:column;align-items:flex-start}
.logo{padding:12px 18px;background:#fff;border-radius:18px;box-shadow:0 12px 34px rgba(0,0,0,.45)}
.logo img{height:96px;display:block}
.big{margin-top:30px;font:900 64px/1.02 "Noto Serif Bengali",serif;color:#fff;text-shadow:0 6px 26px rgba(0,0,0,.5)}
.big small{display:block;font:900 30px/1.2 Montserrat,sans-serif;letter-spacing:.14em;color:#f2c14e;margin-bottom:6px}
.sub{margin-top:16px;font:700 23px/1.4 "Hind Siliguri",sans-serif;color:rgba(255,255,255,.88)}
.tag{margin-top:10px;font:800 21px "Noto Serif Bengali",serif;color:#f2c14e}
.cta{margin-top:auto;display:flex;align-items:center;gap:12px;padding:12px 20px;border-radius:999px;background:#e10b0b;font:800 24px "Hind Siliguri",sans-serif;box-shadow:0 10px 30px rgba(225,11,11,.5),0 0 0 3px rgba(242,193,78,.6)}
.cta i{width:0;height:0;border-left:16px solid #fff;border-top:10px solid transparent;border-bottom:10px solid transparent}
.cta small{font:800 20px Montserrat,sans-serif;opacity:.9}
.band{position:absolute;left:0;right:0;top:0;height:8px;background:linear-gradient(90deg,#c8100f,#D4A017,#c8100f)}
</style></head><body>
<div class="c"><div class="rays"></div><div class="dots"></div><i class="band"></i><div class="glow"></div>
<div class="tv"><div class="scr"><img src="${esc(photo)}" alt=""><div class="sh"></div>
<div class="bug"><img src="/brand/logo.webp" alt=""></div>
<div class="live"><b><i></i>LIVE</b>${time ? `<span>${esc(time)}</span>` : ""}</div>
<div class="l3"><em>এইমাত্র</em><h1>${esc(h0)}</h1></div>
<div class="tk"><b>শিরোনাম</b>${(rest.length ? rest : ["কলকাতা · পশ্চিমবঙ্গ · ভারত · বিশ্ব"]).map(t => `<span>${esc(t)}</span>`).join("")}</div>
</div></div><i class="stand"></i>
<div class="side"><span class="logo"><img src="/brand/logo.webp" alt=""></span>
<div class="big"><small>LIVE TV</small>২৪×৭ খবর</div>
<div class="sub">কলকাতা, বাংলা, দেশ আর দুনিয়ার খবর, সারাদিন সারারাত</div>
<div class="tag">দেশ প্রথম । বলিদান পরম ধর্ম</div>
<div class="cta"><i></i>এখনই দেখুন <small>rashtrix.live</small></div></div>
</div></body></html>`;
}
