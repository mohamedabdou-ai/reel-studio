# Third-party notices

Reel Studio's own code is released under the MIT License (see `LICENSE`). The tools below are not part of this repository: `node scripts/studio.mjs setup` downloads them into this folder from their official sources, each pinned to a SHA-256 in `versions.lock.json`. Each keeps its own license.

## Downloaded by setup

| Component | Version | License | Source |
|---|---|---|---|
| Node.js (portable, only when no suitable Node is installed) | 22.20.0 | MIT | https://nodejs.org |
| Git for Windows MinGit (only when Git is missing) | 2.55.0.5 | GPL-2.0 | https://gitforwindows.org |
| FFmpeg full build by gyan.dev | 8.1.2 | GPL-3.0 | https://www.gyan.dev/ffmpeg/builds/ |
| 7-Zip `7zr.exe` (unpacks the FFmpeg archive during setup) | 26.06 | LGPL-2.1-or-later | https://www.7-zip.org/ |
| Chrome Headless Shell (used by Remotion to render) | 149.0.7790.0 | BSD-3-Clause (Chromium) and bundled third-party licenses | https://developer.chrome.com/blog/chrome-headless-shell |
| MediaPipe face detector model `blazeface-short-range-float16-v1` | - | Apache-2.0 | https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector |
| MediaPipe face detector model `blazeface-full-range-float16-v1` | - | Apache-2.0 | https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector |
| MediaPipe selfie segmenter model `selfie-segmenter-float16-v1` (the person matte of the layered-speaker style) | - | Apache-2.0 | https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter |

## Fonts

Downloaded from Google Fonts under the SIL Open Font License 1.1: Alexandria, Amiri, Aref Ruqaa, Aref Ruqaa Ink, Cairo, El Messiri, IBM Plex Mono, IBM Plex Sans Arabic, Inter, Lalezar, Marhey, Noto Kufi Arabic, Noto Naskh Arabic, Readex Pro, Reem Kufi, Source Serif 4, Tajawal.

## Bundled sounds (provenance ledger)

`Sound-Kits/cc0/` holds a small set of short recorded sounds. Every file is CC0 1.0 (public domain, no credit required) and none is music. `Sound-Kits/cc0/ledger.json` is the ledger: for each file it records where it came from, the source size and the SHA-256 of the file as shipped. A sound is added only with its ledger entry. All other sound effects are synthesized by `scripts/sfx.mjs`.

## Animated icons and emoji

Small curated files in `engine/public/stickers/`, played by `engine/src/core/lottie-icon.tsx`. The file lists, sizes and pinned source urls are in `third-party/icons/README.md` and `third-party/emoji/README.md`; each source keeps its license text in that folder.

| Component | License | Source |
|---|---|---|
| useAnimations animated icons | MIT. Text: [license](third-party/icons/LICENSE-useanimations) | https://github.com/useanimations/react-useanimations |
| Meteocons weather icons (Lottie, fill style) | MIT. Text: [license](third-party/icons/LICENSE-meteocons) | https://github.com/basmilius/meteocons |
| Google Noto Animated Emoji | CC BY 4.0. Credit: "Animated Noto Emoji by Google, licensed under CC BY 4.0." See [notice](third-party/emoji/NOTICE-noto-animated-emoji.md) | https://googlefonts.github.io/noto-emoji-animation/ |
| Microsoft Fluent Emoji (Color, SVG) | MIT. Text: [license](third-party/emoji/LICENSE-fluent-emoji) | https://github.com/microsoft/fluentui-emoji |

## Libraries and tools used by the engine

| Component | License | Source |
|---|---|---|
| Remotion (installed into engine/node_modules by npm ci) | Remotion License: free for individuals, non-profits and companies with up to 3 employees; larger companies need a Remotion company license | https://www.remotion.dev/license |
| MediaPipe Tasks Vision (@mediapipe/tasks-vision) | Apache-2.0 | https://github.com/google-ai-edge/mediapipe |
| Lucide React icons (lucide-react 1.48.0) | ISC; Feather-derived icons retain their MIT attribution. Full text: [Lucide license](third-party/lucide/LICENSE) | https://lucide.dev/license |
| whisper.cpp (downloaded during setup) | MIT | https://github.com/ggml-org/whisper.cpp |
| OpenAI Whisper model weights (downloaded during setup) | MIT | https://github.com/openai/whisper |
| Silero VAD v6.2.0 model, ggml conversion (downloaded during setup) | MIT | https://github.com/snakers4/silero-vad |
| Other npm packages in engine/node_modules | Each package's own license file | https://www.npmjs.com |

## Optional word alignment

`node scripts/align-captions.mjs install` installs a project-local CPU alignment runtime only when requested. Its packages and model weights retain their own licenses; the alignment runner and installation code in this repository are Reel Studio code. The model repository and revision are recorded in `scripts/lib/alignment-contract.mjs`.

| Component | License | Source |
|---|---|---|
| WhisperX 3.8.6 | BSD-2-Clause | https://github.com/m-bain/whisperX |
| PyTorch and torchaudio CPU packages | Their BSD-style licenses and bundled third-party notices | https://github.com/pytorch/pytorch and https://github.com/pytorch/audio |
| Hugging Face Transformers | Apache-2.0 | https://github.com/huggingface/transformers |
| Arabic wav2vec2 alignment model | Apache-2.0 | https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-arabic |
| English wav2vec2 alignment model | Apache-2.0 | https://huggingface.co/facebook/wav2vec2-base-960h |

## Adapted motion components

Adapted source lives under `engine/src/motion-library/`; pinned upstream revisions, checksums and full license texts are in `third-party/motion-kits/`.

- av/remotion-bits @ `6c71169aa061` — MIT — StaggeredMotion, AnimatedCounter
- riaz37/remotion-ui @ `c0729bd638a1` — MIT — MaskedSlideReveal, PathDraw, SimulatedCursor
