# Authored motion graphics without a recording

Use this route when the creator asks for an animated explanation, map, title sequence or other motion video and has supplied no recording. The studio can create a silent generated base and run authored scenes through the normal editor. It does not need an uploaded source or a made-up transcript. Read [RULES.md](RULES.md), [EDITORIAL.md](EDITORIAL.md) and [MOTION-CHOICES.md](MOTION-CHOICES.md).

Use [STYLE-RECIPES.md](STYLE-RECIPES.md) to decide the visual grammar, [STYLE-LEARNING.md](STYLE-LEARNING.md) for named-reference evidence and its content-specific application, and [ASSET-PRODUCTION.md](ASSET-PRODUCTION.md) for any supporting media. An authored mechanism can use [PROJECT-SCENES.md](PROJECT-SCENES.md) with project-local React code, declared fields and the normal live preview/render/checks. Reference notes alone do not change scene behavior.

## Author and check the specification

Write `Projects/<slug>/graphics-spec.json` with `version: 1`, `id`, one of the eleven `style` ids, `fps` (30, 50 or 60), optional `durationInFrames`, and `scenes`. Scenes use the normal scene schema: `id`, `family`, `fromFrame`, `durationInFrames`, `layout: "takeover"`, `motion`, and `data`. They must cover the whole timeline without gaps or overlapping intervals. Plan readable final holds and meet each family's duration floor.

Copy review is independent of speech. Include `reviewedBy` naming the actual reviewer of the authored copy; graphics mode requires reviewed copy before initialization. Do not record an approval that did not occur. Optional `creator` and endings are authored explicitly; the default has no comment keyword, follow card or sign-off. Preserve only endings applicable to this request. Do not invent narration, pretend that generated silence is a recording, or use literal `kinetic-text` word indices without recorded words.

Start from the [complete illustrative example](examples/idea-to-results.json). Its review attribution concerns the bundled synthetic copy, not approval of a customer's video. It demonstrates messages gathering into a board and a selected result moving into focus; it is not a fixed recipe for every topic.

For scattered messages → one board → one selected result, use the optional `message-board` takeover family described in `MOTION-CHOICES.md`. It carries the same item IDs through gathering and focus with authored frame cues. The example demonstrates this continuous action across twenty seconds with no assets or invented speech. The existing fifteen `motion-concept` choices remain available for other ideas.

```powershell
node scripts/editor.mjs graphics Projects/<slug>/graphics-spec.json --check
node scripts/editor.mjs graphics Projects/<slug>/graphics-spec.json
node scripts/editor.mjs prepare Projects/<slug>/edit.json
node scripts/review-editor.mjs Projects/<slug>/edit.json
node scripts/editor.mjs render Projects/<slug>/edit.json
```

`--check` validates only and creates no media. The creation command writes a generated silent base, `edit.json` with `contentMode: "graphics"`, `presenter: false`, empty caption words, and an origin record. It never replaces an existing project. After creation edit the existing manifest, preserving manual changes; do not rerun initialization to overwrite it. Open the printed editor URL immediately, keep the server alive, and review meaningful small batches.

## Evidence, assets and geography

Use supplied or appropriately sourced assets and record their provenance in the project. Relative scene-image paths refer to files under `engine/public/`; keep generated project assets in their own untracked folder. A diagram may be illustrative; label it accordingly. Real numbers and places need reviewed sources.

For a request to highlight regions on a map, verify the map geometry, region names, islands/enclaves and label positions. Keep the same verified map through successive highlights so the viewer sees where each region belongs. `screens` takeover scenes can sequence supplied/generated annotated map images (`steps`, at most six per scene), with another scene for remaining regions and a final combined view. This is a supplied-asset route, not a built-in geographic database. A `route-stops` diagram alone does not establish region borders. Explain and resolve a missing factual asset rather than quietly substituting an inaccurate outline.

## Review and deliver

Use [VISUAL-REVIEW.md](VISUAL-REVIEW.md) for actual motion, readable holds, continuity and factual review. If the creator approved the plan and asked to finish, retain that scope rather than asking for the same approval at every stage.

Create the first project without `--deliver` and review its actual preview. After creative preview review, update the existing validated manifest to delivery purpose, retaining the reviewed copy/reviewer, then prepare again and render normally. `graphics --deliver` can initialize a new already approved project; it does not export a video or overwrite an existing draft.

```powershell
node scripts/editor.mjs render Projects/<slug>/edit.json --deliver
```

Graphics-only work has no presenter motion plan or head review. Applicable plate, layout, safe-zone, media and Instagram checks remain. Inspect the final MP4, copy the verified output into `Outputs/<slug>/`, and write its post descriptions with the social-captions skill. Publishing is a separate action.
