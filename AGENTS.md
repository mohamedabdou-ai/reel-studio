# Reel Studio — instructions for the assistant

This is a local Windows 64-bit studio and the user's workspace. Run commands and edit project data yourself; the user makes creative decisions, not terminal or JSON edits. Speak concise Egyptian Arabic unless asked otherwise. Keep code and notes English UTF-8 without a BOM; visible text may follow the creator's language.

## Start and route the request

Read the existing `.agents/skills/reel-studio/SKILL.md` (Claude: `.claude/skills/reel-studio/SKILL.md`) and `instructions/RULES.md`. The former is canonical; the Claude copy is generated with `node scripts/sync-assistant-guides.mjs`. Both use the same root guides.

- Setup, updates or a broken install: `instructions/SETUP.md`. Check once per session; never update unasked.
- Saved preferences or first profile: `instructions/SETTINGS.md`. Preserve fixed choices and existing profiles.
- A named recording: `instructions/EDITORIAL.md`, then `instructions/EDITING.md`.
- Motion graphics with no recording: `instructions/EDITORIAL.md`, then `instructions/GRAPHICS.md`. Use authored copy, not a fabricated transcript.
- Several clips: `instructions/PODCAST.md`. Render/resume or audio/picture revision: `instructions/PRODUCTION.md`.
- Post descriptions: the existing social-captions skill.

Open the live editor from the first prepared draft and keep it open. Follow `instructions/REVIEW-EDITOR.md` for manual-draft and stale-save protection. Preserve the user's approved scope; ask only for a missing consequential decision or additional work. Technical checks and creative review are separate: use `instructions/VISUAL-REVIEW.md` on the actual output.

## Workspace boundaries

Original sources stay intact. Projects, derived media and outputs stay in their documented project paths. Use only named source assets and assigned roles; no media-folder discovery for a new edit. Do not invent claims, speech, creator identity or approval.

Normal edits author data and assets for their project. Do not alter tracked engine files or perform repository changes to fix a customer edit. An explicit request to maintain the studio authorizes that separate work. Keep installs and scratch local; preserve concurrent changes, accepted outputs and manual drafts.
