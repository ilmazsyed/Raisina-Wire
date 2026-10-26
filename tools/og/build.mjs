// Share cards (og-image.jpg, og-image-hi.jpg, og-image-bn.jpg): `node tools/og/cap.cjs` takes phone
// screenshots of the live site (light and dark), `node tools/og/build.mjs` lays out the cards and
// `node tools/og/shoot.cjs` renders them into public/. Run all three from the repository root.
import { markDome, skyline } from "../../src/brand.js";
import fs from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const b64 = f => "data:image/png;base64," + fs.readFileSync(dir + "shots/" + f).toString("base64");
const T = {
  en: { tag: "India’s strategic briefing", sub: "Geopolitics · Security · Diplomacy · Markets", feat: ["Live wire", "Explainers", "Shorts", "Market board"], back: "en-light.png", front: "en-dark.png", modes: ["Light", "Dark"] },
  hi: { tag: "भारत की रणनीतिक ब्रीफिंग", sub: "भू-राजनीति · सुरक्षा · कूटनीति · बाजार", feat: ["लाइव वायर", "एक्सप्लेनर", "शॉर्ट्स", "मार्केट बोर्ड"], back: "hi-light.png", front: "hi-dark.png", modes: ["लाइट", "डार्क"] },
  bn: { tag: "ভারতের কৌশলগত ব্রিফিং", sub: "ভূরাজনীতি · নিরাপত্তা · কূটনীতি · বাজার", feat: ["লাইভ ওয়্যার", "এক্সপ্লেনার", "শর্টস", "মার্কেট বোর্ড"], back: "bn-light.png", front: "bn-dark.png", modes: ["লাইট", "ডার্ক"] }
};
for (const [l, t] of Object.entries(T)) {
  const font = l === "hi" ? "'Tiro Devanagari Hindi'" : l === "bn" ? "'Tiro Bangla'" : "Newsreader";
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500&family=Noto+Serif+Display:wdth,wght@62.5,900&family=Manrope:wght@500;600;700;800&family=DM+Mono:wght@500&family=Tiro+Devanagari+Hindi&family=Tiro+Bangla&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:Manrope,sans-serif;color:#fff;
 background:radial-gradient(900px 520px at 78% 38%,rgba(214,40,52,.55),transparent 62%),radial-gradient(600px 380px at 8% 105%,rgba(242,140,40,.22),transparent 70%),radial-gradient(700px 400px at 30% -10%,rgba(80,110,200,.28),transparent 70%),linear-gradient(160deg,#0a0e19 0%,#121828 55%,#1a0d14 100%);position:relative}
.grain{position:absolute;inset:0;opacity:.07;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.tri{position:absolute;top:0;left:0;right:0;height:6px;display:flex}.tri i{flex:1}.tri i:nth-child(1){background:#ff8a2a}.tri i:nth-child(2){background:#f4f4f4}.tri i:nth-child(3){background:#138a3c}
.sky{position:absolute;left:-20px;bottom:-6px;width:700px;color:rgba(255,255,255,.12)}
.left{position:absolute;left:64px;top:108px;width:640px}
.brand{display:flex;align-items:center;gap:20px}
.tile{width:86px;height:86px;border-radius:20px;background:linear-gradient(150deg,#e2323f,#9d0f19);display:grid;place-items:center;color:#fff;box-shadow:0 16px 40px -10px rgba(214,40,52,.75),inset 0 1px 0 rgba(255,255,255,.35)}
.tile svg{width:60px;height:52px}
.word{font:900 96px/0.9 'Noto Serif Display';font-stretch:62.5%;font-variation-settings:'wdth' 62.5;letter-spacing:-1px;white-space:nowrap}.word em{font-style:normal;color:#ff4d57}
.rule{height:3px;width:560px;margin:22px 0 22px;background:linear-gradient(90deg,#fff,rgba(255,255,255,.15))}
.tag{font:500 48px/1.1 ${font};letter-spacing:${l === "en" ? "-1px" : "0"}}
.sub{margin-top:14px;font:600 19px/1.4 ${l === "en" ? "Manrope" : font};color:rgba(255,255,255,.72);letter-spacing:.2px}
.langs{display:flex;gap:10px;margin-top:30px}
.chip{padding:10px 18px 9px;border-radius:999px;font:600 20px/1 Manrope;color:#fff;background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 8px 20px -10px rgba(0,0,0,.6);backdrop-filter:blur(10px)}
.chip.hi{font-family:'Tiro Devanagari Hindi';font-size:22px}.chip.bn{font-family:'Tiro Bangla';font-size:22px}
.chip.on{background:linear-gradient(180deg,#ff5560,#c4151f);border-color:rgba(255,255,255,.35)}
.feat{display:flex;gap:16px;margin-top:26px;font:700 15px/1 'DM Mono';letter-spacing:1.4px;text-transform:uppercase;color:rgba(255,255,255,.6)}
.feat span{display:flex;align-items:center;gap:8px}.feat span:first-child:before{content:"";width:9px;height:9px;border-radius:50%;background:#ff4d57;box-shadow:0 0 0 4px rgba(255,77,87,.25)}
.feat span:not(:first-child):before{content:"·";margin-right:8px;color:rgba(255,255,255,.35)}
.phone{position:absolute;width:262px;height:566px;border-radius:44px;padding:9px;background:linear-gradient(145deg,#3a4052,#0d1018 60%,#2a2f3d);box-shadow:0 40px 80px -20px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.12),inset 0 1px 0 rgba(255,255,255,.25)}
.phone .scr{width:100%;height:100%;border-radius:36px;overflow:hidden;position:relative;background:#000}
.phone img{width:100%;display:block}
.phone .scr:after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.28) 0%,rgba(255,255,255,.06) 30%,transparent 46%);pointer-events:none}
.phone .notch{position:absolute;top:18px;left:50%;width:86px;height:24px;margin-left:-43px;border-radius:20px;background:#05070c;z-index:2}
.p1{left:742px;top:74px;transform:rotate(-7deg)}
.p2{left:902px;top:40px;transform:rotate(5deg)}
.mode{position:absolute;z-index:3;padding:7px 13px;border-radius:999px;font:700 13px/1 Manrope;letter-spacing:.4px;display:flex;align-items:center;gap:7px;box-shadow:0 10px 24px -8px rgba(0,0,0,.6)}
.m1{left:720px;top:560px;background:#fff;color:#0f1422}.m2{left:1050px;top:550px;background:#151b2a;color:#fff;border:1px solid rgba(255,255,255,.2)}
.glow{position:absolute;left:760px;top:520px;width:420px;height:120px;background:radial-gradient(closest-side,rgba(0,0,0,.6),transparent);filter:blur(10px)}
.url{position:absolute;left:64px;top:30px;font:600 16px/1 'DM Mono';letter-spacing:1px;color:rgba(255,255,255,.55)}
</style></head><body><div class="grain"></div><div class="tri"><i></i><i></i><i></i></div>
<div class="sky">${skyline("s", false)}</div>
<div class="left"><div class="brand"><div class="tile">${markDome("d", 3.6)}</div><div class="word">Raisina<em> Wire</em></div></div>
<div class="rule"></div><div class="tag">${t.tag}</div><div class="sub">${t.sub}</div>
<div class="langs"><span class="chip ${l === "en" ? "on" : ""}">English</span><span class="chip hi ${l === "hi" ? "on" : ""}">हिन्दी</span><span class="chip bn ${l === "bn" ? "on" : ""}">বাংলা</span></div>
<div class="feat">${t.feat.map(f => `<span>${f}</span>`).join("")}</div></div>
<div class="glow"></div>
<div class="phone p1"><div class="scr"><div class="notch"></div><img src="${b64(t.back)}"></div></div>
<div class="phone p2"><div class="scr"><div class="notch"></div><img src="${b64(t.front)}"></div></div>
<div class="mode m1">☀ ${t.modes[0]}</div><div class="mode m2">☾ ${t.modes[1]}</div>
<div class="url">raisinawire.calibrex.org</div>
</body></html>`;
  fs.writeFileSync(`${dir}og-${l}.html`, html);
}
