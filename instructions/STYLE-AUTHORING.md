# Add or promote a style

Use this checklist only when the creator explicitly asks to add a style to the studio, or to promote a project-local direction (see [STYLE-LEARNING.md](STYLE-LEARNING.md) and [PROJECT-SCENES.md](PROJECT-SCENES.md)) into a registered style. A registered style ships to every creator, so this is studio maintenance, separate from editing a video. Work on a local branch, keep installs and scratch local, preserve concurrent changes, and commit or push only when the creator asks.

A style is a folder of data plus a theme. The registry derives every list that used to be kept by hand (ids, labels, defaults, recommendation scores, sound palettes, policies), so a complete folder and its guide are the whole change. Tick each box in order; the list of styles is [STYLES.md](STYLES.md).

## 1. Scope the style

- [ ] Choose an immutable lowercase kebab-case id. It becomes a saved setting value and never changes afterwards.
- [ ] Write the Arabic label and description shown on the settings card, and the English label and description.
- [ ] Choose the use cases (`explainer`, `case-study`, `tutorial`, `comparison`, `opinion`, `story`) and the grammar literals.
- [ ] Reuse existing grammar literals where possible. A new literal is added to `StyleGrammar` in `engine/src/styles/types.ts` and needs a renderer branch in every consumer of that field. List the consumers of `card`, `typography`, `annotation`, `composition` and `caption` with `git grep -nE "grammar\??\.(card|typography|annotation|composition|caption)" -- engine/src`, which works in Git Bash and PowerShell and matches both `grammar.card` and `grammar?.card`. The `motion` literal is read only as the default for a scene's `motion` (`git grep -nE "grammar\??\.motion"` finds it in `scripts/lib/editor-director.mjs`), and the renderers branch on that scene field, so for `motion` search an existing literal such as `git grep -nw "quiet" -- engine/src`. A new `motion` literal must also join every `z.enum` scene schema that lists `land`, `stagger` and `quiet` (that search finds them) and `MOTIONS` in `engine/src/review-editor/ops/scenes.ts`. Searching any existing literal of a field, for example `git grep -n "signal-strip" -- engine/src`, lists its branches. A literal without a branch renders as the plain default card.
- [ ] Decide whether the style needs its own scene families (section 7). Most styles do not.

## 2. Register the style

- [ ] Create `engine/src/styles/<id>/meta.ts` with `defineStyle({...})` and every `StyleMeta` field: `id`, `label`, `description`, `useCases`, `grammar`, `legacy`, `brand`, `pip`, `defaults`, `fit`, `ownScenes`, an optional `mix`, and `since`.
- [ ] Append the meta to `STYLE_METAS` in `engine/src/styles/registry.ts`. Registry order breaks recommendation ties, so a new style goes last unless the creator decides otherwise.
- [ ] Keep `registry.ts` and every `meta.ts` Node-safe. Setup loads them before `npm ci`, so use explicit `.ts` import extensions, no JSX and no packages.
- [ ] Set `since` to the studio version that introduces the style, `legacy` to false, and `brand` to true only when the style takes the profile's brand colours.
- [ ] Set `pip` to `{allowed, basis, evidence}`. Use `allowed: false`, `basis: 'inference'` and one line of evidence unless the presenter window was checked on real footage.
- [ ] Keep the `fit` scores below the winners asserted in `tests/editorial-scenes.test.mjs`, `tests/styles-v2.test.mjs` and `tests/preferences.test.mjs`. List the style's own scene families in `fit.semanticBeats` so a brief that uses them can select it.
- [ ] Set `defaults`: the font, the captions presentation, and whether clause captions and static captions are on.

Shared scene families keep their data schemas. Register a style's drawing components in `engine/src/styles/family-designs.tsx`; prepared edits, the library preview and the creative gallery use that registry before the shared renderer. Use `familiesOff` in the style meta to refuse known families the style does not draw. It must not overlap `ownScenes`; validation, editor choices and motion catalogs honor it.

## 3. Theme and geometry

- [ ] Create `engine/src/styles/<id>/theme.ts` with a default export `{theme, layout, galleryCut} satisfies StyleThemeModule`, and register it in `engine/src/styles/themes.ts`.
- [ ] Choose colours so every text pair reaches 4.5:1 contrast, and measure the pairs you define: `text`, `dim`, `good`, `bad`, `accent` and `pillText` on the canvas, the card and the pill.
- [ ] Check that every shared scene family and every motion concept stays legible in the new theme: `node scripts/concept-stills.mjs --concept all --style <id>`, then look at the stills.

