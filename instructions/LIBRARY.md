# Motion library inventory

Use this guide to inspect the studio's existing motion inventory before choosing a mechanism or proposing library maintenance. The inventory reads studio code and catalogs; it does not inspect creator recordings or projects, render previews, change settings or apply edits.

## Read the right layer

- **Scene:** an editable scene family. A family can contain several configurations.
- **Concept:** a complete explanatory mechanism mounted inside the `motion-concept` family.
- **Effect:** a graphic overlay, transition, layout change, camera punch or entrance. These have different scopes and controls.
- **Style:** the visual grammar, palette, typography and defaults. It is not one movement.
- **Sound:** a generator or a recipe of timed hits; sound recipes are not visual movements.
- **Primitive:** an authoring building block. An exported function is not automatically available in the normal editor workflow.
- **Recipe variant:** a projection of an existing scene family, not another canonical scene.

Never add these layers into one marketing count. Keep native IDs unchanged. Qualified inventory keys identify the layer, for example `concept:prompt-to-results` and `scene:motion-concept`.

## Commands

Run from the studio root:

```text
node scripts/library.mjs inventory
node scripts/library.mjs inventory --format markdown
node scripts/library.mjs list --kind concept
node scripts/library.mjs search --query "results" --limit 5
node scripts/library.mjs search --query "نتائج" --kind concept --limit 5
node scripts/library.mjs show concept:prompt-to-results
node scripts/library.mjs gaps --format markdown
node scripts/library.mjs catalog --format markdown
node scripts/library.mjs recommend --context Projects/<slug>/library-context.json
```

Use the JSON inventory for exact fields and source references. The Markdown format is a readable index. Queries and item inspection print to stdout; they do not save or replace an edit.

## Use the inventory in an edit

1. Read `EDITORIAL.md`. State the viewer takeaway, visual starting state, action and resolved hold. Interpret the mood from the actual content and the creator's words; you cannot hear the delivery.
2. Preserve explicit and profile-fixed choices. Choose or retain the style using `STYLES.md` and its own guide; check its brand and layout policies.
3. Search the inventory for the visual job. Start with a short list, then inspect the relevant record and its actual schema/source. Match required assets, source mode, recorded words, duration at the project fps, layout and style ownership.
4. Follow `MOTION-CHOICES.md` and the normal brief/manifest contracts. A concept uses `{concept, config}`; an effect uses its own supported slot. An internal helper does not become a valid family by naming it in a brief. In a style with a design system, when no family states the idea exactly, compose the page from the system's parts (`scene:compose`, worked examples in the style guide) before reaching for a project scene.
5. Author real data and timing. Keep literal recorded words separate from explanatory copy. Do not substitute demonstration claims or missing evidence assets.
6. Continue through the normal planner, open live editor and actual visual review. Apply changes to the current edit with its manual-draft protections. Inventory lookup is never permission to rebuild or discard user edits.

Explain the selected action in one short sentence. Use a quiet hold or presenter moment when that better serves the material. If the idea needs unsupported behavior, use `PROJECT-SCENES.md` within the current project; promoting it globally is separate studio maintenance.

## Choose by meaning, mood and identity

The main skill interprets the actual message and the creator's words, then asks the read-only selector for compatible actions. It does not need to load the entire catalog into the conversation. `show` exposes one item's curated explanation, visual action, useful/unsuitable contexts and source evidence. `search` also searches current editorial meanings in Arabic and English. `catalog` provides the complete visual reference, keeping styles, wrappers, extension points and accents distinct.

Write a context in the current project's own folder, for example:

```json
{
  "intent": "process",
  "mode": "recording",
  "role": "explanation",
  "mood": "calm",
  "energy": "low",
  "style": "paper-collage",
  "layout": "split",
  "durationSec": 4,
  "sourceKind": "presenter",
  "assets": [],
  "requireBrandColors": false,
  "limit": 5
}
```

