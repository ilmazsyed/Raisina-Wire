// The language of the control-room and studio screens (producer, PCR, prompter, guest): বাংলা,
// English or हिन्दी, remembered on the device and, for staff, on their account. On-air graphics
// stay in Bengali whatever the screen's language.
import { LANGUAGES, setLang, loadLanguage, startTranslator, lang } from "./i18n.js";

const KEY = "rx-ui-lang";
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export async function initUiLang({ account = true } = {}) {
  let l = new URLSearchParams(location.search).get("lang") || read();
  if (!l && account) l = await fetch("/api/auth/ui-lang", { cache: "no-store" }).then(r => r.json()).then(d => d.lang).catch(() => null);
  if (!LANGUAGES[l]) l = "bn";
  setLang(l);
  await loadLanguage();
  startTranslator();
  return l;
}
// A small switch (select) for the screen's header.
export function langSwitch(account = true) {
  const sel = document.createElement("select");
  sel.className = "ui-lang"; sel.setAttribute("aria-label", "Language"); sel.dataset.noTr = "";
  sel.innerHTML = Object.entries(LANGUAGES).map(([k, x]) => `<option value="${k}"${k === lang ? " selected" : ""}>${x.name}</option>`).join("");
  sel.addEventListener("change", async () => {
    try { localStorage.setItem(KEY, sel.value); } catch { /* private window */ }
    if (account) await fetch("/api/auth/ui-lang", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: sel.value }) }).catch(() => {});
    const u = new URL(location.href); u.searchParams.delete("lang"); location.replace(u);
  });
  return sel;
}
