# Editing workflow

Read `instructions/RULES.md` first. Run every command from the studio root. `<slug>` is a lowercase project id such as `ai-tools-01`; every output of one video lives in `Projects/<slug>/`. Work only on the files the creator names; never scan or change `Raw/`.

This guide is for named recordings. For an animation with no recording, use `instructions/GRAPHICS.md` instead; do not invent a transcript. Read `instructions/EDITORIAL.md` and write the short scene plan before choosing effects. Several clips use `instructions/PODCAST.md`; audio/picture revisions use `instructions/PRODUCTION.md`. `instructions/MOTION-CHOICES.md` and the actual schemas describe supported families and layouts. Keep explicit preferences, approved scope and manual manifests.

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

The transcript is a draft: correct clear ASR errors against the recording, show numbered lines and resolve uncertain wording before using it as reviewed subtitles. Preserve an already reviewed transcript; do not make the creator approve it again. The cut proposal only suggests silence, retake and filler cuts; show its table and apply only approved changes. Keep existing approved source selections. It never cuts at or after the recorded sign-off in `PROFILE.json`; a `signoff-not-found` warning means that sign-off is not in these words, so it will be off for this video. Resolve this video's CTA only when it applies and has not been settled (default: the profile's `ctaDefault`; "none" turns it off). Do not add a comment keyword or stock sign-off to a source that does not establish one.

## 4. Brief

If the named recording already has burned-in subtitles, set `captionsVisible: false` in this video's brief before planning the first draft. It maps to `captions.visible: false` in the manifest and hides only the generated subtitle overlay; retain the complete reviewed transcript and its word timing for cuts and `kinetic-text`. Do not empty the transcript or change `PROFILE.json`. The live captions panel has the same visibility choice. Review the actual crop/output to confirm the original burned text stays readable and no second subtitle stream is drawn.

```
node scripts/profile.mjs brief --cta <keyword>
node scripts/profile.mjs brief --no-cta
```

`--no-cta` disables only the comment keyword for this video. The follow card is independent and keeps its saved setting unless the creator also turns it off for this video.

Paste **all** printed fields (`creator`, `preferences`, and `brand` when present) into `Projects/<slug>/brief.json` (version 1) with `id`, `source` (the intake `edit` or redacted path), `transcript`, `purpose`, `tone`, `sourceKind` (`"screen"` for a screen recording), `captionsReviewedBy`, `endAtSec`, the approved `segments` copied unchanged from `auto-cut.json`, and authored `beats`. Omit `style` unless the creator requests a one-video override; saved fixed style or the automatic recommendation chooses it. Explicit `style`, `fontFamily`, `captionsGrouping`, `captionsPresentation`, `writingStyle` override this video without changing PROFILE.json. `captionsMode` still means transcript input (`words`/`phrases`), not grouping. Open `node scripts/studio.mjs settings` when the creator wants to change defaults. Beat times and `signoffFromSec` stay in source seconds; the director maps them onto the cut. Ending beats come last: `comment` with the keyword, then `follow` with the complete handle, each only when on. Literal subtitles and `kinetic-text` retain reviewed spoken words. Other beat labels may faithfully summarize/explain them or use reviewed cited evidence; identify illustrative examples. Author the visual action and cue/hold using `EDITORIAL_PLAN.md`, not a sequence of interchangeable cards.

## 5. Plan and preview (creative review)

```
node scripts/editor.mjs recommend Projects/<slug>/brief.json
node scripts/editor.mjs plan Projects/<slug>/brief.json --replace
node scripts/editor.mjs render Projects/<slug>/edit.json
```

Keep the agreed scope: a request to finish after plan/preview approval authorizes the remaining production work without repeating the same gate. Use `instructions/VISUAL-REVIEW.md` to review the difficult passage and complete arc; technical success is separate from creative acceptance.

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

Write the post description with the `social-captions` skill (`.claude/skills/social-captions/SKILL.md`; Codex: `.agents/skills/social-captions/SKILL.md`). It is the only guide for `publish-copy.json`, its dialect, `scripts/caption-check.mjs` and `scripts/publish-pack.mjs`. The on-screen captions in the steps above are a different thing.