## 4. Fonts

- [ ] Install fonts only through `versions.lock.json` `fonts[]`. Add one entry per family, subset and weight with `file` (a flat file name matching `^[A-Za-z0-9-]+\.woff2$`, no sub-folders, not used by another entry), `family`, `subset`, `unicodeRange`, `weight`, `style`, a `https://fonts.gstatic.com/` URL, a 64-character `sha256` and `bytes`.
- [ ] Measure `sha256` and `bytes` from the downloaded file instead of copying them from memory: `node -e "const b=require('node:fs').readFileSync(process.argv[1]);console.log(require('node:crypto').createHash('sha256').update(b).digest('hex'),b.length)" <file.woff2>`.
- [ ] Add the family to `DECLARED_FONTS` in `scripts/lib/font-css.mjs` (a variable family lists its axes there), then fetch the files, check the axes and write the pins into `versions.lock.json` and `engine/public/fonts/manifest.template.json`. A variable family (declared with `axes`) runs `node scripts/fetch-fonts.mjs --family <Name> --lock` alone; a static family also needs `--weights <list> --subsets <list>` matching its `DECLARED_FONTS` entry, for example `node scripts/fetch-fonts.mjs --family <Name> --weights 400,700 --subsets arabic,latin --lock`. Then add the family to `FAMILY` and `FACES` in `engine/src/core/fonts.ts` and its license line to `NOTICE.md`.
- [ ] Offer a new family in settings by appending it to `FONT_CHOICES` in `engine/src/styles/types.ts` and adding its preview faces to `PREVIEW_FAMILIES` in `scripts/lib/settings-fonts.mjs` (served by `scripts/lib/settings-server.mjs`) and a `labels.font` entry in `scripts/settings-ui/app.js`.
- [ ] Never commit `.woff2` files or `manifest.json`. Existing installs run the fonts step of setup once after updating; say so in the release notes.

## 5. Sound

- [ ] Create `engine/src/styles/<id>/sound.json` with `dna` set to `instructions/STYLES.md` and `kinds` for `transition`, `stamp`, `swap`, `click`, `count`, `reveal` and `type`. Each kind has exactly `recipe`, `gain`, `leadSec`, `confidence`, `basis` and `evidence`.
- [ ] A silent kind uses `recipe: null`, `gain: 0`, `leadSec: 0`, `confidence: 'none'` and `basis: 'authored'`. A sounding kind names a recipe from `Sound-Kits/catalog.json`, with `gain` from 0.01 to 2 and `leadSec` from 0 to 1 and shorter than the recipe's duration. A palette never names a `-sweep` recipe or a recipe built on a sweep voice (`whoosh`, `whooshSoft`, `whooshShort`, `swipe`): transitions land on a soft low landing or stay silent ([SOUND.md](SOUND.md)); the palette validator refuses a sweep.
- [ ] Give every kind, silent or sounding, a `confidence` of `high`, `medium`, `low` or `none` and a `basis` of `observed`, `inferred` or `authored`. `confidence: 'none'` goes together with `basis: 'authored'` and with nothing else, so any other confidence needs `basis: 'observed'` or `'inferred'`. `evidence` is a non-empty sentence of at most 600 characters.
- [ ] Make new sounds deterministic code: add a voice to `scripts/sfx.mjs` and a recipe to `Sound-Kits/catalog.json`. Never ship WAV or MP3 files or reference recordings. Keep the provenance wording "original deterministic synthesis" and update the voice and recipe counts in `Sound-Kits/README.md`.
- [ ] Cue only real state changes. Words, entrances and wipes stay silent unless the style's guide says otherwise.

## 6. Settings card

- [ ] Add the `.illustration.<id>` rules to `scripts/settings-ui/app.css`. The card text comes from the meta labels; a test requires one rule for every registered style.

## 7. Own scene families (only when a theme cannot express the style)

