# Review the idea, the movement and the actual output

Technical checks answer whether the file and layouts meet their contracts. Creative review answers whether the edit communicates its idea and looks coherent. Record both separately in `Projects/<slug>/QC_REPORT.md` and identify the exact output/version reviewed.

## Review the representative passage first

Choose the passage containing the difficult explanation or transition, not only the opening title. Review the actual preview with the creator. For a recording, inspect word-cue frames and the moments immediately before/after each move. For authored graphics, inspect each planned action's start, key change and resolved hold. A still shows composition; playback shows motion and sequence.

| Question | Evidence to inspect |
| --- | --- |
| What changed, and why? | Input, physical/visual action and output convey the scene-plan takeaway without unrelated effects |
| Is the explanation connected? | Relevant objects retain identity; paths connect the intended endpoints; chapter changes or match cuts preserve context |
| Does the cue land? | The important change lands on the reviewed spoken cue, or at the authored reading moment |
| Is the motion controlled? | No unintended teleport, spring wobble, clipping or abrupt crop; entrance and exit meet their neighbouring states |
| Can the viewer read it? | Final state holds long enough; Arabic stays joined; mixed-language labels fit; contrast and density support the hierarchy |
| Is the Arabic correct? | `node scripts/arabic-check.mjs --project <slug>` reports no `fail` (cut joins, characters the font does not draw); every `needs-review` item (mixed Arabic and Latin order, stacked harakat, digit style, long lines) was looked at on its own frame and has a written decision |
| Does the layout serve the line? | Screens are legible, graphic-only passages have enough space, and visible hair/face/beard/baked subtitles remain clear |
| Are claims honest? | Evidence is authentic; illustrations are identified; no invented result, number, testimonial or geographic boundary |
| Does sound help? | Speech remains understandable; accents land on actions; important holds and endings are not crowded |

When a mechanism looks too busy, simplify its dominant action before adding another effect. When a transition looks disconnected, fix its outgoing/incoming states before shortening everything. Revisit the [scene plan](EDITORIAL.md) rather than treating more motion as the only remedy.

## Full preview and delivery

Review the arc from opening to resolution and the complete ending. Check that an explanation pays off, evidence arrives where required, density varies deliberately, and the invitation gets room. Keep the review editor open for small corrections; preserve manual drafts and conflicts. After cut changes, prepare again before describing its footage as current.

The final review uses the exported MP4. You cannot hear it: its sound is judged by the creator playing the passage you name. Probe/encode/decode, plate cadence, safe zones, presenter/head checks, motion and audio checks still run through the delivery pipeline. Fix a failed gate; do not bypass it because a still looked good.

A marked design surface may extend into the side margins when it carries no information there. Safe-check reports that background coverage as an informational zone/area note; text, glyphs, marks, logos, icons and media remain enforced content. Review the note against the actual frame. This does not exempt a band from head clearance: head checks still see its fill.

Record the practical scope honestly: schema-only, rendered stills, sampled video/audio review, uninterrupted playback, and creator acceptance are different evidence. If only samples were inspected, say so. A clean test suite, HTTP success or a generated demonstration is not creative acceptance. A request to produce the final authorizes production; the creator's acceptance belongs to the reviewed result.

## Reusable examples

Use [EXAMPLES.md](EXAMPLES.md) as reasoning references and adapt them to the current source. Synthetic demonstration assets contain no private footage and prove no real result. Compare the same idea and passage across alternatives so the difference comes from the montage. Preserve accepted outputs, record the new revision identity, and inspect fresh output after changing the relevant inputs.
