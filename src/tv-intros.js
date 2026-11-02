// Raisina TV: the anchor's intro before each explainer on the live channel (never inside the
// video itself), written from the explainer's story and stored here, keyed by the video file.
// Each intro is 65–80 words in three parts, cut like a bulletin:
//   cam  the anchor on camera: the hook (about 0–8 s)
//   vo   the anchor's voice over the explainer's pictures: why it matters, what's coming (8–20 s)
//   out  back on camera for the hand-off
// Per explainer, chosen by the editor each time (see CLAUDE.md):
//   anchor  who reads it (a key of ANCHORS in src/anchors.js)
//   intro   "cam": on camera once the anchor's lip-synced clips for it are ready (until then, and
//           for an anchor whose face isn't ready, it plays as a voice-over); "voice": always a
//           voice-over on the explainer's pictures, no anchor on screen
// Explainers from a story Ilmaz Syed wrote are his Editor's Pick. A new explainer gets its intro
// here when it is made (see video/README.md).
export const TV_INTROS = {
  "/videos/tesla-spacex-merger-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "Elon Musk's car company and his rocket company could soon be one. Asked whether Tesla and SpaceX should merge, Musk said simply: yes.",
    vo: "Special committees are now studying a deal that could create a company worth about three and a half trillion dollars, spanning cars, batteries, robots, rockets and satellite internet. It would also put SpaceX's work for the US military under the same roof as Tesla's big business in China.",
    out: "What a merger could mean. Here's the explainer."
  },
  "/videos/iran-no-limits-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "Strike Iran again, and the answer will have no limits. That is the order Iran's new supreme leader has given his generals.",
    vo: "Mojtaba Khamenei's first reported meeting with the military since taking over in March came with a new target list and a sharp rise in weapons production. With most of India's crude passing near the Gulf, a second round would hit our fuel bill fast.",
    out: "Here is what the generals heard, and why it matters."
  },
  "/videos/gaza-schools-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "My pick today. Gaza's children have gone back to school, and some of them are being killed on the way there.",
    vo: "Mohammed Hamad was fourteen, near the top of his class, when a strike hit the road home. In one week, ten children and a teacher were killed. This is what a ceasefire looks like for the youngest people in Gaza, and for the families who must choose between school and safety.",
    out: "Their story, in this explainer."
  },
  "/videos/germany-genz-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "Don't spend on war, spend on people. That is the message from Germany's youngest voters, and it lands just as Berlin rearms.",
    vo: "Rallies in thirty-four cities, a generation asked to accept cuts and maybe military service, and a chancellor who needs their support. Europe's rearmament may depend on how Berlin answers them, and India is watching closely.",
    out: "Who they are, and what they want. Here's the explainer."
  },
  "/videos/israel-deadlock-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "Israel voted, and nobody won. Benjamin Netanyahu's bloc fell to fifty-three seats, well short of a majority.",
    vo: "A record turnout, a record nineteen seats for Arab-led parties, and four possible ways out of the deadlock, from a caretaker government to another election. Whoever governs next will shape Israel's choices on Iran and Gaza, and its ties with New Delhi.",
    out: "What the deadlock means. Here is the explainer."
  },
  "/videos/persia-to-iran-explained-v2-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "Empires come and go. Iran has outlasted almost all of them. So why does it still unsettle the great powers?",
    vo: "From two hundred and forty kingdoms on the Iranian plateau to the King of Kings, from Cyrus to Alexander and beyond, this is the long story of a civilisation that absorbs its conquerors. It explains how Iran thinks today, as the Gulf becomes a tinderbox again.",
    out: "Iran measures history in centuries. Here's why."
  },
  "/videos/china-economy-explained-v2-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "My pick today. China's economy is still growing, but underneath is a problem Beijing can't fix. Its people aren't spending.",
    vo: "Consumption is only about fifty-six per cent of China's economy, lower than Japan at the worst of its lost decade. Factories are humming, shoppers are not. And it matters for India both ways: cheap imports if China's shoppers stay home, a bigger market if they start spending.",
    out: "Why China can't fix its economy. Here's the explainer."
  },
  "/videos/iran-war-explained-v2-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "My pick today. A supreme leader killed, the world's most important oil route choked, and a region still on the edge.",
    vo: "Eight months of the Iran war, from the first strikes of twenty-eighth February to the envoys flying to Tehran this week to stop a second round. For India, the question underneath it all is simple: will the oil keep flowing?",
    out: "The whole story, from the first strike to today. Here it is."
  },
  "/videos/nps-pension-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "My pick today. The retirement savings of nearly one crore government employees, and a union that says they could be at risk.",
    vo: "The NPS employees' federation has written to the Prime Minister about a proposed seventeen thousand crore rupee investment from the pension corpus in two firms it calls startups. If the deal is sound, publishing the safeguards would settle it. If not, the pressure for an audit will grow.",
    out: "What the row is about. Here's the explainer."
  },
  "/videos/europe-youth-protests-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "From Paris to Milan to Lisbon, young Europeans are on the streets, and their anger is growing.",
    vo: "Rent, wages and the cost of living have brought hundreds of thousands out in France, Italy, Portugal and Belgium, with fresh strikes called and governments short of answers. For India, key European partners have less room for trade and strategy, and the lesson travels.",
    out: "Why Europe's youth are angry. Here's the explainer."
  },
  "/videos/karak-church-attack-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "Gunmen opened fire on mourners at a church funeral in southern Jordan. Nine people are dead.",
    vo: "The attack in Karak governorate left thirty-four wounded and the country in three days of mourning. King Abdullah has promised an iron fist, but the attackers haven't been identified. Jordan is a stable partner for India against terror, and an attack like this tests that stability.",
    out: "Here is what we know so far."
  },
  "/videos/trump-sindoor-claim-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "Donald Trump has made Operation Sindoor part of his midterm pitch, again claiming he stopped the conflict.",
    vo: "At a Florida rally he spoke of two hundred and fifty per cent tariffs and eleven planes shot down. India's account is very different: the pause came at Pakistan's request, agreed directly between the two. And Washington's politics keep spilling into India's security.",
    out: "The claim, and India's answer. Here's the explainer."
  },
  "/videos/us-midterms-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "America votes on the third of November, and Donald Trump's grip on Congress is on the line.",
    vo: "All four hundred and thirty-five House seats and a third of the Senate are up, with Republicans holding razor-thin margins. For India, the result could shape everything from the hundred-thousand-dollar H-1B fee to the tariffs on our exports.",
    out: "How the midterms work, and why they matter. Here's the explainer."
  },
  "/videos/machado-returns-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "After ten months in exile, Venezuela's opposition leader, Nobel laureate María Corina Machado, is back home, and she has a message.",
    vo: "Nicolás Maduro was deposed in January, but his vice-president has stayed past her term, and no election has been called. Machado's return makes that hard to ignore. For India, this is about oil: Washington wants our refiners to process Venezuelan crude.",
    out: "Why her return matters. Here's the explainer."
  },
  "/videos/vandyke-nia-case-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "An American and six Ukrainians, accused of training armed groups in Myanmar. India's case against them has changed shape.",
    vo: "The NIA arrested the seven in March and called it a terror case. But the charge sheet, filed on the last possible day, brought only immigration charges, and all seven are now abroad on bail. The question is whether the bigger allegations will ever stand up in court.",
    out: "Where the case stands. Here's the explainer."
  },
  "/videos/netanyahu-nuclear-image-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "Two days before Israel voted, Benjamin Netanyahu posted a mushroom cloud over Tel Aviv.",
    vo: "The AI-generated image came with a warning that Israel has two more years of Donald Trump to finish the work in Iran. His rivals called it fearmongering. For India, a two-year deadline on Iran means risk: oil, freight, insurance and a harder balancing act in the Gulf.",
    out: "Why he posted it. Here's the explainer."
  },
  "/videos/france-protests-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "It started at school gates. Now it's a national test for President Emmanuel Macron and his government.",
    vo: "Students blocked schools over teacher shortages. Then the protests turned violent, France deployed seventy thousand police, and nearly a thousand people were arrested. Macron has promised more teachers, but with new rallies planned, policing can hold the streets. It can't fix schools or prices.",
    out: "How France got here. Here's the explainer."
  },
  "/videos/rubio-jamnagar-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "America's Secretary of State came to India this week, and skipped New Delhi altogether. That was no accident.",
    vo: "Marco Rubio's visit centred on Mumbai's boardrooms and Reliance's giant refinery at Jamnagar. Washington wants India to buy more American energy and refine Venezuelan crude. The test for India is simple: competitive prices, secure supply, and no new kind of dependence.",
    out: "Why the refinery, not the capital. Here's the explainer."
  },
  "/videos/karakoram-2026-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "For the first time, the armies of China and Pakistan have trained together.",
    vo: "Nine days in Xinjiang, with drones at the centre, and Pakistani troops working with Chinese rifles and fighting vehicles. One drill does not prove preparation for any specific conflict, but it shows growing military familiarity on two of India's borders, and what to watch next.",
    out: "What Karakoram 2026 means. Here's the explainer."
  },
  "/videos/houthi-oil-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "A missile over Yemen can seem far away. Here's how it can reach an Indian household.",
    vo: "Brent crude has hit its highest since May on fears for two chokepoints, Hormuz and Bab el-Mandeb. No blockade is needed: the threat alone reroutes ships and raises insurance and freight. India imports most of its crude, so every barrel gets more expensive.",
    out: "From the Red Sea to your fuel bill. Here's the explainer."
  },
  "/videos/russian-diesel-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "Donald Trump is buying diesel from Russia. It's a stunning U-turn, and for now, it helps India.",
    vo: "American pump prices have soared, diesel has nearly doubled, and the midterms are close. The deal brings India a breather: a pause on a tariff law and less pressure over Russian oil. But Washington's swings have cost India before.",
    out: "This round went India's way. The next may not. Here's why."
  },
  "/videos/chemical-parks-explained-16x9.mp4": {
    anchor: "tara", intro: "cam",
    cam: "India is betting three thousand and thirty crore rupees on three new chemical parks.",
    vo: "Chemicals go into almost everything India makes, yet key products left a thirty-one billion dollar trade deficit, and we import up to ninety per cent of our methanol. Land and pipes are the easy part. A park works only when one company's output becomes another's input.",
    out: "Can the parks fix India's import problem? Here's the explainer."
  }
};
