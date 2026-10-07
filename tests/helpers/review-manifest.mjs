import {readFile} from 'node:fs/promises';
import {profileToBrief} from '../../scripts/lib/branding.mjs';
import {buildEditorPlan} from '../../scripts/lib/editor-director.mjs';

const profile = JSON.parse(await readFile(new URL('../../PROFILE.example.json', import.meta.url), 'utf8'));
export function reviewManifest(id = 'live-test') {
  const source = {path: 'Raw/example.mp4', sha256: 'a'.repeat(64), fps: 30, width: 1080, height: 1920, totalFrames: 120};
  return buildEditorPlan({version: 1, id, source: source.path, ...profileToBrief(profile),
    purpose: 'tutorial', tone: 'calm', transcript: `Projects/${id}/words.json`,
    beats: [{id: 'hook', fromSec: 0, toSec: 2, intent: 'intro', data: {kicker: 'تجربة', title: 'شرح', subtitle: 'بسيط', caption: 'شرح'}}]},
  source, [{text: 'شرح', startMs: 0, endMs: 400, confidence: 1}]).manifest;
}
