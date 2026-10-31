# Editing workflow

Read `instructions/RULES.md` first. Run every command from the studio root. `<slug>` is a lowercase project id such as `ai-tools-01`; every output of one video lives in `Projects/<slug>/`. Work only on the files the creator names; never scan the contents of `Raw/` or change a file there. If the creator attached or dropped one video without naming it, name the file you found (the attachment, or the newest file name in `Raw/`; names only) and ask «ده الفيديو؟» before intake; copy an attachment into `Raw/` under a new name, never over an existing file.

This guide is for named recordings. For an animation with no recording, use `instructions/GRAPHICS.md` instead; do not invent a transcript. Read `instructions/EDITORIAL.md` and write the short scene plan before choosing effects. Several clips use `instructions/PODCAST.md`; audio/picture revisions use `instructions/PRODUCTION.md`. `instructions/MOTION-CHOICES.md` and the actual schemas describe supported families and layouts. Keep explicit preferences, approved scope and manual manifests.

## Live editor throughout the session

When a beat needs an authored visual beyond shipped families, use [PROJECT-SCENES.md](PROJECT-SCENES.md) inside the same project. For reviewed word/audio emphasis, presenter PiP or optional post-review forced alignment, use [PERFORMANCE.md](PERFORMANCE.md). Keep source timing, actual face clearance, manual drafts and applicable delivery checks; a performance proposal is not creative approval.

The creator watches the edit being built. After intake and any approved privacy blur, transcribe and run the cut proposal (step 3), then create the first draft with the saved preferences (captions still `draft`): its `segments` are the proposal's `silenceSegments`, so the long pauses are already cut the way step 3 sets for this kind of video and every recorded word stays (unless the creator asked to see or approve the cuts first). Prepare its footage. Start `node scripts/review-editor.mjs Projects/<slug>/edit.json` as a long-running command and open its printed URL in the user's browser/panel; use `--open` if the host has no panel-opening tool. Do this before applying proposed cuts and before the first full rendered preview. Keep the server and tab open while editing and waiting for decisions; restart and reopen if the connection ends.

Update the same manifest in small, meaningful, approved batches. Write complete validated snapshots atomically; the editor follows their captions, scenes and timeline automatically. Cut changes need `node scripts/editor.mjs prepare Projects/<slug>/edit.json`; until that finishes the banner says the footage still has the previous cuts. Do not call that old preview current, or spend a complete render on each small edit. Retain the transcript, privacy, cut and delivery gates below. Ask the creator to finish/save manual edits before changing the same project; a pending update or stale save is a conflict to resolve, not permission to overwrite it.

**Changing one thing in an open edit.** (1) Ask the creator to save what is in hand («احفظ اللي في إيدك الأول») and wait for yes: you cannot see unsaved browser edits. (2) This video's font, caption grouping or shape, and digits change safely in the editor's «المظهر» tab, with History and undo: ask the creator to pick there, or change the brief and run `plan --replace --keep-captions` only when nothing but captions was edited. (3) For any other field, ask the creator to change it in the editor's form, or ask before using `--discard-edits`. (4) Never edit `edit.json` with a text tool while the editor runs.

## 1. Intake (measure first)

```
node scripts/intake.mjs --source Raw/<file> --id <slug>
```

It measures the real motion rate and, when needed, writes a constant-rate BT.709 SDR copy to `Projects/<slug>/source/` (iPhone HDR/HLG, variable-rate recordings, 60-tagged footage that really moves at 30, anything under 30 fps). From now on the record's `edit` path is the source. The edit, its graphics and the delivery all run at `deliveryFps`; the recording's own motion is `plateFps`, with every frame shown `repeat` times.

### Named B-roll clips

When the creator names clip files to show while they speak, bring each one in once and use it by its clip record. The creator names the files; never search folders for footage.

```
node scripts/clips.mjs add --project Projects/<slug> --file Raw/<clip file> --label "<what it shows>" --licence "<usage statement>" [--credit "<attribution>"] [--from <sec> --to <sec>]
node scripts/clips.mjs list --project Projects/<slug>
```

The command keeps one second of handle on each side of the requested window, converts HDR to SDR and any frame rate to the project's `deliveryFps`, removes the sound, never scales up, stages the clip under `engine/public/projects/<slug>/clips/`, and records it in `Projects/<slug>/clips.json` and the asset ledger `assets.json`. The original file is never touched. A project without a recording (a graphics project) passes `--fps` with the graphics spec's rate. A file longer than 60 s needs `--from` and `--to`. State the usage honestly (`creator-supplied (own footage)`, `CC0`, a stock licence the creator holds); a clip whose right is unclear is not used. Run the intake yourself as the manager: the assets worker does not (`instructions/agents/assets.md`).

