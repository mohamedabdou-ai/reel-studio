# From meaning to an edit

The edit should make the idea easier to see. A style supplies its material, type and motion grammar; the sentence supplies the action. Start here for recorded and authored graphics videos, then use [motion choices](MOTION-CHOICES.md), [examples](EXAMPLES.md) and [visual review](VISUAL-REVIEW.md). [Styles](STYLES.md) lists every style and links each style's own guide, whose Recipe section explains its decisions; named references use [style learning](STYLE-LEARNING.md), and supporting media uses [asset production](ASSET-PRODUCTION.md).

## Build the idea before choosing an effect

In a style whose guide has a `## Design system`, decide each beat in this order: an approved family when it states the meaning exactly; otherwise a `compose` scene (the arrangement, the parts, and the spoken word that triggers each part); otherwise a project scene that imports the system. No beat may fall back to the old shared look: preparation lists such scenes in `undrawnScenes`.

1. State what the viewer should understand after this beat. Identify its job: question, contrast, cause, process, scale, evidence, reveal, consequence or invitation.
2. Describe the visual's initial state, its change, and its readable final state. For a process, an input should reach its output; for a contrast, retain the same object while its state changes. Use a title when a title explains the line, a diagram when the relationship matters, and real evidence when making a factual case.
3. Give the dominant element a cue. In recordings use reviewed word starts and measured source timing. In graphics-only work author the reading and demonstration time. Enter, demonstrate, resolve and hold; adjust the action to the available duration instead of squeezing an eight-second mechanism into two seconds.
4. Choose presenter, split or takeover because it helps this idea. A personal statement can return to the speaker; a multi-step explanation may need the full canvas. Keep the face and existing subtitles clear. Presenter screen time has no fixed target.
5. Choose assets and sound for a reason. A source capture proves a product state; an illustrative diagram explains a relationship. Label examples clearly. A click belongs on the click, a paper move on the movement, and a held reveal may work better with silence.

For each distinct visual job, use [LIBRARY.md](LIBRARY.md) to form a small context from this plan and the actual profile/source: meaning first, mood/energy second, fixed identity and layout as constraints. Run the library shortlist, inspect the selected item's meaning/requirements, and record the qualified key plus one reason. A quiet presenter passage can be the right choice when no diagram adds understanding. The native branch/filter concepts have specific typed-data and timing limits. Unsupported queue/feedback behavior needs an honest project-local design; a linear flow or repeating playback does not supply that meaning.

Use [PRODUCTION-MANAGER.md](PRODUCTION-MANAGER.md) for delegated routine choices, directed overrides, source observations versus editorial interpretations and bounded worker handoffs. Keep the live edit's designated writer and revision protections.

For a named recording with burned-in subtitles, use the brief's `captionsVisible: false` to suppress only the studio's added caption overlay. Keep reviewed words, cut timing and literal kinetic emphasis intact, then verify that the chosen footage window preserves the source's original subtitle text. This is a per-video choice, not a profile change or an empty-transcript workaround.

## Scene-plan contract

Write `Projects/<slug>/EDITORIAL_PLAN.md` before authoring the beat data. Keep it short; for each important beat record:

| Field | Required decision |
| --- | --- |
| Phrase or authored message | Source words/time range, or reviewed authored copy |
| Viewer takeaway | One concrete idea |
| Visual action | Initial state → action → resolved state; which object remains continuous |
| Timing | Cue, entrance, demonstration, readable hold and exit |
| Layout | Presenter/split/takeover and why it helps |
| Assets | Exact named asset or generated illustration; evidence/source note |
| Implementation | Supported family/concept plus its schema and duration limits, or declared project scene component/values |
| Library choice | Qualified key, what its action explains in this beat, mood/identity fit and any unresolved requirement |
| Text and sound | Literal subtitle versus explanatory label; action-linked sound or silence |
| Review concern | The hardest moment to understand or keep readable |

