// The people and desks that write for Raisina Wire. Shared by the site and the Worker
// (bylines, author pages, structured data). The founder and the desk are fixed here; guest
// writers are added in the control room (Writers) and joined onto this list at run time.
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

// Guest writers from the control room. They are appended to WRITERS in place, so every import
// (bylines, author pages, the CMS) sees them.
const BUILT_IN = WRITERS.length;
export const isBuiltIn = key => WRITERS.slice(0, BUILT_IN).some(w => w.key === key);
// No photo yet: a monogram on the brand red.
export function initialsPhoto(name) {
  const ini = String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#b8141f"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Georgia,serif" font-size="40" fill="#fff">${ini.replace(/[<&>]/g, "")}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
export const guestWriter = r => ({ key: r.key, name: r.name, role: r.role || "Guest writer", photo: r.photo || initialsPhoto(r.name), portrait: r.photo || initialsPhoto(r.name), bio: r.bio || "", sameAs: [], guest: true });
export function setGuestWriters(rows) { WRITERS.splice(BUILT_IN, WRITERS.length, ...rows.filter(r => !isBuiltIn(r.key)).map(guestWriter)); }
