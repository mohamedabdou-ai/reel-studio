# magazine-interview

## Look

A print magazine alternating navy and cream pages, gold hairlines and folios; Alexandria thin/heavy contrast with Source Serif 4 accents and IBM Plex Mono numerals. Captions follow each page's ink and ground.

## Best for

Interviews, chapters and accurately attributed quotes.

## Layouts and footage

Uses the shared `split` and `takeover` layouts. [MOTION-CHOICES.md](../MOTION-CHOICES.md) records each family's layout support and [PERFORMANCE.md](../PERFORMANCE.md) records presenter picture-in-picture.

## Palette and brand

- **Brand colours:** not applied; the style keeps its own palette.

## Recipe

**Direction:** preserve the speaker's authority and wording

- **Decision:** Choose it for a quote, interview chapter or attributed viewpoint. Identify whose words are being shown and which context makes them accurate.
- **Composition/material:** Use navy or cream pages, gold hairlines and the measured thin/heavy headline contrast. Chapter quotes keep the supplied chapter, quote and attribution; verdict presents supplied scores.
- **Timing/action:** Keep the fixed pilot page choreography, restrained rings and stamp. Count remains split; statement remains over footage.
- **Transition/sound:** Prefer the signature `magazine-flip` between compatible adjacent takeover scenes. This is a director choice: the code preserves authored transitions and does not propose them automatically. Follow its layout and two-scene contract in [MOTION-CHOICES.md](../MOTION-CHOICES.md); sound follows [SOUND.md](../SOUND.md).
- **Application/review:** `chapter-quote` carries title, quote, speaker and role; check all against the source. Review cover overlap and the quote transition if enabled. A shorter paraphrase belongs in a reviewed explanatory label, not quotation marks.

Presenter scenes (`kinetic-hook`, `creator-cta`, `statement`) keep every band, panel and text block outside the prepared head box, which already includes the chin allowance. A title that cannot fit above moves below when space permits; otherwise its band is omitted. Without an envelope, reserve y 380-1000 for the talking head. `kinetic-hook` first keeps its approved upper placement, then tries the full block below the chin. If that cannot fit before y 1150, use the compact form: label and stamp share opposite ends of one row, the one-line title may fit down to 72 px, and the gold rule stays under it. Hide and warn only if even this compact form cannot fit (a chin past about y 1000); choose a split-capable scene instead of forcing `kinetic-hook` to an unsupported layout.

## Design system

Every scene in this style is drawn with one design system, whatever the speaker says. Code: `engine/src/styles/magazine-interview/system/`; project scenes import `@reel-studio/styles/magazine-interview/system`. Preparation reports any scene that would fall back to the old shared look in `undrawnScenes`; that list must be empty.

**The law of the style**
- Navy paper by default. Cream only when the author sets `paper: "cream"`, and never two cream pages in a row.
- One gold surface per page at most. Gold is for hairlines, the focal word or number, and one filled chip. No red, green, glow, drop shadows, tilts or pulses.
- Headlines contrast thin and heavy weights. The key words go heavy, the rest thin.
- Small numerals: Latin digits use Plex Mono 500, Arabic-Indic digits use Alexandria 600; both are tabular. The face follows the digits actually drawn.
- Size floors: reading text 34 px, labels and meta 28 px, chat text 46 px, proof pages 42 px, body columns 44 px. A part that cannot fit shrinks to its floor, then warns; it never overflows silently.
- Zones: content sits in x 65 to 1015, starting at y 350 under the folio. Takeover ends at y 1150; split ends at min(1150, seam − 88). Below y 1150, content keeps its right edge at or left of x 853 (the platform rail).
- One focal point per page. Motion lands; it never overshoots or bounces. Each part appears on the word that says it.

**Decision order for every beat** (binding for the director and the editor):
1. Use an approved family when it states the meaning exactly.
2. Otherwise write a `compose` scene: pick the arrangement and the parts, and anchor each part to the spoken word that triggers it.
3. If the parts cannot express it, author a project scene that imports the system.

**Arrangements.** Leading kickers and headlines form the head; trailing lines and rules form the foot; everything between is the body. A page holds 1 to 6 parts and at most one `emphasis`.
- `hero`: exactly one emphasised part.
- `stack`: parts one under another.
- `two-column`: 2 or 4 body parts.
- `grid`: 2 to 4 cells, each a card, number, ring or marks.

A `screen` fills the body alone.

**Parts and when to use each**

| Part | Use it for |
|---|---|
| `kicker` | The section label: what the page is about, 38 characters at most. |
| `headline` | The claim itself, 100 characters at most; the key words go heavy. |
| `line` | One takeaway line with the diamond, usually in the foot. |
| `body` | A short column when a sentence of context is needed. |
| `number` | One figure that counts up, with its label, unit and suffix. |
| `bars` | 2 to 5 amounts compared side by side. |
| `ring` | A share of a whole (value out of max). |
| `quote` | The speaker's exact words with name and role, checked against the source. |
| `list` | 1 to 6 rows marked check, cross or none. |
| `card` | One framed item: `plain`, `ticket` (offer), `input` (prompt), `follow` or `stamp`. |
| `chat` | 1 to 4 messages; the newest one is the hero. |
| `screen` | A web, chat or dashboard page built from blocks, with one block in focus. |
| `steps` | 2 to 4 stops of a route or process. |
| `media` | A named image, a verified clip, or a before/after compare. |
| `marks` | A verdict: one check or cross with its label. |
| `rule` | A gold hairline that closes or separates. |

