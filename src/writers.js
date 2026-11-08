// The people and desks that write for Rashtrix. Shared by the site and the Worker (bylines,
// author pages, structured data). The desks are fixed here; reporters and guest writers are
// added in the control room (Writers) and joined onto this list at run time.
export const WRITERS = [
  {
    key: "rashtrix-desk", name: "Rashtrix News Desk", role: "The Rashtrix newsroom, Kolkata",
    photo: "/icon-192.png", portrait: "/icon-512.png", isDesk: true,
    bio: "News from the Rashtrix 24×7 News desk in Kolkata: Kolkata, West Bengal, India, Bengalis abroad and the world.",
    sameAs: ["https://www.rashtrix.live"]
  },
  {
    key: "rashtrix-wire", name: "Rashtrix Wire", role: "Wire desk",
    photo: "/icon-192.png", portrait: "/icon-512.png", isDesk: true, isWire: true,
    bio: "Short reports written by the Rashtrix wire desk from several published sources, checked against each other.",
    sameAs: []
  }
];
export const DEFAULT_WRITER = "rashtrix-desk";
export const writer = key => WRITERS.find(w => w.key === key) || WRITERS[0];

// Guest writers from the control room. They are appended to WRITERS in place, so every import
// (bylines, author pages, the CMS) sees them.
const BUILT_IN = WRITERS.length;
export const isBuiltIn = key => WRITERS.slice(0, BUILT_IN).some(w => w.key === key);
// No photo yet: a monogram on the brand red.
export function initialsPhoto(name) {
  const ini = String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(p => [...p][0]).join("").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#AA0404"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="700" font-size="38" fill="#fff">${ini.replace(/[<&>]/g, "")}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
export const guestWriter = r => ({ key: r.key, name: r.name, role: r.role || "Reporter", photo: r.photo || initialsPhoto(r.name), portrait: r.photo || initialsPhoto(r.name), bio: r.bio || "", sameAs: [], guest: true });
export function setGuestWriters(rows) { WRITERS.splice(BUILT_IN, WRITERS.length, ...rows.filter(r => !isBuiltIn(r.key)).map(guestWriter)); }
