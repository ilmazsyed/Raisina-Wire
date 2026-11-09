// A one-line Bengali title for a video, from its YouTube title and description: only the Bengali
// words, with channel names, hashtags, links, English words and stock prefixes or suffixes
// ("ব্রেকিং", "শর্টস", "রাষ্ট্রিক্স নিউজ" …) dropped. Used for the TV's "up next" card when the
// wire desk has not written one yet.
const BN = /[ঀ-৿]/g;
const count = s => (String(s).match(BN) || []).length;
const JUNK = /^(?:ব্রেকিং(?: নিউজ)?|এইমাত্র(?: পাওয়া খবর)?|বড় খবর|লাইভ|শর্টস|শর্ট|খবর|সংবাদ|রাষ্ট্রিক্স(?: নিউজ| টিভি| ২৪x৭)?|বাংলা খবর|আজকের খবর|দেখুন|ভিডিও|সাবস্ক্রাইব করুন)$/;
const bnDigits = s => String(s).replace(/\d/g, d => "০১২৩৪৫৬৭৮৯"[d]);
export function tidyLine(s, max = 80) {
  let line = bnDigits(String(s || "")
    .replace(/https?:\/\/\S+/g, " ").replace(/[#@][^\s#@]+/g, " ")
    .replace(/[A-Za-z][A-Za-z0-9'’&.\-]*/g, " ")
    .replace(/[^ঀ-৿0-9\s,'‘’\-?]/g, " ")
    .replace(/\s+/g, " ").replace(/^[\s,\-'‘’।]+|[\s,\-'‘’।]+$/g, "").trim());
  if (line.length > max) { const cut = line.slice(0, max), sp = cut.lastIndexOf(" "); line = `${sp > 30 ? cut.slice(0, sp) : cut}…`; }
  return line;
}
const parts = s => String(s || "").replace(/https?:\/\/\S+/g, " ").replace(/[#@][^\s#@]+/g, " ")
  .split(/\s*(?:[|｜•【】\[\]()«»"“”]|\s[-–—:]\s|\n|।|!)\s*/)
  .map(p => tidyLine(p, 400)).filter(p => count(p) >= 4 && !JUNK.test(p));
export function bnLine(title = "", desc = "") {
  let line = parts(title).sort((a, b) => count(b) - count(a))[0] || "";
  if (count(line) < 10) {
    const d = parts(String(desc || "").split("\n").slice(0, 6).join("\n"))[0] || "";
    if (count(d) > count(line)) line = d;
  }
  return tidyLine(line);
}
