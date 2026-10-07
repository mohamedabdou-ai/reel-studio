# Motion concepts library

Fifteen graphics scenes for 1080x1920 reels, each built around one idea: a button
becomes a product window, bars become a trend line, or a dashboard highlights
one number. Source: [engine/src/motion-concepts](../../engine/src/motion-concepts).

These are reusable components and sample previews. They are not automatically
selected by the normal editing workflow or registered in the default Remotion
Studio. An advanced composition can mount them explicitly.

## Choose and preview

Run from the repository root after setup:

```powershell
node scripts/concept-stills.mjs --list
node scripts/concept-stills.mjs --list --query dashboard
node scripts/concept-stills.mjs --list --query ديمو --family morph
node scripts/concept-stills.mjs --concept kpi-zoom --style kinetic-paper --video
```

Listing uses the local catalog without bundling or opening a browser. Previews
use a separate entry point and write to `Projects/motion-concepts/stills/`.
`--video` produces a silent H.264 preview; omit it for still images. Preview the
scene with the video's actual copy before using it in a finished edit.

## Capabilities and limits

- Graphics only: the concepts do not mount or alter footage, or locate a
  presenter's face. Position and review graphics so they do not cover the
  presenter's face, hair or beard.
- Seven style directions through `getSceneTheme`: `split-canvas`,
  `section-deck`, `kinetic-paper`, `calligraphic-receipts`, `paper-collage`,
  `judgment-board` and `stepped-editorial`. Default: `kinetic-paper`.
- Arabic and mixed Arabic/Latin copy use fitted text and bidi isolation.
  Schemas limit copy length; text that cannot fit is rejected rather than clipped.
- Motion uses frame-based timing and seeded randomness.
- Layout targets the `ig-reels-organic` safe box. Concepts have no runtime
  safe-profile option. The optional caption uses the organic caption band;
  leave it unset for an ads composition and review the full layout separately.
- Demo data is labelled SAMPLE. Replace every demo number, name and claim
  with copy from the recording or a reviewed source.

| Mode | Behaviour |
| --- | --- |
| `once` (default) | Resolves to a frozen, readable hold of at least 20% of the sequence length. |
| `loop` | Returns to the opening state at the end of the sequence. |

## Inventory

Frames below are at 30 fps: `min` is the design floor and `default` is the
preview length. At another frame rate the floor scales by `fps / 30`, rounded
up. Character limits count code points; measured text fit is still required.
`?` means optional. Best use describes the scene's intent, not a measured result.

| id | What it does | Best use in a reel | min / default frames | Loop | Data fields |
|---|---|---|---|---|---|
| `button-to-window` | A call-to-action pill morphs into a product window with three interface rows and a slim progress bar. "One click becomes a live product demo." | The line where he tells the viewer to open or try something and the reel shows the product. | 150 / 240 (5 s / 8 s) | yes | `ctaLabel` 24, `productName` 30, `previewLines` 3 x 52, `productIcon`?, `progressLabel`? 34, `badge`? 10 |
| `prompt-to-results` | An instruction is typed into an input field and three result cards stagger out of it. "One instruction, multiple useful outputs." | "One prompt gives you A, B and C." | 90 / 240 | yes | `prompt` 90, `results` 3 x {`title` 32, `detail` 76} |
| `brief-to-workspace` | A small brief card unfolds into a five-panel workspace (one wide hero panel and a 2 x 2 grid). "A short brief unfolds into a complete plan." | "You give it a brief and it lays out the whole plan." | 90 / 240 | yes | `briefTitle` 48, `panels` 5 x {`label` 18, `detail` 40} |
| `department-tabs` | A tab strip with a sliding indicator; each tab lists two or three example lines for that department. "The same automation idea applied across every department." | The same idea shown for sales, marketing, support, finance. | 180 for 5 tabs / 240; the floor is 30 x tabs + 30 (120 for 3, 150 for 4) | yes | `tabs` 3 to 5 x {`label` 13, `examples` 2 to 3 lines x 56, no word over 24} |
| `data-morph` | Six bars grow, then morph into a line, with the final KPI and a result tag. "The same data, told as a trend." | A growth or trend statement backed by figures from the recording or a cited source. | 90 / 240 | yes | `metricLabel` 30, `values` 6 non-negative numbers in time order, `finalKpi` 14 (drawn verbatim), `resultLabel` 28, `unit`? 12 |
| `kpi-zoom` | A five-tile dashboard, then one tile zooms into a hero with a count-up. "Out of the whole dashboard, this is the number that matters." | "Out of all these numbers, this is the one to watch." | 90 / 240 | yes | `tiles` 5 x {`name` 24, `value` (two decimals at most), `change` in percent}, `focusIndex` 0 to 4, `unit`? 4 |
| `tool-stack-spread` | Five tool cards fan out from a stack into one view. "The whole stack, laid out in one glance." | "This is my stack": a five-item list where each item has a one-line job. | 90 / 240 | yes | `tools` 5 x {`name` 30, `function` 44, `icon`?} |
| `magnetic-dock` | A pointer sweeps a dock of six icons; each magnifies in turn and is named in a pill. "Meet the tools, one by one." | Introducing six tools one after another at the pace of speech. | 210 / 240 (7 s / 8 s, little slack) | yes | `tools` 6 x {`name` 18, `icon`?} |
| `keyword-reveal` | A hero word appears as an outline and fills with colour, with a subheadline under it. "The launch word, filling with meaning." | The one keyword of the reel, such as a launch word, as a title beat. | 150 / 240 | yes | `keyword` 14, `subheadline` 80 |
| `headline-to-system` | One headline becomes a hub that connects to four content assets. "One idea becomes many content assets." | "One idea turns into a post, a reel, a carousel and an email." | 90 / 240 | yes | `coreIdea` 48 (no word over 22), `assets` 4 x {`label` 22} |
| `panel-reveal` | Panels part like curtains to reveal a title and one call-to-action line over an image. "Panels part to reveal a course, event or product." | Announcing a course, event or product. Supply `visualSrc`: the built-in plate is a generic placeholder. | 90 / 240 | yes | `title` 56 (no word over 32), `cta` 40, `visualSrc`? |
| `system-layers` | Five layers in perspective, highlighted one at a time. "Business architecture, layer by layer." | Explaining a system as layers, top to bottom. | 90 / 240 | yes | `layers` 5 x {`label` 28, `detail`? 38} |
| `glass-lens` | A glass lens travels down five metric rows and rests on the key one. "Focus on the metric that matters." | "In this report, look only at this metric." | 150 / 240 | yes | `rows` 5 x {`label` 28, `value` 14}, `keyIndex` 0 to 4 |
| `automation-flow` | A pulse runs an S-shaped path: input, four numbered steps, output badge. "Input flows through automated steps into a business output." | Walking through an automated process from trigger to result. | 150 / 240 | yes | `input` 36, `steps` 4 x 28 (no word over 13), `output` 36 |
| `chaos-to-brand` | Scattered particles converge into a dotted, then solid, mark, then a name and tagline lockup. "Scattered chaos organises into a brand mark and then a clean lockup." | An identity beat: from a messy problem to a clean brand. It never replaces the fixed delivery ending. | 90 / 240 | yes | `mark` (a caller SVG path with its `viewBox` and optional `filled`, or a text mark of 6 characters), `brandName` 24, `tagline` 64 |

