// The people and desks that write for Raisina Wire. Shared by the site and the Worker
// (bylines, author pages, structured data). Add a writer here and it appears in the CMS.
export const WRITERS = [
  {
    key: "ilmaz-syed", name: "Ilmaz Syed", role: "Founder and Editor",
    photo: "/editions/ilmaz-syed.jpg", portrait: "/editions/ilmaz-syed-portrait.jpg",
    bio: "Founder and editor of Raisina Wire and founder of Calibrex. An OSINT expert, defence investigative journalist and geopolitical analyst with more than fifteen years in Indian news.",
    sameAs: ["https://www.linkedin.com/in/ilmaz-syed"]
  },
  {
    key: "raisina-wire", name: "Raisina Wire", role: "The Raisina Wire desk",
    photo: "/icon-192.png", portrait: "/icon-512.png", isDesk: true,
    bio: "News, explainers and briefings from the Raisina Wire desk in New Delhi, on India’s security, diplomacy and markets.",
    sameAs: []
  }
];
export const DEFAULT_WRITER = "ilmaz-syed";
export const writer = key => WRITERS.find(w => w.key === key) || WRITERS[0];
