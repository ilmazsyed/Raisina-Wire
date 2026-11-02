# Raisina Wire: notes for Claude

## Raisina TV explainers: ask every time
Before starting work on any explainer, ask the editor (Ilmaz Syed), each time, never assuming from
earlier ones:
1. Which anchor reads the Raisina TV intro?
2. Is the intro on camera (`intro: "cam"`) or voice only (`intro: "voice"`)?
3. Which anchor narrates the explainer itself (the script's `voice`)?

Make lines, recordings and lip sync only for the anchor chosen, never for every anchor. No anchor
self-introduction ("I'm Kabir") and no "AI narrator" card on intros. Only anchors in `READY`
(`src/anchors.js`) go on air; add another anchor (Kabir, Bharti, Vikram, Ilmaz) only when the editor
names them. Steps: `video/README.md` ("Raisina TV anchor intros") and `anchors/README.md`.

## Changes
Work on a branch and open a pull request; the "Site builds" check must be green before merging.
