# Project-local scene example

This is a silent, synthetic 12-second illustration, not a measured result or a creator-approved video. Three persistent SVG objects move from scattered notes into a process, become illustrative chart bars, then emphasize one next step. Their bar heights express the animation only. The actual authored copy is attributed to `Synthetic fixture author`.

Copy this folder's `scene-pack.json`, `scenes/` and `graphics-spec.json` into a new `Projects/idea-flow-example/` folder. Keep both `id` and `projectScenePack` in the specification consistent if you choose another project name.

```powershell
node scripts/editor.mjs graphics Projects/idea-flow-example/graphics-spec.json --check
node scripts/editor.mjs graphics Projects/idea-flow-example/graphics-spec.json
node scripts/editor.mjs prepare Projects/idea-flow-example/edit.json
node scripts/review-editor.mjs Projects/idea-flow-example/edit.json
node scripts/editor.mjs render Projects/idea-flow-example/edit.json
```

Open the printed review URL and inspect movement and text in the actual preview before claiming creative acceptance. `--check` validates the specification only. The initialized project remains editable; update its existing `edit.json` instead of running initialization over it.

The declared title, result label, accent color and three item labels are editable values. The component uses Sequence-local `useCurrentFrame()`, `useVideoConfig().fps`, local Cairo fonts and probe-aware `CanvasFill`. It requires no media, paid API, external URL or additional package. Takeover layout is designed for this example; author a separate layout if your scene needs split footage. Meaningful content stays within x 100–880 / y 320–1420 and avoids the organic UI rail.

The scene is ordinary project code, not a fixed engine preset. Its `style` and `motion` props are available for your own design rules; this illustration deliberately defines its own palette and continuity while its editable `accent` value controls the emphasis.
