# Techniques

Use `EDITORIAL.md` to design the explanation, `MOTION-CHOICES.md` to select a supported mechanism, and `VISUAL-REVIEW.md` to review the result. This guide describes runtime capabilities; `technique-catalog.json` is the technical inventory.

- **Authored graphics** (`scripts/editor.mjs graphics`): a validated source-free specification creates a generated silent base and a normal editable manifest. No fabricated transcript; see `GRAPHICS.md`.
- **Motion concepts** (`engine/src/motion-concepts/`): all fifteen are normal takeover `motion-concept` scenes with their existing typed config and duration floors.
- **Recorded kinetic text and evidence comparison** (`engine/src/creative-kit/semantic/`): literal recorded word indices for emphasis; supplied image assets for before/after wipes.

- **Semantic scenes** (`engine/src/creative-kit/semantic/`): token lens, shared-scale meter, ticket offer, comment stack, chapter quote and route stops with local images. Authored reveals follow reviewed speech. Optional magazine covers use a supplied verified transparent PNG; no automatic masking.
- **Resumable render** (`scripts/lib/render-chunks.mjs`): bounded chunks, exact input/preset cache identity, decode/black checks and verified resume. Full renders choose this automatically when long or resource constrained.
- **Audio revision** (`scripts/render-audio.mjs`): sample-accurate placement, separate voice/music/effects gains, unchanged picture verification and final audio/encode gates.
- **Picture revision** (`scripts/render-segment.mjs`, `scripts/splice-segment.mjs`): rerender selected PreparedEdit frames, join the picture exactly, retain original audio and rerun delivery checks.
- **Podcast batches** (`scripts/podcast.mjs`): reviewed proposals, explicit selection, rebased late-source clips and sequential exports with verified media-aware resume.

- **Prepared edit** (`engine/src/prepared-edit/PreparedEdit.tsx`): one continuous source through authored cuts, captions, scenes, brand colours and sound. The director (`scripts/editor.mjs`) writes and checks its manifest.
- **Scene families** (`engine/src/creative-kit/scenes.tsx` and `engine/src/creative-kit/kinetic/`): hook, proof, three-step process, comparison, comment CTA, follow card, kinetic hook, image comparison, checklist, counter, screens, statement, outcome and data story.
- **Screen recordings** (`engine/src/screen-recording/`): the `screen-recording` family for a screen-recording source (camera keys, click ripples at the real pointer, pinned callouts); `screen-focus` (`engine/src/motion-library/`) for a separate capture inside a presenter video.
- **Curtain and image focus** (`engine/src/techniques/`): the full-to-split curtain move and image shrink/zoom/focus.
- **Brand colours** (`engine/src/core/brand.ts`): profile colours become readable per-scene palettes for split-canvas and section-deck; graphics only.
- **Endings** (`scripts/lib/endings.mjs`): the profile's CTA, follow card and recorded sign-off, per video, in a fixed order.
- **Source intake** (`scripts/intake.mjs`): HDR/HLG to BT.709 SDR, variable to constant frame rate, real motion rate by mpdecimate, delivery at 30 fps or more.
- **Privacy blur** (`scripts/redact.mjs`): blur or pixelate confirmed private regions of a screen recording into a new plate before anything previews it. The assistant proposes the regions from stills; the creator confirms them.
- **Cuts** (`scripts/auto-cut.mjs`): proposed silence, retake and filler cuts from reviewed words and audio; nothing at or after the recorded sign-off is cut. Proposals are reviewed, never applied blindly; approved `segments` go into the brief.
- **Sound** (`scripts/sfx.mjs`): synthesised, licence-clean effects placed on scene cues; mixed under the voice at render.
- **Voice clean-up** (`scripts/mix.mjs`): `node scripts/editor.mjs render ... --voice clean` (or `denoise`) cleans the dialogue inside the final mix.
- **Captions** (`scripts/export-captions.mjs`): reviewed word timing to SRT/ASS.
- **Face check** (`scripts/face-check.mjs`): MediaPipe BlazeFace short-range and full-range models, run locally; FAIL moves the video and checks again; frames without a face need the creator's review.
- **Delivery checks** (`scripts/render.mjs --deliver`, `scripts/motion-plan.mjs`): safe zones, presenter motion, face check, plate cadence and the Instagram encode contract.
- **Publish pack** (`scripts/caption-check.mjs`, `scripts/publish-pack.mjs`): TikTok and Instagram post descriptions checked against the profile, the video's keyword and the spoken words, so they tease the video instead of retelling it. How to write them: the `social-captions` skill.
- **Transcription** (`engine/tools/transcribe.mjs`): local Whisper.cpp drafts; needs its runtime and a model download on first use. Every transcript is a draft until reviewed.

An executable component is not proof that a given source or style choice looks right: review rendered stills and the final file with the creator.
