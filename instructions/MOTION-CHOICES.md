# Choose a mechanism for the idea

Read the [editorial recipe](EDITORIAL.md) first. Author the visual action, then choose the smallest supported mechanism that performs it. The same family can look different across the styles; changing the palette alone does not create a new explanation.

## Transitions between scenes

The manifest's `transitions` (`{atFrame, durationInFrames, kind, dir?}`) offers `clip-wipe`, `light-scan` and `whip-pan` (graphics scene entrances), `hue-crossfade`, and the overlay flashes `whiteout`, `leak`, `bloom` and `burn`. `layoutTransitions` (`curtain`, `window-morph`) move between the presenter and split layouts. Prefer one calm entrance kind per video between graphics scenes; keep flashes rare and never over the presenter speaking. They are editable in the live editor.

## Supported paths

V4 adds entrances `iris` (circle), `keyhole` (keyhole mask), `blinds` (six horizontal slats, right edge first), `dot-zoom` (90x ink-dot zoom resolving into the incoming scene), and `zoom-through` (1.4x scale and blur settling to rest). Anchor them to the incoming scene's first frame, finish inside it, and use split or takeover; these mask entrances reject presenter scenes; `clip-wipe` and the graphics-only `ink-slab` can serve presenter scenes. `clip-wipe` accepts optional `shape` (`inset`, `circle`, `polygon`, `keyhole`); it and `iris`/`keyhole`/`dot-zoom` accept normalized `origin: {x,y}` (0..1, default centre for the new masks). New centred overlays `paper-tear`, `page-turn` (Arabic book direction, left to right), and `pen-dot-curtain` cover the cut at `atFrame`; half their duration falls after that frame and must finish before signoff. Their paper/ink lead-in adapts the two-scene canvas demonstrations without cloning video. The ink lattice closes outwards and reopens from the centre. `pixel-curtain` (default 24 frames) builds a curtain of square cells in the style's background colour, is whole at `atFrame` and dissolves away cell by cell; while whole it covers the captions too, so place it in a pause, never on a spoken word. New V4 entrances are `ink-slab` (12 frames; incoming lead 10, outgoing tail 12; full canvas), `lens-zoom` (14; lead/tail 14; outgoing frozen) and `paper-pull` (14; lead/tail 14; frozen outgoing takeover sheet lifted above incoming). New centred overlays are `magazine-flip` (14; incoming lead 15 (8 before the flip starts), outgoing tail 7; outgoing page drawn once above incoming, takeover/split graphics only) and `paper-swap` (14; incoming lead 12; full-canvas sheet). Anchor all five to an adjacent scene cut. The generic drawing overlap changes no manifest boundary, caption, audio or camera clock. ink-slab supports presenter graphics; lens-zoom supports split/takeover graphics; paper-pull requires two takeover sheets. No scene video enters a two-node effect. The five have fixed directions and accept no dir/shape/origin. The editor labels are proposals. Whip-pan media and split-direction restrictions are unchanged.

- Recording: a brief beat's `intent` selects the scene family; the director maps reviewed source seconds onto the cut. See [EDITING.md](EDITING.md).
- No recording: author full-timeline takeover scenes in a graphics specification. See [GRAPHICS.md](GRAPHICS.md). Do not manufacture a speech transcript.
- Registered motion concepts are reachable in the normal `PreparedEdit` manifest and live editor through `family: "motion-concept"`, `data: {"concept": "<id>", "config": {...}}`. Use `takeover`. The config is the selected concept's existing schema, not arbitrary JSX or a free-form prompt.

Find a concept with `node scripts/concept-stills.mjs --list --query <idea>`. Read `engine/src/motion-concepts/<id>/schema.ts` and `math.ts`; the catalog gives the duration floor. Its 30 fps minimum scales to the actual fps through `minFramesAtFps`. Preview it with the real copy, then mount that same data through the normal family. Listing and schema checks do not render or approve it.

