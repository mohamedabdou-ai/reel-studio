# Contributing to Reel Studio

For installation and normal video editing, start with [README.md](README.md)
and [AGENTS.md](AGENTS.md). This guide is for changes to the studio itself.

## Where things live

| Path | Purpose |
| --- | --- |
| `instructions/` | Setup, editing, styles and delivery guides. |
| `.agents/skills/`, `.claude/skills/` | Assistant instructions for Codex and Claude Code. |
| `scripts/` | Local setup, settings, editing, rendering and checks. |
| `engine/src/` | Remotion scenes and the video runtime. |
| `tests/` | Automated tests shipped with the studio. |
| `Sound-Kits/` | Local sound recipes and style palettes. |
| `third-party/` | Motion references, source snapshots and license notices. |
| `docs/images/`, `docs/media/` | README images, examples and their sources. |

## Keep personal files local

`PROFILE.json`, `Raw/`, `Projects/`, `Outputs/`, `Tools/`, `state/` and installed
dependencies are ignored. Keep recordings, exports and working files there.
Environment files and private key files are also ignored; only sanitized
`.env.example` or `.env.template` files belong in a commit. Internal planning
notes belong under the ignored `docs/superpowers/` directory.

Ignoring a file does not remove a file that is already tracked or erase old
Git history. Check the staged diff before submitting a change. Use your GitHub
noreply email for commits if you do not want a personal email in commit metadata.

## Write for the people using the studio

Use short, natural Egyptian Arabic for public commit messages, pull request
titles and descriptions, release notes and product copy unless another language
is requested. Explain the visible improvement and its benefit. For example:
«اختار خطك والستايل اللي يناسب فيديوهاتك».

Avoid development prefixes, implementation details, debugging logs and private
work conversations. Keep necessary source code, installation commands and
license information precise. Follow the shared publishing rules in
[AGENTS.md](AGENTS.md), and use GitHub's noreply email in public metadata.

## Validate a change

Use Node.js 22.20.0 or newer. After the engine dependencies are available, run
these commands from the repository root:

```powershell
node --test tests/*.test.mjs
node engine/node_modules/typescript/bin/tsc --project engine/tsconfig.json --noEmit
git diff --check
node scripts/publication-check.mjs
node scripts/publication-check.mjs --history
```

Enable the local pre-push checks before publishing: `git config --local core.hooksPath .githooks`. The publication check reports file, line and rule names without printing rejected content. It checks the reachable history as well as the selected files.

For documentation changes, check that links, file paths and commands exist.
Setup tests need a temporary directory with no `package.json` in its parent
folders, just as a normal studio installation needs an independent folder.
For settings changes, preserve existing profiles and reviewed defaults. For a
video or scene change, review representative frames and the resulting video;
passing tests and type checks alone do not show how it looks or sounds.

Follow the [motion concept contract](engine/src/motion-concepts/CONTRACT.md)
when adding a concept. Preserve [LICENSE](LICENSE), [NOTICE.md](NOTICE.md) and
the third-party notices. Keep dependency changes deliberate and update the
lockfile only when required.
