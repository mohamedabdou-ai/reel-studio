# Reusable local sound recipes

`catalog.json` describes the thirteen deterministic sounds from `scripts/sfx.mjs` and eleven reusable multi-hit recipes. These are synthesized locally at 48 kHz as stereo, 16-bit PCM WAV. They do not require samples, downloads, accounts or paid generation.

```powershell
node scripts/sound-catalog.mjs list
node scripts/sound-catalog.mjs show paper-reveal
node scripts/sound-catalog.mjs render paper-reveal --out Projects/sound-preview/media/paper-reveal.wav --gain 0.8
```

`render` writes both the audition WAV and a sibling `paper-reveal.hits.json` containing the exact inputs used by the existing SFX pipeline. Output paths must stay in `Projects/<project>/`. It renders to a temporary WAV, checks the file, and then replaces the requested audition. An exclusive output lock prevents concurrent renders from overwriting each other.

| Recipe | Length | Suggested visual use |
| --- | --- | --- |
| `soft-transition` | 0.40 s | Quiet short join |
| `paper-reveal` | 0.85 s | An editorial paper/card arrival |
| `ui-confirmation` | 0.90 s | A button click and confirmation |
| `counter-accent` | 0.70 s | Sparse counter steps |
| `highlight-swipe` | 0.40 s | A line or highlighter drawing across the frame |
| `restrained-reveal` | 1.10 s | Brief anticipation before a reveal |
| `typing-burst` | 0.60 s | Text typed into a prompt box, search bar or comment field |
| `cursor-click` | 0.20 s | An on-screen cursor clicking a real product button |
| `directional-whoosh` | 0.30 s | A push, slide or cut; the sweep peaks 0.077 s after its start |
| `count-tick` | 0.50 s | A rolling number: accelerating ticks and a light landing |
| `chapter-shift` | 0.70 s | A new section: a falling sweep that settles on a soft landing |

The last five recipes use `keyTap` (options `dur`, `seed`, `fc`), `mouseClick` (`dur`, `seed`, `fc`) and `whooshShort` (`dur`, `seed`, `f0`, `f1`; `f0` below `f1` rises, above it falls). All available voices are defined in `scripts/sfx.mjs`.

Use the chosen style and edit plan to decide whether and where a sound belongs. These descriptions are optional controls, not new style rules. Keep the creator's final spoken signature clean: no sting over the sign-off. Audition with the voice; a numerically small gain does not prove the effect will be unobtrusive.

To place a recipe in a longer timeline, copy its hits to your project's hits file and add the intended start time to each `t`. Times are seconds, so a frame position becomes `frame / fps`. Leave the deterministic `seed` values unchanged to reproduce the same texture, or change them deliberately. `gain` is linear amplitude; `pan` ranges from -1 to 1. The `opts` object exposes the existing synthesizer's duration, pitch/filter and seed options without adding another audio engine.

Generate the full-length stem with `scripts/sfx.mjs --hits <project-hits.json> --dur <video-seconds> --out <project-stem.wav>`, or use the validated `sfx` job adapter. Pass that stem as the existing render pipeline's `--sfx` input for mixing under the voice. The catalog auditions are not loudness-mastered final soundtracks; the delivery pipeline owns mixing and loudness QC.

See the [editing guide](../instructions/EDITING.md) for the project and delivery workflow.

## Event-driven placement

Sounds can land on the frames an edit's scenes already declare instead of only at each scene's first frame.

1. `scripts/lib/scene-cues.mjs`: `editCues(manifest)` and `sceneCues(scene)` return `{frame, kind, sceneId}` cues on the edit timeline. Kinds, highest priority first: `transition`, `stamp`, `swap`, `click`, `count`, `reveal`, `type`.
2. `style-palettes.json`: for every registered style, one entry per kind with `recipe` (or `null` when the references show no sound there), `gain` (the manifest event gain), `leadSec` (start early so the recipe's peak lands on the cue) and `confidence` / `basis` / `evidence` for the sound itself. `none` / `authored` means the style's references say nothing about that sound: show those entries at the Edit Plan gate.
3. `scripts/lib/sfx-events.mjs`: `planSfxEvents(cues, palette, {fps, signoffFromFrame, durationInFrames, maxPerSec})` returns manifest-ready `sounds` events plus one decision per cue; `buildSfxHits(...)` returns hits for `scripts/sfx.mjs --hits`; `loadStylePalette(style)` reads and validates the palette.

| Scene | Cue |
| --- | --- |
| every scene | its first frame -> `transition` |
| `kinetic-hook` | `swapFrame` -> `swap`, `stampFrame` -> `stamp` |
| `checklist` | `items[].atFrame` -> `reveal` |
| `count` | `rollFrame` -> `count`, `unitFrame` -> `reveal`, badge -> `stamp` |
| `creator-cta` | `followFrame` -> `reveal`, `clickedFrame` -> `click` |
| `data-story` | `items[].atFrame` -> `count` |
| `screens`, `screen-focus` | later steps -> `swap`; focus -> `reveal`; the focus click ring or explicit `cursor[].click` -> `click`; a `label` callout with text -> `type`, other callouts -> `reveal` |
| `manifest.transitions[]` | `atFrame` -> `transition` |

Fixed rules: at most one accent per 400 ms by default (`maxPerSec` 2.5, measured between cue frames; the higher-priority kind wins). No recipe may still sound at `signoffFromFrame`, so the recorded sign-off stays clean. A lead that would start before frame 0 drops that cue. Every drop is recorded with its reason: `no-sound-for-kind`, `before-start`, `signoff`, `edit-end` or `density`.

```js
import {editCues} from './scripts/lib/scene-cues.mjs';
import {loadStylePalette, planSfxEvents} from './scripts/lib/sfx-events.mjs';
const palette = await loadStylePalette(manifest.style);
const {events, decisions} = planSfxEvents(editCues(manifest), palette, {fps: manifest.source.fps, signoffFromFrame: manifest.signoffFromFrame});
```
