# Settings and creator profile

Open `node scripts/studio.mjs settings` for first-run profile setup or an explicit request to change defaults. Keep the process and browser open. Saved preferences are the starting point for new work; a one-video choice does not rewrite them.

## Settings and profile (PROFILE.json, schema 3)

«افتح إعداداتي» or a request to change defaults: open `node scripts/studio.mjs settings` as a long-running command and open its printed local URL. Verify the save with `node scripts/profile.mjs check`. Preserve profiles at session start. Schema 2 is readable without rewriting; screen saves migrate and back up. On a stale save, reload instead of overwriting a newer change.

Each preference independently uses `{"mode":"auto","value":null}` or `{"mode":"fixed","value":"<listed choice>"}`:

| Preference | Fixed choices |
| --- | --- |
| `style` | Eleven ids in `instructions/STYLES.md` |
| `captionsGrouping` | `compact`, `clauses`, `single` |
| `captionsPresentation` | `pill`, `minimal`, `ink-strip` |
| `font` | `Cairo`, `Tajawal`, `Noto Naskh Arabic`, `Plex Display` |
| `writingStyle` | `short`, `educational`, `storytelling` |
| `palette` | `brand` (colours on supported styles) |

Automatic selection considers all eleven styles and the authored semantic mechanisms. Explicit choices win. Style cards are illustrations; font previews use installed fonts and label missing downloads.

**One video only:** keep PROFILE.json. Copy **all fields** printed by `node scripts/profile.mjs brief` into that video's brief. Add explicit `style`, `fontFamily`, `captionsGrouping`, `captionsPresentation` or `writingStyle` only for a user-requested override; these win over saved defaults. Example: saved paper-collage/Tajawal + «الفيديو ده بس خطوات منظمة» → brief `style: "section-deck"`, retain `preferences`, omit `fontFamily` override so Tajawal stays fixed. Explain the chosen style in the preview; don't repeat settled questions.

### Fallback when this host cannot open a browser

Ask, one at a time, and never invent an answer:

1. Name (person or brand).
2. Social handle — optional; `null` if they have none.
3. Follow card at the end? Needs the handle.
4. Default comment keyword for the CTA — optional; they can change it for each video.
5. Their recorded sign-off — the exact words they say at the very end, optional.
6. Brand colours: primary and accent (`#RRGGBB`); background and text are optional (`null` keeps each style's own). Offer the example's colours if they have none.
7. Platforms: Instagram, TikTok and/or YouTube Shorts. Preserve existing selections; do not add a platform the creator did not choose.
8. Each preference above: automatic or fixed from its listed choices. Offer automatic when undecided.

Write it like `PROFILE.example.json` (schema 3, `language` "ar-EG", all six `preferences`) and validate with `node scripts/profile.mjs check`. Relay Arabic errors and fix the answer. A request to change defaults authorizes that change; preserve all other fields. Prefer the screen's backed-up save.