| Idea to make visible | Candidate mechanism |
| --- | --- |
| Scattered messages gather into one board, then one result moves forward | `message-board` keeps the same item IDs through continuous gathering and focus |
| One instruction produces several outputs | `prompt-to-results` |
| A short input unfolds into a complete workspace | `brief-to-workspace` |
| One idea connects to multiple content formats | `headline-to-system` |
| Trigger → ordered operations → result | `automation-flow`; `route-stops` for an explained journey |
| A typed condition chooses one of two routes for the same input | `conditional-branching`; supplied boolean equality or numeric minimum, with one computed selected outcome |
| The same candidates pass successive criteria and form a shortlist | `identity-filtering`; stable IDs, supplied typed attributes, computed survivor sets and traceable rejections |
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
| One authored Arabic word or short line carries the moment through its letters (dots fall into place, a pen writes it, letters snap together, Kufic tiles, a kashida stretch, decrypt, an echo, a redacted stamp, one word melting into another, a clip inside the letters, unblur) | `arabic-type` with one `move` (takeover; the letter moves take at most 40 characters and three words, and `kashida-stretch` takes exactly one Arabic word with a joint it can lengthen (three letters or more with two connected letters, like جميل; not ورد or a Latin word), which the check enforces; `word-melt` needs `to`, `video-in-letters` a creator-named clip in `media`; optional `backdrop`: `plain` (default), `girih`, `sunburst` or `paper`, `font` (an installed family, else Cairo) and one `sticker`). The letters stay joined in every move |
| An authored web page, chat or dashboard, with one detail in focus | `proof-screen` with `page`, 1-10 `blocks`, optional `focus` and `path` (`tilt-in`, `glide`, `focus`). It is rebuilt from authored copy and named project images: illustrative, never a captured screen or proof of a result |
| A point that no approved family states exactly, in a style with a `## Design system` | `compose` (split or takeover): an `arrangement` (`hero`, `stack`, `two-column`, `grid`) and 1-6 `parts` of the 16 kinds, each anchored to the word that says it with `at.word`. Worked examples are in the style guide's `## Design system` |
| A journey between places, or one country or city brought into focus | `map-route` or `map-focus`, only in the `documentary` style ([styles/documentary.md](styles/documentary.md)); cities always need reviewed `lon`/`lat` |
| A supplied scorecard ending in a reviewed verdict | `verdict`, only in the `magazine-interview` style; 2–4 supplied scores and an ordered verdict cue |
| A claim paired with two supplied receipt amounts and their difference | `claim-proof`, only in the `calligraphic-receipts` style; illustrative samples say «مثال» |
| A creator-named archival photo with its explanation | `cutout-card`, only in the `documentary` style |
| Real screen or source image supports the claim | `screens`, `screen-focus`, or `screen-recording` according to source type |
| A short real clip illustrates what the speaker names, over the continuing voice | `screens` with `look: "broll"` (full screen or split; silent; never proof; not in cartoon, one-shot or grid-glide) |
| A countable explainer (steps, tools, options), each with a real capture | `glide-chapter`, `glide-card` and `glide-lines`, only in the `grid-glide` style |
| The comment call to action and the follow card in the `grid-glide` style | `glide-comment` and `glide-follow`, instead of the shared `comment` and `follow` |
| A how-to told in one unbroken take (open, put something in, type, choose, wait, receive) | `one-shot`, only in the `one-shot` style |
| An explainer told by an illustrated narrator over flipping grounds, with the headline built on the recorded words | `cartoon` (body) and `cartoon-ending`, only in the `cartoon` style |
| One to three key words around the on-camera speaker, the big one stretched behind the head, with a hand-drawn mark on the key word | `layered-speaker`, only in the `layered-speaker` style ([guide](styles/layered-speaker.md)); the matte comes from `node scripts/matte.mjs` |

`glide-chapter`, `glide-card`, `glide-lines`, `glide-comment` and `glide-follow` are style-owned takeover families: the manifest accepts them only when `style` is `grid-glide`, and their enter, exit and dip behaviour lives inside the scene, so the shared transition list is not used. Their frames are relative to the scene start, a card's captures are public-local files whose `sha256` and pixel size the scene states, and the data contracts are summarised in [styles/grid-glide.md](styles/grid-glide.md).

The catalog is authoritative for exact inputs and supported lengths. Replace SAMPLE numbers, names and claims with recorded facts, cited evidence or clearly reviewed illustrative content. For a geographic explanation, use verified map geometry and region labels; a decorative route or random dot layout is not a map.