The catalog is searchable in English or Arabic. Families: `morph`, `data`,
`stack`, `reveal`, `flow` and `type`. Search matches all query terms across
ids, titles, messages and tags, with normalization of common Arabic variants.

## Mounting in a custom composition

Place the concept inside the composition's `SafeRoot` and a sequence whose
length matches the spoken beat. The following fragment assumes the video's
copy, timing, guides and footage are supplied by the caller:

```tsx
import { Sequence } from "remotion";
import { SafeRoot } from "../core/safe";
import { getConcept } from "../motion-concepts/registry";

const kpi = getConcept("kpi-zoom");
const data = kpi.schema.parse(copyFromTheRecording);

<SafeRoot guides={guides} probe={probe}>
  {/* The composition's footage goes here. */}
  <Sequence from={beatStart} durationInFrames={beatLength}>
    <kpi.Component style="kinetic-paper" data={data} mode="once" backdrop="none" />
  </Sequence>
  {/* The composition's speech-timed captions go above the graphics. */}
</SafeRoot>
```

- Use a 1080x1920 composition and an explicit `durationInFrames` at or above
  the concept's scaled minimum. A shorter sequence or different canvas throws.
- Align the resolved motion with the spoken word. `math.ts` defines each
  scene's beats; `conceptSettledFrame` in `catalog.ts` identifies its hold.
- `backdrop="canvas"` paints the theme background; `"none"` leaves the
  background transparent. Cards remain opaque, so review overlap with footage.
- `icon`, `productIcon` and `visualSrc` accept relative image paths under
  `engine/public/`, served through `staticFile`. Parent traversal and leading
  slashes are rejected. Missing icons fall back to a monogram.
- `caption` is an optional single line of at most 44 characters. Leave it
  unset when the composition already has its own caption track.
- Keep the composition's delivery checks, plate declaration and ending.
  Use the [technical guide](../../instructions/TECHNIQUES.md) for delivery rules.

## Preview options

`scripts/concept-stills.mjs` registers the fifteen `Concept-<id>` previews
through `engine/src/motion-concepts/entry.ts`. Each uses SAMPLE data at
1080x1920, 30 fps and its default frame length.

```powershell
node scripts/concept-stills.mjs --concept button-to-window --at 0.5f,settled
node scripts/concept-stills.mjs --concept all --style all --out Projects/motion-concepts/review
node scripts/concept-stills.mjs --concept kpi-zoom --mode loop --guides --guides-profile ig-reels-organic,ig-reels-ads
node scripts/concept-stills.mjs --concept magnetic-dock --caption "افتح Claude Code" --style all
```

- `--at`: seconds (`1.5`), sequence fraction (`0.5f`), frame (`90fr`), or
  `settled`. Default: `0.5f,settled`. In loop mode `1.0f` shows the opening state.
- `--style`: a style, a comma-separated list, or `all`.
- `--mode`: `once` or `loop`. `--guides` shows safe-zone guides.
- `--scale`, `--png`, `--assets` and `--out` control preview output;
  output stays under `Projects/` or `state/`. Default scale is 0.5.
- `--video` produces a silent preview per concept/style and ignores `--at`.

## Changing or adding a concept

Follow the [authoring contract](../../engine/src/motion-concepts/CONTRACT.md).
Use `button-to-window/` as a source example. Update the concept's `index.ts`
and its Node-loadable `catalog.ts` row together; the registry checks their
agreement when imported. Shared timing, geometry and theme helpers must remain
consistent across concepts.

From the repository root:

```powershell
node engine/node_modules/typescript/bin/tsc --project engine/tsconfig.json --noEmit
node --test tests/*.test.mjs
```

The shipped tests cover studio settings and preferences, including caption fit.
They are not a dedicated motion-concept test suite or a visual review. Review
changed concepts with actual copy in the intended style, timing and layout.
