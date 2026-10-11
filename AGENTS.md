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

## Public GitHub wording — Codex and Claude

When the owner explicitly asks you to maintain or publish the studio, apply these rules to the repository description, commit messages, pull request titles and descriptions, release notes and product copy:

- Use short, natural Egyptian Arabic unless the owner requests another language. Lead with what the user can do and how the change helps them. Example: «اختار خطك والستايل اللي يناسب فيديوهاتك».
- Keep descriptions free of development jargon, implementation details, function or variable names, debugging logs and prefixes such as `feat:`, `fix:`, `docs:` or `refactor:`. Describe the visible result instead.
- Never publish private conversations, approval exchanges, agent coordination, internal plans, personal machine paths, personal email addresses, real user profiles, recordings or secrets. Use GitHub's noreply email for commit and tag metadata.
- Keep claims factual. Do not describe an installation, a video or a feature as verified unless the relevant check actually ran.
- Keep source code, exact installation commands, compatibility requirements, contributor instructions and license notices where they are needed. Plain public wording does not mean removing information that people need to use the studio.
- Before uploading, review both the selected files and every public title and description. Upload only the files needed for the requested change; keep private material in ignored local folders.
- Before an authorized publication, run `node scripts/publication-check.mjs` and `node scripts/publication-check.mjs --history`. Both must pass. Enable the repository's pre-push check with `git config --local core.hooksPath .githooks`; never bypass it to publish rejected content.

These publishing rules apply to both assistants. They do not authorize changes to the studio during normal video editing; the owner must explicitly request studio maintenance or publication.