Adding the same file and window again returns the same clip. To correct the stored text, run `add` again with the same file and window and with `--label` and `--licence` given again (every run needs both); a new `--credit` replaces the stored one, but a credit can be corrected, not cleared. When a clip record has a `credit`, add that line, as registered, to `credits` in `Projects/<slug>/publish-copy.json` when you write the post description (the `social-captions` skill; at most 12 lines of 1000 characters), so `PUBLISH_PACK.md` prints it ready to paste; never write a credit the record does not hold. A long HDR window (a minute of 4K HLG or PQ footage) can take several minutes to convert, so run the intake in the background or with a long timeout; if a run is killed it leaves `Projects/<slug>/clips.lock`, which the studio never removes by itself: delete that one file once you have confirmed that no intake is still running.

Place a clip as a `screens` beat with `look: "broll"`: full screen, or split (clip above the presenter), or a takeover scene named in `footage.pip.sceneIds` when the style shows the presenter window. The placement rules are in [EDITORIAL.md](EDITORIAL.md) and [MOTION-CHOICES.md](MOTION-CHOICES.md); inside a project scene use a `clip` field ([PROJECT-SCENES.md](PROJECT-SCENES.md)).

When you write a B-roll step yourself, copy `src`, `sha256`, `width` and `height` from the clip record and set `trimBeforeFrame` to the record's `inFrame` (the frames before it are the handle, so leaving it at 0 starts up to a second before the requested moment); a step can play at most the record's `frames` minus `trimBeforeFrame` frames of the file. The live editor does both when the creator picks a clip. The step's on-screen `label` is a separate field of at most 60 characters; the `--label` given at registration is only for the list and may be up to 80. A B-roll scene named in `footage.pip.sceneIds` carries no `label`: the presenter window covers the label's corner, and the manifest refuses the pair (remove the label, or take the scene out of `sceneIds`).

## 2. Privacy blur (screen recordings)

Screen recordings can show private information (emails, names, API keys, chats, notifications). Before any preview reads the recording, extract temporary stills to `state/tmp/` (never `scripts/frames.mjs`, which caches frames): one every 2 seconds plus one at each scene change that `node scripts/scenes.mjs <source>` lists; delete them afterwards. Draw each region you propose to hide on its still (for example `ffmpeg -i <still> -vf "drawbox=x=<x>:y=<y>:w=<w>:h=<h>:color=red:t=4" <marked still>`) and show the creator the marked images with their times. Add one line for anything private you read in the transcript («بتقول الإيميل بصوتك عند 1:20»): a blur hides pixels, not speech or subtitles, so ask whether to cut that phrase. Only after the creator confirms the list, write `Projects/<slug>/redact.json` as `{"version":1,"rects":[{"x":0,"y":0,"width":200,"height":40,"fromSec":0,"toSec":3,"mode":"pixelize","label":"email"}]}` in source pixels and run:

```
node scripts/redact.mjs --in <source> --rects Projects/<slug>/redact.json --out Projects/<slug>/<name>-redacted.mp4
```

Use the redacted file as the source from then on. After `redact.mjs`, show the creator three stills of each blurred window taken from the redacted file and wait for «تمام» before transcribing or editing from it; on `NEEDS-REVIEW`, look at its `.verify/` frames with the creator. Take click times and positions for screen-recording effects only from frames where the cursor visibly presses; otherwise leave the click out.

## 3. Transcript and cut proposals (gate 1)

```
node engine/tools/transcribe.mjs --media <source> --lang ar --out Projects/<slug>/transcript
node scripts/audio.mjs <source>
node scripts/auto-cut.mjs --captions Projects/<slug>/transcript/captions.json --wav <wav16k path printed by audio.mjs> --fps <deliveryFps> --out Projects/<slug>/rough-cut/auto-cut.json
```

In a staffed edit the analysis worker (`instructions/agents/analysis.md`) runs these three commands and returns the cut table with its original row IDs and the uncertain words as questions; the manager shows them to the creator and approves the cut.

The transcript is a draft: correct clear ASR errors against the recording, show numbered lines and resolve uncertain wording before using it as reviewed subtitles. Preserve an already reviewed transcript; do not make the creator approve it again.

