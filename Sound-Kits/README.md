# Reusable local sound recipes

`catalog.json` describes the twenty deterministic sounds from `scripts/sfx.mjs` and twenty-five reusable recipes. These are synthesized locally at 48 kHz as stereo, 16-bit PCM WAV. They do not require samples, downloads, accounts or paid generation. The catalog also holds twenty-eight recorded CC0 recipes (`cc0-<id>`), one short file each, listed in [cc0/README.md](cc0/README.md) with their ledger.

```powershell
node scripts/sound-catalog.mjs list
node scripts/sound-catalog.mjs show paper-reveal
node scripts/sound-catalog.mjs render paper-reveal --out Projects/sound-preview/media/paper-reveal.wav --gain 0.8
```

`render` writes both the audition WAV and a sibling `paper-reveal.hits.json` containing the exact inputs used by the existing SFX pipeline. Output paths must stay in `Projects/<project>/`. It renders to a temporary WAV, checks the file, and then replaces the requested audition. An exclusive output lock prevents concurrent renders from overwriting each other.

| Recipe | Length | Suggested visual use |
| --- | --- | --- |
| `soft-transition` | 0.40 s | Quiet short join: a soft low landing on the frame the move settles |
| `paper-reveal` | 0.85 s | An editorial paper/card arrival |
| `ui-confirmation` | 0.90 s | A button click and confirmation |
| `counter-accent` | 0.70 s | Sparse counter steps |
| `highlight-swipe` | 0.14 s | A drawn highlight or underline settling: a small pop (the id is kept for old manifests) |
| `restrained-reveal` | 1.10 s | Brief anticipation before a reveal |
| `typing-burst` | 0.60 s | Text typed into a prompt box, search bar or comment field |
| `cursor-click` | 0.20 s | An on-screen cursor clicking a real product button |
| `directional-whoosh` | 0.30 s | A push, slide or pan: a soft low landing as the move settles (the id is kept for old manifests) |
| `count-tick` | 0.50 s | A rolling number: accelerating ticks and a light landing |
| `chapter-shift` | 0.40 s | A new section: one soft low landing on the cue frame |
| `sub-boom` | 0.62 s | Opening hit on frame 0 of an edit that starts on a Grid Glide scene (mono) |
| `sub-thump` | 1.25 s | A scene change: a 0.27 s swell before the cut and a body just after it (stereo) |
| `sub-thud` | 0.75 s | A soft landing or motion-matched cut, about 10 dB under the thump; its peak is 0.145 s in, so the Grid Glide swap cue starts it 0.13 s early (stereo) |
| `sub-swell-hit` | 0.34 s | A climax: a rising swell that stops abruptly at 0.31 s (stereo) |
| `ui-click` | 0.20 s | One damped interface tick for a pill: a chapter's tool or the follow card (mono) |
| `air-rise` | 1.50 s | Wind pulled toward the camera with a soft landing under its end; the next world arrives 0.85 s in, so the lead-in is 0.85 s (stereo) |
| `air-pass` | 0.90 s | A soft pass of air for a shape that morphs or a screen that swipes; the peak is about 0.55 s in (stereo) |
| `soft-pop` | 0.14 s | A tiny pop for a badge, a finished job or a chip that appears |
| `soft-transition-sweep` | 0.40 s | The earlier air sweep of `soft-transition`; only through `"sweeps": true` |
| `directional-whoosh-sweep` | 0.30 s | The earlier rising sweep; peak 0.077 s in; only through `"sweeps": true` |
| `chapter-shift-sweep` | 0.70 s | The earlier falling sweep settling on a landing; the sweep peaks 0.105 s in; only through `"sweeps": true` |
| `highlight-swipe-sweep` | 0.40 s | The earlier swipe behind a drawn highlight; only through `"sweeps": true` |
| `cartoon-flip` | 0.40 s | A soft pass of air for a cartoon ground flip through the circle reveal; peak about 0.2 s in; not a sweep voice (stereo) |
| `cartoon-stamp` | 0.50 s | One weighted impact for a cartoon stamp, a crossed-out block or a layer drop |

`typing-burst` and `cursor-click` use `keyTap` (options `dur`, `seed`, `fc`) and `mouseClick` (`dur`, `seed`, `fc`). The four `-sweep` twins are the only recipes built on the legacy sweep voices `whooshSoft`, `whooshShort` (`dur`, `seed`, `f0`, `f1`; `f0` below `f1` rises, above it falls) and `swipe`. All available voices are defined in `scripts/sfx.mjs`.

The two one-shot voices (`airRise`, `airPass`) take `dur`, `seed`, `lo` and `hi` (the filter sweep in Hz) and return stereo; they are filtered noise under a pink-noise body, seeded so they never change.

