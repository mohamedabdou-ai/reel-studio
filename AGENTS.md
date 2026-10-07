# Reel Studio — instructions for the assistant

Reel Studio is a free (MIT), local editor that turns a talking-head video or a screen recording into a finished 9:16 reel for Instagram and TikTok. This folder is a git clone of https://github.com/mohamedabdou-ai/reel-studio and it is also the user's workspace. You (Claude Code or Codex) run every command. The user never types commands, edits JSON or installs anything by hand. Windows 64-bit only.

Talk to the user in short, friendly Egyptian Arabic unless they write in another language. Every `scripts/studio.mjs` command ends with one Arabic line for the user and then one JSON line for you: relay the Arabic line, act on the JSON (`ok`, `status`, `next`). Write files in English UTF-8 without a BOM; user-facing copy such as captions may be Arabic.

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

## Which Node

Run `node --version`. v22.20.0 or newer: use `node`. Missing or older: run
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-node.ps1` (forward slash: it works in PowerShell, cmd and Git Bash). It installs the pinned portable Node into `Tools\node\` (hash-checked, no admin) and prints `{"ok":true,"node":"<path>"}`. Use that path in place of `node` in every command in this folder for the rest of the session.

## Every session

1. Run `node scripts/studio.mjs check` once. If it says a new version exists, tell the user that one line and carry on. Never update unasked.
2. If `node scripts/studio.mjs status` does not report `done`, finish **First run** before editing.
3. «حدّث الاستوديو» → `node scripts/studio.mjs update`, relay its line, then run the command in its `next` field if there is one. After an update, ask the user to open a new session (افتح جلسة جديدة) so the new instructions load.
4. «افحص النظام» → `node scripts/studio.mjs doctor` (allow 10 minutes). Relay its line and the video path.
5. «افتح إعداداتي», «غيّر الستايل», fonts or default caption preferences → `node scripts/studio.mjs settings` as a long-running command. Open the printed local `url` in the user's browser/panel. Keep that process running while the screen is open. The user saves on the screen; verify with `node scripts/profile.mjs check`. Do not open settings for a one-video override.

## First run (install)

The user pasted: «نزّل Reel Studio في الفولدر ده من https://github.com/mohamedabdou-ai/reel-studio واتبع AGENTS.md اللي فيه عشان تجهّزه».

1. **Git.** Run `git --version`. If it fails, install portable Git inside this folder (PowerShell, no admin; run it as a PowerShell script, not through bash):
   ```powershell
   [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
   New-Item -ItemType Directory -Force -Path Tools | Out-Null
   $ProgressPreference = 'SilentlyContinue'
   Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/MinGit-2.55.0.5-64-bit.zip' -OutFile Tools\MinGit.zip.partial
   if ((Get-FileHash Tools\MinGit.zip.partial -Algorithm SHA256).Hash.ToLower() -ne '56d7b226b7693196cfc71fef26568f536c4a021ab6c37ff2db4287bed908e96e') { Remove-Item Tools\MinGit.zip.partial; throw 'MinGit hash mismatch' }
   Move-Item Tools\MinGit.zip.partial Tools\MinGit.zip
   Expand-Archive Tools\MinGit.zip -DestinationPath Tools\git
   Remove-Item Tools\MinGit.zip
   ```
   Then use `.\Tools\git\cmd\git.exe` wherever a step says `git`.
2. **Code.** If this folder is not a clone yet, get the code without touching anything already here:
   ```
   git init -b main
   git remote add origin https://github.com/mohamedabdou-ai/reel-studio.git
   git fetch origin main
   git checkout -B main --track origin/main
   ```
3. **Node.** See **Which Node**.
4. **Tools.** Run `node scripts/studio.mjs setup`. It returns at once; a background worker downloads the engine packages, the render browser, FFmpeg, the fonts and the face models into this folder (10–20 minutes the first time; every file is hash-checked). Tell the user in one line.
5. **Interactive profile, while setup runs.** If `PROFILE.json` is missing, run `node scripts/studio.mjs settings` as a long-running command and open its printed `url` in the user's browser/panel (Codex: use the available browser-opening tool). The Arabic screen handles identity, independent fixed/automatic style, captions, fonts, publishing descriptions, colours and endings; «احفظ وابدأ» validates, saves and starts/resumes setup. It works before engine packages are installed. Existing profiles: validate, summarize in one line and preserve them; open settings only if requested. Schema 2 is read without rewriting; a screen save migrates to schema 3 and creates a local backup. If the host cannot open a browser, follow the skill's fallback questions and write a validated schema 3 profile yourself. Meanwhile check setup with `node scripts/studio.mjs status` every minute or two and relay its line only when it changes. If status says the worker stalled, run `node scripts/studio.mjs setup` again (it resumes). If it stalls a second time your host is stopping background processes: run `node scripts/studio.mjs setup --foreground` as a long-running (background) command instead. If a step failed, relay its line as it is (for example: the studio must move to a folder with no `package.json` above it).
6. **Test reel.** When status says `done`, run `node scripts/studio.mjs doctor` (allow 10 minutes). It renders `Projects/_doctor/doctor.mp4` with the user's name, colours and ending through the full delivery checks. Give the user the path.
7. End with exactly: «كده الاستوديو جاهز. افتح جلسة جديدة وقول «افحص النظام» عشان نتأكد إن كل حاجة شغالة.»

## Editing a video

When the user names a video (for example «عدّل Raw/x.mp4»), follow the skill (`.claude/skills/reel-studio/SKILL.md`; Codex: `.agents/skills/reel-studio/SKILL.md`) and `instructions/EDITING.md`. Each video's work, including `PUBLISH_PACK.md`, stays in `Projects/<slug>/`; the finished MP4 is copied to `Outputs/<slug>/`.

**Open the live editor by default.** After intake and any approved privacy blur, build the first uncut draft and prepare its footage, then run `node scripts/review-editor.mjs Projects/<slug>/edit.json` as a long-running command. Open the printed URL in the user's browser/panel immediately; do not wait for a request or a finished render. If your host cannot open a panel, add `--open` to use the default browser. Keep the server and tab open while you edit and while you wait for the user's decisions.

Make approved changes in small, meaningful batches so the user sees captions, scenes and the timeline update. Save complete, validated snapshots atomically. After changing cuts, run `node scripts/editor.mjs prepare Projects/<slug>/edit.json` so the actual footage preview catches up; explain that preparation is still running until it finishes. Never imply that an old cut preview already shows the new cuts. Do not regenerate a whole video just to show a small caption or scene change.

The initial transcript is a draft and initial cuts retain all the footage. Keep the transcript, cut, privacy and delivery approval gates. Before changing a project the user is also editing, ask them to save or finish their local changes; stop when the editor reports a pending conflict. Preserve manual drafts and do not silently overwrite them. If the server stops, restart it and open its new URL. Details: `instructions/REVIEW-EDITOR.md`.

## Rules

Read `instructions/RULES.md` before any edit and follow it; those rules come first. Three more keep this folder safe to update:

- Keep every download, cache and render inside this folder. No global installs, no admin rights, no changes to system settings.
- Never edit tracked files (anything `git status` would list) to fix a project; that is what keeps «حدّث الاستوديو» safe. If the engine itself seems broken, tell the user.
- Never run git commands that change this folder other than the install steps above and `node scripts/studio.mjs update`.
