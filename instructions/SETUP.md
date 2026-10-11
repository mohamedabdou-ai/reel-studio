# Setup, updates and checks

The studio folder is also the user's workspace. All downloads, dependencies and scratch stay here. Run commands yourself and relay the Arabic line; act on the JSON result. A completed download or saved profile is not a passed doctor check.

## Which Node

Run `node --version`. v22.20.0 or newer: use `node`. Missing or older: run
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-node.ps1` (forward slash: it works in PowerShell, cmd and Git Bash). It installs the pinned portable Node into `Tools\node\` (hash-checked, no admin) and prints `{"ok":true,"node":"<path>"}`. Use that path in place of `node` in every command in this folder for the rest of the session.

## Every session

1. Run `node scripts/studio.mjs check` once. If it says a new version exists, tell the user that one line and carry on. Never update unasked.
2. If `node scripts/studio.mjs status` does not report `done`, finish **First run** before editing.
3. «حدّث الاستوديو» → `node scripts/studio.mjs update`, relay its line, then run the command in its `next` field if there is one. After an update, ask the user to open a new session (افتح جلسة جديدة) so the new instructions load.
4. «افحص النظام» → `node scripts/studio.mjs doctor` (allow 10 minutes). Relay its line and the video path.
5. «افتح إعداداتي», «غيّر الستايل», fonts, default on-screen caption or post-description preferences → `node scripts/studio.mjs settings` as a long-running command. Open the printed local `url` in the user's browser/panel. Keep that process running while the screen is open. The user saves on the screen; verify with `node scripts/profile.mjs check`. Do not open settings for a one-video override.

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
5. **Interactive profile, while setup runs.** If `PROFILE.json` is missing, run `node scripts/studio.mjs settings` as a long-running command and open its printed `url` in the user's browser/panel (Codex: use the available browser-opening tool). The Arabic screen handles identity, independent fixed/automatic style, captions, fonts, publishing descriptions, colours and endings; «احفظ وابدأ» validates, saves and starts/resumes setup. It works before engine packages are installed. Existing profiles: validate, summarize in one line and preserve them; open settings only if requested. Schema 2 is read without rewriting; a screen save migrates to schema 3 and creates a local backup. If the host cannot open a browser, follow `instructions/SETTINGS.md` fallback questions and write a validated schema 3 profile yourself. Meanwhile check setup with `node scripts/studio.mjs status` every minute or two and relay its line only when it changes. If status says the worker stalled, run `node scripts/studio.mjs setup` again (it resumes). If it stalls a second time your host is stopping background processes: run `node scripts/studio.mjs setup --foreground` as a long-running (background) command instead. If a step failed, relay its line as it is (for example: the studio must move to a folder with no `package.json` above it).
6. **Test reel.** When status says `done`, run `node scripts/studio.mjs doctor` (allow 10 minutes). It renders `Projects/_doctor/doctor.mp4` with the user's name, colours and ending through the full delivery checks. Give the user the path.
7. End with exactly: «كده الاستوديو جاهز. افتح جلسة جديدة وقول «افحص النظام» عشان نتأكد إن كل حاجة شغالة.»

## Troubleshooting

Keep the setup server/worker alive and report changed stages rather than repeatedly narrating unchanged polls. Resume a stalled step once; if the host stops its background worker again, use the documented foreground fallback. A failed tool/model/browser stage needs its actual error resolved before calling the studio ready. Use `node scripts/studio.mjs doctor --quick` for non-rendering checks; `doctor` checks a real test export.

During normal editing keep tracked studio files intact so updates remain safe. Requested studio maintenance is a separate authorized task. Never run global installers or delete state while a setup worker is running. Do not replace dependencies ad hoc with `npm install`; use the pinned setup/update workflow.
