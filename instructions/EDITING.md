# Editing workflow

Read `instructions/RULES.md` first. Run every command from the studio root. `<slug>` is a lowercase project id such as `ai-tools-01`; every output of one video lives in `Projects/<slug>/`. Work only on the files the creator names; never scan or change `Raw/`.

## Live editor throughout the session

The creator watches the edit being built. After intake and any approved privacy blur, transcribe, create a simple uncut draft with the saved preferences (captions still `draft`), and prepare its footage. Start `node scripts/review-editor.mjs Projects/<slug>/edit.json` as a long-running command and open its printed URL in the user's browser/panel; use `--open` if the host has no panel-opening tool. Do this before applying proposed cuts and before the first full rendered preview. Keep the server and tab open while editing and waiting for decisions; restart and reopen if the connection ends.

Update the same manifest in small, meaningful, approved batches. Write complete validated snapshots atomically; the editor follows their captions, scenes and timeline automatically. Cut changes need `node scripts/editor.mjs prepare Projects/<slug>/edit.json`; until that finishes the banner says the footage still has the previous cuts. Do not call that old preview current, or spend a complete render on each small edit. Retain the transcript, privacy, cut and delivery gates below. Ask the creator to finish/save manual edits before changing the same project; a pending update or stale save is a conflict to resolve, not permission to overwrite it.

## 1. Intake (measure first)

```
node scripts/intake.mjs --source Raw/<file> --id <slug>
```

It measures the real motion rate and, when needed, writes a constant-rate BT.709 SDR copy to `Projects/<slug>/source/` (iPhone HDR/HLG, variable-rate recordings, 60-tagged footage that really moves at 30, anything under 30 fps). From now on the record's `edit` path is the source. The edit, its graphics and the delivery all run at `deliveryFps`; the recording's own motion is `plateFps`, with every frame shown `repeat` times.

## 2. Privacy blur (screen recordings)

Screen recordings can show private information (emails, names, API keys, chats, notifications). Before any preview reads the recording, propose every region to hide, with its times, from temporary stills you extract to `state/tmp/` and delete afterwards (never `scripts/frames.mjs`, which caches frames). Only after the creator confirms the list, write `Projects/<slug>/redact.json` as `{"version":1,"rects":[{"x":0,"y":0,"width":200,"height":40,"fromSec":0,"toSec":3,"mode":"pixelize","label":"email"}]}` in source pixels and run:

```
node scripts/redact.mjs --in <source> --rects Projects/<slug>/redact.json --out Projects/<slug>/<name>-redacted.mp4
```

Use the redacted file as the source from then on. On `NEEDS-REVIEW`, look at its `.verify/` frames with the creator.

## 3. Transcript and cut proposals (gate 1)

```
node engine/tools/transcribe.mjs --media <source> --lang ar --out Projects/<slug>/transcript
node scripts/audio.mjs <source>
node scripts/auto-cut.mjs --captions Projects/<slug>/transcript/captions.json --wav <wav16k path printed by audio.mjs> --fps <deliveryFps> --out Projects/<slug>/rough-cut/auto-cut.json
```

