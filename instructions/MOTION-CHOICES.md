# Choose a mechanism for the idea

Read the [editorial recipe](EDITORIAL.md) first. Author the visual action, then choose the smallest supported mechanism that performs it. The same family can look different across the eleven styles; changing the palette alone does not create a new explanation.

## Supported paths

- Recording: a brief beat's `intent` selects the scene family; the director maps reviewed source seconds onto the cut. See [EDITING.md](EDITING.md).
- No recording: author full-timeline takeover scenes in a graphics specification. See [GRAPHICS.md](GRAPHICS.md). Do not manufacture a speech transcript.
- All fifteen motion concepts are reachable in the normal `PreparedEdit` manifest and live editor through `family: "motion-concept"`, `data: {"concept": "<id>", "config": {...}}`. Use `takeover`. The config is the selected concept's existing schema, not arbitrary JSX or a free-form prompt.

Find a concept with `node scripts/concept-stills.mjs --list --query <idea>`. Read `engine/src/motion-concepts/<id>/schema.ts` and `math.ts`; the catalog gives the duration floor. Its 30 fps minimum scales to the actual fps through `minFramesAtFps`. Preview it with the real copy, then mount that same data through the normal family. Listing and schema checks do not render or approve it.

| Idea to make visible | Candidate mechanism |
| --- | --- |
| Scattered messages gather into one board, then one result moves forward | `message-board` keeps the same item IDs through continuous gathering and focus |
| One instruction produces several outputs | `prompt-to-results` |
| A short input unfolds into a complete workspace | `brief-to-workspace` |
| One idea connects to multiple content formats | `headline-to-system` |
| Trigger → ordered operations → result | `automation-flow`; `route-stops` for an explained journey |
| The same system applied across departments | `department-tabs` |
| Stack opens into individually meaningful tools | `tool-stack-spread`; `magnetic-dock` for six sequential introductions |
| A headline or reveal carries the moment | `keyword-reveal`; `panel-reveal` with a supplied visual |
| A product action becomes its interface | `button-to-window` |
| Locate a meaningful metric | `kpi-zoom`; `glass-lens` |
| Verified data changes form | `data-morph`; `data-story`; `meter-receipt` for a shared-scale comparison |
| Explain architecture | `system-layers` |
| Disorder resolves into an identity | `chaos-to-brand` with reviewed mark/name/copy |
| Compare actual images | `evidence-wipe` or `image-compare` |
| Emphasize words that were recorded | `kinetic-text` with literal transcript indices |
| Real screen or source image supports the claim | `screens`, `screen-focus`, or `screen-recording` according to source type |

The catalog is authoritative for exact inputs and supported lengths. Replace SAMPLE numbers, names and claims with recorded facts, cited evidence or clearly reviewed illustrative content. For a geographic explanation, use verified map geometry and region labels; a decorative route or random dot layout is not a map.

`message-board` is an optional additional takeover family, separate from the existing fifteen concepts. Its data has `initialTitle`, `boardTitle`, `focusTitle`, `closingTitle`, three to six `items` with unique `id`, `label` and optional `detail`, `focusIndex`, `gatherFrame`, `gatherDurationFrames`, `focusFrame`, `focusDurationFrames` and optional `closingFrame`. The same objects travel from scattered positions into the board and the selected object moves forward; a card-image cut is not required. Author at the project fps: allow at least 0.6 s before gathering, 0.75 s on the completed board before focus, and 1 s after focus resolves. An optional closing starts after that focus hold and must remain readable for at least one second. Use it when this action serves the message; other explanations keep their appropriate mechanisms.

## Layout and text contracts

Read the actual schema before specifying a layout. `motion-concept`, `screens`, `image-compare` and `checklist` use takeover. `count` and `outcome` are split-only; `statement`, `kinetic-hook` and `creator-cta` are presenter-only. A source-free graphics project requires takeover coverage throughout, so those presenter/split families cannot fill it.

`kinetic-text` uses `sourceIndices` (1–32 literal word indices), `lang`, `enter`, optional per-word `emphasis`, plus `kicker` and `title`. The manifest verifies the selected words against the cut and scene interval. It adds emphasis without replacing the existing caption stream; it cannot supply words for a silent graphics project.

`evidence-wipe` uses `before` and `after` images with `src`, exact `width`, `height`, `label`; `revealFrame`, `revealDurationFrames`, `dir`, `footer`, `kicker`, `title`. Supply and review both images. A wipe is a visual comparison, not proof of a fabricated result.

Shared authoring modules include spoken-line emphasis, type-on, compare wipe, price/delta/gauge graphics, small camera punches and speed inserts. Use their existing contracts for applicable graphics and source material. The normal scene families remain the editable route; an arbitrary component is not automatically a supported manifest family. Preserve source speed during speech and keep presenter treatment natural.
