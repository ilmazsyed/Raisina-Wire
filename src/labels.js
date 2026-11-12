// Story labels for the channel's running order: each story's desk (where it is from, so two from
// the same desk never run back to back and Bengal, India and the world take turns) and its weight
// (heavy: death, crime, war, disaster; light: culture, festivals, sport, science, human interest),
// so a light story follows every two heavy ones. Rules by words, Bengali and English, and the
// category; a story can be relabelled in the AVO Story Desk when a rule gets it wrong.
const HEAVY = /মৃত|মৃত্যু|খুন|হত্যা|ধর্ষণ|নিহত|আহত|দুর্ঘটনা|বিস্ফোরণ|হামলা|জঙ্গি|সন্ত্রাস|যুদ্ধ|গুলি|অগ্নিকাণ্ড|আগুন|বন্যা|ভূমিকম্প|ঘূর্ণিঝড়|গ্রেফতার|গ্রেপ্তার|আত্মহত্যা|অপহরণ|দুর্নীতি|প্রতারণা|সংঘর্ষ|রক্তাক্ত|লাশ|দেহ উদ্ধার|নিখোঁজ|ধস|বিপর্যয়|\b(dead|death|died|killed|murder|rape|accident|blast|attack|terror|war|fire|flood|earthquake|cyclone|arrest|suicide|crash|riot)\b/i;
const LIGHT = /উৎসব|পুজো|পূজা|মেলা|সাফল্য|পুরস্কার|শিরোপা|জয়ী|রেকর্ড|বিজ্ঞান|প্রযুক্তি|সিনেমা|ছবিমুক্তি|গান|ভাইরাল|শিল্প|সংস্কৃতি|বই|প্রদর্শনী|উদ্বোধন|সম্মান|বিয়ে|জন্মদিন|পর্যটন|খুদে|নজির|\b(festival|award|record|science|culture|viral|wins|launch|celebrat)/i;
const BD = /বাংলাদেশ|ঢাকা|চট্টগ্রাম|হাসিনা|ইউনূস|\bbangladesh|\bdhaka/i;
// The desk key: kolkata, bengal, india, bangladesh, world, sports, business, other.
export function deskKey(category = "", text = "") {
  const c = String(category).toLowerCase();
  if (c === "sports") return "sports";
  if (c === "business") return "business";
  if (BD.test(text)) return "bangladesh";
  if (c === "kolkata") return "kolkata";
  if (c === "west bengal") return "bengal";
  if (c === "india" || c === "probashi bangali") return "india";
  if (c === "world") return "world";
  return "other";
}
export function weightOf(category = "", text = "") {
  if (HEAVY.test(text)) return "heavy";
  if (["sports", "entertainment", "lifestyle"].includes(String(category).toLowerCase()) || LIGHT.test(text)) return "light";
  return "mid";
}
// The bulletins' order (src/tvchannel.js, src/engine.js): West Bengal politics first, then Kolkata
// politics, India's politics, then West Bengal, Kolkata and India, then the world, sports,
// entertainment, lifestyle and the rest. A word must start where the match starts.
const POLITICS = /(?<![\p{L}\p{M}])(?:রাজনীতি|রাজনৈতিক|তৃণমূল|বিজেপি|সিপিএম|সিপিআই|কংগ্রেস|বামফ্রন্ট|বামেদের|আইএসএফ|মমতা|শুভেন্দু|অভিষেক|সুকান্ত|শমীক|মুখ্যমন্ত্রী|মন্ত্রী|প্রধানমন্ত্রী|বিধায়ক|সাংসদ|বিধানসভা|লোকসভা|রাজ্যসভা|সংসদ|নির্বাচন|উপনির্বাচন|ভোট|প্রার্থী|রাজ্যপাল|নবান্ন|মোদী|অমিত শাহ|রাহুল গান্ধী|পঞ্চায়েত|কাউন্সিলর|দলবদল|tmc|bjp|cpi|congress|election|minister|assembly|parliament)/iu;
export const isPolitics = text => POLITICS.test(String(text || ""));
export function bulletinRank(category = "", text = "") {
  const c = String(category).toLowerCase(), pol = isPolitics(text), dk = deskKey(category, text);
  if (dk === "bengal") return pol ? 0 : 3;
  if (dk === "kolkata") return pol ? 1 : 4;
  if (dk === "india") return pol ? 2 : 5;
  if (dk === "world" || dk === "bangladesh") return 6;
  if (c === "sports") return 7;
  if (c === "entertainment") return 8;
  if (c === "lifestyle") return 9;
  return 10;
}
export const labelsOf = (category, text, override) => ({ dk: override?.dk || deskKey(category, text), weight: override?.weight || weightOf(category, text) });
