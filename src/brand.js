// Rashtrix 24×7 News brand marks. The gold "R" mark and the full logo are bitmaps cut from the
// owner's logo (rashtrix/brand/logo.png → public/brand/). The wordmark is set in Montserrat:
// RASHTRIX in brand red over a red "24X7 NEWS" bar, as on the logo.
export const BRAND = {
  name: "Rashtrix 24×7 News", short: "Rashtrix", nameBn: "রাষ্ট্রিক্স ২৪×৭ নিউজ", nameHi: "राष्ट्रिक्स 24×7 न्यूज़",
  owner: "Middleton Media Works", tagline: "লোক গুনি না, লোকের কথা শুনি",
  red: "#AA0404", maroon: "#A43F44", gold: "#D4A017", ink: "#111111"
};
export const brandMark = (cls = "brand-mark") => `<span class="${cls}" aria-hidden="true"><img src="/brand/mark.webp" alt="" width="40" height="40" decoding="async"></span>`;
export const wordmark = () => `<span class="wm-name">RASHTRIX</span><span class="wm-bar">24X7 NEWS</span>`;
export const fullLogo = (cls = "full-logo") => `<img class="${cls}" src="/brand/logo.webp" alt="Rashtrix 24×7 News" width="240" height="344" decoding="async">`;