The transcript is a draft: show it to the creator as numbered lines and fix it with them against the recording before it drives captions. The cut proposal only suggests silence, retake and filler cuts; show its table and cut nothing until they approve. It never cuts at or after the recorded sign-off in `PROFILE.json`; a `signoff-not-found` warning means that sign-off is not in these words, so it will be off for this video. At this gate also ask: "What is the comment keyword for this video?" (default: the profile's `ctaDefault`; "none" turns the CTA off for this video).

## 4. Brief

```
node scripts/profile.mjs brief --cta <keyword>
node scripts/profile.mjs brief --no-cta
```

`--no-cta` disables only the comment keyword for this video. The follow card is independent and keeps its saved setting unless the creator also turns it off for this video.

Paste **all** printed fields (`creator`, `preferences`, and `brand` when present) into `Projects/<slug>/brief.json` (version 1) with `id`, `source` (the intake `edit` or redacted path), `transcript`, `purpose`, `tone`, `sourceKind` (`"screen"` for a screen recording), `captionsReviewedBy`, `endAtSec`, the approved `segments` copied unchanged from `auto-cut.json`, and authored `beats`. Omit `style` unless the creator requests a one-video override; saved fixed style or the automatic recommendation chooses it. Explicit `style`, `fontFamily`, `captionsGrouping`, `captionsPresentation`, `writingStyle` override this video without changing PROFILE.json. `captionsMode` still means transcript input (`words`/`phrases`), not grouping. Open `node scripts/studio.mjs settings` when the creator wants to change defaults. Beat times and `signoffFromSec` stay in source seconds; the director maps them onto the cut. Ending beats come last: `comment` with the keyword, then `follow` with the complete handle, each only when on. Beat copy must come from what the creator actually says.

## 5. Plan and preview (gate 2)

```
node scripts/editor.mjs recommend Projects/<slug>/brief.json
node scripts/editor.mjs plan Projects/<slug>/brief.json --replace
node scripts/editor.mjs render Projects/<slug>/edit.json
```

`plan` prints `notices`: a sign-off that is not in this recording is turned off for this video, and brand colours that had to be adjusted are named. Tell the creator each notice in one line. The plain `render` is the fast preview. Review stills with `node scripts/stills.mjs --comps PreparedEdit --props-file Projects/<slug>/prepared/props.json --at <word start seconds> --out Projects/<slug>/stills`.

### Keep reviewing in the open editor

The editor is already open. Keep using it for caption, scene, timing, cut, sound and camera changes before delivery. The creator can pause automatic following and fix things by hand; local edits and a focused field are never replaced automatically. A new disk version also blocks a stale save. If they choose to view the new version, preserve their manual draft first. Export still runs the same delivery checks. Guide: `instructions/REVIEW-EDITOR.md`.

## 6. Delivery

```
node scripts/editor.mjs plan Projects/<slug>/brief.json --deliver --replace
node scripts/face-check.mjs Projects/<slug>/edit.json --fix
node scripts/motion-plan.mjs Projects/<slug>/edit.json
node scripts/editor.mjs render Projects/<slug>/edit.json --deliver --motion-plan Projects/<slug>/motion-plan.json
```

- Face check: `PASS` or `EXEMPT` (screen recordings) continue. On `FAIL`, `--fix` already moved the video inside its window and checked again; if it still fails, change the named scene's layout or text, plan again and rerun the check. On `NEEDS-REVIEW` no face was found in some presenter frames: show the creator the listed stills and ask whether the face is clear of every graphic; only after they confirm, add `--face-reviewed-by "<their name>"` to the render. If its `envelopeErrors` say a face model is missing, run `node scripts/reframe.mjs install` and check again. Planning again rewrites `edit.json`, so rerun the face check after every plan.
- Motion: `motion-plan.mjs` measures the presenter window and marks takeover scenes, which cover the presenter, as graphics. Pass `--crop w:h:x:y` if the window does not show the presenter moving. A screen recording (`sourceKind` `"screen"`) has no presenter: skip `motion-plan.mjs` and render without `--motion-plan`.
- Add `--voice clean` (or `--voice denoise` for a noisy room) to clean the voice in the final mix.

The render refuses a delivery whose ending, safe zones, face check, motion or Instagram encode fails; fix the cause. It writes `Projects/<slug>/renders/edit-delivery.mp4`. Probe it with `node scripts/ig-check.mjs Projects/<slug>/renders/edit-delivery.mp4`, look at stills from it and listen to it, then copy it to `Outputs/<slug>/<slug>.mp4`.

## 7. Publish pack

First run `node scripts/profile.mjs writing --project <slug>`. Follow this video's resolved guide, including per-video overrides. `short`: maximum 450 characters, clear hook and one useful point; `educational`: useful explanation or practical points; `storytelling`: a short factual narrative. Keep platforms distinct. Changing defaults later must not silently change an already planned video's writing style.

Use the platforms printed by `writing` (the current PROFILE.json platform selection). Include a comment keyword only if its printed project CTA is non-null. A saved keyword does not override a video's `--no-cta`.

Write `Projects/<slug>/publish-copy.json`:

```json
{"title": "<hook>",
 "tiktok": {"caption": "<hook and benefit in the resolved writing style; keyword only when CTA is on>", "hashtags": ["#<topic>", "#<topic>"]},
 "instagram": {"caption": "<distinct useful context in the same writing style; CTA only when on>", "hashtags": ["#<topic>"]},
 "notes": ["<what the copy deliberately does not promise>"]}
```

Include only the platforms in `PROFILE.json`, put the main topic in the first line, keep every claim true to the video, and use 1 to 5 specific hashtags. Then run

```
node scripts/publish-pack.mjs --project <slug> --video Outputs/<slug>/<slug>.mp4
```

and show both captions to the creator.
