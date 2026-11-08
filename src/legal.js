// Rashtrix's About page and legal documents, in English with Bengali versions (`bn`). One
// source for the app views and the server-rendered pages. Plain HTML strings; edit the text here.
// Hindi readers get the English until a Hindi version is saved in the control room
// (Translations); a version saved there also replaces the bundled Bengali.
// Drafted with care for Indian law (IT Act 2000 and IT Rules 2021, DPDP Act 2023, Copyright
// Act 1957) but not a substitute for review by the company's legal officer.

export const LEGAL_UPDATED = "7 November 2026";
// The Grievance Officer required by IT Rules 2021, rule 3(2) and rule 4. Fill these in before
// launch: the pages say the details are coming until they are set.
export const GRIEVANCE = { name: "", title: "Grievance Officer, Rashtrix 24×7 News", email: "", phone: "", address: "" };
export const CONTACT_EMAIL = GRIEVANCE.email;
export const SITE_URL = "https://www.rashtrix.live";
const mail = CONTACT_EMAIL ? `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>` : "the address on our <a href=\"/grievance\">Grievance Redressal</a> page";
const mailBn = CONTACT_EMAIL ? `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>` : "<a href=\"/grievance\">অভিযোগ নিষ্পত্তি</a> পাতায় দেওয়া ঠিকানা";
const officer = (bn = false) => GRIEVANCE.name && GRIEVANCE.email
  ? `<div class="officer"><b>${bn ? "অভিযোগ আধিকারিক (Grievance Officer)" : "Grievance Officer"}</b><br>${GRIEVANCE.name}, ${GRIEVANCE.title}<br>${bn ? "ইমেল" : "Email"}: <a href="mailto:${GRIEVANCE.email}">${GRIEVANCE.email}</a>${GRIEVANCE.phone ? `<br>${bn ? "ফোন" : "Phone"}: ${GRIEVANCE.phone}` : ""}${GRIEVANCE.address ? `<br>${bn ? "ঠিকানা" : "Address"}: ${GRIEVANCE.address}` : ""}<br>${bn ? "সময়: সোম থেকে শনি, সকাল ১০টা থেকে সন্ধ্যা ৬টা" : "Hours: Monday to Saturday, 10:00 to 18:00 IST"}</div>`
  : `<div class="officer"><b>${bn ? "অভিযোগ আধিকারিক (Grievance Officer)" : "Grievance Officer"}</b><br>${GRIEVANCE.title}<br>${bn ? "নাম ও যোগাযোগের বিবরণ শিগগির এখানে প্রকাশ করা হবে।" : "The officer’s name and contact details will be published here shortly."}</div>`;

const ORG = "Rashtrix 24×7 News";
const CREDITS = "Founder and Editor-in-Chief: Ilmaz Syed. Powered by Calibrex";
const ORG_BN = "রাষ্ট্রিক্স ২৪×৭ নিউজ";
const CREDITS_BN = "প্রতিষ্ঠাতা ও প্রধান সম্পাদক: Ilmaz Syed। প্রযুক্তি সহায়তায়: Calibrex";

