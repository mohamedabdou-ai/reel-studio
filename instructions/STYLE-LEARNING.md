# Learn a reference's decisions, then apply them to new content

Use this guide when the creator names finished reference videos, asks to learn a visual direction, or wants a learned direction adapted to a new edit. References show the finished result: their original footage, hidden timeline and production settings are unknown. Read [EDITORIAL.md](EDITORIAL.md) for the new video's meaning, [STYLE-RECIPES.md](STYLE-RECIPES.md) for the eleven base directions, and [PROJECT-SCENES.md](PROJECT-SCENES.md) when an authored mechanism is needed.

The result is project-local evidence and a usable decision system, called `projectStyleDNA` here. It is saved in `Projects/<slug>/STYLE_DNA.json` and explained in `STYLE_DNA.md`; it is editorial evidence, not an extra manifest field or a new globally registered style. Keep the current supported `style` ID in `edit.json`. New scene behavior uses validated existing families or the project scene contract.

## Scope and inspect the named references

1. Record the exact named files or supplied accessible links and their role: style reference, evidence, source footage or reusable asset. A style reference is not automatically licensed footage for the new video. Preserve the originals and do not scan unrelated media folders.
2. For local videos, record SHA-256, duration, dimensions, fps, audio presence and the inspected coverage. Store the reference ledger and analyses under `Projects/<slug>/style-analysis/`. Use the original reference timeline for evidence timecodes, independently of the new recording's source/edit time.
3. Inspect the opening, middle, important idea transitions and ending. Watch motion and listen to sound; contact sheets locate moments but do not establish easing, audio cues or sequence. If only part of a reference is available, state that limitation.
4. Compare observed composition and pacing separately. A cut detector suggests candidate cuts, not their editorial purpose. Check the frames around a candidate before calling it a cut, punch-in, mask or transition.

The bundled helpers support named-file analysis. Create the project directories first and replace the example filename and time samples with the selected reference:

```powershell
node scripts/probe.mjs "Reference/reference-a.mp4" --json Projects/<slug>/style-analysis/probe.json
node scripts/scenes.mjs "Reference/reference-a.mp4" --threshold 0.25
node scripts/scenes.mjs "Reference/reference-a.mp4" --threshold 0.1
node scripts/audio.mjs "Reference/reference-a.mp4"
node scripts/contact-sheet.mjs "Reference/reference-a.mp4" --out Projects/<slug>/style-analysis/reference-a-sheet.jpg
node scripts/frames.mjs "Reference/reference-a.mp4" --fps 2 --start 0 --end 6 --out Projects/<slug>/style-analysis/reference-a-opening
node scripts/frames.mjs "Reference/reference-a.mp4" --at 2.88,3.12 --out Projects/<slug>/style-analysis/reference-a-transition
```

These commands create derivatives/caches; run them only within an authorized analysis scope. Probe, scenes and audio return their own cached evidence; record the returned artifact paths. Read the contact sheet and frame files, including the sheet's timecode sidecar. Use exact reviewed transition times for the next samples. Local analysis needs no paid generator.

## Give every claim an evidence record

Write one row per meaningful observation in `style-analysis/<reference-id>.md`, with stable evidence IDs referenced by the DNA. Record unknown values as unknown rather than estimating them silently.

| Required slot | What it contains |
| --- | --- |
| `id`, `referenceId` | Stable observation and named-reference IDs |
| `timecodes` | Exact intervals in the reference, e.g. `00:03.20–00:05.60` |
| `claim` | What visibly or audibly happens; describe the action rather than an effect name alone |
| `basis` | `observed`, `measured` or `inferred`; a rendered move is observed, helper output is measured, intent is inferred |
| `confidence`, `reason` | `high`, `medium` or `low`, plus evidence quality, inspected coverage and ambiguity |
| `artifacts` | The actual frames, probe/analysis output or playback range inspected |
| `trait` | `invariant`, `adaptive` or `uncertain`; recurrence and exceptions determine this classification |
| `exceptions` | Contradictory passages, missing coverage or alternate explanations |

For example: “the same paper token lands on a board at 00:03.20 and remains visible during the label reveal” is observed. “The creator wanted this to represent trust” is inferred. A two-frame sample cannot prove a spring's exact settings. A quiet waveform cannot measure emotional importance.

