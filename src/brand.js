// Rashtrix 24×7 News brand marks. The Rashtrix logo is a trademark: it is always shown whole
// (the gold R with RASHTRIX / 24X7 NEWS in its frame), never cropped or redrawn. Bitmaps from
// the owner's logo (rashtrix/brand/logo.png → public/brand/).
export const BRAND = {
  name: "Rashtrix 24×7 News", short: "Rashtrix", nameBn: "রাষ্ট্রিক্স ২৪×৭ নিউজ", nameHi: "राष्ट्रिक्स 24×7 न्यूज़",
  owner: "Middleton Media Works", tagline: "লোক গুনি না, লোকের কথা শুনি",
  red: "#AA0404", maroon: "#A43F44", gold: "#D4A017", ink: "#111111"
};
export const brandMark = (cls = "brand-mark") => `<span class="${cls}" aria-hidden="true"><img src="/brand/logo-xs.webp" alt="" width="120" height="172" decoding="async"></span>`;
export const fullLogo = (cls = "full-logo") => `<img class="${cls}" src="/brand/logo.webp" alt="Rashtrix 24×7 News" width="240" height="344" decoding="async">`;
