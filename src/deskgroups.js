// The desks' lists in the same groups everywhere (the AVO, Explainer, Headlines and Ad desks):
// made and in rotation, made and out of rotation, being made, and everything made in the last hour.
// A row of tabs with their counts picks one; "All" shows every group under its own heading.
import { esc } from "./crshell.js";
import { digits } from "./i18n.js";

export const HOUR = 3600e3;
// A time as the server gives it (ISO, or SQLite's "YYYY-MM-DD HH:MM:SS" in UTC), in milliseconds.
export const ms = t => { if (typeof t === "number") return t; const s = String(t || "").trim(); if (!s) return NaN; return Date.parse(/^\d{4}-\d\d-\d\d \d/.test(s) ? `${s.replace(" ", "T")}Z` : s); };
export const within = (t, span = HOUR) => { const x = ms(t); return Number.isFinite(x) && Date.now() - x < span; };
export const ago = t => { const x = ms(t); if (!Number.isFinite(x)) return ""; const m = Math.round((Date.now() - x) / 60e3); return m < 1 ? "just now" : m < 60 ? `${digits(m)} min ago` : m < 1440 ? `${digits(Math.floor(m / 60))} h ago` : `${digits(Math.floor(m / 1440))} d ago`; };

// The groups: [key, heading, test]. The tabs: All, Last hour, then the groups.
//   items: the desk's items; groups: [[key, name, test], …]; recent: item → made in the last hour?
export function groupsBar(items, groups, recent, cur, attr = "data-grp") {
  // (each item counts in one group only, the first that takes it, as the list shows them)
  const placed = grouped(items, groups, recent, "all");
  const n = k => k === "all" ? items.length : k === "hour" ? items.filter(recent).length : placed.find(g => g[0] === k)?.[2].length || 0;
  const tabs = [["all", "All"], ["hour", "Made in the last hour"], ...groups.map(([k, name]) => [k, name])];
  return `<div class="dg-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="dg-tab${cur === k ? " on" : ""}${k === "hour" ? " hour" : ""}" ${attr}="${k}" aria-selected="${cur === k}"><span>${esc(l)}</span><b data-no-tr>${digits(n(k))}</b></button>`).join("")}</div>`;
}
// The items to show for the tab, in their groups: [[key, name, list], …] (each item in one group,
// the first that takes it; "hour" keeps the groups but only the last hour's items).
export function grouped(items, groups, recent, cur) {
  const pool = cur === "hour" ? items.filter(recent) : items;
  const left = [...pool];
  const all = groups.map(([k, name, f]) => { const g = left.filter(f); g.forEach(x => left.splice(left.indexOf(x), 1)); return [k, name, g]; });
  return all.filter(([k, , g]) => g.length && (cur === "all" || cur === "hour" || k === cur));
}
// The heading over a group.
export const groupHead = (k, name, n) => `<h3 class="dg-head" data-g="${esc(k)}"><i></i>${esc(name)} <small data-no-tr>${digits(n)}</small></h3>`;
// The tab is kept per desk on this device.
export const savedTab = desk => { try { return localStorage.getItem(`dg:${desk}`) || "all"; } catch { return "all"; } };
export const saveTab = (desk, k) => { try { localStorage.setItem(`dg:${desk}`, k); } catch { /* fine */ } };
