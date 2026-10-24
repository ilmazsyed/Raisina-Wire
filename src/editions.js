// Published Raisina Wire editions (LinkedIn newsletter by Ilmaz Syed), newest first.
// Full text is in edition-bodies.json, loaded only when an edition is opened.
// To add an edition: put its entry at the top here, its text in edition-bodies.json
// under the same slug, and its artwork at public/editions/<slug>.webp.
export const NEWSLETTER_URL = "https://www.linkedin.com/newsletters/raisina-wire-7418787153549238272";
export const AUTHOR = { name: "Ilmaz Syed", role: "Founder and Editor", photo: "/editions/ilmaz-syed.jpg" };

export const editions = [
  {
    "slug": "shadow-war",
    "date": "2026-03-18",
    "topic": "Northeast · Security",
    "title": "Shadow War: Is the CIA Using Mercenaries to Destabilize India’s Northeast?",
    "dek": "An operation at Kolkata and Delhi airports, and what it signals about foreign actors on India’s soil.",
    "url": "https://www.linkedin.com/pulse/shadow-war-cia-using-mercenaries-destabilize-indias-northeast-syed-peacc",
    "image": "/editions/shadow-war.webp",
    "readMinutes": 2
  },
  {
    "slug": "iron-dome-east",
    "date": "2026-02-15",
    "topic": "Eastern India · Strategy",
    "title": "The “Iron Dome” of the East: Why Kolkata is Becoming India’s Strategic Nerve Center for 2026",
    "dek": "Kolkata is no longer in the rear. It is the command, intelligence and logistical anchor that ensures the frontlines move forward.",
    "url": "https://www.linkedin.com/pulse/iron-dome-east-why-kolkata-becoming-indias-strategic-nerve-ilmaz-syed-cbizc",
    "image": "/editions/iron-dome-east.webp",
    "readMinutes": 3
  },
  {
    "slug": "dhaka-reset",
    "date": "2026-02-14",
    "topic": "Bangladesh · Border security",
    "title": "The Dhaka Reset: Tarique Rahman’s Landslide, the Jamaat Shadow, and India’s High-Stakes Border Security",
    "dek": "Bangladesh has spoken. What the shift in Dhaka means for radicalisation networks and infiltration along India’s border.",
    "url": "https://www.linkedin.com/pulse/dhaka-reset-tarique-rahmans-landslide-jamaat-shadow-indias-ilmaz-syed-sthxc",
    "image": "/editions/dhaka-reset.webp",
    "readMinutes": 3
  },
  {
    "slug": "delhis-red-line",
    "date": "2026-02-14",
    "topic": "Bangladesh · Intelligence",
    "title": "Delhi’s Red Line: Inside the ‘Jamaat-MIM’ Pincer and R&AW’s Explosive Message to Tarique Rahman",
    "dek": "While the world watches the return of Tarique Rahman, New Delhi is looking at a much more dangerous map.",
    "url": "https://www.linkedin.com/pulse/delhis-red-line-inside-jamaat-mim-pincer-raws-explosive-ilmaz-syed-5nf8c",
    "image": "/editions/delhis-red-line.webp",
    "readMinutes": 4
  },
  {
    "slug": "deterrence-without-firing",
    "date": "2026-02-08",
    "topic": "South Asia · Deterrence",
    "title": "How India is Redefining Geopolitical Deterrence Without Firing a Single Bullet",
    "dek": "Economic leverage, technology and “invisible” weaponry: India is no longer merely reacting to provocations.",
    "url": "https://www.linkedin.com/pulse/how-india-redefining-geopolitical-deterrence-without-firing-syed-pwdgc",
    "image": "/editions/deterrence-without-firing.webp",
    "readMinutes": 4
  },
  {
    "slug": "naravane-midnight-call",
    "date": "2026-02-05",
    "topic": "Defence · Civil–military",
    "title": "The 135-Minute Midnight Call: Why Gen. Naravane’s Stalled Memoir is Shaking the Indian Establishment",
    "dek": "Why an unpublished memoir by a former Army chief brought proceedings in Parliament to a halt.",
    "url": "https://www.linkedin.com/pulse/135-minute-midnight-call-why-gen-naravanes-stalled-memoir-ilmaz-syed-mhsxc",
    "image": "/editions/naravane-midnight-call.webp",
    "readMinutes": 4
  },
  {
    "slug": "cia-invisible-front",
    "date": "2026-02-04",
    "topic": "Information environment",
    "title": "The CIA’s Invisible Front: Decoding the Narrative Warfare Targeting India’s Global Rise",
    "dek": "Warfare is no longer only tanks, missiles and boots on the ground. Reading the narratives aimed at India.",
    "url": "https://www.linkedin.com/pulse/cias-invisible-front-decoding-narrative-warfare-targeting-ilmaz-syed-vposc",
    "image": "/editions/cia-invisible-front.webp",
    "readMinutes": 4
  },
  {
    "slug": "pakistan-1971-moment",
    "date": "2026-02-01",
    "topic": "Pakistan · Balochistan",
    "title": "Is Pakistan Facing Its 1971 Moment? The Unraveling of Balochistan and the End of the CPEC Dream",
    "dek": "A seismic shift on South Asia’s map, and what it means for the China–Pakistan Economic Corridor.",
    "url": "https://www.linkedin.com/pulse/pakistan-facing-its-1971-moment-unraveling-balochistan-ilmaz-syed-ggzsc",
    "image": "/editions/pakistan-1971-moment.webp",
    "readMinutes": 3
  },
  {
    "slug": "begging-bowls-terror-hubs",
    "date": "2026-01-31",
    "topic": "Pakistan · Economy",
    "title": "From Begging Bowls to Terror Hubs: Is Pakistan Speed-running Its Own Collapse?",
    "dek": "While the world races toward a digital future, a neighbour trapped in a cycle of its own making.",
    "url": "https://www.linkedin.com/pulse/from-begging-bowls-terror-hubs-pakistan-speed-running-ilmaz-syed-x4tfc",
    "image": "/editions/begging-bowls-terror-hubs.webp",
    "readMinutes": 4
  },
  {
    "slug": "bangladesh-breaking-point",
    "date": "2026-01-26",
    "topic": "Bangladesh · Economy",
    "title": "Bangladesh at a Breaking Point: Economic Collapse, Industry Shutdowns, and a Humanitarian Crisis",
    "dek": "The story of Bangladesh as South Asia’s “economic tiger” is rapidly unravelling.",
    "url": "https://www.linkedin.com/pulse/bangladesh-breaking-point-economic-collapse-industry-shutdowns-syed-xiyqc",
    "image": "/editions/bangladesh-breaking-point.webp",
    "readMinutes": 3
  },
  {
    "slug": "silent-superpower",
    "date": "2026-01-26",
    "topic": "Defence industry",
    "title": "The Silent Superpower: Why the World is Moving its Arms Factories to India",
    "dek": "From electromagnetic railguns to ₹100-per-shot lasers, India is becoming a defence manufacturing hub.",
    "url": "https://www.linkedin.com/pulse/silent-superpower-why-world-moving-its-arms-factories-ilmaz-syed-2x4qc",
    "image": "/editions/silent-superpower.webp",
    "readMinutes": 3
  },
  {
    "slug": "iran-500m-masterstroke",
    "date": "2026-01-23",
    "topic": "West Asia · Connectivity",
    "title": "Is India’s $500M Masterstroke in Iran Under Threat?",
    "dek": "Behind the protests in Tehran lies a high-stakes game for India’s trade, energy security and Chabahar Port.",
    "url": "https://www.linkedin.com/pulse/indias-500m-masterstroke-iran-under-threat-ilmaz-syed-3cndc",
    "image": "/editions/iran-500m-masterstroke.webp",
    "readMinutes": 3
  },
  {
    "slug": "himalayan-tunnel",
    "date": "2026-01-19",
    "topic": "Water security · Infrastructure",
    "title": "India’s Secret Himalayan Tunnel: The Underground Strategy to Dismantle Pakistan’s Water Lifeline",
    "dek": "The Himalayan rivers as strategy, and what it means for Pakistan’s most vital lifeline.",
    "url": "https://www.linkedin.com/pulse/indias-secret-himalayan-tunnel-underground-strategy-dismantle-syed-ry8bc",
    "image": "/editions/himalayan-tunnel.webp",
    "readMinutes": 3
  }
];
