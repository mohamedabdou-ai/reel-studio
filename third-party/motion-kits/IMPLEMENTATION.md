# Curated upstream motion primitives

## Runtime API

Import from `engine/src/motion-library/upstream.tsx`:

```tsx
<FrameReveal children={content} frame={frame} duration={18} distance={36} />
<DrawProgress progress={0.65} color="#e8b86d" width={420} height={12} />
<FocusCursor x={0.62} y={0.38} progress={clickProgress} color="#e8b86d" />
```

- `FrameReveal` uses frame counts and keeps `children` as one DOM block. It
  does not split Arabic into characters or words.
- `DrawProgress.progress`, `FocusCursor.x`, `FocusCursor.y`, and
  `FocusCursor.progress` are normalized `0..1` values and clamp invalid ranges.
- `AnimatedNumber({from,to,progress,prefix?,postfix?,toFixed?,className?,style?})`
  and `MaskedBlockReveal({children,frame,duration,distance?,style?})` are also
  exported for data-story and whole-block headline use.

All runtime primitives use explicit numeric inputs. They have no wall clock,
CSS animation, randomness, remote asset, or upstream package dependency.

## Curated source

| Repository | Immutable commit | Selected components |
| --- | --- | --- |
| `av/remotion-bits` | `6c71169aa061f15313fadbdc6e29a3a3a87f2c03` | `StaggeredMotion`, `AnimatedCounter` |
| `riaz37/remotion-ui` | `c0729bd638a1265995fd25a3b620bd2824d0cdc7` | `MaskedSlideReveal`, `PathDraw`, `SimulatedCursor` |

`manifest.json` contains immutable raw URLs, upstream SHA-256 values, stored
snapshot SHA-256 values, commit dates, and adapter mappings. The snapshots are
review evidence and are not imported into the engine. The stored files differ
from the fetched bytes only by one final LF. The manifest records both hashes
so the stored snapshot and its original bytes can be checked separately.

## Adaptation boundary

- `StaggeredMotion` became a single-child frame reveal. Its random ordering and
  internal motion framework imports were removed.
- `AnimatedCounter` became an explicit normalized-progress number interpolation.
- `MaskedSlideReveal` became an explicit-frame whole-block variant; upstream's
  automatic word splitting is not used.
- `PathDraw` became a dependency-free line with `pathLength={1}` and an explicit
  dash offset.
- `SimulatedCursor` keeps the upstream pointer and click-ring structure while
  accepting normalized coordinates and click progress directly.

## License review

Both upstream projects declare MIT. `riaz37/remotion-ui` includes a complete
MIT file and copyright notice at the pinned commit. `av/remotion-bits` declares
MIT in `package.json` and its README but has no standalone license file in that
commit (the GitHub license endpoint returns 404). `LICENSES.md` preserves this
distinction and the available notices.

## Verification

After engine dependencies are available, run from the repository root:

```powershell
node engine/node_modules/typescript/bin/tsc --project engine/tsconfig.json --noEmit
node --test tests/*.test.mjs
```

These commands check engine types and run the tests shipped with Reel Studio.
They do not provide a dedicated visual or checksum test of these adapters.
To check provenance, hash each `snapshot` file's stored Git bytes with SHA-256
and compare them with `sha256` in [manifest.json](manifest.json); removing the
documented final LF should match `upstreamSha256`. Windows checkouts can convert
LF to CRLF, so their working-file bytes may differ. Review changed adapters at
their actual frame and progress values, including intact Arabic text. Preserve [LICENSES.md](LICENSES.md)
and the pinned source snapshots when modifying an adapter.
