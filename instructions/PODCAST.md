# Podcast batches

Work only on the recording the creator names. Read `RULES.md` and `EDITING.md`. A long recording is proposed and reviewed once; each selected clip gets its own project, editor, approval, render evidence and publish pack. Every individual clip stays within the existing ten-minute edit limit; its source window can start anywhere in the long recording.

## 1. Reviewed transcript and proposals

Transcribe locally, review the words against the recording, and keep word timestamps in original recording seconds/milliseconds. Then:

```text
node scripts/podcast.mjs propose --source Raw/example-podcast.mp4 --transcript Projects/example-podcast/words.json --id example-podcast --reviewed-by Creator --min-sec 15 --max-sec 90
```

The proposal contains transcript quotations and source windows. It does not select or cut anything. Show the candidates to the creator and agree on exact ranges with complete words and clear context.

## 2. Record the actual selection

Write `Projects/example-podcast/selections.json` only after approval. Author beats using the selected source seconds. A minimal example:

```json
{
  "version": 1,
  "selectionApproved": true,
  "approvedBy": "Creator",
  "clips": [{
    "id": "one-idea",
    "fromSec": 630,
    "toSec": 660,
    "signoff": {"mode": "none"},
    "editor": {
      "purpose": "explainer",
      "tone": "calm",
      "style": "liquid-glass",
      "beats": [{
        "id": "opening",
        "fromSec": 630,
        "toSec": 635,
        "intent": "intro",
        "data": {"kicker": "الموضوع", "title": "عنوان من الكلام", "subtitle": "نقطة واضحة", "caption": "الكلام اللي اتقال"}
      }]
    }
  }]
}
```

Use `signoff.mode: "none"` when no recorded sign-off is retained; choose the recorded mode according to the module contract when it is included. Preserve the profile's actual CTA/follow decisions and author ending scenes when required. Do not invent an outro or synthesize speech to complete a clip. The selection rejects overlapping, out-of-bounds and partial-word ranges.

```text
node scripts/podcast.mjs select Projects/example-podcast/podcast/batch.json --selections Projects/example-podcast/selections.json
node scripts/podcast.mjs prepare Projects/example-podcast/podcast/batch.json
node scripts/podcast.mjs status Projects/example-podcast/podcast/batch.json
```

Preparation extracts each window, performs intake and rebases its word/beat times. It preserves original media/profile and existing manual formatting. Changed words, internal cuts, presenter exemptions or sign-off choices need a new reviewed selection. Open each returned `edit.json` in the live review editor.

## 3. Review and sequential export

```text
node scripts/podcast.mjs render Projects/example-podcast/podcast/batch.json
```

This creates previews sequentially. For final export, apply each clip's ordinary delivery planning, face check and motion plan first. Put render options under that clip id in `Projects/example-podcast/render-options.json`:

```json
{"one-idea": {"motionPlan": "Projects/example-clip/motion-plan.json", "voice": "clean", "chunkJobs": 1}}
```

```text
node scripts/podcast.mjs render Projects/example-podcast/podcast/batch.json --deliver --approved-by Creator --options Projects/example-podcast/render-options.json
```

Use the project path returned by preparation. Screen-only sources do not use presenter motion options. `--clip one-idea` limits prepare/render to one selected clip. Repeat the same render request after a failure; reuse requires matching manifest, options, current media/asset bytes, output and QC. A rendered status is not creative acceptance or publication.

## 4. Complete each delivery

Watch/listen to each actual output and follow its normal delivery checks. For every clip, run `profile.mjs writing --project <clip-project-id>`, write distinct faithful platform copy, then `publish-pack.mjs --project <clip-project-id> --video <returned-output>`. Copy the accepted MP4 to its `Outputs/` folder. Report individual paths and both platform captions. No external posting is implied.
