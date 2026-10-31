# A project-authored scene in the normal editor

Use this when the editorial action cannot be expressed well by a shipped family: a custom map, a diagram whose same objects change state, a collage, a visual metaphor or another authored explanation. Read EDITORIAL.md and the Recipe section of the chosen style's guide (linked from STYLES.md). Decide the visual action and reviewed copy before writing code. Keep ordinary families when they already serve the idea.

The assistant authors the scene inside the project's folder. The creator reviews its copy, timing and editable values in the same live editor. The project does not modify tracked engine files or register a new global composition.

## Start from a working example

Copy the contents of `instructions/examples/project-scene/` into a new `Projects/idea-flow-example/` folder. Read its README and scene code. The copy is an illustration with a synthetic review attribution; it is not approval for a customer's content. Adapt the idea and use the actual reviewer for customer copy.

```powershell
node scripts/editor.mjs graphics Projects/idea-flow-example/graphics-spec.json --check
node scripts/editor.mjs graphics Projects/idea-flow-example/graphics-spec.json
node scripts/editor.mjs prepare Projects/idea-flow-example/edit.json
node scripts/review-editor.mjs Projects/idea-flow-example/edit.json
node scripts/editor.mjs render Projects/idea-flow-example/edit.json
```

The new folder must not already contain a generated base or edit manifest. After initialization edit the existing manifest and reprepare; do not rerun initialization to replace it. Final delivery uses the ordinary `render ... --deliver` route after preview review.

## Declare the editable contract

`scene-pack.json` contains `{version: 1, scenes: [...]}`. Each scene declares:

- `id`: a unique lowercase slug.
- `label`: a short name for the authored component.
- `entry`: a TSX/JSX path relative to the pack, inside this same project.
- `fields`: an ordered list of editable values. Each field has `key`, `type`, optional `label`, `required`, `default`, `min` and `max`. Types are `string`, `number`, `boolean`, `color`, `asset`, `clip`, `enum`, `array` and `object`. An enum declares `options`; an array declares `items`; an object declares `fields`. Use short readable labels and appropriate limits.

Colour is a six-digit hex value. An asset value is a local image path relative to `engine/public/`; keep its bytes and provenance in the project's own untracked asset directory. Static custom assets go through the same image/dimension/hash checks as other scene assets. For moving screen captures use the existing `screens`, `screen-focus` or `screen-recording` families and their explicit media contracts. No remote media URL is a substitute for a verified local source.