The five Grid Glide voices (`subBoom`, `subThump`, `subThud`, `subSwellHit`, `uiClick`) take no options: each is a fixed, deterministic sum of low sinusoidal partials (a damped ring plus a seeded noise tick for the click) whose parameter tables live in `scripts/lib/sfx-glide-tables.mjs`. They sit below the voice band, so use them through the `grid-glide` palette or the five recipes above rather than mixing them with the earlier voices. A voice may return stereo: `mixHits` mixes it per channel and treats `pan` as a balance, and it keeps the original pan rule for mono voices. `sound-catalog render` plays a recipe at full level, so turn the monitor down before auditioning `sub-boom`.

Use the chosen style and edit plan to decide whether and where a sound belongs. These descriptions are optional controls, not new style rules. Keep the creator's final spoken signature clean: no sting over the sign-off. Audition with the voice; a numerically small gain does not prove the effect will be unobtrusive.

**No sweeps by default.** Transitions land on a soft low landing (`soft-transition`, `directional-whoosh`, `chapter-shift`) or a small pop (`highlight-swipe`), or stay silent; no style palette names a sweep voice or a `-sweep` twin, and the palette validator refuses one. The four twins exist for a creator who explicitly asks for air sweeps: `"sweeps": true` beside the brief's `sound` (or beside `"sounds": "auto"` in a graphics specification) swaps each landing for its twin. The legacy voices `whoosh`, `whooshSoft`, `whooshShort` and `swipe` stay in `scripts/sfx.mjs` so old hits files render unchanged. Which effect, when and how loud: [SOUND.md](../instructions/SOUND.md).

To place a recipe in a longer timeline, copy its hits to your project's hits file and add the intended start time to each `t`. Times are seconds, so a frame position becomes `frame / fps`. Leave the deterministic `seed` values unchanged to reproduce the same texture, or change them deliberately. `gain` is linear amplitude; `pan` ranges from -1 to 1. The `opts` object exposes the existing synthesizer's duration, pitch/filter and seed options without adding another audio engine.

Generate the full-length stem with `scripts/sfx.mjs --hits <project-hits.json> --dur <video-seconds> --out <project-stem.wav>`, or use the validated `sfx` job adapter. Pass that stem as the existing render pipeline's `--sfx` input for mixing under the voice. The catalog auditions are not loudness-mastered final soundtracks; the delivery pipeline owns mixing and loudness QC.

See the [editing guide](../instructions/EDITING.md) for the project and delivery workflow.

## Event-driven placement

Sounds can land on the frames an edit's scenes already declare instead of only at each scene's first frame.