`message-board` is an optional additional takeover family, separate from the concept bank. Its data has `initialTitle`, `boardTitle`, `focusTitle`, `closingTitle`, three to six `items` with unique `id`, `label` and optional `detail`, `focusIndex`, `gatherFrame`, `gatherDurationFrames`, `focusFrame`, `focusDurationFrames` and optional `closingFrame`. The same objects travel from scattered positions into the board and the selected object moves forward; a card-image cut is not required. Author at the project fps: allow at least 0.6 s before gathering, 0.75 s on the completed board before focus, and 1 s after focus resolves. An optional closing starts after that focus hold and must remain readable for at least one second. Use it when this action serves the message; other explanations keep their appropriate mechanisms.

## Camera moves on graphics scenes

A takeover (full-frame) or split scene may carry `camera: {"move": "snap-zoom" | "orbit" | "dolly" | "handheld", "strength": "soft" | "normal" | "strong", "at": <scene frame>}`. `strength` defaults to `normal`; `at` belongs to `snap-zoom` alone and defaults to 40 % into the scene. `snap-zoom` punches in on the cue and relaxes back to the resting frame within about a second (peak scale 1.05 / 1.10 / 1.18). `orbit` arcs the view round the scene, upright in the middle (±3° / 5° / 8°, covering the frame so no edge shows). `dolly` is one slow push-in across the whole scene (to 1.04 / 1.08 / 1.14). `handheld` is a seeded organic shake: the same scene id gives the same shake on every render. Use one move per scene and leave most scenes still. Keep small text off the edges, because a strong move crops them. A takeover scene moves the whole frame. A split scene moves its graphics panel only, clipped at the seam: the presenter window, captions and head gates stay still, and a strong move crops anything small near the panel edges or the seam. Presenter scenes keep the existing `camera` track and head gates and refuse a scene camera; `one-shot`, `screen-recording` and `screen-focus` already move their own camera and refuse it too. The safe-zone check measures the resting layout, so a scene with a camera is checked as if it stood still. In the live editor the choice sits on the scene card.

## Layout and text contracts

In a recording, `arabic-type`, `figures`, `chat-thread` and `proof-screen` use the whole frame down to about y 1320, so during them the caption leaves the style's takeover line and sits on the presenter caption line (y 1370) below their content. Read the actual schema before specifying a layout. `compose` uses split or takeover. `motion-concept`, `screens`, `image-compare` and `checklist` use takeover (`screens` with `look: "broll"` may also use split). `count` and `outcome` are split-only; `statement`, `kinetic-hook` and `creator-cta` are presenter-only. A source-free graphics project requires takeover coverage throughout, so those presenter/split families cannot fill it.

`kinetic-text` uses `sourceIndices` (1–32 literal word indices), `lang`, `enter`, optional per-word `emphasis`, plus `kicker` and `title`. The manifest verifies the selected words against the cut and scene interval. It adds emphasis without replacing the existing caption stream; it cannot supply words for a silent graphics project.

`evidence-wipe` uses `before` and `after` images with `src`, exact `width`, `height`, `label`; `revealFrame`, `revealDurationFrames`, `dir`, `footer`, `kicker`, `title`. Supply and review both images. A wipe is a visual comparison, not proof of a fabricated result.

Shared authoring modules include spoken-line emphasis, type-on, compare wipe, price/delta/gauge graphics, small camera punches and speed inserts. Use their existing contracts for applicable graphics and source material. The normal scene families remain the editable route; an arbitrary component is not automatically a supported manifest family. Preserve source speed during speech and keep presenter treatment natural.

- Figures and chat-thread are generic takeover scenes for authored quantities and message sequences. See [FIGURES-CHAT](FIGURES-CHAT.md) for variants, scene-local frame cues and delivery guards.

Preparation requests a head guide for `statement`, `creator-cta`, `layered-speaker` and `kinetic-hook`. Prepared boxes already include the chin allowance; do not pad them again. Magazine presenter designs keep out of the box, or reserve y 380-1000 when no envelope is available; a missing envelope still cannot produce a PASS from head-check.
