// Raisina Wire's About page and legal documents. One source for the app views and the
// server-rendered pages. Plain HTML strings; edit the text here.
// These documents were drafted with care but are not a substitute for advice from an
// Indian lawyer, who should review them before relying on them.

export const LEGAL_UPDATED = "24 October 2026";
export const CONTACT_EMAIL = "ilmazsyed@gmail.com";
export const SITE_URL = "https://raisinawire.calibrex.org";
const mail = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;

/* ---------- About ---------- */
export const ABOUT = {
  title: "About Raisina Wire",
  description: "Raisina Wire is an independent Indian publication on geopolitics, national security, diplomacy and markets, founded and edited by Ilmaz Syed and built on technology from Calibrex.",
  html: `
<p class="lede">Raisina Wire is an independent Indian publication on geopolitics, national security, diplomacy and markets: an Indian perspective on a changing world.</p>

<h2>What we publish</h2>
<ul>
  <li><b>Raisina Wire editions and analysis</b>: original, open-source analysis of India’s strategic questions, first published as the Raisina Wire newsletter on LinkedIn.</li>
  <li><b>The live wire</b>: headlines from named publishers, newest first, with short credited excerpts and a link to every original story.</li>
  <li><b>Live coverage</b> of developing events, posted by our desk with sources.</li>
  <li><b>The market board</b>: delayed quotes for Indian and global markets, for information only.</li>
  <li><b>The community</b>: moderated discussions, briefings and members’ events.</li>
</ul>

<h2>How we work</h2>
<p>We work from public, verifiable information and say where it comes from. We separate fact from analysis, label opinion as opinion, and correct mistakes openly. Other publishers’ stories are always credited and linked; we show only short excerpts so that readers go to the publisher for the full story. Read our <a href="/disclaimer">editorial disclaimer</a> and <a href="/copyright">how we use other publishers’ work</a>.</p>
<p>Raisina Wire is independent. It is not affiliated with, endorsed by or speaking for the Government of India or any of its offices. The line drawing of Raisina Hill in our masthead is architectural artwork; we do not use the State Emblem of India or any official emblem.</p>

<h2 id="founder">Founder and editor: Ilmaz Syed</h2>
<figure class="founder-card"><img src="/editions/ilmaz-syed-portrait.jpg" alt="Portrait of Ilmaz Syed" width="160" height="160" loading="lazy"><figcaption><b>Ilmaz Syed</b><span>Founder and Editor, Raisina Wire · Founder, Calibrex</span><span>OSINT expert · Defence investigative journalist · Geopolitical analyst</span></figcaption></figure>
<p>Ilmaz Syed founded Raisina Wire and edits it. He is an OSINT expert, a defence investigative journalist and a geopolitical analyst, and a senior editor and primetime anchor whose on-ground reporting has covered the India–China LAC standoffs, the Manipur–Myanmar border, the Nagaland insurgency and counter-terror operations in Kashmir. He is a certified OSINT journalist (Basel Institute on Governance, Switzerland).</p>
<p>He has led newsrooms and on-air programming as Executive Editor of Calcutta News at Calcutta Television Network, at NKTV Media Group and as a senior producer and anchor at News18 Bangla, and earlier worked with Star, ETV News Bangla, NewsX, News Time and The Statesman. He is the founder of Calibrex, the founder and editor-in-chief of Rashtrix, and a partner and deputy managing director at Middleton Media Works. As an Army Wing cadet of the National Cadet Corps he earned the NCC ‘C’ Certificate and was declared Best Army Cadet of the West Bengal and Sikkim Directorate. He studied journalism at St. Xavier’s College, Kolkata, and works in English, Hindi and Bengali.</p>
<p><a href="https://www.linkedin.com/in/ilmaz-syed" target="_blank" rel="noopener">Ilmaz Syed on LinkedIn ↗</a> · <a href="/author/ilmaz-syed">His Raisina Wire stories</a></p>

<h2 id="calibrex">Powered by Calibrex</h2>
<a class="cx-card" href="https://calibrex.org/?utm_source=raisinawire&utm_medium=referral&utm_campaign=about" target="_blank" rel="noopener"><img src="/partners/calibrex-mark.svg" alt="" width="52" height="52"><span><span class="cx-word">CALIBRE<span>X</span></span><small>Information is everywhere. Clarity isn’t. · calibrex.org ↗</small></span></a>
<p>Raisina Wire runs on technology from <a href="https://calibrex.org/?utm_source=raisinawire&utm_medium=referral&utm_campaign=about" target="_blank" rel="noopener">Calibrex</a>, the intelligence, operations and capability company founded by Ilmaz Syed. Calibrex builds <b>OSINT Studio</b>, an open-source intelligence workspace for source-backed research; <b>NRCS</b>, a newsroom management system; the <b>Calibrex Academy</b>, assessed OSINT training with verifiable certificates; and <b>Calibrex Atlas</b>, global situational awareness with the evidence behind every point. Calibrex provides the platform; editorial decisions at Raisina Wire are made by its editors.</p>

<h2>Contact</h2>
<p>Editorial, corrections, partnerships and legal matters: ${mail}. For complaints and takedown requests, see <a href="/grievance">Grievance redressal</a>.</p>`
};