1. `scripts/lib/scene-cues.mjs`: `editCues(manifest)` (which reads `manifest.source.fps`) and `sceneCues(scene, fps = 30)` return `{frame, kind, sceneId}` cues on the edit timeline. Kinds, highest priority first: `transition`, `stamp`, `swap`, `click`, `count`, `reveal`, `type`.
2. `engine/src/styles/<id>/sound.json`: every registered style keeps its own palette beside its theme (the shared version, provenance and cue kinds are in `engine/src/styles/sound-palettes.json`). A palette has one entry per kind with `recipe` (or `null` when the references show no sound there), `gain` (the manifest event gain), `leadSec` (start early so the recipe's peak lands on the cue) and `confidence` / `basis` / `evidence` for the sound itself. `none` / `authored` means the style's references say nothing about that sound: show those entries at the Edit Plan gate.
3. `scripts/lib/sfx-events.mjs`: `planSfxEvents(cues, palette, {fps, signoffFromFrame, durationInFrames, maxPerSec})` returns manifest-ready `sounds` events plus one decision per cue; `buildSfxHits(...)` returns hits for `scripts/sfx.mjs --hits`; `loadStylePalettes()` assembles the style files into one validated object and `loadStylePalette(style)` returns one resolved palette.

| Scene | Cue |
| --- | --- |
| every scene except `one-shot` | its first frame -> `transition` (two cues of one kind on one frame are one cue) |
| `one-shot` | no scene-start cue; the take's own cues from its timeline: a swallow, circle or dive -> `transition`, a morph, pull back or swipe -> `swap`, a file landing -> `stamp`, a press -> `click`, typing -> `type`, a rolling figure -> `count`, a small arrival -> `reveal` |
| `cartoon` | no scene-start cue; from its word-anchored timeline: each ground flip -> `transition`, a card landing (0.05 s in) or a picked grid cell or a single shape -> `reveal`, a stamp, a crossed block or a layer drop -> `stamp`, a link cable, an arrow, a morph or rings -> `swap`, a typed code line or command -> `type`, the seconds counter stopping -> `count`; nothing at or after the sign-off tail. `sceneCues` needs the compiled words (`editCues` passes them) |
| `cartoon-ending` | its first frame (the reveal) -> `transition`; the comment and follow cards (0.1 s in) -> `reveal`; the follow tap -> `click` and `count`; nothing at or after the sign-off tail |
| `layered-speaker` | the big word's `atFrame` -> `reveal`, each hand-drawn mark's `atFrame` -> `swap`; words beside the head and the bar growing add no cue. The scene-start `transition` is silent in this style's palette: the speaker is already on screen |
| `kinetic-hook` | `swapFrame` -> `swap`, `stampFrame` -> `stamp` |
| `kinetic-text` | its first frame -> `type`; the scene-start `transition` sits on the same frame with a higher priority, so this `type` cue always loses (`density`) whenever the palette has a transition recipe |
| `compose` | each part entrance -> `reveal`; steps use each row's `offsetFrames`, lists use `i * (staggerFrames ?? 10)`; word anchors resolve through `resolveComposeAt` and compiled words. A frame-0 reveal is covered by the scene-start transition |
| `checklist` | `items[].atFrame` -> `reveal` |
| `count` | `rollFrame` -> `count`, `unitFrame` -> `reveal`, badge -> `stamp` (`badgeFrame`, else `unitFrame`) |
| `creator-cta` | `followFrame` -> `reveal`, `clickedFrame` -> `click` |
| `data-story` | `items[].atFrame` -> `count` |
| `message-board` | `gatherFrame` -> `reveal`, `focusFrame` -> `swap`, `closingFrame` (when set) -> `reveal` |
| `evidence-wipe` | `revealFrame` -> `swap` |
| `token-lens` | `groups[].atFrame` -> `reveal`, `lens.atFrame` -> `swap` |
| `verdict` | `rows[].atFrame` -> `count`, `verdictFrame` -> `stamp` |
| `claim-proof` | `receiptFrame` -> `reveal`, `totalFrame` -> `count`, `totalFrame + 36` -> `stamp` |
| `meter-receipt` | `rows[].atFrame` -> `count` |
| `ticket-offer` | `ticket.atFrame` -> `stamp` |
| `comment-stack` | `comments[].atFrame` -> `reveal` |
| `chapter-quote` | `quoteFrame` -> `reveal` |
| `route-stops` | `stops[].atFrame` -> `reveal` |
| `arabic-type` | by `move`: `letters-snap` -> `stamp` once the letters settle; `decrypt` -> `type` on its first frame and `reveal` when the last letter resolves; `pen-write`, `kufi-tiles` -> `type`; `dots-drop`, `kashida-stretch`, `video-in-letters` -> `reveal`; `word-melt` -> `swap`; `redacted-stamp` -> `reveal` per word and `stamp` when `stamp` is set; any other move -> `reveal` on its first frame |
| `figures` | `bars` -> `count` per bar, 0.12 s apart; other variants -> `count` on the first frame |
| `chat-thread` | each message -> `reveal` when it lands; the `typing` variant adds `type` when its dots start |
| `proof-screen` | `reveal` one second in |
| `map-route`, `map-focus` | no cue: geographic movement and city labels stay silent |
| `cutout-card` | `at` (default 10) -> `reveal` |
| `glide-chapter`, `glide-follow` | with a `pill`: `pillAt` (default `heroAt + 14.75 * fps / 30`) plus `5 * fps / 30` frames, rounded -> `click`; an explicit `pillAt` is in edit frames and is not scaled |
| `glide-chapter`, `glide-card`, `glide-lines`, `glide-comment`, `glide-follow` | an `enter` of kind `dip` -> `stamp` on the scene's first frame, in place of the `transition`; words, lines, boxes, bullets and media changes add no cue |
| `screens`, `screen-focus` | later steps -> `swap`; focus -> `reveal`; the focus click ring or explicit `cursor[].click` -> `click`; a `label` callout with text -> `type`, other callouts -> `reveal` |
| `screen-recording` | `clicks[].atFrame` -> `click`, `callouts[].atFrame` -> `reveal` |
| `manifest.transitions[]` | `atFrame` -> `transition` |

Fixed rules: at most one accent per 400 ms by default (`maxPerSec` 2.5, measured between cue frames; the higher-priority kind wins). No recipe may still sound at `signoffFromFrame`, so the recorded sign-off stays clean. A lead that would start before frame 0 drops that cue. Every drop is recorded with its reason: `no-sound-for-kind`, `before-start`, `signoff`, `edit-end` or `density`.

```js
import {editCues} from './scripts/lib/scene-cues.mjs';
import {loadStylePalette, planSfxEvents} from './scripts/lib/sfx-events.mjs';
const palette = await loadStylePalette(manifest.style);
const {events, decisions} = planSfxEvents(editCues(manifest), palette, {fps: manifest.source.fps, signoffFromFrame: manifest.signoffFromFrame});
```
