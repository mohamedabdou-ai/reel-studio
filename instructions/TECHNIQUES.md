# Techniques

What the runtime can do, where it lives, and its limits. `technique-catalog.json` is the same list as data.

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
- **Publish pack** (`scripts/publish-pack.mjs`): TikTok and Instagram captions checked against the profile and the video's keyword.
- **Transcription** (`engine/tools/transcribe.mjs`): local Whisper.cpp drafts; needs its runtime and a model download on first use. Every transcript is a draft until reviewed.

An executable component is not proof that a given source or style choice looks right: review rendered stills and the final file with the creator.
