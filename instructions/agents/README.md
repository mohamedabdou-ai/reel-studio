# Worker agents

The production manager and creative director (`PRODUCTION-MANAGER.md`) staffs an edit with the workers defined here and briefs them with the video's creative direction. One canonical file per role; the Claude copies in `.claude/agents/reel-<role>.md` are generated with `node scripts/sync-assistant-guides.mjs` and must not be edited by hand. Codex reads these files directly.

## Staffing rule

- A named finished reference (learn its style, or make a recording in its style) → the breakdown worker first, alone, on every named reference; its draft DNA and recipe go to the editorial worker with the creative brief. A `needs-input` from it (add-on not installed, a changed stored breakdown, hand-edited DNA files) goes to the manager, who asks the creator or settles the file; nobody installs or forces on their own.
- Short job (default): recording ≤ 90 s, ≤ 8 designed beats, one clip, or authored graphics of that size → the manager performs the roles itself in order: analysis → editorial → assets (only when the plan names media to make) → edit → sound → qa → delivery, and says so («أديت الأدوار بنفسي بالترتيب»).
- Big job: anything larger, a podcast batch, three or more assets to make, or the creator asks for the team → real sub-agents: analysis alone first; editorial; then edit ∥ assets; then sound on the edit candidate; then the manager integrates, prepares and renders the fast preview; then qa; then delivery. At most 3 workers at once; one heavy command (transcribe, prepare, render, RVM) at a time; never two renders.
- A host without sub-agents runs the same order itself and says so.

## Files per role

Frontmatter: `name` (`reel-<role>`), `role`, `description`, `model` (`haiku` | `sonnet`), `tools` (tool names; `Bash(<exact command> *)` for commands), `writes` (the task folder first), `returns`. Body sections in order: Job, Inputs you may read, Steps, Return, Never, Knowledge. Whole file ≤ 6 KB.

## Before the manager accepts a result

`node scripts/production-accept.mjs --role <role> --task Projects/<id>/production/<run>/tasks/<task>` writes `accept.json` in the task folder and prints PASS/FAIL per check. A FAIL goes back to the worker with the failing check named; the manager never passes on unchecked work.

## Claude agent contract

Frontmatter keys: `name`, `description` (both required), `tools` (comma-separated tool names), `model` (aliases `haiku`, `sonnet`; `opus` is also accepted). Unknown keys are ignored, so the studio keys `role`, `writes` and `returns` are safe in the canonical file and dropped from the generated copy. Project agents under `.claude/agents/` are discovered when the studio folder is opened. Source: https://code.claude.com/docs/en/sub-agents.md
