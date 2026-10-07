import './lib/project-tmp.mjs';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {ROOT, cliArgs, ensureOutput, fileSnapshot, readJson, relativePath, slug} from './lib/job-paths.mjs';
import {PROFILE_FILE, readProfileFile} from './lib/branding.mjs';
import {renderPublishPack, validatePublishCopy} from './lib/publish-pack.mjs';

const USAGE = 'Usage: node scripts/publish-pack.mjs --project <slug> --video <file.mp4> [--copy <publish-copy.json>] [--profile <file>]';
try {
  const args = cliArgs(process.argv.slice(2), ['project', 'video', 'copy', 'profile']);
  if (typeof args.project !== 'string' || typeof args.video !== 'string' || args._.length) throw new Error(USAGE);
  const id = args.project;
  slug(id, 'project');
  const profile = await readProfileFile(path.resolve(ROOT, args.profile ?? PROFILE_FILE));
  const manifest = await readJson(`Projects/${id}/edit.json`, {optional: true});
  const cta = manifest?.creator?.ending?.cta ?? null;
  const writingStyle = manifest?.writingStyle ?? (profile.preferences.writingStyle.mode === 'fixed' ? profile.preferences.writingStyle.value : null);
  const copyPath = (args.copy ?? `Projects/${id}/publish-copy.json`).replaceAll('\\', '/');
  relativePath(copyPath);
  const copy = validatePublishCopy(await readJson(copyPath), {profile, cta, writingStyle});
  const videoPath = args.video.replaceAll('\\', '/');
  relativePath(videoPath);
  const video = await fileSnapshot(videoPath);
  const file = `Projects/${id}/PUBLISH_PACK.md`;
  await fs.writeFile(await ensureOutput(file, {project: id}), renderPublishPack({profile, copy, cta, writingStyle, video: {path: video.path, sha256: video.sha256}, source: manifest?.source?.path ?? null}), 'utf8');
  console.log(JSON.stringify({ok: true, file, platforms: profile.platforms, cta}, null, 2));
} catch (error) {
  console.error(JSON.stringify({ok: false, error: error.message}));
  process.exitCode = 1;
}
