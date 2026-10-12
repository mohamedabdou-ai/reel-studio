---
name: social-captions
description: Write and check selected Instagram, TikTok and YouTube Shorts publishing copy (publish-copy.json → PUBLISH_PACK.md), including optional Instagram alt text, supplied credits and pinned comments. Use at every Reel Studio delivery, including silent authored graphics, for every podcast clip, and when the creator asks for post descriptions, hashtags, post SEO or revisions. A description is a search card and teaser in the creator's dialect, never a retelling. This does not edit on-screen subtitles; resolve a bare caption request from context.
---

# Social captions — the post description

This skill is the only guide for the text posted **under** the video (`publish-copy.json` → `PUBLISH_PACK.md`). It never changes the on-screen captions (the spoken words shown on the video, `captionsGrouping` / `captionsPresentation`). Other instructions in this folder only point here for the post description.

**Which captions?** In Reel Studio «الكابشن» usually means the on-screen captions (the Review Editor captions panel, `captionsGrouping`, `captionsPresentation`). This skill is only for the text under the video. If the creator says just «الكابشن» or "caption": timing, words on the video, font, position, size or the editor = on-screen captions, so do not use this skill; posting, hashtags, platforms, search or the text under the video = this skill. If it is still unclear, ask once: «تقصد الكابشن اللي على الفيديو ولا وصف المنشور؟» and run nothing until they answer.

The video delivers the content. The description has two other jobs:

1. **Search card:** the words people type go in the opening, and in a Shorts title when selected.
2. **Teaser:** it makes someone who has not watched want to, and someone who watched act (comment the keyword, save, share). It never retells the video.

## 1. Collect before writing

- Run `node scripts/profile.mjs writing --project <slug>`. Its `writingStyle`, `platforms` and `cta` are binding for this video; its `guide` is a one-line reminder of the shape (see the writing-style rule below).
- Read the reviewed spoken words (`captions.words` in `Projects/<slug>/edit.json`). For silent graphics, read the reviewed scene text and project scene values instead; empty words are valid and must stay empty. `writing` reports the comparison source as `spoken`, `authored` or `none`. Every claim must be supported by the video or supplied reviewed evidence; keep the creator's conditions (what is free, who it suits, limits).
- **Dialect:** use the creator's language and dialect from the reviewed spoken or authored copy, plus their stated audience. `PROFILE.json` `language` is always `ar-EG` today and does not establish their dialect. If the copy mixes dialects or you cannot tell, ask once in one line and use the answer. Never invent speech to infer a voice. Keep product and tool names exactly as people type them.
- Choose one **primary search phrase** (what a viewer would type: the topic or the tool name) and 2-4 secondary terms (tool names, one plain term in the creator's language).
- If the creator shares some of their own past captions, match their voice: line length, emoji, how they ask for comments.

## 2. Write `Projects/<slug>/publish-copy.json`

```json
{"title": "<short hook, at most 80 characters>",
 "instagram": {"caption": "<Instagram text>", "hashtags": ["#<topic>"], "altText": "<optional visual description>", "pinnedComment": "<optional supplied or approved comment>"},
 "tiktok": {"caption": "<separately written TikTok text>", "hashtags": ["#<topic>"]},
 "youtube": {"title": "<Shorts title, at most 100 characters>", "description": "<separately written Shorts description>", "hashtags": ["#<topic>"]},
 "credits": ["<optional supplied attribution and required license credit>"],
 "notes": ["<what the copy deliberately does not promise>"]}
```

Include only the platforms printed by `writing`, in their selected order. The profile platform key `youtube` means YouTube Shorts. Existing Instagram/TikTok inputs and profile schemas 2/3 remain valid; selecting Shorts is optional and does not alter saved choices. Hashtags go in `hashtags`, never inside captions, titles or descriptions: 1 to 5 per platform, on topic. Mention no account in promotional copy except the profile handle. Supplied credits and approved pinned comments may retain attribution handles; never invent ownership, licensing or a credit.

Optional fields are omitted when absent. Instagram `altText` describes the actual visible sequence for accessibility (at most 1000 characters in this studio), without promotional filler. Every selected platform can include `pinnedComment` (at most 2200 characters); retain supplied wording or obtain an applicable writing decision. `credits` accepts at most 12 supplied attribution lines, each at most 1000 characters. The pack prints these separately so they are ready to paste. Production license evidence lives in the asset ledger, not an invented publishing claim.

- **Re-say, don't repeat.** Never copy the creator's spoken sentences; a short quoted phrase only when it is the hook keyword itself.
- **Name, don't explain.** Name what people search for, keep what each thing does inside the video, and leave the payoff open (for example, hint that one step is the one most people miss).
- **Add a layer** the video lacks when it helps: who it is for, when to use it, a caution or a condition.
- **Instagram:** the first ~125 characters show before "more": the primary search phrase plus a hook worded differently from the spoken hook. Then about three short blocks: what you get or who it is for, an optional open loop, and the comment-keyword line only when `cta` is non-null, with the exact keyword.
- **TikTok:** shorter and written separately: search phrase and hook in the first line, one payoff tease, the comment keyword only when `cta` is non-null.
- **YouTube Shorts:** a separate useful title, at most 100 characters, containing the primary search phrase. Start the description with that phrase in its first 150 characters and a fresh hook; keep it a teaser with the applicable CTA. The studio accepts descriptions up to 5000 characters, or 450 with saved `short` style. Do not turn the description into a transcript.
- The resolved `writingStyle` sets the shape, never the depth: every style stays a teaser. `short`: one clear opening line, one benefit and one ask, at most 450 characters per caption. `educational`: a few short practical points (who it suits, what you get, a condition) that make people want the full explanation in the video, never the explanation itself. `storytelling`: a short situation in new words that leads to the video without walking through its steps or giving its conclusion. If the printed `guide` seems to ask for more, this rule wins.

## Never

- Retell the video or list every point with its explanation.
- Invent numbers, results, prices, urgency or official claims, or promise reach and views.
- Use engagement bait (a follow or like request as the whole message) or giveaway framing unless the creator runs a real giveaway.
- Add platform disclaimers, use the same text on two platforms, or write in a dialect the creator does not speak.
- Post anything. The creator publishes it.

## 3. Check, then build the pack

While rewriting, check quickly (it writes nothing):

```
node scripts/caption-check.mjs --project <slug> --keyword "<primary search phrase>"
```

Then build the pack with the same search phrase:

```
node scripts/publish-pack.mjs --project <slug> --video <the accepted MP4> --keyword "<primary search phrase>"
```

Both commands always apply the selected-platform rules, 1–5 hashtags, the video's comment keyword, saved writing limit, search opening, filler tags and cross-platform duplication checks. Instagram's search window is 125 characters, TikTok's 100, and Shorts' 150 plus its title. They reject descriptions sharing more than half their phrases across platforms.

When a baseline exists, descriptions must avoid 6 or more consecutive copied words and more than 20 % copied 3-word phrases. A Shorts title is checked separately for a copied run of 6 or more words; it cannot dilute the description's overlap score. Recordings use their reviewed spoken words; silent graphics use scene copy and declared project-scene string/enum values, excluding technical IDs, paths, assets and colours. With no baseline the report says `comparison.source: "none"`; the remaining checks still run. This is a copy-overlap check, not proof of creative acceptance or a copyright review.

`publish-pack.mjs` writes `PUBLISH_PACK.md` only when the copy passes, retaining the actual descriptions and selected optional fields. On failure, rewrite and rerun. Show the creator each selected platform's copy ready to paste, including separate Shorts title/description, Instagram alt text and supplied credits when present. Posting remains a separate action.
