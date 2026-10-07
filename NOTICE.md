# Third-party notices

Reel Studio's own code is released under the MIT License (see `LICENSE`). The tools below are not part of this repository: `node scripts/studio.mjs setup` downloads them into this folder from their official sources, each pinned to a SHA-256 in `versions.lock.json`. Each keeps its own license.

## Downloaded by setup

| Component | Version | License | Source |
|---|---|---|---|
| Node.js (portable, only when no suitable Node is installed) | 22.20.0 | MIT | https://nodejs.org |
| Git for Windows MinGit (only when Git is missing) | 2.55.0.5 | GPL-2.0 | https://gitforwindows.org |
| FFmpeg full build by gyan.dev | 8.1.2 | GPL-3.0 | https://www.gyan.dev/ffmpeg/builds/ |
| Chrome Headless Shell (used by Remotion to render) | 149.0.7790.0 | BSD-3-Clause (Chromium) and bundled third-party licenses | https://developer.chrome.com/blog/chrome-headless-shell |
| MediaPipe face detector model `blazeface-short-range-float16-v1` | - | Apache-2.0 | https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector |
| MediaPipe face detector model `blazeface-full-range-float16-v1` | - | Apache-2.0 | https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector |

## Fonts

Downloaded from Google Fonts under the SIL Open Font License 1.1: Cairo, IBM Plex Mono, IBM Plex Sans Arabic, Noto Naskh Arabic, Source Serif 4, Tajawal.

## Libraries and tools used by the engine

| Component | License | Source |
|---|---|---|
| Remotion (installed into engine/node_modules by npm ci) | Remotion License: free for individuals, non-profits and companies with up to 3 employees; larger companies need a Remotion company license | https://www.remotion.dev/license |
| MediaPipe Tasks Vision (@mediapipe/tasks-vision) | Apache-2.0 | https://github.com/google-ai-edge/mediapipe |
| whisper.cpp (downloaded on first transcription) | MIT | https://github.com/ggml-org/whisper.cpp |
| OpenAI Whisper model weights (downloaded on first transcription) | MIT | https://github.com/openai/whisper |
| Other npm packages in engine/node_modules | Each package's own license file | https://www.npmjs.com |

## Adapted motion components

Adapted source lives under `engine/src/motion-library/`; pinned upstream revisions, checksums and full license texts are in `third-party/motion-kits/`.

- av/remotion-bits @ `6c71169aa061` — MIT — StaggeredMotion, AnimatedCounter
- riaz37/remotion-ui @ `c0729bd638a1` — MIT — MaskedSlideReveal, PathDraw, SimulatedCursor
