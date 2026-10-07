import './lib/project-tmp.mjs';
import {cliArgs, readJson} from './lib/job-paths.mjs';
import {listEditorStyles, recommendEditorStyle, planEditorBrief, prepareEditorManifest, renderEditorManifest, validateEditorInput} from './lib/editor-director.mjs';
import {listMotionRecipes} from '../engine/src/motion-library/catalog.ts';

const usage='Usage: editor.mjs styles | motions [--style id] [--family screen-focus|data-story] [--query text] | recommend <brief.json> | plan <brief.json> [--out Projects/id/edit.json] [--deliver] [--replace] | prepare <edit.json> [--no-proxy] | render <edit.json> [--out Projects/id/video.mp4] [--review | --deliver] [--motion-plan file.json | --motion-crop w:h:x:y] [--frames a-b] [--concurrency 4] [--no-proxy] [--media-engine offthread|webcodecs] [--png] [--crf n] [--face-reviewed-by name] [--voice clean|denoise] | validate <brief-or-edit.json> [--deliver]';
try {
  const [action,...tokens]=process.argv.slice(2);
  const allowed={styles:[],motions:['style','family','query'],recommend:[],plan:['out','deliver','replace'],prepare:['no-proxy'],
    render:['out','review','deliver','motion-plan','motion-crop','frames','concurrency','no-proxy','media-engine','png','crf','face-reviewed-by','voice'],validate:['deliver']};
  if(!Object.hasOwn(allowed,action)) throw new Error(usage);
  const args=cliArgs(tokens,allowed[action],['deliver','replace','review','no-proxy','png']);
  if(args._.length!==(['styles','motions'].includes(action)?0:1)) throw new Error(usage);
  const file=args._[0];
  const onProgress=message=>process.stderr.write(`[editor] ${message}\n`);
  let result;
  if(action==='styles') result=listEditorStyles();
  else if(action==='motions') result=listMotionRecipes(args);
  else if(action==='recommend') result={ok:true,...recommendEditorStyle(await readJson(file))};
  else if(action==='plan') result=await planEditorBrief(file,{out:args.out,delivery:!!args.deliver,replace:!!args.replace});
  else if(action==='prepare') result=await prepareEditorManifest(file,{noProxy:!!args['no-proxy'],onProgress});
  else if(action==='validate') result=await validateEditorInput(file,{delivery:!!args.deliver});
  else result=await renderEditorManifest(file,{out:args.out,delivery:!!args.deliver,review:!!args.review,motionPlan:args['motion-plan'],
    motionCrop:args['motion-crop'],frames:args.frames,concurrency:args.concurrency===undefined?4:Number(args.concurrency),
    noProxy:!!args['no-proxy'],mediaEngine:args['media-engine']??'offthread',png:!!args.png,
    crf:args.crf===undefined?undefined:Number(args.crf),faceReviewedBy:args['face-reviewed-by'],voice:args.voice??'off',onProgress});
  console.log(JSON.stringify(result,null,2));
} catch(error) {
  console.error(JSON.stringify({ok:false,error:error.message}));
  process.exitCode=1;
}
