# Setup, updates and checks

Reel Studio runs from the folder it was cloned into; that folder is also the user's workspace. Everything it downloads stays inside it (`Tools/`, `state/`, `engine/node_modules/`, `.remotion/`, `engine/public/fonts/`) and is git-ignored, so `git pull` never touches the user's work. Every command ends with one Arabic line for the user and one JSON line for you.

| Command | What it does |
|---|---|
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-node.ps1` | Only when `node --version` is missing or older than 22.20.0: installs the pinned portable Node into `Tools\node\` and prints its path. Use that path in place of `node`. |
| `node scripts/studio.mjs setup` | Starts the background setup worker and returns at once. Steps: folders, npm packages (`npm ci --ignore-scripts`), render browser, FFmpeg, fonts, face models. Downloads are pinned by SHA-256 in `versions.lock.json`, land as `.partial` and are renamed only after the hash matches; the render browser comes from Remotion itself and is checked against its pinned hash afterwards. A step that stalls stops after 30 minutes and is reported as failed. Rerunning resumes; finished steps are skipped. `--steps fonts,models` limits the run. The browser step refuses to run when a folder above the studio has a `package.json` (renders would look for the browser there); relay its line: the user moves the studio folder. |
| `node scripts/studio.mjs setup --foreground` | The same work in the current process, for hosts that stop background processes. |
| `node scripts/studio.mjs status` | Progress of the worker. Poll until `status` is `done`. The log is `state/setup.log`. |
| `node scripts/studio.mjs check` | `git fetch`; says in one line whether a newer version exists. Never changes files. |
| `node scripts/studio.mjs update` | `git pull --ff-only`; restarts setup (then `status`, then `doctor --quick`) only when `engine/package-lock.json` or the tool pins in `versions.lock.json` changed; otherwise runs the quick check at once. Refuses when tracked files were edited. |
| `node scripts/studio.mjs doctor --quick` | Checks the folder location, tools, fonts, models, `PROFILE.json` and a clean git tree without rendering. |
| `node scripts/studio.mjs doctor` | Renders `Projects/_doctor/doctor.mp4` (4 s, 1080x1920) with the user's name, colours and ending through `scripts/render.mjs --deliver`, so the plate, safe-zone and Instagram encode gates run on a real file. Allow 10 minutes. |

Never edit tracked files to fix a project, never run `npm install` or global installers, and never delete `state/` while a setup worker is running.
