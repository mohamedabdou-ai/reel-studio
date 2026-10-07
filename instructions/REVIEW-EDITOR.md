# Review Editor

A local editor that opens **as soon as the first draft and its footage are ready**, before proposed cuts and the first full rendered preview. Keep it open while the assistant works: completed changes appear in the preview and timeline without reloading the page. You can also fix captions, scenes, cuts, sounds and camera by hand; Export runs the same delivery pipeline.

## Open it

```bash
node scripts/review-editor.mjs Projects/<slug>/edit.json
```

It prints one URL with a per-run token (`http://127.0.0.1:4177/?token=...`). Open it in the browser pane. `--port n` picks another port (the default falls back to a free one), `--open` also opens the default browser. Ctrl-C stops it; nothing is written until you press Save or Export.

## Follow the assistant's work

Automatic following is on when the editor opens. The banner shows the most recent completed change (cuts, captions, scenes, motion, sound or style). Use **وقف المتابعة** to pause and **كمّل المتابعة** to resume. The assistant keeps this server running, updates the same project in small approved batches, and never invents activity or progress to make the session look busy.

A focused input, unsaved manual changes or an unanswered draft holds incoming changes. They stay visible until you finish them. A stale Save cannot replace a newer assistant edit. **اعرض التحديث الجديد** lets you choose the new version; if you have local edits, it first preserves a browser draft and asks for confirmation. The draft can be restored or dismissed, including after a reload. If draft storage fails, your current edits remain on screen.

Caption and scene changes show immediately after a complete snapshot is saved. After a cut changes, the assistant runs `node scripts/editor.mjs prepare Projects/<slug>/edit.json`; the previous cut remains clearly labelled until the new footage is ready, then the preview catches up automatically. A disconnected server or invalid partial write leaves the last playable version on screen. The editor follows actual saved changes, not every keystroke in the assistant's terminal.

Works on projects that go through the reusable editor (`Projects/<slug>/edit.json`, rendered by `PreparedEdit`). Hand-built compositions with their own React code have no manifest and cannot be edited here.

## What you can change

| Panel | You can |
|---|---|
| **ملخص** | See project, style, duration, counts and the list of problems |
| **الكابشن** | Search phrases, edit the text of a word, move a word's start/end by frames or ms, split, merge, delete, colour/weight/pulse emphasis, shift all captions, mark the captions reviewed or draft. Clicking a phrase jumps the preview to it |
| **المشاهد** | Change a scene's timing and layout/motion, and edit its own text fields (a form generated from the scene's schema: length limits are enforced as you type; a value the schema rejects is never applied) |
| **القص** | Trim or split a cut and delete a segment. Later scenes, sounds, camera keys and transitions move by the same number of frames (captions stay on their source moment); anything that would fall inside a removed range is listed before you confirm |
| **المؤثرات** | Add, move and delete sound effects (recipe and gain), camera keys and transitions at the playhead |

The timeline along the bottom has lanes for cuts, scenes, captions, sounds, camera and transitions; click to seek, drag scene blocks and markers, wheel to zoom. Toolbar: undo / redo, History, Notes (problems), Guides (Instagram safe zones), Save, Export.

## Save, History, backups

- **Save** validates the whole manifest with the same schema the pipeline uses, then writes atomically. A manifest you did not change is saved byte-for-byte identical (no noisy diffs).
- Every save that changes the file first copies the previous version to `Projects/<slug>/edit-history/<time>~<label>.json` (newest 30 kept). **History** lists them; restoring one is an undoable edit.
- Unsaved edits survive a reload as a local draft, and the tab warns before closing with unsaved changes.

## Export

Press **تصدير** and choose:

- **معاينة سريعة**: `scripts/editor.mjs render` on the saved manifest, proxy quality, no delivery gates. For checking.
- **تصدير نهائي**: `scripts/editor.mjs render --deliver --motion-plan <Projects/<slug>/motion-plan.json> --png --crf n`. Every existing gate still runs (safe zone, Instagram encode contract, head keep-out, plates, motion); `FAIL` and `NEEDS-REVIEW` are shown as the pipeline printed them.

Before either, the editor checks disk and RAM (`scripts/lib/disk-report.mjs` `renderBudget`) and refuses to start a render that would not fit. One export runs at a time; Cancel stops only the process the editor started. Outputs go to `Projects/<slug>/renders/`.

## Safety of the local server

Binds to 127.0.0.1 only; every request needs the run's token; requests with a foreign Host or Origin are refused (DNS rebinding / other tabs); it serves only its own app and `engine/public` (GET); it writes only inside `Projects/<slug>/`.

## Limits

- The preview has no sound effects (they are mixed at export); the timeline shows where they are.
- The first playback after opening the page shows the video about 0.44 s ahead of the captions and graphics (the Player buffers at first play); pause, scrub and frame-step are exact, and later plays are within a few frames. Judge caption timing on a paused frame.
- Drafts are kept per port in the browser: use the default port (4177) if you want a reload to bring unsaved edits back.
- A split inside continuous speech adds a tiny (12 ms) audio fade at the joint when the plate is re-prepared.
- Preview uses the proxy of the prepared plate; export uses the full-quality plate.
- Changing which source video is used, or re-running transcription, is not done here (ask the assistant, then reopen).
- Only one person/tab should edit a file at a time.
