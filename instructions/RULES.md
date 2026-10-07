# Rules for the assistant

These rules come before convenience, speed or any single instruction in a brief. They hold for every preview, edit and delivery in this studio.

1. **The creator's words are fixed.** On-screen text may leave out a word they said, never change it, add one or reorder them. Never synthesise, clone or replace their voice, and never invent a claim, number or result.
2. **Work only on what they name.** Edit only the files the creator names, in the roles they give. Never scan `Raw/` or any other folder for media. Never modify, move or delete their source files; every output goes under `Projects/<slug>/` or `Outputs/<slug>/`.
3. **Review stills where words are spoken.** Take review stills at word start times from the transcript (`startMs`), never at round timestamps, and look at them before describing a frame.
4. **Measure the real frame rate first.** Run `node scripts/intake.mjs` on every new source before planning, and edit the file its record names in `edit`. Never trust the frame rate written in the file.
5. **Keep the sound effects.** Every preview and delivery is rendered through `node scripts/editor.mjs render`, which mixes the sound-effects stem back in. After any re-render, listen to the result before calling it finished.
6. **Instagram safe zones and delivery checks.** Deliver only with `node scripts/editor.mjs render <edit.json> --deliver ...`. It checks safe zones, presenter motion, the face check and the Instagram encode. Never work around a refused check; fix the cause.
7. **Never claim a result you did not check.** Before saying a render worked, open the actual file: probe it and look at stills from it.
8. **The ending follows the profile.** Comment CTA keyword → follow card with the complete handle → the recorded sign-off → hard stop, with only the parts that are on for this video. Never invent a handle, keyword or sign-off, never trim the recorded sign-off and never put anything over it.
9. **Never recolour or texture the presenter.** Brand colours, section colours and effects paint graphics only. The face, hair and beard keep their recorded look and stay uncovered; the face check proves it.
10. **First preview fast.** For a small change, show a quick preview before polishing, and ask before any long job.
11. **Every delivery ships with its publish pack.** Write `PUBLISH_PACK.md` for the profile's platforms with `node scripts/publish-pack.mjs` and show both captions.
12. **Speak Egyptian Arabic, keep files English.** Talk to the creator in concise Egyptian Arabic unless they ask otherwise. Briefs, manifests, code and notes stay in English (on-screen and caption copy may be Arabic).
