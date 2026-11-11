# Setup, updates and checks

The studio folder is also the user's workspace. All downloads, dependencies and scratch stay here. Run commands yourself and relay the Arabic line; act on the JSON result. A completed download or saved profile is not a passed doctor check.

## Which Node

Run `node --version`. v22.20.0 or newer: use `node`. Missing or older: run
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-node.ps1` (forward slash: it works in PowerShell, cmd and Git Bash). It installs the pinned portable Node into `Tools\node\` (hash-checked, no admin) and prints `{"ok":true,"node":"<path>"}`. Use that path in place of `node` in every command in this folder for the rest of the session.

## Every session

1. Run `node scripts/studio.mjs check` once. If it says a new version exists, tell the user that one line and carry on. Never update unasked.
2. If `node scripts/studio.mjs status` does not report `done`, finish **First run** before editing.
3. «حدّث الاستوديو» → `node scripts/studio.mjs update`, relay its line, then run the command in its `next` field if there is one. Updates install the newest official release (a `vX.Y.Z` tag), never unreleased work. When the update starts setup in the background, poll `node scripts/studio.mjs status` every minute or two until it says `done`, then run `node scripts/studio.mjs doctor --quick`. Only then ask the user to open a new session (افتح جلسة جديدة) so the new instructions load.
   - A folder from the old paid store edition (it has `STORE-EDITION.json`) is never turned into a git clone. The store edition is discontinued and Reel Studio is free: relay the line `check`/`update` print. On «انقل بروفايلي» in a new GitHub install: copy only `PROFILE.json` from the old folder the user names, run `node scripts/profile.mjs check`, then `node scripts/studio.mjs setup`. Old projects stay in the old folder.
   - The studio ships `.claude/settings.json`, so its everyday commands run without a permission prompt. Those commands write only inside this folder and never into `Raw/`; an exported subtitle file is replaced only with `--force`. Deleting files, installing, updating and every other command still ask; that is expected. These rules are a convenience that spares prompts for the studio's own commands, not a sandbox or a security boundary.
4. «افحص النظام» → `node scripts/studio.mjs doctor` (allow 10 minutes). Relay its line and the video path.
5. «افتح إعداداتي», «غيّر الستايل», fonts, default on-screen caption or post-description preferences → `node scripts/studio.mjs settings` as a long-running command. Open the printed local `url` in the user's browser/panel. Keep that process running while the screen is open. The user saves on the screen; verify with `node scripts/profile.mjs check`. Do not open settings for a one-video override; when «غيّر الستايل» could mean either, ask once «للفيديو ده بس ولا لكل الفيديوهات؟».

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
4. **Tools.** Run `node scripts/studio.mjs setup`. It returns at once; a background worker downloads the engine packages, the render browser, FFmpeg, the fonts, the face and person cut-out models and the transcription tool (whisper.cpp with its medium model, about 1.5 GB) into this folder (15–30 minutes the first time; every file is hash-checked). Tell the user in one line.
5. **Interactive profile, while setup runs.** If `PROFILE.json` is missing, run `node scripts/studio.mjs settings` as a long-running command and open its printed `url` in the user's browser/panel (Codex: use the available browser-opening tool). The Arabic screen handles identity, independent fixed/automatic style, captions, fonts, publishing descriptions, colours and endings; «احفظ وابدأ» validates, saves and starts/resumes setup. It works before engine packages are installed. Existing profiles: validate, summarize in one line and preserve them; open settings only if requested. Schema 2 is read without rewriting; a screen save migrates to schema 3 and creates a local backup. If the host cannot open a browser, follow `instructions/SETTINGS.md` fallback questions and write a validated schema 3 profile yourself. Meanwhile check setup with `node scripts/studio.mjs status` every minute or two and relay its line only when it changes. If status says the worker stalled, run `node scripts/studio.mjs setup` again (it resumes). If it stalls a second time your host is stopping background processes: run `node scripts/studio.mjs setup --foreground` as a long-running (background) command instead. If a step failed, relay its line as it is (for example: the studio must move to a folder with no `package.json` above it).
6. **Test reel.** When status says `done`, run `node scripts/studio.mjs doctor` (allow 10 minutes). It renders `Projects/_doctor/doctor.mp4` with the user's name, colours and ending through the full delivery checks. Give the user the path.
7. End with this thank-you line and support line from the studio's maker (relay both as the maker's message without the outer «» marks, with the link as written), then the ready line, exactly:
   «شكرًا إنك نزّلت Reel Studio 🙏 الاستوديو بيبلّغني بإشارة صغيرة إن التثبيت نجح وإنك بتستخدمه، ومعاها رقم الإصدار. مفيش اسمك ولا فيديوهاتك ولا أي ملف من جهازك. الإشارة دي بتفرّحني وبتساعدني أعرف إن التحديثات بتوصلكم وشغالة.»
   «ولو محتاج مساعدة مباشرة على جهازك في جلسة خاصة مدفوعة واختيارية، احجز جلستك الاستشارية اليوم: https://store.pyraai.cloud/product/reel-studio/»
   «كده الاستوديو جاهز. افتح جلسة جديدة وقول «افحص النظام» عشان نتأكد إن كل حاجة شغالة.»

## Troubleshooting

Keep the setup server/worker alive and report changed stages rather than repeatedly narrating unchanged polls. Resume a stalled step once; if the host stops its background worker again, use the documented foreground fallback. A failed stage needs its actual error resolved before calling the studio ready. The status JSON names the cause in `reason`; the full output is in `state/setup.log`:

| `reason` | What to do |
|---|---|
| `network` | Rerun setup; finished bytes are kept and the download resumes. If it repeats, check the connection, VPN or proxy. |
| `timeout` | Rerun setup; it resumes. A very slow line may need a quieter time. |
| `disk-full` | Tell the user how much space the line names; free space or move the studio folder to another drive, then rerun. |
| `file-locked` | Antivirus or OneDrive is holding a file: ask the user to exclude the studio folder from scanning or stop syncing it, then rerun. |
| `path` | Follow the line: move the studio to a short local path with no `package.json` above it, and no junctions inside `engine`. |
| `hash` | A proxy or security tool may have changed the download: rerun once; if it repeats, report the line and the log tail. |
| `unavailable` | The pinned file is missing at its source: try later; if it persists, report it so the pin can be updated. |
| `missing-runtime` | Ask the user to install Microsoft's official x64 Visual C++ Redistributable from https://aka.ms/vs/17/release/vc_redist.x64.exe themselves (a system install that needs their approval), then rerun. |
| `extract` | Rerun once; if it repeats, read the 7zr or ffmpeg lines in `state/setup.log` and report them. |
| `unknown` | Read `state/setup.log` and resolve the actual error. |

Rerun means `node scripts/studio.mjs setup`.

Use `node scripts/studio.mjs doctor --quick` for non-rendering checks; `doctor` checks a real test export.

During normal editing keep tracked studio files intact so updates remain safe. Requested studio maintenance is a separate authorized task. Never run global installers or delete state while a setup worker is running. Do not replace dependencies ad hoc with `npm install`; use the pinned setup/update workflow.