/* ---------- About ---------- */
export const ABOUT = {
  title: "About Rashtrix",
  description: "Rashtrix 24×7 News is a Bengali news channel and app from Kolkata, founded by its editor-in-chief Ilmaz Syed: Kolkata, West Bengal, India, Bengalis abroad and the world.",
  html: `
<p class="lede">Rashtrix 24×7 News is a Bengali-first news channel and app from Kolkata. Our line: <b lang="bn">দেশ প্রথম । বলিদান পরম ধর্ম</b>: the nation first; sacrifice is the highest duty.</p>
<h2>What we publish</h2>
<ul>
  <li><b>Rashtrix reports</b>: stories by our own reporters and desk, with their photographs.</li>
  <li><b>Wire reports and briefs</b>: short reports written by the Rashtrix wire desk from several published sources, checked against each other and written in our own words. They carry no photographs.</li>
  <li><b>Live coverage</b> of developing events, and alerts when news breaks.</li>
  <li>Five desks: <b>Kolkata</b>, <b>West Bengal</b>, <b>India</b>, <b>Probashi Bangali</b> (Bengalis outside Bengal and abroad) and the <b>World</b>, in Bengali, English and Hindi.</li>
</ul>
<h2>How we work</h2>
<p>We report facts we can stand behind and correct mistakes openly. Wire reports are drafted with the help of an AI language model from facts in at least two published reports wherever possible, and an editor can pull or correct any of them at once; every correction is recorded. See our <a href="/disclaimer">editorial disclaimer</a>, <a href="/copyright">how we use other publishers’ work</a> and our <a href="/corrections">corrections policy</a>.</p>
<p>Rashtrix is independent. It is not affiliated with any government or political party.</p>
<h2>Who we are</h2>
<p>${ORG}. ${CREDITS}. Watch us on YouTube and Facebook, and read us at <a href="${SITE_URL}">rashtrix.live</a>.</p>
<h2>Contact</h2>
<p>Editorial, corrections and legal matters: ${mail}. For complaints and takedown requests, see <a href="/grievance">Grievance redressal</a>.</p>`,
  bn: { title: "রাষ্ট্রিক্স সম্পর্কে", html: `
<p class="lede">রাষ্ট্রিক্স ২৪×৭ নিউজ কলকাতার একটি বাংলা খবরের চ্যানেল ও অ্যাপ। আমাদের কথা: <b>দেশ প্রথম । বলিদান পরম ধর্ম</b>।</p>
<h2>আমরা কী প্রকাশ করি</h2>
<ul>
  <li><b>রাষ্ট্রিক্সের খবর</b>: আমাদের নিজস্ব সাংবাদিক ও ডেস্কের লেখা, তাঁদের তোলা ছবি সহ।</li>
  <li><b>ওয়্যার খবর ও সংক্ষিপ্ত খবর</b>: একাধিক প্রকাশিত খবর মিলিয়ে, যাচাই করে, আমাদের নিজের ভাষায় লেখা রাষ্ট্রিক্স ওয়্যার ডেস্কের ছোট প্রতিবেদন। এগুলিতে কোনো ছবি থাকে না।</li>
  <li>ঘটনার <b>লাইভ কভারেজ</b>, আর বড় খবরে সঙ্গে সঙ্গে অ্যালার্ট।</li>
  <li>পাঁচটি ডেস্ক: <b>কলকাতা</b>, <b>পশ্চিমবঙ্গ</b>, <b>ভারত</b>, <b>প্রবাসী বাঙালি</b> আর <b>বিশ্ব</b> — বাংলা, ইংরেজি ও হিন্দিতে।</li>
</ul>
<h2>আমরা কীভাবে কাজ করি</h2>
<p>যে তথ্যের দায় নিতে পারি, শুধু সেটুকুই প্রকাশ করি, আর ভুল হলে খোলাখুলি সংশোধন করি। ওয়্যার খবর একটি এআই ভাষা-মডেলের সাহায্যে লেখা হয়, যতটা সম্ভব অন্তত দু’টি প্রকাশিত খবরের তথ্য মিলিয়ে; সম্পাদক যে কোনো খবর সঙ্গে সঙ্গে সরিয়ে নিতে বা সংশোধন করতে পারেন, আর প্রতিটি সংশোধনের হিসেব রাখা হয়। পড়ুন আমাদের <a href="/disclaimer">সম্পাদকীয় ঘোষণা</a>, <a href="/copyright">অন্য প্রকাশকের লেখা আমরা কীভাবে ব্যবহার করি</a> আর <a href="/corrections">সংশোধন নীতি</a>।</p>
<p>রাষ্ট্রিক্স স্বাধীন। কোনো সরকার বা রাজনৈতিক দলের সঙ্গে এর কোনো যোগ নেই।</p>
<h2>আমরা কারা</h2>
<p>${ORG_BN}। ${CREDITS_BN}। ইউটিউব আর ফেসবুকে আমাদের দেখুন, পড়ুন <a href="${SITE_URL}">rashtrix.live</a>-এ।</p>
<h2>যোগাযোগ</h2>
<p>সম্পাদকীয়, সংশোধন ও আইনি বিষয়ে: ${mailBn}। অভিযোগ ও কিছু সরানোর অনুরোধের জন্য দেখুন <a href="/grievance">অভিযোগ নিষ্পত্তি</a>।</p>` }
};

