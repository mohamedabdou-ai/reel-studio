---
name: reel-studio
description: Use when working in a Reel Studio folder on setup, preferences, a named recording, motion graphics without a recording, podcast clips, revisions, previews, review or delivery.
---

# Reel Studio

Make the idea visible through the edit. A style provides visual grammar; each message determines its action, timing and layout. Run commands from the studio root, three levels above this file. This is the canonical skill; generate its Claude copy with `node scripts/sync-assistant-guides.mjs`.

## Load the relevant guide

Read [the rules](../../../instructions/RULES.md). Setup/update/doctor uses [SETUP](../../../instructions/SETUP.md); profile/preferences uses [SETTINGS](../../../instructions/SETTINGS.md). Preserve saved fixed choices and approved scope. Post descriptions use the existing social-captions skill.

For an edit, read [EDITORIAL](../../../instructions/EDITORIAL.md), then choose:

| Request | Production route |
| --- | --- |
| A named real recording | [EDITING](../../../instructions/EDITING.md): intake, reviewed words and source-timed beats |
| Authored animation with no recording | [GRAPHICS](../../../instructions/GRAPHICS.md): `editor.mjs graphics <spec.json>`, full takeover scenes and authored-copy review |
| Several clips from one recording | [PODCAST](../../../instructions/PODCAST.md) |
| Render/resume or audio/picture revision | [PRODUCTION](../../../instructions/PRODUCTION.md) |

## Make and review the scene plan

1. Identify the viewer takeaway and the message's progression. Write `EDITORIAL_PLAN.md`: phrase/message → initial visual state → action → resolved state, with cue/hold, layout reason, asset provenance and supported family.
2. Choose a mechanism using [MOTION-CHOICES](../../../instructions/MOTION-CHOICES.md) and the actual schema. All fifteen concepts are normal editable `motion-concept` takeover scenes with `{concept,config}`. Use their duration floors. Literal `kinetic-text` requires recorded word indices; `outcome` is split-only. A source-free request needs no uploaded video or invented transcript.
3. Preserve the relevant object's identity across the explanation. A prompt can produce outputs; a process carries an input to a result; a contrast changes the same subject. Adapt [EXAMPLES](../../../instructions/EXAMPLES.md), not their fixed timing or copy.
4. Prepare the first draft, start `node scripts/review-editor.mjs Projects/<slug>/edit.json` and open its URL immediately. Keep it running while editing and awaiting decisions. Protect manual edits; reprepare changed cuts before calling footage current.
5. Review a representative difficult passage and the full arc through [VISUAL-REVIEW](../../../instructions/VISUAL-REVIEW.md). Keep existing approvals; an agreed request to finish does not require the same approval at each step.
6. Deliver through the normal editor checks, inspect the actual MP4/audio, preserve the output identity and write post descriptions. Report schema checks, sampled review, playback and creator acceptance honestly.

Keep original recordings and meaning intact. Literal subtitles and reviewed explanatory labels serve different roles. Named source assets, natural presenter appearance, verified evidence and safe layouts remain protected. Never invent factual results or claim creative acceptance from a green technical check.
