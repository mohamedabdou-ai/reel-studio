---
name: reel-studio
description: Use when working in a Reel Studio folder on setup, preferences, a named recording, reference styles, asset production, project scenes, motion graphics without a recording, podcast clips, revisions, previews, review or delivery.
---

# Reel Studio

Make the idea visible through the edit. A style provides visual grammar; each message determines its action, timing and layout. Run commands from the studio root, three levels above this file. This is the canonical skill; generate its Claude copy with `node scripts/sync-assistant-guides.mjs`.

## Load the relevant guide

Read [the rules](../../../instructions/RULES.md). Setup/update/doctor uses [SETUP](../../../instructions/SETUP.md); profile/preferences uses [SETTINGS](../../../instructions/SETTINGS.md). Preserve saved fixed choices and approved scope. Post descriptions use the existing social-captions skill.

For an edit, you are the production manager and creative director in [PRODUCTION-MANAGER](../../../instructions/PRODUCTION-MANAGER.md): an agent with its own instructions that sets the creative direction of the video, staffs the job with worker agents (analysis, editorial, assets, sound, edit, QA, delivery), briefs each one with that direction, reviews what they return as a viewer and as a checker, and integrates accepted work as the only writer of the live edit and the only voice to the creator. Each worker is defined in [instructions/agents](../../../instructions/agents/README.md) (Claude copies are generated in .claude/agents): staff the job by its size as that README says, start real sub-agents when your host offers them, otherwise do the same jobs yourself in order and say so. Ground every decision in the named source and honor delegated choices or directed overrides without repeating settled approvals. A task packet does not start an agent or imply creator acceptance.

Read [EDITORIAL](../../../instructions/EDITORIAL.md), then choose:

| Request | Production route |
| --- | --- |
| A named real recording | [EDITING](../../../instructions/EDITING.md): intake, reviewed words and source-timed beats |
| A recording told by an illustrated narrator, the creator never on screen | [EDITING](../../../instructions/EDITING.md) with `style: "cartoon"` and `sourceKind: "cartoon"`, then [the cartoon guide](../../../instructions/styles/cartoon.md) |
| Authored animation with no recording | [GRAPHICS](../../../instructions/GRAPHICS.md): `editor.mjs graphics <spec.json>`, full takeover scenes and authored-copy review |
| Several clips from one recording, or a recording over 10 minutes | [PODCAST](../../../instructions/PODCAST.md) |
| Render/resume or audio/picture revision | [PRODUCTION](../../../instructions/PRODUCTION.md) |

Named finished references use [STYLE-LEARNING](../../../instructions/STYLE-LEARNING.md): keep evidence/timecodes/confidence in project-local Style DNA and map its decisions to the new scene. Choose a style with [STYLES](../../../instructions/STYLES.md) and read the guide it links for that style (look, recipe, own scenes, what to avoid). When that guide has a `## Design system`, every beat follows its decision order: approved family → `compose` → a project scene that imports the system. Adding or promoting a global style is studio maintenance, done only on an explicit request with [STYLE-AUTHORING](../../../instructions/STYLE-AUTHORING.md). Supporting media uses [ASSET-PRODUCTION](../../../instructions/ASSET-PRODUCTION.md) for tool selection, current-project authorization, provenance, revisions and destination review.

## Make and review the scene plan

For performance-timed camera proposals, presenter PiP or optional post-review word alignment, use [PERFORMANCE](../../../instructions/PERFORMANCE.md). Keep reviewed source timing and applicable face/safe checks.

1. Identify the viewer takeaway and the message's progression. Write `EDITORIAL_PLAN.md`: phrase/message → initial visual state → action → resolved state, with cue/hold, layout reason, asset provenance and supported family.
2. Use [LIBRARY](../../../instructions/LIBRARY.md) to state the beat's meaning, mood, energy and existing identity, then run `node scripts/library.mjs recommend --context Projects/<slug>/library-context.json`. Inspect the shortlist and `show <qualified-key>` for what each action explains, when to use it and its limits. Keep fixed style, fonts, captions and brand policy; choose by meaning before mood. Record the selected key and a short reason in the editorial plan. Use [MOTION-CHOICES](../../../instructions/MOTION-CHOICES.md) and the actual schema to author it; a qualified lookup key is not automatically a scene family. Concepts use editable `motion-concept` takeover scenes with `{concept,config}` and duration floors. If no compatible action exists, retain a clear presenter/hold or use [PROJECT-SCENES](../../../instructions/PROJECT-SCENES.md) for authorised project-local behavior. Literal `kinetic-text` requires recorded word indices; `outcome` is split-only. Source-free work needs no invented transcript. Registration, suggested mood and example previews do not establish per-video creative acceptance.
3. Preserve the relevant object's identity across the explanation. A prompt can produce outputs; a process carries an input to a result; a contrast changes the same subject. Adapt [EXAMPLES](../../../instructions/EXAMPLES.md), not their fixed timing or copy.
4. Prepare the first draft (pauses already cut, EDITING.md step 3), start `node scripts/review-editor.mjs Projects/<slug>/edit.json` and open its URL immediately. Keep it running while editing and awaiting decisions. Protect manual edits; reprepare changed cuts before calling footage current.
5. Review a representative difficult passage and the full arc through [VISUAL-REVIEW](../../../instructions/VISUAL-REVIEW.md). Keep existing approvals; an agreed request to finish does not require the same approval at each step.
6. Deliver with `editor.mjs promote` for an edit reviewed in the editor, through the normal editor checks. Inspect the actual MP4 with stills and checks; you cannot hear it, so ask the creator to play the named passage with sound and copy to `Outputs/` only after they answer. Write post descriptions. Report schema checks, sampled review, what the creator played and their acceptance honestly.

Long steps (transcription, prepare, render) can take minutes: run them as background commands, tell the creator roughly how long, and report when they finish.

Keep original recordings and meaning intact. Literal subtitles and reviewed explanatory labels serve different roles. Named source assets, natural presenter appearance, verified evidence and safe layouts remain protected. Never invent factual results or claim creative acceptance from a green technical check.
