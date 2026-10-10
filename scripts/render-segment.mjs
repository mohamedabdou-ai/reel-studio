import './lib/project-tmp.mjs';
import path from 'node:path';
import {parseArgs,ROOT,run,writeJson,readCachedJson} from './lib/media.mjs';
import {readRenderProps} from './lib/render-props.mjs';
import {withOutputTransaction} from './lib/delivery.mjs';
import {contentHash,mediaContract} from './lib/render-chunks.mjs';
import {parseFrameRange} from './lib/segment-revision.mjs';
import {compileEdit} from '../engine/src/prepared-edit/timeline.ts';
import {assertPreparedRevisionDestinations} from './lib/revision-paths.mjs';

const args=parseArgs(process.argv.slice(2));
if(!args.out||!args.frames||(!args['props-file']&&!args.props))throw new Error('Usage: node scripts/render-segment.mjs --props-file Projects/job/prepared-props.json --frames a-b --out Projects/job/replacement.mp4');
const props=await readRenderProps(args,{composition:'PreparedEdit'}),range=parseFrameRange(args.frames),totalFrames=compileEdit(props.edit).durationInFrames;
if(range[1]>=totalFrames)throw new Error('Range is outside the prepared manifest.');
await assertPreparedRevisionDestinations(args.out,props,{propsFile:args['props-file'],extraInputs:args.sfx?[path.resolve(args.sfx)]:[]});
const result=await withOutputTransaction(args.out,async(staged,work)=>{
  const propsFile=path.join(work,'prepared-props.json');await writeJson(propsFile,props);
  await run(process.execPath,[path.join(ROOT,'scripts/render.mjs'),'PreparedEdit','--props-file',propsFile,'--frames',String(args.frames),'--out',staged,'--muted'],{cwd:ROOT});
  const media=await mediaContract(staged);
  if(media.frames!==range[1]-range[0]+1||Math.abs(media.fps-props.edit.source.fps)>.00001)throw new Error('Prepared range frame count or fps changed.');
  const report=await readCachedJson(`${staged}.qc.json`);if(!report?.ok)throw new Error('Prepared range render has no verified QC report.');
  const metadata={version:1,composition:'PreparedEdit',range,totalFrames,fps:media.fps,sha256:await contentHash(staged),media,props};
  await writeJson(`${staged}.range.json`,metadata);report.out=path.resolve(args.out);await writeJson(`${staged}.qc.json`,report);
  return {ok:true,out:path.resolve(args.out),range,totalFrames,fps:media.fps,metadata:`${path.resolve(args.out)}.range.json`};
},{sidecars:['.qc.json','.range.json']});
console.log(JSON.stringify(result,null,2));
