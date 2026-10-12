# Produce assets for a specific scene and keep their evidence

Use this guide when an edit needs a screenshot, source still, illustration, generated image/video, music, sound effect or other supporting media. Read [EDITORIAL.md](EDITORIAL.md) first. Every asset has a purpose in a named scene: proving a real state, explaining a relationship, preserving visual continuity or supporting a visible action. An empty space alone is not an asset brief.

## Choose the media and the available tool

1. Identify the scene ID, viewer takeaway, required media type and intended placement. Decide whether the asset is evidence or illustration. A source still, verified screenshot or simple local diagram may explain the idea better than generation.
2. Check the named existing assets first, within their assigned roles. Preserve originals. For a factual product state, use the actual authorized capture; a generated interface cannot prove that the product works. Use a local authored vector/component for editable diagrams and relationships.
3. Discover the current tool/connector capabilities and input schema before choosing a provider. Use the host's available-tool listing, relevant skill and connector documentation; do not invent tool names, accepted models or import paths. Prefer a sufficient connected tool. If unavailable, report the limitation and choose a documented local or browser workflow within scope.
4. Select tools by the need: image generation/editing for bitmap illustration, deterministic crop/retouch for a supplied photo, a project scene for editable motion, video generation for a justified visual shot, TTS only for approved authored speech, and music/SFX for an audio role. Preserve the user's chosen service. Check input access, aspect/dimensions, format, transparency, duration and any exposed cost before running.

An image's appearance is reviewed by viewing it. A video requires probe and actual motion review; an audio asset requires listening. A job's success status, thumbnail or HTTP response does not establish quality. Import only a usable output actually returned by the tool, using its documented download/import mechanism. Keep the generation ID/status so an uncertain outcome can be recovered before spending on a duplicate job.

## Authorization follows this project and operation

Read the current request and established scope. Approval from another customer, project, old plan or provider session does not authorize paid work here. Plan approval alone does not create a blanket spending allowance. Record the actual approval scope, operation/provider and any cap when supplied; if paid production is already explicitly authorized within that scope, continue without per-asset reapproval. Ask before additional expensive work outside it, with a concrete proposed asset and exposed cost/limit when available.

Reference analysis does not authorize reuse of its footage. Asset generation does not authorize a new identity/likeness treatment, voice cloning or replacement dialogue. Existing recorded speech stays intact unless that change is explicitly approved. A voice or media tool's availability does not imply those permissions.

For an unapproved direction, use authorized local placeholders/diagrams or named source derivatives to make a reviewable sample. Mark placeholders and keep them out of final delivery. Do not silently replace a required factual screenshot or geographic asset with a fabricated illustration.

## Maintain a project-local asset ledger

Write `Projects/<slug>/assets.json` as the structured ledger and `ASSET_MANIFEST.md` as its concise readable summary. These are production records, not new fields accepted by `edit.json`. Use stable asset IDs, append revision entries, and explicitly choose the revision used by each scene. Keep generated/downloaded derivatives in `Projects/<slug>/assets/`. When a scene requires a public-local `src`, stage the selected derivative in a project-specific untracked folder under `engine/public/` using the documented scene contract. Record both paths; do not point a renderer at an unsupported arbitrary path.

Each asset entry contains these slots:

| Slot | Required record |
| --- | --- |
| Identity | `id`, `kind`, `role` (`evidence` or `illustration`), purpose and exact scene destination(s) |
| Provenance | Named source file/URL, supplied ownership/usage information, access date when relevant and derivative relationship |
| Usage/license | License or permission source, permitted use/required attribution if known, verification status; `unknown` remains explicit |
| Production | Tool/provider, operation/model when exposed, job ID, actual prompt/settings/seed/duration/aspect when applicable; deterministic local edits record their operation |
| Authorization/cost | Current-project approval evidence/scope, any cap and actual/reported cost when exposed; unknown costs stay unknown |
| Revision identity | Revision ID, parent revision, original output path, staged `src` if used, hash and media metadata |
| Purpose and placement | Scene ID, source/edit-frame destination, placement/crop role and how it supports the planned action |
| Review | Exact revision reviewed, method/range, findings, reviewer and accepted/rejected/awaiting-review status |
| Selection | Selected revision plus the reason; retain rejected revisions and their findings |

For sources or generated outputs with unclear rights, report the missing usage evidence and resolve it before intended use. A URL, a file supplied for analysis or the word “stock” is not a license record. Record supplied attribution accurately and give relevant credits to the publish-copy workflow; do not invent a license or claim ownership on the creator's behalf. Private reference URLs and ledger notes stay in the local project.

The following compact record illustrates the structure for a local authored diagram. It is an example of documentation, not an existing asset, paid approval or customer acceptance:

```json
{
  "version": 1,
  "assets": [{
    "id": "input-token",
    "kind": "vector",
    "role": "illustration",
    "purpose": "Keep the input recognisable while it enters the process",
    "destinations": [{"sceneId": "process-main", "role": "moving input"}],
    "provenance": {"type": "local-authored", "source": "project scene code"},
    "usage": {"status": "documented", "basis": "original local diagram; no external media", "credits": []},
    "production": {"tool": "project-scene", "operation": "draw labelled paper token"},
    "authorization": {"scope": "local draft for current scene plan", "paid": false},
    "reportedCost": {"amount": 0, "basis": "local production"},
    "revisions": [{
      "id": "r1",
      "parent": null,
      "path": "scenes/Process.tsx",
      "review": {"status": "awaiting-review", "method": "not yet reviewed", "findings": []}
    }],
    "selectedRevision": "r1"
  }]
}
```

Media file revisions also record their real SHA-256, dimensions, duration/fps/audio presence or transparency as applicable. For a project component, record the reviewed code revision/hash and preview identity. The scene's actual asset contract may require extra dimensions/hash/alpha checks; consult it instead of treating this ledger as runtime validation.

## Produce, inspect, revise and place

Start with a brief containing the subject/action, explanatory purpose, composition, material, required factual/identity constraints, destination format and continuity with neighboring states. Generated text/numbers are draft visual content until checked; use editable scene labels when exact wording matters. Save the actual prompt and settings returned/used, without secrets or credentials.

Review each result before selecting it. For an image check subject, edges, transparency, unwanted artifacts, factual labels, crop and destination fit. For video check continuity, identity/anatomy when relevant, camera/action plausibility and the full requested duration. For audio check pronunciation/meaning, cadence, noise and how it competes with the recording. For screenshots check real state, legibility and authorized privacy redactions.

Give each retry a specific reason and change that could address the failure. Use a small representative proof before batching an untested generation approach. Set an iteration limit appropriate to the brief and authorized budget; after the limit or repeated failure, stop and propose a concrete change of approach. A failed sample does not authorize extra paid attempts. Preserve job IDs and rejected revisions instead of blindly resubmitting.

Place the selected revision in its actual scene/data/code, keeping its stable identity through movement. Check the composite in the live editor: aspect ratio, pixel quality, readable text, timing, crop, face/hair/baked captions, safe area and outgoing/incoming state. An individually good asset can fail in its destination. If scene code or asset bytes change, prepare/render fresh output and update the ledger's selected/reviewed revision; previous review belongs to the previous output.

Finish through [VISUAL-REVIEW.md](VISUAL-REVIEW.md) and the normal delivery checks. Record sampled review, playback and creator acceptance separately. Preserve originals and accepted outputs, include applicable credits, and remove placeholders from the delivery revision. Asset acceptance and publishing authorization are separate decisions.
