import path from 'node:path';
import {promises as fs} from 'node:fs';
import {WRITING_GUIDES} from '../engine/src/core/preference-options.ts';
import {ROOT} from './lib/project-paths.mjs';
import {PROFILE_FILE, ProfileError, normalizeCreatorProfile, profileToBrief, readProfileFile} from './lib/branding.mjs';

const USAGE = 'Usage: node scripts/profile.mjs check|brief|writing [--profile <file>] [--cta <keyword> | --no-cta] [--project <slug>]';
try {
  const [command, ...rest] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === '--no-cta') options.noCta = true;
    else if (token === '--profile' || token === '--cta' || token === '--project') {
      const value = rest[++i];
      if (!value || value.startsWith('--')) throw new Error(`${token} needs a value.\n${USAGE}`);
      options[token.slice(2)] = value;
    } else throw new Error(`Unknown option ${token}.\n${USAGE}`);
  }
  if (!['check', 'brief', 'writing'].includes(command)) throw new Error(USAGE);
  if (command !== 'brief' && (options.cta !== undefined || options.noCta)) throw new Error(USAGE);
  if (options.project !== undefined && (command !== 'writing' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.project))) throw new Error(USAGE);
  if (options.cta !== undefined && options.noCta) throw new Error('Choose --cta <keyword> or --no-cta, not both.');
  const profile = await readProfileFile(path.resolve(ROOT, options.profile ?? PROFILE_FILE));
  if (command === 'check') console.log(JSON.stringify({ok: true, profile}, null, 2));
  else if (command === 'writing') {
    const manifest = options.project ? JSON.parse(await fs.readFile(path.join(ROOT, 'Projects', options.project, 'edit.json'), 'utf8')) : null;
    const writingStyle = manifest?.writingStyle ?? (profile.preferences.writingStyle.mode === 'fixed' ? profile.preferences.writingStyle.value : null);
    if (writingStyle !== null && !Object.hasOwn(WRITING_GUIDES, writingStyle)) throw new Error('The project contains an unknown writingStyle.');
    console.log(JSON.stringify({ok: true, writingStyle, guide: writingStyle ? WRITING_GUIDES[writingStyle] : 'اختار طريقة وصف مناسبة لمحتوى الفيديو الفعلي.',
      language: profile.language, platforms: profile.platforms, cta: manifest ? manifest.creator?.ending?.cta ?? null : profile.ending.ctaDefault}, null, 2));
  } else {
    const fields = profileToBrief(profile);
    const creator = fields.creator;
    if (options.noCta) creator.ending.cta = null;
    else if (options.cta !== undefined) creator.ending.cta = options.cta;
    console.log(JSON.stringify({...fields, creator: normalizeCreatorProfile(creator)}, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ok: false, error: error.message, ...(error instanceof ProfileError ? {ar: error.ar, en: error.en} : {})}));
  process.exitCode = 1;
}
