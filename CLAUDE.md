# Rashtrix app: notes for Claude

This branch line (`rashtrix`) is the Rashtrix 24×7 News app, a Bengali-first rebuild of Raisina
Wire. Read `rashtrix/BRIEF.md` (phases and decisions) and `README.md` (what exists and how to set
it up) before working.

- Never merge into `main` (the live Raisina Wire site). Pull requests target `rashtrix`.
- It deploys as its own Worker (`rashtrix`) and D1 database (`rashtrix-db`), never Raisina Wire's.
- Free tiers only; no paid AI API. Ask the owner for keys only when a phase needs them, with
  step-by-step instructions.
- Bengali is the default language at `/`; English `/en`, Hindi `/hi`. New interface text is written
  in English in the code and needs an entry in `src/i18n/bn.js` (and `hi.js`).
- All Bengali (pages, interface, articles, wire rewrites and briefs) is written in the house style of
  Anandabazar Patrika and The Wall: standard চলিত বাংলা, short plain sentences, Bengali digits. The
  rules the wire desk follows are `BENGALI_STYLE` in `src/wiredesk.js`; use them for any Bengali you write.
- Wire rewrites and briefs never carry photos and never show their sources to readers.
- The "Site builds" check must be green before merging.