- [ ] Put them under `engine/src/styles/<id>/scenes/`: a zod `schema.ts`, the renderers, and a Node-safe `math.ts` when the timing math is tested without React.
- [ ] List each family in `ownScenes` in the meta. It is then registered once through `engine/src/styles/scenes.ts` and `engine/src/styles/scene-renderers.tsx`, and manifest validation refuses it in any other style.
- [ ] Keep every cue a frame relative to the scene, ordered and inside the scene, and make the schema reject cues that are not.
- [ ] Animate Arabic by word or line, never by character, and never add letter-spacing to Arabic text.
- [ ] Add the family's cue events to `scripts/lib/scene-cues.mjs`.
- [ ] Map beat intents to the family in `scripts/lib/editor-director.mjs` (`BEAT_FAMILIES`, the default layout and `SOUND_FOR_FAMILY`).
- [ ] Add an editable template and Arabic field labels in `engine/src/review-editor/ops/scenes.ts`, and a demo in `engine/src/review-editor/ops/demo.ts`.
- [ ] Hide captions while a takeover scene that draws its own words is on screen.
- [ ] Document the contract in the guide's Style-owned scenes section: the data fields, the timing rules and the limits.

## 8. Guide and documents

- [ ] Create `instructions/styles/<id>.md` from the template below, then run `node scripts/style-docs.mjs` to regenerate the table in [STYLES.md](STYLES.md).
- [ ] Add the style's still image `docs/images/style-<id>.jpg` and its card to the README gallery, and update any README count that names the number of styles.
- [ ] Do not write the number of styles into any instruction guide. The generated table is the only list.

```markdown
# <id>

## Look

One or two sentences on material, type, colour and caption treatment.

## Best for

The content this style serves, in one sentence.

## Layouts and footage

The layouts it uses (`split`, `takeover`), how the presenter and footage appear, and its picture-in-picture policy.

## Palette and brand

- **Brand colours:** applied or not applied, and the palette rule.

## Recipe

**Direction:** the function the style serves, in one short phrase

- **Decision:** when to choose it.
- **Composition/material:** what dominates and what supports it.
- **Timing/action:** what is cued, how it lands and what is held.
- **Transition/sound:** what carries across beats and which sound marks a real state change.
- **Application/review:** the families to use and what to check before delivery.

## Design system

Only a style with a design system carries this section: the law of the style, the parts and when to use each, the decision order, and worked compositions.

## Style-owned scenes

Each own scene family with its data contract, timing rules and limits. Without own families, say that the style renders the shared families.

## Avoid

- One mistake the style invites, in one sentence.
```

## 9. Scrub personal and third-party material

Remove all of this before the first commit. The history check keeps a leaked line flagged for good.

- [ ] Creator handles, avatars, profile photos and account names. A handle or watermark comes from the profile, never from the code.
- [ ] Reference reels, their URLs, account names, file paths and timecodes. What was learned stays in a project's Style DNA, not in the product.
- [ ] Third-party logos, marks, trademarks and traced brand shapes. Use original, generic shapes.
- [ ] Private paths (user folders, project folders, recordings, outputs), private analysis files and the names of source recordings.
- [ ] Dated approval notes and internal review records.
- [ ] Cloned-voice workflows and voice samples, personal sign-off clips, private tool paths and analytics.
- [ ] Use generic examples with neutral wording in tests, demos and the guide.

## 10. Verify

- [ ] `node --test tests/*.test.mjs` passes: registry, baselines, documents, cards and sound.
- [ ] `node engine/node_modules/typescript/bin/tsc --project engine/tsconfig.json --noEmit` passes.
- [ ] `node scripts/style-docs.mjs --check` passes, and `node scripts/sync-assistant-guides.mjs --check` passes when the skill changed.
- [ ] Render stills of every own scene family and of a shared family in Arabic and in Latin text with digits, and inspect the actual frames with [VISUAL-REVIEW.md](VISUAL-REVIEW.md).
- [ ] Show the fast preview to the creator and review the real video and sound, not only the logs.
- [ ] `git diff --check`, `node scripts/publication-check.mjs` and `node scripts/publication-check.mjs --history` pass.
- [ ] After a local commit the creator asked for, `node scripts/verify-clean-install.mjs --ref HEAD --cache-from . --doctor` passes.

## 11. Release

- [ ] When the creator asks to release, bump `edition` in `versions.lock.json` (a new style is a minor release) and, when engine code changed, `engine` there and in `engine/package.json` with its lock file.
- [ ] Add the CHANGELOG entry and the README "what's new" section. Write public notes in simple, neutral Arabic that explains the benefit, without private conversations or internal work details.
- [ ] Tag and push only when the creator asks, after every box above is ticked.
