import './lib/project-tmp.mjs';
import {parseArgs} from './lib/media.mjs';
import {spliceRevision,parseFrameRange} from './lib/segment-revision.mjs';
import {rangeGates} from './lib/segment-picture-gates.mjs';

const args=parseArgs(process.argv.slice(2));
if(!args.base||!args.segment||!args.frames||!args.out)throw new Error('Usage: node scripts/splice-segment.mjs --base Projects/example/master.mp4 --segment Projects/example/replacement.mp4 --frames a-b --out Projects/example/picture-revision.mp4 --motion-plan Projects/example/motion-plan.json');
console.log(JSON.stringify(await spliceRevision({base:args.base,replacement:args.segment,out:args.out,range:parseFrameRange(args.frames),channel:args.channel??'organic',...rangeGates(args)}),null,2));