Use this plan to give the creator a concise recommendation and a representative preview. A new style choice needs its own creative review. Keep already approved direction, cuts and scope; an explicit request to finish authorizes the remaining agreed production work. Ask again only for a new consequential choice, uncertain source meaning or work outside that scope.

When references inform the plan, link evidence IDs from the project's Style DNA and record which rule is retained and which variable adapts to this message. Apply that decision to actual scene data/assets/code. If no shipped family can express the planned state change, follow [PROJECT-SCENES.md](PROJECT-SCENES.md) for project-local authored code and its declared editable data; normal customer work keeps tracked engine files intact.

## B-roll over the voice

B-roll is a short real clip that illustrates what the speaker names while the voice continues. It is illustration, never proof of a result, and it is silent. Use it only from clip records made with `node scripts/clips.mjs add` (see [EDITING.md](EDITING.md#named-b-roll-clips)) from files the creator named; a sentence without a suitable clip gets no B-roll. Start the clip on the cue word or up to 6 frames before it and keep it to about one to three seconds (defaults to validate on real reels, not fixed rules); change clips with hard cuts and add no sound effect. Use full screen only when the clip stays within 1.25x of its pixels; otherwise use split (clip above the presenter), or `contain` when the clip's shape rather than its size causes the enlargement (a clip that is too small even when contained is not used); the presenter window (`footage.pip`) is available only in styles that allow it, and a B-roll scene shown with that window carries no `label`, because the window covers the label's corner. Never cover the comment keyword, the follow card or the recorded sign-off, and do not use B-roll in the `cartoon`, `one-shot` or `grid-glide` styles. A real capture of the tool itself, not B-roll, proves a product state.

Captions can become unreadable over a clip. The `minimal` presentation is shadowed text with no backing, and so is the `pill` presentation in the styles whose pill is transparent (`calligraphic-receipts` and `magazine-interview`; `calligraphic-receipts` uses `pill` by default, with dark ink). After preparing, look at the still of each B-roll scene with its captions ([VISUAL-REVIEW.md](VISUAL-REVIEW.md)); where the captions have no backing and the clip is not clearly dark or light enough for them, propose `captionsPresentation: "ink-strip"` for this video to the creator in one line, and never override a `captionsPresentation` the creator fixed.

An optional `captions.skin` overrides presentation drawing: `spoken-box` backs only the word being spoken, `karaoke` highlights that word, `bold-outline` adds a dark contour, `soft-shadow` uses white shadowed text, and `paper-tag` uses a light paper strip. None guarantees contrast over every clip; review the actual footage. Preserve a fixed skin when proposing a presentation change, because the skin takes precedence. Caption emphasis `stretch` grows an Arabic word along legal joins and relaxes within its spoken time; Latin and words without slots stay intact. Line breaks and the caption size are measured with the word at its longest, so the line never rewraps or jumps; the word takes only the room it needs at each frame and its neighbours glide apart and back. A long stretched word may sit alone on its line. It is refused by styles with `staticCaptions` (currently `section-deck` and `documentary`), just like `pop`. Source words are never rewritten and Arabic letters are never split into DOM elements.

## Carry an idea across scenes

Prefer a connected progression to unrelated decorated cards: a question becomes a diagram; its input becomes results; one result becomes the focus; the final state answers the opening. Across scene boundaries preserve the relevant object, position, direction or visual identity. If the selected family cannot perform that transition, design a clear match between states or choose another supported mechanism. A style recommendation does not invent this progression.

Use colour to distinguish a chapter, change of state or reveal. Keep coherent type and material while varying scale, density and pace. Short holds and a clean personal line can carry weight. Repeating a zoom, card swap or whoosh on a fixed schedule does not explain a new idea.

Keep recorded speech, source facts and reviewed copy separate. Emotion is an editorial interpretation, not a number measured by the audio waveform. A synthetic diagram is an example, not evidence of real customer results.