**Pauses follow the kind of video.** A silence cut removes silence only, never a word. For tips, tutorials, explainers and comparisons, run `auto-cut.mjs` with its defaults; the first draft uses its `silenceSegments`, and you tell the creator in one line («شلت السكتات الطويلة، تقدر ترجّعها من القص»). For a story, an opinion, a joke or any request for a natural or calm feel, add `--gap 1.2 --pad 250,400` (only pauses over 1.2 s are shortened and each keeps about 0.65 s), list those pauses with their time and length, and ask once which are deliberate; run it again with `--protect "<from>-<to>"` (source seconds, comma-separated ranges) for every pause the creator wants kept. Never shorten the pause right before a punchline or after an emotional sentence without asking. If the creator asked to see or approve the cuts first, show the whole table, silence rows included, before the first draft uses any of them.

Retakes and fillers remove recorded speech, so show only those rows in a table with their original 1-based removed-row IDs, retaining gaps left by silence rows, and ask once (all, none, or those original IDs). Do not renumber the filtered speech rows; pass the displayed original IDs unchanged to --approve. Then write the approved set with `node scripts/auto-cut.mjs --from Projects/<slug>/rough-cut/auto-cut.json --approve <numbers|all|none> --out Projects/<slug>/rough-cut/approved.json`; its `segments` always include the pauses. If the creator asks for no cut in this video, use no `segments` at all. Keep existing approved source selections. It never cuts at or after the recorded sign-off in `PROFILE.json`; a `signoff-not-found` warning means that sign-off is not in these words, so it will be off for this video.

**Comment card.** Resolve this video's CTA only when it applies and has not been settled (default: the profile's `ctaDefault`; "none" turns it off). The card shows a public promise of what commenters receive, so use the keyword only when the creator has said what that is: if the recording does not say it, ask once «لو حد كتب {الكلمة} هيستلم إيه؟» and write their answer as the comment beat's `promise`; with no answer, use `profile.mjs brief --no-cta` for this video. Never write a `promise` yourself. The follow card's `message` is «تابعني لمحتوى أكثر» unless the creator gives other words. Never invent a keyword, a promise or a spoken sign-off that neither the profile nor the creator gave.

## 4. Brief

If the named recording already has burned-in subtitles, set `captionsVisible: false` in this video's brief before planning the first draft. It maps to `captions.visible: false` in the manifest and hides only the generated subtitle overlay; retain the complete reviewed transcript and its word timing for cuts and `kinetic-text`. Do not empty the transcript or change `PROFILE.json`. The live captions panel has the same visibility choice. Review the actual crop/output to confirm the original burned text stays readable and no second subtitle stream is drawn.

```
node scripts/profile.mjs brief --cta <keyword>
node scripts/profile.mjs brief --no-cta
```

`--no-cta` disables only the comment keyword for this video. The follow card is independent and keeps its saved setting unless the creator also turns it off for this video.

Paste **all** printed fields (`creator`, `preferences`, and `brand` when present) into `Projects/<slug>/brief.json` (version 1) with `id`, `source` (the intake `edit` or redacted path), `transcript`, `purpose`, `tone`, `sourceKind` (`"screen"` for a screen recording, `"cartoon"` for a cartoon video that never shows the recorded picture), `captionsReviewedBy`, `endAtSec`, the approved `segments` copied unchanged from `approved.json` (or `silenceSegments` for a draft), and authored `beats`. Pick `purpose` from the reviewed words: numbered steps → `tutorial`, two options side by side → `comparison`, a personal stance → `opinion`, one narrated event → `story`, a result with numbers → `case-study`, otherwise `explainer`. `tone` is `energetic`, `calm` or `editorial`: take it from the creator's words or the request; you cannot hear the delivery, so when neither says it, judge from the reviewed words, default to `calm`, and name the tone in your one-line style note so the creator can correct it. When the profile's style is automatic, choose the style yourself before writing the beats: read the "Best for" line in `STYLES.md` and the style's own fit rule (Grid Glide needs a real capture for each item, One Shot needs one object that travels; neither fits a plain talking head), write your choice as `style` in the brief and tell the creator in one plain line why («اخترت "خطوات منظمة" لأن الفيديو نصايح مترتبة»). When two styles fit equally, vary from the creator's recent videos: `recentStyles` lists the `style` of their earlier `Projects/*/edit.json`, newest first (skip `_doctor`). `editor.mjs recommend` is only a second opinion; never quote its points to the creator and never author a beat only to steer it. A saved fixed style or the creator's explicit choice always wins: then leave `style` out unless the creator asked for a one-video override. Sound: the brief's `sound` defaults to `"auto"`, which places the chosen style's own sound palette on real state changes; write `"sound": "none"` when the creator wants no effects, `"recipes"` only for the old one-cue-per-scene behaviour, and `"sweeps": true` only when the creator explicitly asks for air sweeps ([SOUND.md](SOUND.md)). Explicit `style`, `fontFamily`, `captionsGrouping`, `captionsPresentation`, `writingStyle` and `digits` (`latin` or `arabic-indic`; leave it out to keep every number as written) override this video without changing PROFILE.json. `captionsMode` still means transcript input (`words`/`phrases`), not grouping. Open `node scripts/studio.mjs settings` when the creator wants to change defaults. Beat times and `signoffFromSec` stay in source seconds; the director maps them onto the cut. Ending beats come last: `comment` with the keyword, then `follow` with the complete handle, each only when on. In the `grid-glide` style they are `glide-comment` (the keyword in `keyword`) and then `glide-follow` (the complete handle in `handle`), authored from the printed `creator.ending` and the profile handle. Literal subtitles and `kinetic-text` retain reviewed spoken words. Other beat labels may faithfully summarize/explain them or use reviewed cited evidence; identify illustrative examples. Author the visual action and cue/hold using `EDITORIAL_PLAN.md`, not a sequence of interchangeable cards.

