---
name: reel-studio
description: Use for Reel Studio setup, updates, interactive preferences, fonts, styles, caption appearance, editing a named video, review, delivery or Instagram and TikTok publication descriptions in this folder.
---

# Reel Studio

The folder three levels above this file is the studio: `engine/`, `scripts/`, `instructions/`, `Sound-Kits/`, `third-party/`, plus the creator's own files, which git ignores and updates never touch: `PROFILE.json`, `Raw/`, `Projects/`, `Outputs/`, `Tools/`, `state/`. Run every command from that folder.

Talk to the creator in short Egyptian Arabic unless they ask for another language. Keep files, code and JSON in English. Run commands and edit JSON yourself; ask the creator only for decisions, one question at a time. Read `instructions/RULES.md` before any edit — those rules win over speed and convenience.

## Setup and updates

`AGENTS.md` at the studio root has the install, update and check steps; follow it. In short:

- First run: follow `AGENTS.md` for Node and setup. If no profile exists, run `node scripts/studio.mjs settings` as a long-running command and open its printed local `url` in the user's browser/panel. The screen works before engine dependencies are installed. The user chooses and saves; «احفظ وابدأ» starts/resumes setup and shows actual stages. Keep the server running while the screen is open. Poll `node scripts/studio.mjs status`; once it says `done`, run `node scripts/studio.mjs doctor` and show the test reel. A saved profile or completed download is not proof of a passed doctor check.
- Every session: run `node scripts/studio.mjs check` once (update check; it never changes files) and, if it reports a new version, say so in one line and never update unasked. On «حدّث الاستوديو» run `node scripts/studio.mjs update` and follow its `next`. On «افحص النظام», or if something breaks, run `node scripts/studio.mjs doctor` and explain the actual error.

## Settings and profile (PROFILE.json, schema 3)

«افتح إعداداتي» or a request to change defaults: open `node scripts/studio.mjs settings` as above. Verify the save with `node scripts/profile.mjs check`. Preserve profiles at session start. Schema 2 is readable without rewriting; screen saves migrate and back up. On a stale save, reload instead of overwriting a newer change.

Each preference independently uses `{"mode":"auto","value":null}` or `{"mode":"fixed","value":"<listed choice>"}`:

| Preference | Fixed choices |
| --- | --- |
| `style` | Seven ids in `instructions/STYLES.md` |
| `captionsGrouping` | `compact`, `clauses`, `single` |
| `captionsPresentation` | `pill`, `minimal`, `ink-strip` |
| `font` | `Cairo`, `Tajawal`, `Noto Naskh Arabic`, `Plex Display` |
| `writingStyle` | `short`, `educational`, `storytelling` |
| `palette` | `brand` (colours on supported styles) |

Automatic style selection keeps the proven Split Canvas / Section Deck pool; others require selection. Style cards are illustrations; font previews use actual installed fonts and label missing downloads.

**One video only:** keep PROFILE.json. Copy **all fields** printed by `node scripts/profile.mjs brief` into that video's brief. Add explicit `style`, `fontFamily`, `captionsGrouping`, `captionsPresentation` or `writingStyle` only for a user-requested override; these win over saved defaults. Example: saved paper-collage/Tajawal + «الفيديو ده بس خطوات منظمة» → brief `style: "section-deck"`, retain `preferences`, omit `fontFamily` override so Tajawal stays fixed. Explain the chosen style in the preview; don't repeat settled questions.

### Fallback when this host cannot open a browser

Ask, one at a time, and never invent an answer:

1. Name (person or brand).
2. Social handle — optional; `null` if they have none.
3. Follow card at the end? Needs the handle.
4. Default comment keyword for the CTA — optional; they can change it for each video.
5. Their recorded sign-off — the exact words they say at the very end, optional.
6. Brand colours: primary and accent (`#RRGGBB`); background and text are optional (`null` keeps each style's own). Offer the example's colours if they have none.
7. Platforms: Instagram and/or TikTok.
8. Each preference above: automatic or fixed from its listed choices. Offer automatic when undecided.

Write it like `PROFILE.example.json` (schema 3, `language` "ar-EG", all six `preferences`) and validate with `node scripts/profile.mjs check`. Relay Arabic errors and fix the answer. A request to change defaults authorizes that change; preserve all other fields. Prefer the screen's backed-up save.

## Editing a video

Work only on a file the creator names. Follow `instructions/EDITING.md` step by step:

1. `node scripts/intake.mjs --source Raw/<file> --id <slug>` — measure first; edit the `edit` path it prints.
2. Screen recordings: propose the private regions to blur from stills, and blur only what the creator confirms (`scripts/redact.mjs`).
3. Transcribe and build a simple **uncut draft** using saved preferences and the recorded words; captions stay `draft` until reviewed. Plan it, run `node scripts/editor.mjs prepare Projects/<slug>/edit.json`, then start `node scripts/review-editor.mjs Projects/<slug>/edit.json` as a long-running command and open its printed URL immediately in the user's browser/panel (`--open` if no panel-opening tool is available). Keep the server and tab open throughout editing and while awaiting decisions. Then review the transcript as numbered lines, propose cuts with `node scripts/auto-cut.mjs`, and ask for this video's comment keyword (gate 1). Never preview a screen recording before its agreed privacy blur.
4. Use saved preferences; copy **all fields** from `node scripts/profile.mjs brief --cta <keyword>` (or `--no-cta`), retain `preferences`, add only requested per-video overrides and the approved cut `segments`. Apply complete, validated snapshots atomically in small meaningful batches; the open editor follows them without a page reload. After each cut batch, run `node scripts/editor.mjs prepare Projects/<slug>/edit.json` and wait for the new footage preview. Show a fast full preview for approval (gate 2), and relay every plan `notice`. `captionsMode` still means transcript input (`words`/`phrases`), not grouping. If the creator is typing or has unsaved changes, finish/save those first; never overwrite them to keep the display moving.
5. Keep the live Review Editor open for manual corrections and review before delivery (`instructions/REVIEW-EDITOR.md`). Restart and reopen it if its server stops. Plan with `--deliver`, then `node scripts/face-check.mjs Projects/<slug>/edit.json --fix`. On NEEDS-REVIEW show the stills it lists and ask before delivering with `--face-reviewed-by "<name>"`.
6. `node scripts/motion-plan.mjs Projects/<slug>/edit.json` (not for screen recordings), deliver with `node scripts/editor.mjs render ... --deliver`, check the actual MP4, copy it to `Outputs/<slug>/`.
7. Run `node scripts/profile.mjs writing --project <slug>`. Follow its resolved `writingStyle`, guide, platforms and actual project CTA in `publish-copy.json`: short (at most 450 characters), educational (useful explanation/points), or storytelling (a factual short narrative). Write distinct copy for each selected platform. Run `node scripts/publish-pack.mjs --project <slug> --video Outputs/<slug>/<slug>.mp4`; show the captions and never post them.

Screen recordings: set `sourceKind` to `"screen"` and use `screen-recording` beats (`instructions/STYLES.md`). Technique details and limits: `instructions/TECHNIQUES.md`.

## Never

- Never change, add or reorder the creator's spoken words on screen, clone their voice, or invent claims.
- Never recolour, texture or cover the presenter's face.
- Never trim the recorded sign-off or invent a handle, keyword or sign-off.
- Never claim a render passed without probing the file and looking at its stills.
- Never install global tools or change settings outside this folder.