A `clip` field holds a silent video clip registered with `node scripts/clips.mjs add` (see [EDITING.md](EDITING.md)). Its value is the clip's `src`, `sha256`, `width` and `height` plus optional `trimBeforeFrame` (when you write a clip value by hand, set `trimBeforeFrame` to the clip record's `inFrame`, as [EDITING.md](EDITING.md#named-b-roll-clips) explains for B-roll steps), `fit` (`cover` or `contain`) and `focus` (`x`, `y` from 0 to 1); the editor fills the file fields from a list of the project's registered clips. A clip field has no default, because a default would be a file nobody registered. Declare the clip field with `required: true` when the component always needs a clip, because an optional clip field arrives as `undefined` when the creator has not chosen one and `SceneClip` needs a clip. Draw it with `SceneClip` from `@reel-studio/core/clip`:

```tsx
import {SceneClip} from '@reel-studio/core/clip';

// values.background is a clip field
<SceneClip clip={values.background} width={1080} height={1920} />
```

`SceneClip` plays the verified file through the same footage component as the presenter, so safe-zone probes and previews apply, and it fails the render if the clip would be enlarged more than 1.25x in its box. Preparation checks every clip's hash, size, frame rate, silence and length against the scene. A project scene cannot import `OffthreadVideo`, `Video`, `Html5Video` or `@remotion/media` itself: the build refuses it and points to this field.

Nested defaults are validated and expanded consistently for preview, rendering and asset verification. Duplicate names, escaping paths and data that violate declared fields are rejected. Do not use `constructor`, `prototype` or other reserved keys. Contracts are bounded to 32 scenes, 32 fields per object and six nesting levels; composition code remains free to animate those authored values.

Graphics specifications and recording briefs refer to the pack with:

```json
{"projectScenePack":"Projects/idea-flow-example/scene-pack.json"}
```

Creation/planning embeds the resolved contract in `edit.json` as `projectScenes`. A normal scene then uses:

```json
{
  "id":"explanation",
  "family":"project-scene",
  "layout":"takeover",
  "motion":"quiet",
  "fromFrame":0,
  "durationInFrames":360,
  "data":{"component":"idea-flow","values":{}}
}
```

Fill `values` with the fields declared by that component; the empty object above is only a shape example. Recording briefs use `intent: "project-scene"` with reviewed source seconds. Both `takeover` and `split` are available. Source-free graphics still require full takeover coverage.

## Author the component

The entry exports one default React component. It receives `values`, `style`, `layout`, `motion`, `durationInFrames`, `seam` and `headBox`. Remotion's `useCurrentFrame()` is local to this scene's Sequence; `useVideoConfig()` supplies the actual fps. Preserve object IDs, shapes and movement direction through the explanation instead of introducing an unrelated visual on each beat.

Import `react` and `remotion` normally. Shared authoring modules are available through `@reel-studio/`, for example `@reel-studio/core/motion` and `@reel-studio/core/safe`. Use literal imports, including literal `import("./helper")`, so the bundle can verify and fingerprint every dependency. Variable module names, Node-only modules and imports outside the project, shared engine source or installed engine dependencies are rejected. Project scenes are locally authored code; inspect third-party code before using it.

In a style with a design system (see the style guide's `## Design system`; today `magazine-interview`), every project scene the edit uses must import that system, directly or through a helper, or the build refuses it. Wrap the drawing in `SystemScope` and use the system's tokens, zones and parts, so the scene reads as the same magazine:

```tsx
import {SystemScope, NAVY, AR, HEAVY, magazineZones} from '@reel-studio/styles/magazine-interview/system';

export default function Idea({values, layout, seam, durationInFrames}) {
  const zone = magazineZones(seam)[layout];
  return <SystemScope data={values} layout={layout} seam={seam} durationInFrames={durationInFrames}>
    <div style={{position: 'absolute', left: zone.x, top: zone.y, width: zone.width, color: NAVY.ink, fontFamily: AR, fontWeight: HEAVY}}>{values.title}</div>
  </SystemScope>;
}
```

Project scenes do not receive the transcript words. Write each cue as a scene-local frame in the declared values, as the editable contract above requires.

Keep meaningful content in the active platform safe zone. A split scene uses the supplied seam and head box to avoid the presenter. Use the established CanvasFill/SafeExempt/probe contract for decorative backgrounds, keep critical text visible in probes, and preserve source facts, natural faces and recorded words. The shipped sample demonstrates the contract with locally drawn SVG objects.

## Review changes and deliver

- Values, timing and layout use the normal forms and live manifest following. Invalid values cannot replace a valid saved edit. Manual drafts and stale-save protection remain active.
- Code or a statically imported helper changes the bundle identity. After changing scene code, save any manual draft, reprepare and reopen the editor to load the new component. An existing editor warns when its scene code differs from disk; do not approve an old preview as the new revision.
- A changed contract must be reloaded from `projectScenePack` into the manifest and prepared again. Do not edit the embedded contract to make invalid values appear valid.
- Preparation records scene-code dependencies and asset hashes. Rendering rejects a preparation made against different code or assets. The rendered bundle and editor use the same component registry.
- Review the complete action, cue, readability, final hold, factual assets and sound through VISUAL-REVIEW.md. Existing delivery gates still apply. Source-free work does not invent a presenter or speech track.

The supplied illustration proves a reusable authoring route; it does not determine the style, copy or creative acceptance of a new video.