For the `grid-glide` style a brief may also carry `watermark`: `false` leaves the faint bottom text out of every Grid Glide scene, a text of 1 to 40 characters replaces the profile handle, and omitting it uses the profile handle when the profile has one. A scene's own `data.watermark` always wins. The automatic watermark is filled into every Grid Glide scene except `glide-follow` (its hero already is the complete handle), so a follow scene shows a watermark only if you write one. Beat intents `glide-chapter`, `glide-card`, `glide-lines`, `glide-comment` and `glide-follow` select the style-owned scenes; see [styles/grid-glide.md](styles/grid-glide.md).

In a style with a design system (the style guide's `## Design system`), a beat that no approved family states exactly is a `compose` beat: `intent: "compose"`, `layout` `split` or `takeover`, and `data` with `arrangement` and `parts`. Anchor each part to its spoken word with `at: {"word": <index>}` (or `{"frame": n}` in graphics-only work); copy the worked examples' shape. After `prepare`, `Projects/<slug>/prepared/preparation.json` must list no `undrawnScenes`.

In the `cartoon` style the whole recording is one `cartoon` beat (acts, sentences, cards; the character comes from `preferences.character` or the generic default) followed by one `cartoon-ending` beat (the comment part when a keyword is on, the follow part when the follow card is on, and `tail.at` on the first word of the recorded sign-off when it is on). Set `sourceKind` to `"cartoon"`: the beats must cover the whole edit, and every time inside them is a word anchor on the reviewed words. Prepare builds the mouth table (`prepared/mouth.json`) from the recording. Read [styles/cartoon.md](styles/cartoon.md).

In the `layered-speaker` style a beat with intent `layered-speaker` puts one to four key words around the speaker (`words[]`, one per place: `behind`, `above`, `left`, `right`) and may draw one or two hand-drawn marks. The recorded picture stays on screen and the recorded captions stay with it. For the big word behind the head, cut the speaker out first with `node scripts/matte.mjs make` and attach it with `node scripts/matte.mjs attach` (see [the guide](styles/layered-speaker.md)); without a matte the big word sits above the head. Use it once or twice per video, on the moment that carries the point.

## 5. Plan and preview (creative review)

```
node scripts/editor.mjs recommend Projects/<slug>/brief.json
node scripts/editor.mjs plan Projects/<slug>/brief.json --replace
node scripts/editor.mjs render Projects/<slug>/edit.json
```

`recommend` is a second opinion on the style you chose: when its first `candidate` differs, read that style's "Best for" line and switch only if it fits the message better. Tell the creator your choice and its reason in one plain line, with one alternative; never quote points. A saved fixed style or an explicit one wins.

**Opening check (first 3 seconds).** After the first full preview, look at stills at 0, 1 and 2 s and the first reviewed words. The opening is weak when speech starts late, no words are on screen, nothing changes visually, or it opens with a greeting or filler instead of the idea. Then propose at most two alternatives built only from the creator's reviewed words, for example a title card over the first sentence with its strongest phrase, or starting from a stronger sentence. Moving or removing speech needs the creator's explicit yes. A strong opening needs no question.

Keep the agreed scope: a request to finish after plan/preview approval authorizes the remaining production work without repeating the same gate. Use `instructions/VISUAL-REVIEW.md` to review the difficult passage and complete arc; technical success is separate from creative acceptance.

`plan` prints `notices`: a sign-off that is not in this recording is turned off for this video, and brand colours that had to be adjusted are named. Tell the creator each notice in one line. The plain `render` is the fast preview. Review stills with `node scripts/stills.mjs --comps PreparedEdit --props-file Projects/<slug>/prepared/props.json --at <seconds> --out Projects/<slug>/stills`. `--at` takes seconds on the edited timeline: read word starts from `Projects/<slug>/prepared/captions.srt` (already edited timing), never from the transcript, whose times are source seconds.

### Keep reviewing in the open editor

The editor is already open. Keep using it for caption, scene, timing, cut, sound and camera changes before delivery. The creator can pause automatic following and fix things by hand; local edits and a focused field are never replaced automatically. `plan --replace` protects scenes, cuts, sounds, camera and footage geometry, including manual crop, layout and PiP. Use `promote` to deliver the current reviewed edit. `--keep-captions` preserves the current captions, their presentation and review metadata, but cannot authorize discarding changes in other sections; a historical plan without the necessary comparison record also refuses safely. `--discard-edits` is only for a rebuild the creator agreed to. Each content-changing replace or promote first saves the previous version to editor History; a no-op does not add a duplicate. A file saved while planning or a stale editor save cannot replace the newer version. Automatic face-fix geometry is protected too; do not remove it merely to make replanning pass. If the creator chooses to view a new disk version, preserve their manual draft first. Export still runs the same delivery checks. Guide: `instructions/REVIEW-EDITOR.md`.

## 6. Delivery

```
node scripts/editor.mjs promote Projects/<slug>/edit.json --reviewed-by "<the name the creator gave>"
node scripts/face-check.mjs Projects/<slug>/edit.json --fix
node scripts/motion-plan.mjs Projects/<slug>/edit.json
node scripts/editor.mjs render Projects/<slug>/edit.json --deliver --motion-plan Projects/<slug>/motion-plan.json
```

- Face check: `PASS` or `EXEMPT` (screen recordings) continue. On `FAIL`, `--fix` already moved the video inside its window and checked again; if it still fails, change the named scene's layout or text, plan again and rerun the check. On `NEEDS-REVIEW` no face was found in some presenter frames: show the creator the listed stills and ask whether the face is clear of every graphic; only after they confirm, add `--face-reviewed-by "<their name>"` to the render. If its `envelopeErrors` say a face model is missing, run `node scripts/reframe.mjs install` and check again. Planning again rewrites `edit.json`, so rerun the face check after every plan.
- Motion: `motion-plan.mjs` measures the presenter window and marks takeover scenes, which cover the presenter, as graphics. Pass `--crop w:h:x:y` if the window does not show the presenter moving. A screen recording (`sourceKind` `"screen"`) has no presenter: skip `motion-plan.mjs` and render without `--motion-plan`.
- Add `--voice clean` (or `--voice denoise` for a noisy room) to clean the voice in the final mix.

The render refuses a delivery whose ending, safe zones, face check, motion or Instagram encode fails; fix the cause. It writes `Projects/<slug>/renders/edit-delivery.mp4`. Probe it with `node scripts/ig-check.mjs Projects/<slug>/renders/edit-delivery.mp4` and look at the stills of your review plan. You cannot hear or play video: say so in one line, name the exact passage to play with sound in the open editor, and ask «شغّل من 0:12 لـ 0:30 بالصوت: الكلام واضح؟ المؤثرات مريحة؟ في حاجة تتغير؟». Log each comment with `node scripts/review.mjs add --project <slug> --media <file> --at <time> --text <note>`. Copy the file to `Outputs/<slug>/<slug>.mp4` only after the creator answers, and finish with four plain lines: what was done, what you only saw as stills, what you could not hear, and what you need from the creator. Use `promote` (above) for an edit that was reviewed or changed in the editor; use `plan --deliver --replace` only after a deliberate brief change. A second version of a delivered reel is a new project: write `Projects/<slug>-v2/brief.json` from the first brief (same `source` and `transcript`) with a new `id` and only the style, tone or beats the creator asked to change, and deliver it to `Outputs/<slug>-v2/`; never write into `Outputs/<slug>/` again. Copy the subtitles beside it: `Projects/<slug>/prepared/captions.srt` → `Outputs/<slug>/<slug>.srt` (edited timing, reviewed words). For a cover, extract one frame the creator picks: `ffmpeg -ss <seconds> -i Outputs/<slug>/<slug>.mp4 -frames:v 1 Outputs/<slug>/<slug>-cover.jpg`; keep the title inside the middle 3:4 area (the profile grid crops the top and bottom).

## 7. Publish pack

Write the post description with the `social-captions` skill (`.claude/skills/social-captions/SKILL.md`; Codex: `.agents/skills/social-captions/SKILL.md`). It is the only guide for `publish-copy.json`, its dialect, `scripts/caption-check.mjs` and `scripts/publish-pack.mjs`. The on-screen captions in the steps above are a different thing.