/* ---------- Legal documents ---------- */
const parties = `“Raisina Wire”, “we”, “us” and “our” mean the Raisina Wire publication and its founder, editor and publisher, Ilmaz Syed. “Calibrex” means Calibrex, which provides the technology on which Raisina Wire runs. “Raisina Wire Parties” means Raisina Wire, Ilmaz Syed, Calibrex, and their respective affiliates, officers, employees, editors, contributors, agents, licensors and service providers.`;

export const LEGAL = {
  terms: {
    title: "Terms of Use",
    description: "The terms that apply when you use Raisina Wire, its app, alerts, community and services.",
    html: `
<p>These Terms of Use (“Terms”) govern your access to and use of the Raisina Wire website at ${SITE_URL}, its installable app, alerts, community, events and related services (together, the “Service”). By using the Service you agree to these Terms, our <a href="/privacy">Privacy Policy</a>, our <a href="/disclaimer">Disclaimer</a>, our <a href="/copyright">Copyright and Content Policy</a> and our <a href="/community-guidelines">Community Guidelines</a>, which form part of these Terms. If you do not agree, do not use the Service.</p>

<h2>1. Who we are</h2>
<p>${parties} Calibrex provides technology and hosting services only; it does not create, select, edit or approve editorial content published on Raisina Wire, and nothing on the Service is a statement by Calibrex unless expressly attributed to it.</p>

<h2>2. Eligibility and accounts</h2>
<p>You may read Raisina Wire without an account. To create an account, join discussions or use member features you must be at least 18 years old and able to enter into a binding contract under Indian law. You are responsible for the accuracy of the information you give us, for keeping your password confidential and for all activity under your account. Tell us at once at ${mail} if you suspect unauthorised use. You may delete your account at any time from <a href="/account">My account</a>.</p>

<h2>3. What the Service provides</h2>
<ul>
  <li><b>Original journalism</b>: editions, articles and analysis written by Raisina Wire’s writers (“Raisina Wire Content”).</li>
  <li><b>The live wire</b>: headlines, publisher-provided summaries, short excerpts and links to stories published by third parties (“Third-Party Content”), obtained from public feeds and pages those publishers make available.</li>
  <li><b>Market information</b>: delayed or last-available quotes and charts from third-party sources.</li>
  <li><b>Community features</b>: discussions, replies and events, including content posted by users (“User Content”).</li>
  <li><b>Alerts</b>: in-site alerts for every reader and, with your device’s permission, push notifications.</li>
  <li><b>Listen</b>: stories read aloud by a computer-generated (synthetic) voice.</li>
</ul>
<p>We may change, suspend or discontinue any part of the Service at any time, with or without notice.</p>

<h2>4. Third-Party Content</h2>
<p>Third-Party Content belongs to its publishers and other rights holders. Raisina Wire does not claim ownership of it and does not adopt, endorse or verify it. We show only headlines, publisher-provided summaries and short, credited excerpts with a link to the original, as described in our <a href="/copyright">Copyright and Content Policy</a>. The accuracy, legality and availability of Third-Party Content are the responsibility of its publisher. Links take you to websites we do not control; your use of them is governed by their own terms and policies.</p>

<h2>5. Raisina Wire Content and your licence</h2>
<p>Raisina Wire Content, the design of the Service, the Raisina Wire name, logo and masthead, and the software are owned by or licensed to the Raisina Wire Parties and are protected by Indian and international copyright, trademark and other laws. Subject to these Terms, we grant you a limited, personal, non-exclusive, non-transferable, revocable licence to read and use the Service for your own non-commercial purposes. You may share links to our stories and quote short passages with clear attribution to Raisina Wire and a link to the source.</p>
<p>Without our written permission you may not: reproduce, republish, sell, license or distribute Raisina Wire Content in whole or substantial part; frame or mirror the Service; scrape, crawl, harvest or systematically download content or data from the Service other than through our public RSS feed for personal reading; or use any content from the Service to train, fine-tune, test or improve any artificial intelligence or machine-learning system.</p>

<h2>6. Trademarks</h2>
<p>“Raisina Wire”, its logo and masthead are trademarks of Raisina Wire. “Calibrex”, “OSINT Studio” and related marks belong to Calibrex. Names of publishers and other third parties appear only to identify and credit their content; they remain the property of their owners and their use does not imply any affiliation or endorsement.</p>

<h2>7. User Content</h2>
<p>You keep ownership of what you post. By posting User Content you grant the Raisina Wire Parties a worldwide, non-exclusive, royalty-free, transferable and sub-licensable licence to host, store, reproduce, display, distribute, adapt (for example for formatting or length), moderate and remove it in connection with the Service and its promotion, for as long as it remains on the Service and for a reasonable period afterwards for backup, legal and record-keeping purposes. You confirm that you own or have permission to post your User Content and that it complies with these Terms and our <a href="/community-guidelines">Community Guidelines</a>.</p>
<p>User Content is the sole responsibility of the person who posted it. It does not represent the views of the Raisina Wire Parties. In respect of User Content we act as an intermediary within the meaning of the Information Technology Act, 2000; we do not initiate the transmission, select the receiver, or select or modify the information contained in it, and we observe the due-diligence requirements of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021. We may review, refuse, hide, edit for length or remove any User Content and suspend or terminate accounts at our discretion, including on receipt of a complaint or a lawful order, but we are not obliged to monitor User Content.</p>

<h2>8. What you must not do</h2>
<p>You must not use the Service to host, display, upload, publish, transmit or share anything that:</p>
<ul>
  <li>belongs to someone else and that you have no right to share, or infringes any copyright, trademark, patent or other proprietary right;</li>
  <li>is defamatory, obscene, pornographic, paedophilic, invasive of another’s privacy (including bodily privacy), insulting or harassing on the basis of gender, racially or ethnically objectionable, or promotes enmity between groups, violence or any offence under the Bharatiya Nyaya Sanhita, 2023 or other law;</li>
  <li>is harmful to children;</li>
  <li>deceives or misleads about the origin of a message, or knowingly communicates misinformation, or information that is patently false or untrue, or impersonates another person or organisation;</li>
  <li>threatens the unity, integrity, defence, security or sovereignty of India, friendly relations with foreign states or public order, incites any cognisable offence, or prevents the investigation of any offence;</li>
  <li>contains software viruses or any code designed to interrupt, destroy or limit the functionality of any computer resource;</li>
  <li>violates any law in force.</li>
</ul>
<p>You must also not: attempt to gain unauthorised access to the Service, other accounts or our systems; interfere with or overload the Service; use bots or automated means to access it except our public feeds; circumvent any technical measure; or use the Service for unsolicited advertising.</p>

<h2>9. Market information is not advice</h2>
<p>Market data on the Service is delayed or last available, comes from third-party sources, may be incomplete or wrong, and is provided for general information only. Nothing on the Service is investment, financial, tax, legal or other professional advice, or a recommendation or offer to buy or sell any security or instrument. Raisina Wire is not registered with the Securities and Exchange Board of India as an investment adviser or research analyst. Consult a qualified adviser before making decisions. You are solely responsible for decisions you take.</p>

<h2>10. Alerts and notifications</h2>
<p>Alerts appear inside the Service for every reader. Push notifications are sent to a device only after you allow them in your browser or device; you can switch them off at any time from the bell in the Service or in your device settings. Alerts are a convenience: they may be delayed or not delivered, and they are not a substitute for official warnings or advisories.</p>

<h2>11. Listen (synthetic voice)</h2>
<p>Listen uses computer-generated speech produced by third-party text-to-speech technology, which may mispronounce words or misread text. The written text is the authoritative version. The voice is synthetic and is not the voice of any real person.</p>

<h2>12. Events</h2>
<p>Events and briefings are subject to change or cancellation. Statements made by speakers or participants are their own.</p>

<h2>13. Disclaimer of warranties</h2>
<p>To the fullest extent permitted by law, the Service and all content are provided “as is” and “as available”, without warranties of any kind, express or implied, including warranties of accuracy, completeness, timeliness, merchantability, fitness for a particular purpose, non-infringement and uninterrupted or error-free operation. See also our <a href="/disclaimer">Disclaimer</a>.</p>

<h2>14. Limitation of liability</h2>
<p>To the fullest extent permitted by law, the Raisina Wire Parties shall not be liable for any indirect, incidental, special, consequential, exemplary or punitive damages, or for any loss of profits, revenue, data, goodwill or opportunity, arising out of or in connection with the Service, any content (including Third-Party Content and User Content), any market information, any alert or any reliance on any of them, however caused and whether in contract, tort (including negligence) or otherwise, even if advised of the possibility. The total aggregate liability of the Raisina Wire Parties for all claims relating to the Service shall not exceed the greater of the amount you paid us for the Service in the twelve months before the claim and one thousand Indian rupees (₹1,000). Nothing in these Terms limits liability that cannot be limited under applicable law.</p>

<h2>15. Indemnity</h2>
<p>You agree to indemnify and hold harmless the Raisina Wire Parties from and against all claims, demands, losses, liabilities, damages, costs and expenses (including reasonable legal fees) arising out of or related to your User Content, your use of the Service, your breach of these Terms or your violation of any law or the rights of any third party.</p>

<h2>16. Suspension and termination</h2>
<p>We may suspend or end your access to the Service, remove your User Content or delete your account at any time if we reasonably believe you have breached these Terms or the law, or to protect the Service, other users or the Raisina Wire Parties. Sections 4 to 7 and 13 to 20 survive termination.</p>

<h2>17. Changes to these Terms</h2>
<p>We may update these Terms. The date at the top shows the latest version. Material changes will be highlighted on the Service. Continuing to use the Service after changes take effect means you accept them.</p>

<h2>18. Governing law and jurisdiction</h2>
<p>These Terms and any dispute arising out of or in connection with them or the Service are governed by the laws of India. Subject to the grievance process below, the courts at New Delhi, India shall have exclusive jurisdiction.</p>

<h2>19. Grievances</h2>
<p>Complaints about content, accounts or these Terms can be made to our Grievance Officer as set out in <a href="/grievance">Grievance redressal</a>.</p>

<h2>20. General</h2>
<p>If any provision of these Terms is held invalid or unenforceable, the rest remain in force. Our failure to enforce a provision is not a waiver. You may not assign these Terms; we may assign them in connection with a reorganisation or transfer of the Service. We are not liable for failure or delay caused by events beyond our reasonable control. These Terms, with the documents they refer to, are the entire agreement between you and us about the Service.</p>
<p>Contact: ${mail}.</p>`
  },

  disclaimer: {
    title: "Disclaimer",
    description: "Editorial, accuracy, third-party content, market data, no-affiliation and other disclaimers for Raisina Wire.",
    html: `
<p>${parties}</p>

<h2>Independence and no affiliation</h2>
<p>Raisina Wire is an independent publication. It is not affiliated with, endorsed by, sponsored by or speaking for the Government of India, the President’s Secretariat, any ministry, the armed forces, any intelligence or security agency, any political party, or any foreign government. “Raisina” refers to Raisina Hill as a place and a common shorthand in Indian public life. The line drawing of Raisina Hill used in our masthead and logo is original architectural artwork; we do not use the State Emblem of India, the national flag in any official form, or any official seal or emblem.</p>

<h2>Opinion and analysis</h2>
<p>Editions and articles contain analysis and opinion, which are those of their authors on the date of publication and not necessarily the views of Raisina Wire, Calibrex or any other person or organisation. Analysis may involve assessments of uncertain and developing events and may later prove incomplete or wrong. We label analysis and opinion, distinguish them from reported fact where we can, and state uncertainty rather than hide it.</p>

<h2>Open-source information</h2>
<p>Our reporting relies on publicly available information, including official records, other publishers’ reporting, imagery and data. Public information can be incomplete, outdated, manipulated or wrong. We take care to corroborate it and to cite sources, but we do not guarantee the accuracy, completeness or reliability of any information on the Service. Nothing on the Service is based on classified material or is intended to compromise national security, and we do not publish information that we believe could endanger lives or operations.</p>

<h2>Corrections</h2>
<p>If you believe something we published is inaccurate, write to ${mail} with the story link and the correction you propose. We review every request and correct errors of fact openly.</p>

<h2>Third-party content and links</h2>
<p>Headlines, summaries, excerpts, images and links from other publishers belong to those publishers, are shown with credit and a link to the original, and do not imply endorsement. Their accuracy and legality are the responsibility of their publishers. External websites are not under our control and we are not responsible for their content, availability, policies or practices. See our <a href="/copyright">Copyright and Content Policy</a>.</p>

<h2>Market data</h2>
<p>Quotes, charts and market information are delayed or last available, come from third-party sources and are for general information only. They are not investment, trading, financial, tax or legal advice, or a recommendation or solicitation to buy or sell anything. Raisina Wire is not a SEBI-registered investment adviser or research analyst. Do your own research and consult a qualified adviser.</p>

<h2>No professional advice</h2>
<p>Content on the Service is general information and journalism. It is not legal, financial, security, medical, travel or other professional advice and must not be relied on as such.</p>

<h2>User Content</h2>
<p>Discussions, replies and other User Content are the views of the people who posted them and not of the Raisina Wire Parties. We moderate but do not pre-screen all User Content.</p>

<h2>Images and artwork</h2>
<p>Some story images are original or computer-generated illustrations and are not photographs of real events. Photographs and third-party images are credited where shown.</p>

<h2>Synthetic voice and automated features</h2>
<p>Listen uses a computer-generated voice. Automated features such as alerts, the live wire and market data may be delayed, incomplete or unavailable.</p>

<h2>Limitation</h2>
<p>To the fullest extent permitted by law, the Raisina Wire Parties are not liable for any loss or damage arising from the use of, or reliance on, the Service or any content on it. The <a href="/terms">Terms of Use</a> set out the full disclaimer of warranties and limitation of liability.</p>`
  },

  copyright: {
    title: "Copyright and Content Policy",
    description: "How Raisina Wire uses headlines, summaries and short excerpts from other publishers, how publishers can opt out, and how to report infringement.",
    html: `
<p>Raisina Wire respects the work of journalists and publishers. This policy explains how we use other publishers’ content, how they can limit or stop that use, and how anyone can report infringement. ${parties}</p>

<h2>1. What we show from other publishers</h2>
<p>For the live wire and the in-app reader we show only:</p>
<ul>
  <li>the <b>headline</b>, <b>publisher name</b>, <b>publication time</b> and a <b>link</b> to the original story;</li>
  <li>the <b>summary the publisher provides in its public feed</b> or page description;</li>
  <li>a <b>short excerpt</b> of the opening of the story (at most about 120 words and never more than the opening paragraphs), clearly labelled as an excerpt, credited to the publisher and followed by a prominent link to read the full story on the publisher’s site; and</li>
  <li>where the publisher makes one available, a <b>thumbnail or lead image</b> loaded from the publisher’s own servers, credited to the publisher.</li>
</ul>
<p>We never reproduce a full article, never remove credits, and never present another publisher’s work as our own. We use this material for the purpose of reporting current events and current affairs and for review, which we believe is fair dealing under Section 52(1)(a) of the Copyright Act, 1957, and we keep each use short so that it directs readers to the publisher rather than substituting for the original.</p>

<h2>2. Publisher signals we respect</h2>
<ul>
  <li>Our reader identifies itself honestly as <code>RaisinaWireReader</code> with a link to this page, so publishers can recognise it and, if they wish, block it.</li>
  <li>If a page carries <code>nosnippet</code>, <code>noarchive</code> or <code>none</code> in its robots meta tag, we show no excerpt, only the headline, summary and link. A <code>max-snippet</code> limit is applied to the excerpt length.</li>
  <li>We do not store full copies of articles. Excerpts are generated on request and cached briefly for performance.</li>
  <li>We do not use other publishers’ content to train artificial intelligence systems.</li>
</ul>

<h2>3. Opting out</h2>
<p>Any publisher or rights holder can ask us to stop showing excerpts, stop showing images, or remove its stories from Raisina Wire altogether. Write to ${mail} from an address at your organisation’s domain, naming the publication and domain. We act on such requests promptly, normally within 36 hours, and the opt-out applies to future stories as well.</p>

<h2>4. Reporting infringement (notice and takedown)</h2>
<p>If you believe that material on the Service infringes your copyright or other intellectual property, send a notice to our Grievance Officer at ${mail} with:</p>
<ol>
  <li>your name, address, telephone number and email;</li>
  <li>a description of the work you claim is infringed, and evidence that you own it or are authorised to act for the owner;</li>
  <li>the exact URL(s) of the material on the Service;</li>
  <li>a statement that you believe in good faith that the use is not authorised by the owner, its agent or the law;</li>
  <li>a statement that the information in the notice is accurate; and</li>
  <li>your physical or electronic signature.</li>
</ol>
<p>On receiving a complete notice we will remove or disable access to the material expeditiously, and in any event within 36 hours, consistent with Section 52(1)(c) of the Copyright Act, 1957 read with Rule 75 of the Copyright Rules, 2013, and the Information Technology Act, 2000 and the rules under it. Where the law contemplates it, access may be restored if no order of a competent court is produced within the prescribed period. We will tell the person who posted the material (where applicable), who may send a counter-notice explaining why the material does not infringe.</p>
<p>Knowingly making a false or misleading notice may expose you to liability. We may share notices with the person concerned.</p>

<h2>5. Repeat infringers</h2>
<p>We remove User Content that infringes others’ rights and suspend or terminate the accounts of repeat infringers.</p>

<h2>6. Our own content</h2>
<p>Raisina Wire Content is protected by copyright. To license or republish it, write to ${mail}. To report misuse of our content elsewhere, write to the same address.</p>`
  },

  privacy: {
    title: "Privacy Policy",
    description: "What personal data Raisina Wire collects, why, how long we keep it, and your rights under the Digital Personal Data Protection Act, 2023.",
    html: `
<p>This policy explains how Raisina Wire handles personal data, in line with the Digital Personal Data Protection Act, 2023 (“DPDP Act”), the rules under it and the Information Technology Act, 2000. ${parties}</p>

<h2>1. Who is responsible</h2>
<p>Raisina Wire (through its publisher, Ilmaz Syed) is the data fiduciary for personal data processed through the Service. Calibrex and our infrastructure providers process data on our behalf as data processors. Contact: ${mail}.</p>

<h2>2. What we collect</h2>
<ul>
  <li><b>Account data</b>: your email address, display name, a one-way hash of your password (we never store your password itself), your role, and sign-in session tokens (stored as hashes).</li>
  <li><b>Your activity as a member</b>: discussions and replies you post, topics you follow and stories you save.</li>
  <li><b>Contact requests</b>: the name, email, organisation and interest you submit through the briefings and partnerships form.</li>
  <li><b>Alerts</b>: if you allow push notifications, the anonymous push address issued by your browser’s push service (and, if you are signed in, a link to your account).</li>
  <li><b>Story view counts</b>: we count how many times each story is opened, per day. We do not record who opened it, and we do not use cookies or identifiers for this.</li>
  <li><b>Data on your device</b>: preferences such as text size, light or dark mode, saved stories and alert choices are stored in your browser’s local storage and stay on your device.</li>
  <li><b>Technical data</b>: like any website, our hosting provider (Cloudflare) processes IP addresses and request data to deliver and protect the Service.</li>
</ul>
<p>We do not use advertising trackers or third-party analytics, and we do not sell personal data.</p>

<h2>3. Why we use it</h2>
<p>To provide your account and member features; to deliver alerts you allowed; to respond to your requests; to moderate the community and keep the Service secure; to understand which stories are read (in aggregate); and to comply with law. We process personal data on the basis of your consent, which you give when you create an account, post, submit a form or allow notifications, and for the legitimate uses permitted by Section 7 of the DPDP Act, such as complying with law or legal process.</p>

<h2>4. Service providers</h2>
<p>Cloudflare (hosting, database, content delivery and security); your browser’s push service, such as Google, Apple or Mozilla, to deliver notifications (they receive only an anonymous push address and a wake-up signal, not the content of your account); Google Cloud Text-to-Speech, which receives the text of Raisina Wire stories to generate the Listen voice (no personal data); and Google Fonts, which serves our typefaces and may receive your IP address. These providers may process data outside India.</p>

<h2>5. How long we keep it</h2>
<p>Account data and your member activity: until you delete your account, after which it is erased within 30 days except where we must keep it by law. Sessions: up to 14 days. Contact requests: up to 24 months after our last exchange. Push addresses: until you switch alerts off or the address expires. Aggregate view counts contain no personal data.</p>

<h2>6. Your rights</h2>
<p>Under the DPDP Act you may: obtain a summary of your personal data and how it is processed; ask us to correct, complete, update or erase it; withdraw consent at any time (as easily as you gave it); nominate another person to exercise your rights in the event of death or incapacity; and have your grievances addressed. You can change your name and password and <b>delete your account</b> in <a href="/account">My account</a>; for anything else write to ${mail}. We respond within the time limits set by law. If you are not satisfied with our response, you may complain to the Data Protection Board of India.</p>

<h2>7. Children</h2>
<p>The Service is not directed at children, and member accounts are for people aged 18 or over. We do not knowingly process children’s personal data. If you believe a child has created an account, write to us and we will delete it.</p>

<h2>8. Security</h2>
<p>We use encryption in transit, hashed passwords and session tokens, access controls and throttling of sign-in attempts. No system is perfectly secure; if a personal data breach occurs we will notify affected people and the Data Protection Board as the law requires.</p>

<h2>9. Changes</h2>
<p>We may update this policy; the date at the top shows the latest version.</p>`
  },

  "community-guidelines": {
    title: "Community Guidelines",
    description: "Rules for discussions on Raisina Wire: be specific, cite sources, stay civil.",
    html: `
<p>The Raisina Wire community is for serious, civil discussion of India’s strategic questions. These guidelines form part of our <a href="/terms">Terms of Use</a>.</p>
<ul>
  <li><b>Be specific and cite sources.</b> Link to the record, report or data behind a claim. Say what is confirmed and what is not.</li>
  <li><b>Argue with ideas, not people.</b> No personal attacks, harassment, threats, slurs or abuse, and no content that promotes hatred or enmity between groups.</li>
  <li><b>No misinformation.</b> Do not post information you know or should know is false, manipulated media, or impersonations.</li>
  <li><b>Respect privacy and the law.</b> No personal data of private individuals, no doxxing, nothing defamatory, obscene or harmful to children, and nothing that threatens national security or public order.</li>
  <li><b>Respect copyright.</b> Quote briefly with credit and a link; do not paste whole articles.</li>
  <li><b>No spam or self-promotion</b> beyond what is relevant to the discussion.</li>
</ul>
<p>Moderators may edit for length, hide or remove posts, and suspend accounts. To report a post or appeal a decision, write to ${mail} with the link.</p>`
  },

  grievance: {
    title: "Grievance Redressal",
    description: "How to make a complaint to Raisina Wire's Grievance Officer, and the time limits we follow.",
    html: `
<p>In accordance with the Information Technology Act, 2000, the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, the Copyright Act, 1957 and the Digital Personal Data Protection Act, 2023, Raisina Wire has appointed a Grievance Officer.</p>

<div class="officer"><b>Grievance Officer</b><br>Ilmaz Syed, Founder and Editor, Raisina Wire<br>Email: ${mail}<br>Hours: Monday to Friday, 10:00 to 18:00 IST</div>

<h2>What you can raise</h2>
<ul>
  <li>Content on the Service that you believe is unlawful, infringing, defamatory or in breach of our <a href="/terms">Terms</a>;</li>
  <li>copyright or trademark complaints (see the <a href="/copyright">Copyright and Content Policy</a> for what to include);</li>
  <li>corrections to our reporting;</li>
  <li>your personal data and privacy rights (see the <a href="/privacy">Privacy Policy</a>);</li>
  <li>decisions about your account or posts.</li>
</ul>

<h2>How to complain</h2>
<p>Email ${mail} with your name and contact details, the link(s) to the content concerned, what the problem is, and what you would like us to do. Attach any evidence and, for intellectual property complaints, proof of ownership or authority.</p>

<h2>What happens next</h2>
<p>We acknowledge complaints within 24 hours and resolve them within 15 days of receipt. Requests to remove content in the categories that the IT Rules require us to act on faster, and complete copyright notices, are acted on within the shorter time limits the law sets (for copyright notices, within 36 hours). We comply with orders of courts and competent authorities.</p>
<p>If you are not satisfied with the Grievance Officer’s decision, you may appeal to the Grievance Appellate Committee under the IT Rules where applicable, complain to the Data Protection Board of India about personal data, or pursue any other remedy available under law.</p>`
  }
};

export const LEGAL_ORDER = [["terms", "Terms of Use"], ["privacy", "Privacy Policy"], ["disclaimer", "Disclaimer"], ["copyright", "Copyright & Content"], ["community-guidelines", "Community Guidelines"], ["grievance", "Grievance Redressal"]];