This is an example, not a saved default. Fill it from the actual video, measured timing, selected style and creator/profile choices. Preserve the existing font, caption presentation, writing style and ending through the normal editor flow. Set `requireBrandColors` only when applying the profile palette is a requirement; some selected styles own their palette even when the profile contains colours. A fixed style is never silently replaced to satisfy that requirement.

| Context | Meaning |
| --- | --- |
| `intent` | Required viewer job: `question`, `process`, `comparison`, `evidence`, `scale`, `reveal`, `grouping`, `focus`, `chronology`, `cta`, `claim`, `result`, `code`, `keys`, `tooling`, `text`, `transform`, `brand`, `chapter`, `layout-change`, `cut`, `word-emphasis`, `branching`, `filtering`, `bottleneck`, `feedback`. Process means ordered progression; result includes one-to-many outputs. Contrast maps to comparison, invitation to cta. An unimplemented job returns no match. |
| `mode`, `sourceKind` | `mode` is required: `recording` with actual `presenter` or `screen`; `graphics` with `none`. No invented recording words. For a pure identity-policy question without a video, inspect `show style:<id>` rather than inventing a source mode. |
| `role` | Default `explanation`; separately look up `emphasis`, `transition`, `entrance`, `camera` or `style` when that specific supporting action is needed. Wrappers and extension points are reference entries, not packaged actions. |
| `mood`, `energy` | Authored editorial interpretation: `calm`, `energetic`, `editorial`, `serious`, `playful`, `reflective`, `technical`, `warm`; energy `low`, `medium`, `high`. Match meaning first. Mood fit is a suggestion, not an audio measurement or quality score. |
| `style`, `layout`, `durationSec` | Use the selected style and actual available canvas/time. Layout is `presenter`, `split` or `takeover` where the contract permits it. Concept floors use seconds, scaled from their authored fps. Other durations still depend on actual copy, action and readable hold. |
| `assets` | Explicitly available assigned roles: `image`, `image-pair`, `screen-capture`, `screen-recording`, `data`, `reviewed-words`, `project-pack`, `media`. An empty array means none. Omission means unconfirmed, which is a caution rather than proof of availability. |

`screen-capture` is a separately named screen asset: a still or a supported MP4/WebM according to the selected scene. `screen-recording` is the measured main screen source and does not implicitly supply a separate asset. `media` is separately assigned supported image/video media; the B-roll look of `screens` needs it (a clip registered with `scripts/clips.mjs add`). `data` means supplied facts or explicitly illustrative authored values, not permission to invent results. `reviewed-words` means actual reviewed recorded words/timing that must also survive the edit's cuts.

Read the shortlist's `reasons`, `cautions`, `contract` and `suggestedPlan`. Meaning is required; mood/energy only break ties. Known ownership, layout, content-mode, source, required-asset, timing and static-caption conflicts exclude the action. Missing context remains visible. Curated evidence whose source hash changed is excluded until reassessed, and new registered items without guidance are unclassified. These checks shortlist an action; they do not validate every data variant or apply anything to an edit.

Retain the requested representation as well as its broad meaning. For example, a descriptive-text comparison does not fulfil a request for before/after image evidence when its image pair is missing. Inspect `useWhen`, `avoidWhen` and requirements before choosing; keep that source requirement unresolved rather than silently substituting another mechanism.

Translate the choice into the actual supported slot:

- Scene keys use the native family and its data schema. Concepts use family `motion-concept` with `{concept,config}`; recipe variants project into their parent family with their own layout/data constraints.
- Word/kinetic emphasis belongs to the recorded-word scene contract; caption emphasis belongs to the caption slot. A camera key names a track-authoring helper, not a scene family. Entrances and transitions use their declared slots.
- Styles supply grammar and identity. They do not substitute for an explanatory action. Preserve the normal style-selection route in `STYLES.md` when no style is fixed.

