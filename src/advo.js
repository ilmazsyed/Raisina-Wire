// The Rashtrix promo (video ad, made outside the site): its voice-over, recorded once by the cron in
// the channel's chosen male newsreader voice (AVO desk > Newsreader voice) at an unhurried pace,
// kept in tts_audio and served at /api/tv/voice/<key>.mp3 like every other recording
// (key = sha256(`<voice>|ad1|<rate>|<line>`), first 40 characters). A few hundred characters of the
// month's free allowance, once.
import { synthesize, sha256, ttsEnabled } from "./tts.js";
import { tvVoice, voiceBudget, chargeVoice } from "./bulletinvoice.js";

export const AD_RATE = 1.0;
export const AD_LINES = [
  "খবর শুধু দেখার নয়। পড়ারও।",
  "আমরা একটা অদ্ভুত সময়ে বাস করছি।",
  "যে সময়ে খবর আমাদের চোখের সামনে আসে, কানে পৌঁছয়, মুহূর্তে ছড়িয়ে পড়ে।",
  "প্রযুক্তি বদলেছে। বদলেছে খবর পাওয়ার মাধ্যম।",
  "কিন্তু একটা জিনিস কি আমরা হারিয়ে ফেলছি?",
  "পড়ার অভ্যাস।",
  "ব্যাঙ্কের নথি আমরা শুধু শুনে বুঝি না।",
  "সরকারি চিঠি শুধু দেখে সিদ্ধান্ত নিই না।",
  "প্রোমোশন অর্ডার, নিয়োগপত্র কিংবা চাকরি হারানোর নোটিস, কেউ পড়ে শোনালেই কি তার অর্থ পুরোপুরি বোঝা যায়?",
  "না। আমরা পড়ি। বুঝি। তারপর সিদ্ধান্ত নিই।",
  "তাহলে আমাদের জীবনের প্রতিটি মুহূর্তকে প্রভাবিত করে যে খবর, তাকে শুধু দেখে বা শুনে কেন বিশ্বাস করব?",
  "খবর শুধু দৃশ্য নয়।",
  "খবর শুধু শব্দ নয়।",
  "খবর তথ্য, প্রেক্ষাপট, ব্যাখ্যা এবং উপলব্ধি।",
  "এই ভাবনা থেকেই রাষ্ট্রিক্স।",
  "খবর দেখুন।",
  "খবর শুনুন।",
  "খবর পড়ুন।",
  "দেখুন ঘটনার ছবি। শুনুন ঘটনার বিবরণ। আর পড়ে জানুন ঘটনার সম্পূর্ণ প্রেক্ষাপট।",
  "আজ আর শুধু জানা যথেষ্ট নয়। বোঝাটাও জরুরি।",
  "আর বোঝার জন্য পড়া জরুরি।",
  "রাষ্ট্রিক্স। দেখুন। শুনুন। পড়ুন। খবর, কোলাহল নয়।"
];

export async function adVoiceover(env) {
  if (!ttsEnabled(env)) return { skipped: "no key" };
  const voice = tvVoice(env, "m"); let made = 0;
  for (const line of AD_LINES) {
    const key = (await sha256(`${voice}|ad1|${AD_RATE}|${line}`)).slice(0, 40);
    if (await env.DB.prepare("SELECT 1 FROM tts_audio WHERE key=?").bind(key).first()) continue;
    if (await voiceBudget(env) < line.length + 1000) break;
    const audio = await synthesize(env, line, voice, "bn-IN", AD_RATE);
    await env.DB.prepare("INSERT OR REPLACE INTO tts_audio (key,voice,chars,data) VALUES (?,?,?,?)").bind(key, voice, line.length, audio.buffer).run();
    await chargeVoice(env, line.length); made++;
  }
  return { made };
}
