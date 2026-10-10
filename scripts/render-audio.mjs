import './lib/project-tmp.mjs';
import {parseArgs,ROOT} from './lib/media.mjs';
import {readJson} from './lib/job-paths.mjs';
import {reviseAudio} from './lib/audio-revision.mjs';
import path from 'node:path';

const args=parseArgs(process.argv.slice(2));
if(!args.base||!args.timeline||!args.out)throw new Error('Usage: node scripts/render-audio.mjs --base Projects/example/master.mp4 --timeline Projects/example/audio.json --out Projects/example/audio-revision.mp4 [--music-db -18] [--sfx-db -10]');
const manifest=await readJson(path.relative(ROOT,path.resolve(args.timeline)).split(path.sep).join('/'));
const overrides={};for(const [flag,key]of [['voice-db','voiceDb'],['music-db','musicDb'],['sfx-db','sfxDb']])if(args[flag]!==undefined)overrides[key]=Number(args[flag]);
console.log(JSON.stringify(await reviseAudio({base:args.base,manifest,out:args.out,overrides,channel:args.channel??'organic'}),null,2));
