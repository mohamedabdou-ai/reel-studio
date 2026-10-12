import './lib/project-tmp.mjs';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {ROOT, cliArgs, ensureOutput, fileSnapshot, readJson, relativePath, slug} from './lib/job-paths.mjs';
import {PROFILE_FILE, readProfileFile} from './lib/branding.mjs';
import {publishContext, renderPublishPack, validatePublishCopy} from './lib/publish-pack.mjs';
import {checkCaptionCopy, publishComparison} from './lib/caption-check.mjs';

const USAGE = 'Usage: node scripts/publish-pack.mjs --project <slug> --video <file.mp4> [--keyword "<primary search phrase>"] [--copy <publish-copy.json>] [--profile <file>]';
try {
  const args = cliArgs(process.argv.slice(2), ['project', 'video', 'keyword', 'copy', 'profile']);
  if (typeof args.project !== 'string' || typeof args.video !== 'string' || args._.length) throw new Error(USAGE);
  const id = args.project;
  slug(id, 'project');
  const profile = await readProfileFile(path.resolve(ROOT, args.profile ?? PROFILE_FILE));
  const manifest = await readJson(`Projects/${id}/edit.json`, {optional: true});
  const {cta, writingStyle} = publishContext(profile, manifest);
  const copyPath = (args.copy ?? `Projects/${id}/publish-copy.json`).replaceAll('\\', '/');
  relativePath(copyPath);
  const copy = validatePublishCopy(await readJson(copyPath), {profile, cta, writingStyle});
  // Platform, search and duplication checks also apply when the video has no speech.
  const comparison = publishComparison(manifest);
  const keyword = typeof args.keyword === 'string' && args.keyword.trim() ? args.keyword.trim() : null;
  const check = checkCaptionCopy({copy, platforms: profile.platforms, comparisonText: comparison.text, comparisonKind: comparison.source, keyword});
  if (!check.ok) throw new Error(`Rewrite the post description first (social-captions skill):\n- ${check.failures.join('\n- ')}`);
  const videoPath = args.video.replaceAll('\\', '/');
  relativePath(videoPath);
  const video = await fileSnapshot(videoPath);
  const file = `Projects/${id}/PUBLISH_PACK.md`;
  await fs.writeFile(await ensureOutput(file, {project: id}), renderPublishPack({profile, copy, cta, writingStyle, video: {path: video.path, sha256: video.sha256}, source: manifest?.source?.path ?? null}), 'utf8');
  console.log(JSON.stringify({ok: true, file, platforms: profile.platforms, cta, teaserCheck: 'passed', comparison: check.comparison}, null, 2));
} catch (error) {
  console.error(JSON.stringify({ok: false, error: error.message}));
  process.exitCode = 1;
}