**Worked compositions.** These are `data` objects for a `compose` scene. `at.word` is the index of the spoken word in the transcript; `dt` shifts the part by up to 2 s.

1. Number reveal (hero):
```json
{"arrangement":"hero","section":"النتيجة","parts":[{"id":"k","kind":"kicker","text":"بعد ٣ شهور","at":{"word":12}},{"id":"n","kind":"number","value":48,"suffix":"%","label":"زيادة في المبيعات","emphasis":true,"at":{"word":15}},{"id":"f","kind":"line","text":"من غير ما نزوّد الإعلانات","at":{"word":19}}]}
```
2. Quote (hero):
```json
{"arrangement":"hero","parts":[{"id":"q","kind":"quote","text":"العميل مش بيشتري المنتج، بيشتري النتيجة","speaker":"سارة علي","role":"مديرة تسويق","emphasis":true,"at":{"word":30}}]}
```
3. List (stack):
```json
{"arrangement":"stack","parts":[{"id":"h","kind":"headline","text":"تلات حاجات قبل ما تنشر","at":{"word":40}},{"id":"l","kind":"list","items":[{"text":"هوك في أول ثانيتين","mark":"check"},{"text":"كابشن مقروء","mark":"check"},{"text":"موسيقى عالية فوق الكلام","mark":"cross"}],"staggerFrames":12,"at":{"word":44}}]}
```
4. Before and after (hero media):
```json
{"arrangement":"hero","parts":[{"id":"k","kind":"kicker","text":"قبل وبعد","at":{"word":60}},{"id":"m","kind":"media","source":{"kind":"compare","before":{"src":"projects/demo/before.png","width":1080,"height":1350,"label":"قبل"},"after":{"src":"projects/demo/after.png","width":1080,"height":1350,"label":"بعد"},"revealFrames":45},"emphasis":true,"at":{"word":62}}]}
```
5. Mini chart (two-column):
```json
{"arrangement":"two-column","parts":[{"id":"h","kind":"headline","text":"المشاهدات زادت والتكلفة قلّت","at":{"word":80}},{"id":"b","kind":"bars","items":[{"label":"يناير","value":12},{"label":"فبراير","value":19},{"label":"مارس","value":31}],"unit":"ألف","at":{"word":83}},{"id":"r","kind":"ring","value":62,"max":100,"label":"أقل تكلفة","at":{"word":88}}]}
```
6. Chat (stack):
```json
{"arrangement":"stack","parts":[{"id":"k","kind":"kicker","text":"رسالة من عميل","at":{"word":100}},{"id":"c","kind":"chat","messages":[{"from":"them","author":"أحمد","text":"هو الكورس ده ينفع للمبتدئين؟","offsetFrames":0},{"from":"me","text":"أيوه، بيبدأ من الصفر","offsetFrames":30}],"at":{"word":102}}]}
```
7. Screen:
```json
{"arrangement":"stack","parts":[{"id":"k","kind":"kicker","text":"لوحة التحكم","at":{"word":120}},{"id":"s","kind":"screen","page":"dashboard","title":"المبيعات","blocks":[{"kind":"heading","text":"أكتوبر"},{"kind":"stat","text":"طلبات","value":312},{"kind":"row","text":"متوسط الطلب","value":410}],"focus":1,"at":{"word":122}}]}
```
8. Timeline (steps):
```json
{"arrangement":"stack","parts":[{"id":"h","kind":"headline","text":"الطريق من الفكرة للنشر","at":{"word":140}},{"id":"st","kind":"steps","items":[{"title":"الفكرة","offsetFrames":0},{"title":"التصوير","offsetFrames":18},{"title":"المونتاج","offsetFrames":36},{"title":"النشر","offsetFrames":54}],"at":{"word":143}},{"id":"f","kind":"rule","at":{"word":150}}]}
```
In split, keep a route to 3 stops and a comment thread short; longer ones go to takeover.

## Style-owned scenes

- **Owned beat:** `verdict`, takeover only in this style: `question`, 2–4 `rows` with label/value/outOf/atFrame, `verdict` and `verdictFrame`. Scores are non-negative and cannot exceed outOf. Row cues and verdict are strictly ordered inside the scene; the template is 150 frames with cues 30/46/62/84.
- **Shared beat:** `chapter-quote` uses the supplied chapter, title, quote, speaker and role. The approved takeover drawing keeps its fixed frame-20 quote cue; optional cover and quoteFrame do not alter that drawing. Existing shared split behavior remains available.
- Library scores are labelled «مثال» and are illustrative; replace them with reviewed creator data.

## Avoid

- Avoid effects that obscure a speaker's face or imply an unspoken emphasis.
- A shorter paraphrase belongs in a reviewed explanatory label, not quotation marks.
