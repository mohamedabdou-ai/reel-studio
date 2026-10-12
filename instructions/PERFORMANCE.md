# Recorded performance controls

Use reviewed recorded words and the named source. These controls preserve dialogue, word order, source speed and the recorded ending. Camera proposals, measured head geometry and model timing are technical evidence; review the actual presenter and sound before creative acceptance.

## Word and waveform emphasis

Extract the full source to 16 kHz mono PCM with `node scripts/audio.mjs <source>`. Use the printed WAV path and the same source fps:

```text
node scripts/emphasis.mjs --captions Projects/<slug>/transcript/captions.json --reviewed-by Creator --wav <full-source-wav> --fps <source-fps> --out Projects/<slug>/emphasis.json
```

The offline scorer compares each reviewed word's volume with its neighbours and the speech median; recorded numbers, product names and a supplied `--cta <keyword>` can strengthen a proposal. It limits camera scale to 1.03–1.07 and leaves at least 3–5 seconds between punches (`--min-gap`, default 4). It never writes words, cuts or camera into the manifest automatically.

Supply `--signoff "<literal recorded ending>"` or `--signoff-sec <source-seconds>` only when that ending exists in this video. Without either flag, proposals stop before the measured audio end; no stock goodbye or creator identity is assumed. A supplied phrase that is absent fails clearly. Keep the applicable sign-off in the normal creator/brief fields too.

With no usable head envelope, proposals have `anchor:null` and `status:"NEEDS-REVIEW"`. A measured envelope can be supplied with `--envelope <head-envelope.json> --source <named-source>`; source hash and fps must match. Missing/low-confidence samples still require review. Inspect the proposed moves, resolve head framing and delete unwanted proposals. Only after review, keep the chosen proposals with `status:"proposed"` and add `emphasisFile` plus `emphasisApprovedBy` to this video's brief. The planner checks the reviewed word's source frame and rebases each punch through approved cuts; removed words, moves crossing a cut, and moves crossing the sign-off/edit end are rejected.

## Picture in picture

An explicit `footage.pip` uses the existing renderer and schema. Supply `x`, `y`, `width`, `height`, `radius`, a source-aspect-preserving `plate:{left,top,width,height}`, and `sceneIds` naming takeover scenes. Keep the measured head inside the rounded window. PiP is supported by split-canvas, kinetic-paper, calligraphic-receipts, paper-collage, judgment-board and stepped-editorial; other styles retain their split presenter window.

The normal planner/preparation/editor preserve this geometry. The schema checks bounds, source aspect, takeover scene IDs and the caption band; source/hash checks still run. The head gate follows the retained source frame and maps the actual PiP window, including horizontal and rounded clipping. Use a top corner, leave room for platform controls and review the real result. For a PiP failure, revise its plate/window geometry and rerun the gate.

## Optional forced alignment after text review

The normal Whisper.cpp transcription remains a draft with estimated token timing. This separate, optional CPU backend aligns already reviewed text to audio with WhisperX's language-specific wav2vec2 CTC model. It never invokes ASR, translates text, repairs words, interpolates unresolved timing or edits the manifest. Arabic (`ar`, default) and English (`en`) have pinned public Apache-2.0 model revisions.

```text
node scripts/align-captions.mjs --help
node scripts/align-captions.mjs inspect --language ar
node scripts/align-captions.mjs install --language ar
node scripts/align-captions.mjs run --edit Projects/<slug>/edit.json --out Projects/<slug>/alignment --language ar
```

Install is explicit. It needs an existing Python 3.10–3.13 (`--python <executable>` can select it), creates a separate venv under `Tools/alignment`, and downloads CPU PyTorch 2.8, WhisperX 3.8.6, alignment dependencies, sentence-tokenizer data and the pinned language model. Packages, model files, caches, temporary files and diagnostics stay in this installation. No account token is needed. Normal setup, preparation and rendering do not install or import this backend. Allow disk space for these large optional packages/model files; use `inspect` for readiness before a run.

Use complete reviewed phrase envelopes in source milliseconds, ordered and non-overlapping. A selected `--start-ms`/`--duration-ms` range processes only complete phrases inside it. A run verifies the original source hash and uses local model/tokenizer files offline. Cache identity includes source bytes, reviewed text/timing, model revision/files, runtime implementation, language, range and confidence threshold. Changed output bytes invalidate the cache.

Outputs are `alignment-draft.json`, `diagnostics.json`, `whisperx-raw.json` and `alignment-cache.json`. Coverage reports resolved, unresolved, low-confidence and mixed-English words. Every canonical token remains present; unresolved timestamps remain `null`, with reasons. English tokens within Arabic require listening review even when timed. Compare each proposed boundary against the source, resolve missing timings, then explicitly copy the reviewed timing into the project as draft captions and review them again before delivery. Alignment coverage does not approve the copy, speech or creative result.

Official backend contracts: [WhisperX alignment-only API](https://github.com/m-bain/whisperX/blob/3ccc17b8de34f305300f8a3fd3c9f76ba820c0d0/whisperx/alignment.py), [pinned package](https://pypi.org/project/whisperx/3.8.6/), [Arabic model](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-arabic), [English model](https://huggingface.co/facebook/wav2vec2-base-960h).
