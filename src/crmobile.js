// The control room on a phone: every control-room screen (admin.html and the TV desks) shares one
// menu (all screens, grouped), a bottom tab bar within thumb reach (the screens used most), and
// panels that fold away (a tap on a panel's heading), so a long screen is easy to move through.
// Desktop is unchanged: the tab bar and the folding apply only on narrow screens.
import "./crmobile.css";

export const PHONE = "(max-width: 760px)";
export const isPhone = () => matchMedia(PHONE).matches;

// Every control-room screen, grouped. admin.html views are "#view" links.
export const GROUPS = [
  ["Newsroom", [["/admin.html#overview", "Overview", "overview"], ["/admin.html#editorial", "Stories", "editorial"], ["/admin.html#wire", "Wire desk", "wire"],
    ["/admin.html#corrections", "Corrections", "corrections"], ["/admin.html#translations", "Translations", "translations"], ["/admin.html#wix", "Wix import", "wix"], ["/admin.html#writers", "Writers", "writers"]]],
  ["TV", [["/breaking.html", "Breaking desk"], ["/admin.html#tv", "TV channels", "tv"], ["/pcr.html", "PCR"], ["/producer.html", "Bulletin producer"], ["/avodesk.html", "AVO desk"], ["/onair.html", "On-air desk"],
    ["/studio.html", "Live studio"], ["/prompter.html", "Teleprompter"], ["/admin.html#multimedia", "Multimedia", "multimedia"], ["/admin.html#live", "Live publishing", "live"]]],
  ["Readers", [["/admin.html#audience", "Audience", "audience"], ["/admin.html#alerts", "Alerts", "alerts"], ["/admin.html#community", "Community moderation", "community"], ["/admin.html#events", "Events", "events"]]],
  ["Administration", [["/admin.html#members", "Members & roles", "members"], ["/admin.html#sales", "Contact & leads", "sales"], ["/admin.html#social", "Social metrics", "social"]]]
];
const ICON = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  stories: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  wire: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>',
  pcr: '<rect x="2.5" y="5" width="19" height="13" rx="2"/><path d="M9 21h6"/><circle cx="12" cy="11.5" r="2.5"/>',
  more: '<path d="M4 7h16M4 12h16M4 17h16"/>'
};
const svg = k => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const TABS = [["/admin.html#overview", "Home", "home", "overview"], ["/admin.html#editorial", "Stories", "stories", "editorial"], ["/admin.html#wire", "Wire desk", "wire", "wire"], ["/pcr.html", "PCR", "pcr"]];
const here = () => location.pathname === "/admin.html" || location.pathname === "/admin" ? `/admin.html#${(location.hash || "#overview").slice(1)}` : location.pathname;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// The bottom tab bar and the menu sheet. `extra` is HTML for the sheet's foot (language, clock…);
// `hidden` hides screens a role may not open; `owner` adds the owner's Desk Brief.
export function mountPhoneNav({ extra = "", hidden = [], owner = false } = {}) {
  if (document.querySelector(".m-tabs")) return;
  document.body.classList.add("has-mtabs");
  const bar = document.createElement("nav");
  bar.className = "m-tabs"; bar.setAttribute("aria-label", "Control room");
  bar.innerHTML = TABS.map(([h, label, ic]) => `<a href="${h}">${svg(ic)}<span>${label}</span></a>`).join("") + `<button type="button" class="m-more">${svg("more")}<span>More</span></button>`;
  document.body.append(bar);
  const sheet = document.createElement("dialog");
  sheet.className = "m-sheet";
  sheet.innerHTML = `<div class="m-sheet-head"><b>Control room</b><button type="button" class="m-close" aria-label="Close">✕</button></div>
    ${GROUPS.map(([g, items]) => `<section><h3>${g}</h3><div class="m-grid">${items.filter(([, , v]) => !hidden.includes(v)).map(([h, label]) => `<a href="${h}">${esc(label)}</a>`).join("")}</div></section>`).join("")}
    ${owner ? `<section><h3>Owner</h3><div class="m-grid"><a href="/mybrief">Desk Brief</a></div></section>` : ""}
    <section class="m-foot">${extra}<a class="m-site" href="/">← View site</a></section>`;
  document.body.append(sheet);
  const mark = () => {
    const now = here();
    bar.querySelectorAll("a").forEach(a => a.toggleAttribute("aria-current", a.getAttribute("href") === now));
    sheet.querySelectorAll(".m-grid a").forEach(a => a.toggleAttribute("aria-current", a.getAttribute("href") === now));
  };
  mark(); addEventListener("hashchange", mark);
  bar.querySelector(".m-more").addEventListener("click", () => { mark(); sheet.showModal(); });
  sheet.addEventListener("click", e => { if (e.target === sheet || e.target.closest(".m-close") || e.target.closest(".m-grid a")) sheet.close(); });
  return { sheet, mark };
}

// Panels fold on a phone: a tap on the heading. What is folded is remembered per screen (by the
// heading's text), and screens that redraw their panels keep it. `open` lists headings open at
// first (by default the first two panels of the screen).
export function foldPanels(root, { open = null, sel = ".panel", head = ":scope > h2" } = {}) {
  const key = `cr-fold:${location.pathname}`;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch { /* none */ }
  const apply = () => {
    if (!isPhone()) { root.querySelectorAll(".m-fold").forEach(p => p.classList.remove("m-fold", "m-folded")); return; }
    [...root.querySelectorAll(sel)].forEach((p, i) => {
      const h = p.querySelector(head); if (!h) return;
      const name = h.textContent.trim().split("(")[0].trim();
      if (!p.classList.contains("m-fold")) {
        p.classList.add("m-fold");
        // open at first: panels marked data-open, else the first two of the screen
        const def = root.querySelector(`${sel}[data-open]`) ? p.hasAttribute("data-open") : open ? open.some(o => name.startsWith(o)) : i < 2;
        p.classList.toggle("m-folded", name in saved ? saved[name] : !def);
      }
      if (!h.dataset.fold) {
        h.dataset.fold = "1"; h.setAttribute("role", "button"); h.tabIndex = 0;
        h.addEventListener("click", () => { const f = p.classList.toggle("m-folded"); saved[name] = f; try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* private mode */ } });
      }
    });
  };
  apply();
  new MutationObserver(() => { clearTimeout(apply.t); apply.t = setTimeout(apply, 50); }).observe(root, { childList: true, subtree: true });
  matchMedia(PHONE).addEventListener("change", apply);
}