Record the chosen qualified key, initial state → actual action → resolved state, one reason it fits this message, and any remaining source/readability concern in `EDITORIAL_PLAN.md`. Inspect the real schema and output. If a required action is missing, keep a clear hold/presenter passage or author a scoped project scene; do not rename an existing action into the unsupported behavior.

## Conditional branching and filtering

The first expansion is available as two editable takeover concepts in the normal `motion-concept` family:

| Viewer job | Qualified key | Supplied inputs and limits | Time at30fps |
| --- | --- | --- | --- |
| Choose one of two routes from a visible condition | `concept:conditional-branching` | One stable input ID/label/value, boolean equality or numeric minimum, two labelled outcomes. The predicate computes the chosen route; no result override. | Minimum7s, default9s |
| Narrow the same candidates through successive criteria | `concept:identity-filtering` | 3-6 unique cards with numeric/boolean attributes, 1-3 eq/gte/lte criteria; rejected IDs stay traceable. Supplied values support at most6 decimals within the schema bounds. | Minimum9s, default11s |

Use selector intents `branching` or `filtering`, role `explanation`, a takeover layout and the actual available duration. `assets:["data"]` confirms supplied or clearly illustrative values, not permission to fabricate evidence. Neither concept supports arbitrary string predicates, executable predicates, a multi-level decision tree or live product execution. The catalog scales frame floors to project fps. Existing profile/style ownership and actual-motion review still apply.

## What the inventory does not establish

Registration and source references establish declared capability only. `unassessed`, `unverified` or `unresolved` records are not claims of creator approval, complete live-editor parity, preview quality or successful playback. Read the reported evidence and unresolved connections before use.

The inventory is the first foundation for a larger library. Source-backed gap assessment is available through `gaps`; it separates missing mechanisms, internal wiring, unreviewed examples and layout constraints. Priorities are authored editorial recommendations, not measured demand or implementation costs. Changed source evidence invalidates its conclusions until reassessed.

## Prepare and browse studio-maintenance previews

Only run a full preview batch for an explicitly requested library review or maintenance task. It uses original synthetic sample assets, not the creator's recordings, profile or project contents.

```text
node scripts/library-previews.mjs --out Projects/library-review --scale 0.5 --concurrency 4
node scripts/library-gallery.mjs Projects/library-review
node scripts/library-previews.mjs --out Projects/library-expansion --only concept:conditional-branching,concept:identity-filtering --quality high
node scripts/library-gallery.mjs Projects/library-review Projects/library-expansion
```

The renderer prints a report and gallery path. The gallery command prints a local read-only URL. Preview output must be a dedicated project folder. Existing owned outputs can resume only against matching source/input identities and media hashes; unknown files and untrusted output paths are refused. Each rendered clip is decoded and receives a poster. The gallery distinguishes rendered, pending, failed and project-pack-only entries. Internal programming helpers and sounds are accounted for separately rather than counted as independent visual previews.

`--quality high` defaults to native1080x1920, lossless PNG frame capture and PNG posters, H.264 CRF18/fast and BT.709. `draft` retains lighter defaults. Quality/scale/encoding are part of the resume identity; a low-resolution cache cannot stand in for a high-quality request. Actual output dimensions and codec metadata are recorded after decode. Named additional batches are combined as references to their original owned folders; pending new definitions never hide an existing playable example. Alternate outcome previews identify their native `canonicalKey` and are not counted as new mechanisms.

Previews demonstrate existing renderers with declared illustrative copy and timings. A presenter placeholder is not filmed footage, and authored word cues are not a transcript. Inspect actual output and apply VISUAL-REVIEW.md before promoting readiness. Rendering does not record creator acceptance.

The contextual shortlist and per-item selection guidance are available through `recommend`, `show`, `search` and `catalog`. Readiness promotion, new-motion implementation and automatic edits remain separate work. The skill makes the final contextual choice and retains the normal schema, manual-draft and actual-output review protections.
