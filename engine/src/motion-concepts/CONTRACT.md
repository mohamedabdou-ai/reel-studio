# Motion concept authoring contract

Fifteen reusable graphics scenes live in this directory. Each targets a
1080x1920 composition, supports the seven studio styles and accepts validated
copy. Use `button-to-window/` as a source example and see the
[library guide](../../../third-party/motion-concepts/README.md) for usage.

## File layout

```text
motion-concepts/
  types.ts, timeline.ts, geometry.ts, color.ts, fields.ts, shared.tsx
  catalog.ts       Node-loadable metadata, without React scene imports
  registry.ts      Component registry and metadata validation
  <id>/
    index.ts       Named concept export: metadata, schema, demo and component
    schema.ts      Strict data schema, copy limits and SAMPLE demo
    math.ts        Pure layout and frame-state calculations
    scene.tsx      ConceptStage and drawing based on the calculated state
```

Update `index.ts` and `catalog.ts` together. Shared helpers affect all concepts;
keep timing, layout and theme behaviour consistent when changing them. The
preview compositions are registered separately in `entry.ts`, used by
`scripts/concept-stills.mjs`; the default engine root does not register them.

## Scene rules

1. **Frame timing.** Define beats as fractions of the sequence length and use
   `beatFrames` and `EASE`. Mount with an explicit `durationInFrames`. The
   `minFrames` floor is defined at 30 fps; `minFramesAtFps` scales it to the
   composition's frame rate while preserving its minimum length in seconds.
2. **Modes.** `once` ends in a frozen hold of at least 20% of the sequence.
   `loop` returns to its opening state at the sequence end. Use shared timing
   helpers for pulses, envelopes and whole-cycle ambient motion.
3. **Safe layout.** Derive layout from `CONCEPT_BOX`, `mainBottom`,
   `SURFACE_INSET` and `SURFACE_REACH`; include shadows in the bounds. Avoid
   copied safe-zone numbers. Concepts target `ig-reels-organic` and have no
   safe-profile option. Their optional caption belongs to the organic band;
   leave it unset for ads and review the full composition's safe area.
4. **Presenter.** Concepts draw graphics only and do not locate a face.
   The caller must keep cards and text away from the presenter's face, hair
   and beard and review overlap with footage.
5. **Arabic copy.** Use `ConceptText`, `Bidi`, `formatNumber`, `digitsFor`
   and `numberFont`. Fitted text rejects overflow. Use `copy(max)` and strict
   schemas, with limits counted in code points. Reject blank or unsafe control
   text. The optional caption is one line, at most `CAPTION_MAX` characters.
6. **Styles.** Use `getSceneTheme`, `uiColors`, `tint`, `alpha`, `styleShape`
   and `surfaceShadow`. Keep text readable across all seven styles instead of
   embedding a fixed palette or card shape.
7. **Determinism.** Derive motion from the frame. Use seeded randomness when
   needed. Avoid wall clocks, timers, CSS animations and `Math.random`.
8. **Rendering.** Prefer SVG, transforms and opacity; keep filters and shadow
   cost small. Use `Dressing` for decoration so probe renders can omit it.
   `backdrop="none"` must preserve a transparent background.
9. **Data and assets.** Labels, numbers and brand names come from the caller.
   Demo data stays labelled SAMPLE. Images use validated relative `staticFile`
   paths. Preserve recorded word order and use appropriately licensed assets.

## Verification checklist

- Schema accepts the demo and intended real copy, rejects invalid lengths,
  unknown fields and unsafe asset paths, and explains its text limits.
- Both modes have valid integer beats at the minimum and longer durations;
  once holds stay frozen and loop endpoints match.
- Layout, text and shadow bounds stay inside the intended safe region across
  styles and writing directions. Frame calculations remain finite and do not
  depend on evaluation order.
- Review representative frames and the moving scene with Arabic and mixed
  text, actual copy, the intended footage and the intended frame rate.
- Run the available studio checks from the repository root after setup:

```powershell
node engine/node_modules/typescript/bin/tsc --project engine/tsconfig.json --noEmit
node --test tests/*.test.mjs
```

The shipped `tests/` suite covers settings and preferences, including caption
fit. There is no dedicated motion-concept test suite in this package. Add
focused checks for changed math or schemas where useful; do not treat a type
check or passing studio tests as proof of a scene's visual quality.
