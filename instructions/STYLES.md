# Styles

This edition ships seven styles. All of them are driven by the director (`node scripts/editor.mjs`) and rendered by the `PreparedEdit` composition. Choose one per video with the creator; `node scripts/editor.mjs recommend <brief.json>` gives a reasoned default, and it only ever chooses between the two proven styles: name a newer style in the brief when the creator asks for it or the content clearly fits it. A style is a direction, not a checklist: use the scene families that carry the meaning of each sentence.

Two styles are the proven pair, refined on real footage first: **split-canvas** and **section-deck**. Five are newer: **kinetic-paper**, **calligraphic-receipts**, **paper-collage**, **judgment-board** and **stepped-editorial**. A newer style keeps its own palette (the plan adds a notice that brand colours do not apply) and every edit still needs the creator's own creative approval. For a newer style always show the fast preview (gate 2) first. If it shows clipped text, a broken layout or an unreadable frame, say so in one line and offer a proven style instead. Never deliver a style whose preview failed.

## split-canvas

- **Look:** a warm product-UI canvas above a continuous presenter window, rounded cards, accent rules and compact caption pills.
- **Best for:** explainers and tutorials where the presenter stays on screen and the upper canvas shows one idea at a time.
- **Layouts:** `split` (graphics above the seam, presenter below) for most beats; `takeover` for a full-frame idea; `presenter` when the face alone carries the line.
- **Brand colours:** one ground (the profile background, or the style's warm paper) with ink text; the highlight colour alternates between primary and accent from scene to scene; captions become a light card pill with ink text.

## section-deck

- **Look:** dark UI sections with a kicker, an accent headline, semantic chips and held clause captions.
- **Best for:** explainers, tutorials and comparisons that fall into clear sections.
- **Layouts:** `split` for sections under a continuous presenter; `takeover` for comparisons, processes and data.
- **Brand colours:** sections cycle through three grounds — the profile background (or the deck's navy), a deep primary and a deep accent — each with readable ink and its own highlight; captions stay a solid pill.

## kinetic-paper

- **Look:** heavy poster type, ink frames, signal strips and deliberate staggered reveals; ink-strip captions.
- **Best for:** explainers, comparisons and tutorials that want a strong, poster-like opening.
- **Brand colours:** not applied; the style keeps its own palette.

## calligraphic-receipts

- **Look:** Naskh claims paired with evidence receipts, brush rules, boxless captions and a quiet motion.
- **Best for:** case studies, stories and opinions that lean on evidence and numbers.
- **Brand colours:** not applied.

## paper-collage

- **Look:** layered taped-paper cards, tabs and restrained depth; paper-label captions.
- **Best for:** stories, comparisons and case studies.
- **Brand colours:** not applied.

## judgment-board

- **Look:** a clear two-column verdict or comparison board with serif verdict type and a divider between the sides; boxless captions.
- **Best for:** comparisons, opinions and case studies.
- **Brand colours:** not applied.

## stepped-editorial

- **Look:** editorial spreads with offset plates, serif editorial type and yellow-marker evidence; boxless captions.
- **Best for:** opinions, case studies and stories with a magazine feel.
- **Brand colours:** not applied.

## Brand colours

- Only `split-canvas` and `section-deck` take the profile's brand colours. For the other five the plan result carries a notice; tell the creator in one line (for example: "الستايل ده بيفضل بألوانه هو").
- `PROFILE.json` `brand.primary` and `brand.accent` are required; `background` and `text` may be `null` to keep the style's own.
- The planner keeps the background exactly and adjusts ink and highlight lightness in fixed steps until every text pair reaches 4.5:1 contrast. If a colour cannot be made readable, that part of the video uses the style's own colours.
- The plan result lists what changed in `notices`; tell the creator in one line each (for example: "ظبطت درجة لون التمييز شوية علشان الكلام يبان").
- Colours paint graphics only; the presenter is never recoloured.

## Endings

Only the parts that are on for this video appear, always in this order:

| Part | Scene | On when |
| --- | --- | --- |
| Comment CTA | `comment` (or `creator-cta`) with `keyword` = this video's keyword | the brief's `creator.ending.cta` is a keyword |
| Follow card | `follow` (or `creator-cta`) with `handle` = the profile handle | `creator.ending.followCard` is true |
| Recorded sign-off | no scene; every scene ends before it | the profile has `signOff` and it is spoken in this recording |

Every style draws the comment card and the follow card with the same scene families in its own register: the style's palette, type, card shapes and geometry, with the brand palette when the style takes one and the profile has one. The follow card shows the complete handle (up to @ + 30 characters) and a Follow button in the highlight colour; text that cannot fit makes the render fail instead of being cut. A `creator-cta` scene carries the keyword and the handle together, and its follow and click moments must come in that order inside the scene.

## Screen-recording reels

- Set the brief's `sourceKind` to `"screen"` when the source is a screen recording. The face check and the presenter motion check are then exempt and `screen-recording` beats are allowed.
- A `screen-recording` beat shows the recording in the Instagram safe area (1080 x 1220 from y 250). Its data holds:
  - `keys`: camera keys `{atFrame, focus:{x,y,width,height}, zoom, moveFrames}` in frames from the start of the beat; the first key starts at 0; `moveFrames` 0 is a cut, otherwise the move eases in over that many frames.
  - `clicks`: `{atFrame, x, y}` where the recording's own pointer clicks (normalised 0–1 recording coordinates); a ring ripple lands on each.
  - `callouts`: `{atFrame, untilFrame, kind: "rect" | "circle", rect}` pinned to the recording, drawn in the highlight colour.
- Pick focus rectangles and click points from stills of the recording. The planner refuses keys that enlarge the recording more than 1.25x (text turns soft) and callouts that land outside the safe zone.
- A screen capture inside a presenter video is a different tool: the `screen-focus` scene family with its own capture file.