Confidence describes the claim's support, not a numeric style score. A strongly visible one-off move can have high observation confidence and still be an uncertain style trait. Call a rule invariant only when recurring inspected examples support it, recording exceptions; a single reference yields a provisional direction with limited generality. Folder names, popularity and the creator's reputation are not evidence.

## Build projectStyleDNA

Keep these sections in both the readable DNA and its JSON companion:

| Section | Required contents |
| --- | --- |
| Identity and review | `version`, `status`, `baseStyle`, scope, actual reviewer/review evidence when present |
| `references` | Named reference IDs, paths/URLs, hashes where available, inspected time ranges and access limitations |
| `observedInvariants` | Repeated decisions with evidence IDs, confidence and exceptions |
| `adaptiveVariables` | Content-dependent choices: hierarchy, density, layout, cue, hold, asset role and movement distance |
| `uncertainTraits` | Weak or inferred traits and what would resolve them; never silently promote them into rules |
| `applicationLogic` | How the grammar serves recording, screen demonstration or authored graphics; which concrete scene actions implement it |
| `antiPatterns` | Changes that erase this grammar or obstruct meaning, with reasons |
| `limitations` | What the evidence cannot establish and unsupported mechanisms |
| `sampleReview` | Exact output/revision, inspected range, technical findings, creative feedback and actual acceptance status |

Use `draft` or `awaiting-review` until review occurs; a bundled style's availability does not approve this customer's application. A JSON note does not make the runtime implement a behavior. If code is needed, follow the declared fields and preview contract in [PROJECT-SCENES.md](PROJECT-SCENES.md).

Save a revision before replacing reviewed DNA, and record the changed decisions in `STYLE_DNA.md`. Later named references add evidence and a change proposal; preserve accepted project choices. A substantially different grammar is a new direction to review, not a silent replacement of the accepted one. Only put a broadly reusable customer-approved learning into that customer's local resources when that work is requested; never package their references, identity or review records with the product.

## Transfer the grammar into the actual edit

For every important beat, add an application row to `EDITORIAL_PLAN.md`:

| Reference decision | New-content implementation |
| --- | --- |
| Evidence IDs and the transferable rule | The new phrase/message and its viewer takeaway |
| Invariant retained, variable adapted | Initial state → action → resolved state, with a continuous object |
| Composition and material | Presenter/split/takeover, hierarchy, typography and material decisions |
| Reference timing function | New recorded cue or authored reading moment, entrance/demonstration/hold/exit in integer frames |
| Scene destination | Scene ID, supported `family` and concrete data values, or project component ID plus declared `values` |
| Asset and sound role | Selected ledger IDs and the action each supports |
| Review risk | A specific motion, reading, continuity or source-protection concern |

Suppose a reference keeps a token continuous while it is sorted into a board. For a new explanation of “inputs become a process and then a result,” retain each input's identity as it moves into a process, and carry the selected result into focus. The labels, number of inputs, reading time and layout adapt to this idea. Use the shipped `message-board` if its actual data and behavior fit; otherwise author a `project-scene` with declared editable labels, cue frames and layout values. Copying the reference's labels or swapping unrelated cards would not implement that grammar.

This mapping must change the actual scene data, assets or project code. A DNA file beside an unchanged template is incomplete. Keep recorded dialogue and reviewed captions intact; explanatory labels follow the reviewed message. Presenter visibility and scene count depend on the explanation, with no fixed screen-time quota or cut interval.

## Review a representative application

Choose a short passage that contains the hardest mechanism and a transition, usually around 10–20 seconds when the explanation permits it. Use only the named recording or reviewed authored copy. Create a preview through the normal prepare/editor/render route and open the live editor from the first prepared draft. Review its actual motion and sound using [VISUAL-REVIEW.md](VISUAL-REVIEW.md).

Compare the sample to the intended decision rules: hierarchy, continuous object, cue, readable hold, material, neighboring states and factual/source safety. Record technical checks separately from creator feedback in `sampleReview`. If the result fails, change the dominant action or the transfer rule, revise the DNA/application mapping and render fresh output. Repeating the same effect with extra decoration does not resolve a failed explanation. Expand only within the current approved scope; keep an explicit request to finish and do not request the same decision again.

Report the scope accurately: sampled frames, sampled playback, uninterrupted playback and acceptance differ. New unseen output cannot inherit acceptance from a prior sample.