/* ---------- Legal documents ---------- */
export const LEGAL = {
  terms: {
    title: "Terms of Use",
    description: "The terms that apply when you use Rashtrix, its app, alerts, community and services.",
    html: `
<p>These Terms of Use govern your use of the Rashtrix website and app, its alerts, community and related services (the “Service”), provided by ${ORG} (“Rashtrix”, “we”, “us”). By using the Service you agree to these Terms, our <a href="/privacy">Privacy Policy</a>, <a href="/disclaimer">Disclaimer</a>, <a href="/copyright">Copyright and Content Policy</a> and <a href="/community-guidelines">Community Guidelines</a>. If you do not agree, do not use the Service.</p>
<h2>1. Accounts</h2>
<p>You may read Rashtrix without an account. To create an account or post in the community you must be at least 18. You are responsible for the information you give us, for keeping your password confidential and for activity under your account. You may delete your account at any time from <a href="/account">My account</a>.</p>
<h2>2. Using the Service</h2>
<p>You may read, listen to and share links to our content for personal, non-commercial use. You may not copy, republish, sell or systematically download our content, scrape the Service, interfere with its security or operation, or use it for anything unlawful.</p>
<h2>3. What you post</h2>
<p>You keep ownership of what you post, and give us a non-exclusive, royalty-free licence to host, display and moderate it on the Service. You must not post anything that is unlawful, defamatory, obscene, hateful, harmful to children, infringing, misleading, impersonating, or that threatens the unity, integrity, defence, security or sovereignty of India, public order or friendly relations with other states (IT Rules 2021, rule 3(1)(b)). We may remove content and suspend accounts that break these Terms.</p>
<h2>4. Our content</h2>
<p>The Rashtrix name, logo and our original content belong to Rashtrix 24×7 News. Wire reports and briefs are drafted with the help of an AI language model from published reports and checked by our process before and after publication; see the <a href="/disclaimer">Disclaimer</a>.</p>
<h2>5. Liability</h2>
<p>The Service is provided “as is”. To the extent the law allows, we are not liable for indirect or consequential loss arising from your use of the Service. Nothing in these Terms limits liability that cannot be limited under Indian law.</p>
<h2>6. Law and disputes</h2>
<p>These Terms are governed by the laws of India. Courts at Kolkata, West Bengal have jurisdiction, subject to any remedy available to you under consumer protection law. Complaints first go to our <a href="/grievance">Grievance Officer</a>.</p>
<h2>7. Changes</h2>
<p>We may update these Terms; the date at the top shows the latest version. Continued use after a change means you accept it.</p>`,
    bn: { title: "ব্যবহারের শর্তাবলি", html: `
<p>রাষ্ট্রিক্সের ওয়েবসাইট ও অ্যাপ, অ্যালার্ট, কমিউনিটি এবং সংশ্লিষ্ট পরিষেবা (“পরিষেবা”) ব্যবহারের ক্ষেত্রে এই শর্তাবলি প্রযোজ্য। পরিষেবা দিচ্ছে ${ORG_BN} (“রাষ্ট্রিক্স”, “আমরা”)। পরিষেবা ব্যবহার করলে আপনি এই শর্তাবলি, আমাদের <a href="/privacy">গোপনীয়তা নীতি</a>, <a href="/disclaimer">ঘোষণা</a>, <a href="/copyright">কপিরাইট ও কনটেন্ট নীতি</a> আর <a href="/community-guidelines">কমিউনিটির নিয়ম</a> মেনে নিচ্ছেন। রাজি না থাকলে পরিষেবা ব্যবহার করবেন না।</p>
<h2>১. অ্যাকাউন্ট</h2>
<p>অ্যাকাউন্ট ছাড়াই রাষ্ট্রিক্স পড়া যায়। অ্যাকাউন্ট খুলতে বা কমিউনিটিতে লিখতে আপনার বয়স অন্তত ১৮ হতে হবে। আপনার দেওয়া তথ্য, পাসওয়ার্ড গোপন রাখা আর অ্যাকাউন্টের সব কাজের দায় আপনার। <a href="/account">আমার অ্যাকাউন্ট</a> থেকে যে কোনো সময় অ্যাকাউন্ট মুছে ফেলতে পারেন।</p>
<h2>২. পরিষেবা ব্যবহার</h2>
<p>ব্যক্তিগত, অ-বাণিজ্যিক কাজে আমাদের লেখা পড়তে, শুনতে আর লিঙ্ক শেয়ার করতে পারেন। আমাদের লেখা কপি, পুনঃপ্রকাশ, বিক্রি বা একসঙ্গে ডাউনলোড করা, পরিষেবা স্ক্র্যাপ করা, এর নিরাপত্তায় হস্তক্ষেপ বা বেআইনি কাজে ব্যবহার করা চলবে না।</p>
<h2>৩. আপনি যা পোস্ট করেন</h2>
<p>আপনার পোস্টের মালিকানা আপনারই থাকে; পরিষেবায় সেটি রাখা, দেখানো ও মডারেট করার অ-একচেটিয়া, বিনামূল্যের অনুমতি আপনি আমাদের দিচ্ছেন। বেআইনি, মানহানিকর, অশ্লীল, ঘৃণা ছড়ানো, শিশুদের পক্ষে ক্ষতিকর, অন্যের অধিকার লঙ্ঘনকারী, বিভ্রান্তিকর বা ছদ্মবেশী কিছু, কিংবা ভারতের ঐক্য, অখণ্ডতা, প্রতিরক্ষা, নিরাপত্তা, সার্বভৌমত্ব, জনশৃঙ্খলা বা বন্ধু-রাষ্ট্রের সঙ্গে সম্পর্কের পক্ষে হুমকি এমন কিছু পোস্ট করা চলবে না (আইটি রুলস ২০২১, রুল ৩(১)(খ))। এই শর্ত ভাঙলে আমরা কনটেন্ট সরাতে ও অ্যাকাউন্ট স্থগিত করতে পারি।</p>
<h2>৪. আমাদের কনটেন্ট</h2>
<p>রাষ্ট্রিক্স নাম, লোগো আর আমাদের মৌলিক লেখা রাষ্ট্রিক্স ২৪×৭ নিউজের সম্পত্তি। ওয়্যার খবর ও সংক্ষিপ্ত খবর প্রকাশিত খবর থেকে একটি এআই ভাষা-মডেলের সাহায্যে লেখা, প্রকাশের আগে ও পরে আমাদের প্রক্রিয়ায় যাচাই করা; দেখুন <a href="/disclaimer">ঘোষণা</a>।</p>
<h2>৫. দায়</h2>
<p>পরিষেবা “যেমন আছে” সেই অবস্থায় দেওয়া হয়। আইন যতটা অনুমতি দেয়, পরিষেবা ব্যবহারের ফলে পরোক্ষ ক্ষতির দায় আমাদের নয়। ভারতীয় আইনে যে দায় সীমিত করা যায় না, এই শর্তাবলি তা সীমিত করে না।</p>
<h2>৬. আইন ও বিরোধ</h2>
<p>এই শর্তাবলি ভারতের আইন মেনে চলবে। ক্রেতা সুরক্ষা আইনে আপনার অধিকার অক্ষুণ্ণ রেখে, কলকাতার আদালতের এক্তিয়ার থাকবে। অভিযোগ প্রথমে আমাদের <a href="/grievance">অভিযোগ আধিকারিকের</a> কাছে জানান।</p>
<h2>৭. পরিবর্তন</h2>
<p>আমরা এই শর্তাবলি বদলাতে পারি; ওপরের তারিখ সর্বশেষ সংস্করণের। পরিবর্তনের পরেও পরিষেবা ব্যবহার করলে আপনি তা মেনে নিচ্ছেন।</p>` }
  },

  privacy: {
    title: "Privacy Notice",
    description: "What personal data Rashtrix collects, why, and your rights under the Digital Personal Data Protection Act, 2023.",
    html: `
<p>This notice is given under section 5 of the Digital Personal Data Protection Act, 2023 (the “DPDP Act”). The Data Fiduciary is ${ORG}.</p>
<h2>What we collect and why</h2>
<ul>
  <li><b>Account</b> (only if you create one): your name, email address and a scrambled form of your password, to run your account, sync saved stories and topics, and let you post in the community.</li>
  <li><b>What you post</b>: discussions and replies, to show them in the community.</li>
  <li><b>Alerts</b>: if you allow notifications, your browser’s push address, to send alerts. It is not linked to your name unless you are signed in.</li>
  <li><b>Contact form</b>: your name, email and message, to reply to you.</li>
  <li><b>Anonymous counts</b>: daily totals of visits, reading time, app installs and where visits come from. Your browser keeps only the dates of your first and last visit; we keep no cookies for tracking, no IP addresses and nothing that identifies you in these counts.</li>
</ul>
<p>We use one cookie, only when you sign in, to keep you signed in. We do not sell personal data or use it for advertising profiles.</p>
<h2>Consent</h2>
<p>We ask for your consent when you create an account, post, allow notifications or send the contact form. You can withdraw it at any time, as easily as you gave it: delete your account in <a href="/account">My account</a>, turn off alerts from the bell, or write to us. Withdrawal does not affect what was done before it.</p>
<h2>Your rights</h2>
<p>You may ask for a summary of your personal data and how it is used, its correction, completion, updating or erasure, and you may nominate another person to exercise your rights if you die or become unable to. Write to our Grievance Officer at ${mail}; we respond within the time the DPDP Rules set. If you are not satisfied, you may complain to the Data Protection Board of India.</p>
<h2>Where it is kept and for how long</h2>
<p>Data is stored with our hosting provider (Cloudflare) and kept only as long as needed: account data until you delete your account; push addresses until you turn alerts off or they stop working; contact messages for up to two years. Text-to-speech and AI writing services receive story text only, never readers’ personal data.</p>
<h2>Children</h2>
<p>Accounts are for people aged 18 and over. We do not knowingly process children’s personal data, or track or target advertising at children.</p>
<h2>Security and breaches</h2>
<p>We use encryption in transit, scrambled passwords and limited staff access. If a personal data breach occurs, we will inform the Data Protection Board and affected users as the law requires.</p>`,
    bn: { title: "গোপনীয়তা নোটিস", html: `
<p>ডিজিটাল পার্সোনাল ডেটা প্রোটেকশন আইন, ২০২৩ (“ডিপিডিপি আইন”)-এর ৫ নম্বর ধারা মেনে এই নোটিস দেওয়া হচ্ছে। ডেটা ফিডুশিয়ারি: ${ORG_BN}।</p>
<h2>আমরা কী সংগ্রহ করি, কেন করি</h2>
<ul>
  <li><b>অ্যাকাউন্ট</b> (শুধু আপনি খুললে): আপনার নাম, ইমেল আর পাসওয়ার্ডের এনক্রিপ্ট-করা রূপ — অ্যাকাউন্ট চালাতে, সেভ করা খবর ও বিষয় সব ডিভাইসে রাখতে, আর কমিউনিটিতে লেখার সুযোগ দিতে।</li>
  <li><b>আপনার পোস্ট</b>: কমিউনিটিতে দেখানোর জন্য আলোচনা ও উত্তর।</li>
  <li><b>অ্যালার্ট</b>: নোটিফিকেশনের অনুমতি দিলে আপনার ব্রাউজারের পুশ-ঠিকানা, অ্যালার্ট পাঠানোর জন্য। সাইন ইন না করলে এটি আপনার নামের সঙ্গে যুক্ত থাকে না।</li>
  <li><b>যোগাযোগ ফর্ম</b>: উত্তর দেওয়ার জন্য আপনার নাম, ইমেল আর বার্তা।</li>
  <li><b>বেনামি হিসেব</b>: প্রতিদিনের মোট ভিজিট, পড়ার সময়, অ্যাপ ইনস্টল আর কোথা থেকে পাঠকেরা আসছেন। আপনার ব্রাউজারে শুধু প্রথম ও শেষ ভিজিটের তারিখ থাকে; এই হিসেবের জন্য কোনো ট্র্যাকিং কুকি, আইপি ঠিকানা বা আপনাকে চেনা যায় এমন কিছু রাখি না।</li>
</ul>
<p>শুধু সাইন ইন করলে, আপনাকে সাইন ইন রাখতে একটিমাত্র কুকি ব্যবহার করি। ব্যক্তিগত তথ্য বিক্রি করি না, বিজ্ঞাপনের প্রোফাইল তৈরিতেও ব্যবহার করি না।</p>
<h2>সম্মতি</h2>
<p>অ্যাকাউন্ট খোলা, পোস্ট করা, নোটিফিকেশনের অনুমতি বা যোগাযোগ ফর্ম পাঠানোর সময় আপনার সম্মতি নিই। যত সহজে দিয়েছেন, তত সহজেই যে কোনো সময় তা প্রত্যাহার করতে পারেন: <a href="/account">আমার অ্যাকাউন্ট</a> থেকে অ্যাকাউন্ট মুছে, ঘণ্টা-চিহ্ন থেকে অ্যালার্ট বন্ধ করে, কিংবা আমাদের লিখে। প্রত্যাহারের আগে যা হয়েছে, তাতে প্রভাব পড়ে না।</p>
<h2>আপনার অধিকার</h2>
<p>আপনার ব্যক্তিগত তথ্যের সারাংশ ও তার ব্যবহারের বিবরণ চাইতে, তা সংশোধন, সম্পূর্ণ, হালনাগাদ বা মুছে ফেলতে বলতে পারেন; আপনার মৃত্যু বা অক্ষমতায় আপনার হয়ে অধিকার প্রয়োগের জন্য কাউকে মনোনীত করতে পারেন। লিখুন আমাদের অভিযোগ আধিকারিককে, ${mailBn}-এ; ডিপিডিপি রুলসের নির্ধারিত সময়ের মধ্যে উত্তর দেব। সন্তুষ্ট না হলে ডেটা প্রোটেকশন বোর্ড অফ ইন্ডিয়ার কাছে অভিযোগ জানাতে পারেন।</p>
<h2>কোথায়, কতদিন রাখা হয়</h2>
<p>তথ্য রাখা হয় আমাদের হোস্টিং সংস্থা ক্লাউডফ্লেয়ারের কাছে, যতদিন দরকার ততদিন: অ্যাকাউন্ট মোছা পর্যন্ত অ্যাকাউন্টের তথ্য; অ্যালার্ট বন্ধ না করা বা অকেজো না হওয়া পর্যন্ত পুশ-ঠিকানা; যোগাযোগের বার্তা সর্বোচ্চ দু’বছর। টেক্সট-টু-স্পিচ আর এআই লেখার পরিষেবা শুধু খবরের লেখা পায়, পাঠকের ব্যক্তিগত তথ্য কখনও নয়।</p>
<h2>শিশু</h2>
<p>অ্যাকাউন্ট শুধু ১৮ বছর বা তার বেশি বয়সিদের জন্য। জেনেশুনে শিশুদের ব্যক্তিগত তথ্য প্রক্রিয়া করি না, শিশুদের ট্র্যাক করি না বা তাদের লক্ষ্য করে বিজ্ঞাপন দিই না।</p>
<h2>নিরাপত্তা</h2>
<p>তথ্য আদানপ্রদানে এনক্রিপশন, এনক্রিপ্ট-করা পাসওয়ার্ড আর সীমিত কর্মী-প্রবেশাধিকার ব্যবহার করি। কোনো তথ্য-ফাঁস ঘটলে আইন অনুযায়ী ডেটা প্রোটেকশন বোর্ড ও সংশ্লিষ্ট ব্যবহারকারীদের জানাব।</p>` }
  },

  disclaimer: {
    title: "Disclaimer",
    description: "How Rashtrix reports, how wire reports are written with AI assistance, and the limits of what we publish.",
    html: `
<h2>Our reporting</h2>
<p>Rashtrix reports are written and edited by our journalists. We take care to be accurate, fair and up to date, but news develops; check the time on each story.</p>
<h2>Wire reports and briefs</h2>
<p>Stories marked <b>Rashtrix Wire</b> or <b>Brief</b> are written by our wire desk with the help of an AI language model (Google Gemini) from facts in reports already published by other news organisations, using two or more independent reports wherever possible. The model is instructed to use only those facts and to write in its own words; the result is checked automatically for copied phrasing. Editors can pull or correct any wire report at once, and every correction is recorded. These stories carry no photographs. If you find an error, tell us: see our <a href="/corrections">corrections policy</a>.</p>
<h2>Translations and listening</h2>
<p>Stories are offered in Bengali, English and Hindi. Some versions are produced by machine translation and are marked as such; the original language version prevails. “Listen” uses computer-generated voices.</p>
<h2>Opinion and external links</h2>
<p>Opinions of contributors and community members are their own. Links to other websites are for convenience; we are not responsible for their content.</p>`,
    bn: { title: "ঘোষণা", html: `
<h2>আমাদের খবর</h2>
<p>রাষ্ট্রিক্সের খবর লেখেন ও সম্পাদনা করেন আমাদের সাংবাদিকেরা। নির্ভুল, নিরপেক্ষ ও হালনাগাদ থাকার চেষ্টা করি, তবে খবর বদলায়; প্রতিটি খবরের সময় দেখে নিন।</p>
<h2>ওয়্যার খবর ও সংক্ষিপ্ত খবর</h2>
<p><b>রাষ্ট্রিক্স ওয়্যার</b> বা <b>সংক্ষেপে</b> চিহ্নিত খবর আমাদের ওয়্যার ডেস্ক লেখে একটি এআই ভাষা-মডেলের (গুগল জেমিনাই) সাহায্যে, অন্য সংবাদ সংস্থার আগেই প্রকাশিত খবরের তথ্য থেকে — যতটা সম্ভব দুই বা ততোধিক স্বাধীন সূত্র মিলিয়ে। মডেলকে শুধু সেই তথ্য ব্যবহার করতে এবং নিজের ভাষায় লিখতে নির্দেশ দেওয়া থাকে; লেখায় কোনো বাক্যাংশ হুবহু তোলা হয়েছে কি না, স্বয়ংক্রিয়ভাবে পরীক্ষা হয়। সম্পাদক যে কোনো ওয়্যার খবর সঙ্গে সঙ্গে সরাতে বা সংশোধন করতে পারেন, প্রতিটি সংশোধনের হিসেব রাখা হয়। এই খবরে কোনো ছবি থাকে না। ভুল চোখে পড়লে জানান: দেখুন আমাদের <a href="/corrections">সংশোধন নীতি</a>।</p>
<h2>অনুবাদ ও শোনা</h2>
<p>খবর বাংলা, ইংরেজি ও হিন্দিতে পাওয়া যায়। কিছু সংস্করণ যন্ত্রে অনুবাদ করা, সেগুলি চিহ্নিত থাকে; মূল ভাষার সংস্করণই চূড়ান্ত। “শুনুন” কম্পিউটারে তৈরি কণ্ঠ ব্যবহার করে।</p>
<h2>মতামত ও বাইরের লিঙ্ক</h2>
<p>লেখক ও কমিউনিটি সদস্যদের মতামত তাঁদের নিজস্ব। অন্য ওয়েবসাইটের লিঙ্ক সুবিধার জন্য; সেগুলির বিষয়বস্তুর দায় আমাদের নয়।</p>` }
  },

  copyright: {
    title: "Copyright and Content Policy",
    description: "How Rashtrix uses facts reported by other publishers, and how to send a copyright notice.",
    html: `
<h2>Facts, not words</h2>
<p>Facts are not owned by anyone; the way a publisher expresses them is. Our wire desk reads reports that other news organisations have already published, takes only the facts from them, checks them against each other, and writes a new report in our own words. We do not copy their text, headlines or photographs, and we do not reproduce or excerpt their stories. Source reports are read by our system only to extract facts and are not shown to readers. Publishers who do not want their reports used this way can tell us and will be added to our blocklist.</p>
<h2>Our content</h2>
<p>Text, photographs, video and graphics made by Rashtrix belong to Rashtrix 24×7 News. You may share links; republishing needs our written permission.</p>
<h2>Copyright notices</h2>
<p>If you believe something on Rashtrix infringes your copyright, send our Grievance Officer (${mail}) the work you own, the link to the material, a statement that its use is not authorised, and your contact details and signature. We act on complete notices under section 52(1)(c) of the Copyright Act, 1957 and rule 75 of the Copyright Rules, 2013, within 36 hours.</p>`,
    bn: { title: "কপিরাইট ও কনটেন্ট নীতি", html: `
<h2>তথ্য, শব্দ নয়</h2>
<p>তথ্যের মালিক কেউ নন; কিন্তু একজন প্রকাশক তা যেভাবে লেখেন, সেই প্রকাশভঙ্গি তাঁর। আমাদের ওয়্যার ডেস্ক অন্য সংবাদ সংস্থার আগেই প্রকাশিত খবর পড়ে, সেখান থেকে শুধু তথ্য নেয়, একে অপরের সঙ্গে মিলিয়ে দেখে, তারপর নিজের ভাষায় নতুন খবর লেখে। তাদের লেখা, শিরোনাম বা ছবি আমরা কপি করি না, তাদের খবর পুনঃপ্রকাশ বা উদ্ধৃত করি না। সূত্রের খবর আমাদের ব্যবস্থা শুধু তথ্য বের করতে পড়ে, পাঠককে দেখানো হয় না। কোনো প্রকাশক না চাইলে আমাদের জানান, তাঁর খবর আমাদের ব্লক-তালিকায় যোগ করা হবে।</p>
<h2>আমাদের কনটেন্ট</h2>
<p>রাষ্ট্রিক্সের তৈরি লেখা, ছবি, ভিডিও ও গ্রাফিক্সের মালিক রাষ্ট্রিক্স ২৪×৭ নিউজ। লিঙ্ক শেয়ার করতে পারেন; পুনঃপ্রকাশের জন্য আমাদের লিখিত অনুমতি লাগবে।</p>
<h2>কপিরাইট নোটিস</h2>
<p>রাষ্ট্রিক্সে কিছু আপনার কপিরাইট লঙ্ঘন করছে মনে হলে আমাদের অভিযোগ আধিকারিককে (${mailBn}) পাঠান: আপনার মালিকানাধীন কাজের বিবরণ, সংশ্লিষ্ট লিঙ্ক, ব্যবহারটি অনুমোদিত নয় এই মর্মে বিবৃতি, আর আপনার যোগাযোগের বিবরণ ও স্বাক্ষর। কপিরাইট আইন, ১৯৫৭-র ৫২(১)(গ) ধারা ও কপিরাইট রুলস, ২০১৩-র ৭৫ নম্বর রুল অনুযায়ী সম্পূর্ণ নোটিস পেলে ৩৬ ঘণ্টার মধ্যে ব্যবস্থা নিই।</p>` }
  },

  corrections: {
    title: "Corrections Policy",
    description: "How Rashtrix corrects mistakes and pulls stories, and how to report an error.",
    html: `
<p>When we get something wrong, we fix it quickly and say so.</p>
<ul>
  <li><b>Corrections</b>: a corrected story shows a note at the top saying what was corrected and when.</li>
  <li><b>Pulled stories</b>: a story that cannot be fixed by a correction (for example, one built on a false report) is taken down at once.</li>
  <li><b>Records</b>: every correction and every pulled story is recorded with the text as it was before, the time and the editor responsible.</li>
</ul>
<p>To report an error, write to ${mail} with the link and what is wrong. We respond as soon as possible and within the time limits on our <a href="/grievance">Grievance Redressal</a> page.</p>`,
    bn: { title: "সংশোধন নীতি", html: `
<p>ভুল হলে আমরা দ্রুত সংশোধন করি, এবং তা জানাই।</p>
<ul>
  <li><b>সংশোধন</b>: সংশোধিত খবরের ওপরে লেখা থাকে কী বদলানো হয়েছে, কখন।</li>
  <li><b>সরিয়ে নেওয়া খবর</b>: সংশোধন করে যে খবর ঠিক করা যায় না (যেমন ভুয়ো তথ্যের ওপর দাঁড়ানো খবর), তা সঙ্গে সঙ্গে সরিয়ে নেওয়া হয়।</li>
  <li><b>নথি</b>: প্রতিটি সংশোধন আর সরিয়ে নেওয়া খবরের আগের লেখা, সময় আর দায়িত্বপ্রাপ্ত সম্পাদকের নাম রেখে দেওয়া হয়।</li>
</ul>
<p>ভুল জানাতে লিঙ্ক আর কী ভুল তা লিখে পাঠান ${mailBn}-এ। যত দ্রুত সম্ভব, এবং <a href="/grievance">অভিযোগ নিষ্পত্তি</a> পাতায় দেওয়া সময়সীমার মধ্যে উত্তর দিই।</p>` }
  },

  "community-guidelines": {
    title: "Community Guidelines",
    description: "How to take part in Rashtrix community discussions.",
    html: `
<p>Discuss the news, not the person. Be civil, stay on topic and back claims with sources.</p>
<ul>
  <li>No abuse, threats, hate speech, or attacks on anyone’s religion, caste, gender, language or community.</li>
  <li>No misinformation, unverified rumours presented as fact, or doctored images.</li>
  <li>No personal information about others, no impersonation, no spam or advertising.</li>
  <li>Nothing unlawful, including content prohibited by rule 3(1)(b) of the IT Rules, 2021.</li>
</ul>
<p>Moderators may hide or remove posts and suspend accounts. To report a post or appeal a decision, contact our <a href="/grievance">Grievance Officer</a>.</p>`,
    bn: { title: "কমিউনিটির নিয়ম", html: `
<p>খবর নিয়ে আলোচনা করুন, মানুষকে নিয়ে নয়। ভদ্র থাকুন, বিষয়ে থাকুন, দাবির পক্ষে সূত্র দিন।</p>
<ul>
  <li>গালিগালাজ, হুমকি, ঘৃণাভাষণ বা কারও ধর্ম, জাত, লিঙ্গ, ভাষা বা সম্প্রদায় নিয়ে আক্রমণ চলবে না।</li>
  <li>ভুল তথ্য, যাচাই না-করা গুজবকে সত্য বলে চালানো বা বিকৃত ছবি চলবে না।</li>
  <li>অন্যের ব্যক্তিগত তথ্য, ছদ্মবেশ, স্প্যাম বা বিজ্ঞাপন চলবে না।</li>
  <li>বেআইনি কিছু চলবে না, আইটি রুলস ২০২১-এর রুল ৩(১)(খ)-তে নিষিদ্ধ বিষয় সহ।</li>
</ul>
<p>মডারেটররা পোস্ট লুকোতে বা সরাতে এবং অ্যাকাউন্ট স্থগিত করতে পারেন। কোনো পোস্ট নিয়ে অভিযোগ বা সিদ্ধান্তের বিরুদ্ধে আবেদন জানাতে যোগাযোগ করুন আমাদের <a href="/grievance">অভিযোগ আধিকারিকের</a> সঙ্গে।</p>` }
  },

  grievance: {
    title: "Grievance Redressal",
    description: "How to complain to Rashtrix's Grievance Officer under the IT Rules, 2021, and the time limits we follow.",
    html: `
<p>Under the Information Technology Act, 2000, the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, the Copyright Act, 1957 and the Digital Personal Data Protection Act, 2023, ${ORG} has appointed a Grievance Officer.</p>
${officer()}
<h2>What you can raise</h2>
<ul>
  <li>Content you believe is unlawful, infringing, defamatory, or in breach of our <a href="/terms">Terms</a> or the Code of Ethics for digital news publishers;</li>
  <li>errors in our reporting (see the <a href="/corrections">corrections policy</a>);</li>
  <li>copyright complaints (see the <a href="/copyright">Copyright and Content Policy</a>);</li>
  <li>your personal data and privacy rights (see the <a href="/privacy">Privacy Notice</a>);</li>
  <li>decisions about your account or posts.</li>
</ul>
<h2>How to complain</h2>
<p>Write to the Grievance Officer with your name and contact details, the link(s) concerned, what the problem is and what you would like us to do, with any evidence.</p>
<h2>Time limits</h2>
<p>We acknowledge complaints within 24 hours and decide them within 15 days. Complaints about content that exposes a person’s private area, shows them in full or partial nudity or sexual acts, or impersonates them, are acted on within 24 hours. Complete copyright notices are acted on within 36 hours. We comply with orders of courts and competent authorities.</p>
<h2>If you are not satisfied</h2>
<p>You may escalate to the self-regulating body of which we are a member, when we join one, and to the oversight mechanism of the Ministry of Information and Broadcasting under Part III of the IT Rules; for personal data, to the Data Protection Board of India; or pursue any other remedy available under law.</p>`,
    bn: { title: "অভিযোগ নিষ্পত্তি", html: `
<p>তথ্যপ্রযুক্তি আইন, ২০০০; তথ্যপ্রযুক্তি (ইন্টারমিডিয়ারি গাইডলাইনস ও ডিজিটাল মিডিয়া এথিক্স কোড) রুলস, ২০২১; কপিরাইট আইন, ১৯৫৭; এবং ডিজিটাল পার্সোনাল ডেটা প্রোটেকশন আইন, ২০২৩ অনুযায়ী ${ORG_BN} একজন অভিযোগ আধিকারিক নিয়োগ করেছে।</p>
${officer(true)}
<h2>কী নিয়ে অভিযোগ জানাতে পারেন</h2>
<ul>
  <li>বেআইনি, অন্যের অধিকার লঙ্ঘনকারী, মানহানিকর, কিংবা আমাদের <a href="/terms">শর্তাবলি</a> বা ডিজিটাল সংবাদ প্রকাশকদের নৈতিক বিধি ভঙ্গ করছে বলে মনে হওয়া বিষয়;</li>
  <li>আমাদের খবরে ভুল (দেখুন <a href="/corrections">সংশোধন নীতি</a>);</li>
  <li>কপিরাইট সংক্রান্ত অভিযোগ (দেখুন <a href="/copyright">কপিরাইট ও কনটেন্ট নীতি</a>);</li>
  <li>আপনার ব্যক্তিগত তথ্য ও গোপনীয়তার অধিকার (দেখুন <a href="/privacy">গোপনীয়তা নোটিস</a>);</li>
  <li>আপনার অ্যাকাউন্ট বা পোস্ট নিয়ে আমাদের সিদ্ধান্ত।</li>
</ul>
<h2>কীভাবে জানাবেন</h2>
<p>অভিযোগ আধিকারিককে লিখুন: আপনার নাম ও যোগাযোগের বিবরণ, সংশ্লিষ্ট লিঙ্ক, সমস্যাটা কী আর আপনি কী চান, প্রমাণ সহ।</p>
<h2>সময়সীমা</h2>
<p>২৪ ঘণ্টার মধ্যে অভিযোগ পাওয়ার কথা জানাই এবং ১৫ দিনের মধ্যে নিষ্পত্তি করি। কারও গোপন অঙ্গ প্রকাশ, পূর্ণ বা আংশিক নগ্নতা বা যৌন ক্রিয়া দেখানো, কিংবা ছদ্মবেশ ধারণ সংক্রান্ত অভিযোগে ২৪ ঘণ্টার মধ্যে ব্যবস্থা নিই। সম্পূর্ণ কপিরাইট নোটিসে ৩৬ ঘণ্টার মধ্যে ব্যবস্থা নিই। আদালত ও উপযুক্ত কর্তৃপক্ষের নির্দেশ মেনে চলি।</p>
<h2>সন্তুষ্ট না হলে</h2>
<p>আমরা যে স্ব-নিয়ন্ত্রক সংস্থার সদস্য হব, তার কাছে এবং আইটি রুলসের তৃতীয় অংশে তথ্য ও সম্প্রচার মন্ত্রকের তদারকি ব্যবস্থার কাছে যেতে পারেন; ব্যক্তিগত তথ্যের ক্ষেত্রে ডেটা প্রোটেকশন বোর্ড অফ ইন্ডিয়ার কাছে; কিংবা আইনে উপলব্ধ অন্য যে কোনো প্রতিকার নিতে পারেন।</p>` }
  }
};

export const LEGAL_ORDER = [["terms", "Terms of Use"], ["privacy", "Privacy Notice"], ["disclaimer", "Disclaimer"], ["copyright", "Copyright & Content"], ["corrections", "Corrections Policy"], ["community-guidelines", "Community Guidelines"], ["grievance", "Grievance Redressal"]];
