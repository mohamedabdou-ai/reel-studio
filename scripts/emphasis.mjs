import './lib/project-tmp.mjs';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {writeJson} from './lib/media.mjs';
import {ROOT,assertProjectOutput} from './lib/project-paths.mjs';
import {checkedPath,fileSnapshot,cliArgs} from './lib/job-paths.mjs';
import {EMPHASIS_DEFAULTS,findSignoff,parseWav,proposeEmphasis,rmsEnvelope,validateHeadEnvelope,validateWords} from './lib/emphasis-score.mjs';

const USAGE='Usage: node scripts/emphasis.mjs --captions <reviewed-words.json> --wav <16k-mono.wav> --fps <fps> --out Projects/<slug>/emphasis.json\n'+
  '  [--reviewed-by <name>] [--envelope <head.json> --source <named source>] [--cta <keyword>]\n'+
  '  [--signoff <recorded text> | --signoff-sec <source seconds>] [--min-gap <3..5>]\n'+
  'Creates camera proposals only. Review choices before adding emphasisFile/emphasisApprovedBy to the brief.';
const inputPath=async(value)=>{
  const relative=path.relative(ROOT,path.resolve(ROOT,value)).replaceAll(path.sep,'/');
  return checkedPath(relative,{mustExist:true});
};
try {
  const args=cliArgs(process.argv.slice(2),['captions','wav','fps','out','reviewed-by','envelope','source','cta','signoff','signoff-sec','min-gap','help'],['help']);
  if(args.help){console.log(USAGE);process.exit(0);}
  for(const name of ['captions','wav','fps','out'])if(typeof args[name]!=='string')throw new Error(`--${name} is required.\n${USAGE}`);
  const fps=Number(args.fps),minGapSec=args['min-gap']===undefined?EMPHASIS_DEFAULTS.minGapSec:Number(args['min-gap']);
  if(!(fps>0 && fps<=120))throw new Error('--fps must be in (0, 120].');
  if(!(minGapSec>=3 && minGapSec<=5))throw new Error('--min-gap must be within 3-5 seconds.');
  const out=assertProjectOutput(path.resolve(ROOT,args.out));
  if(path.relative(ROOT,out).split(path.sep)[0]!=='Projects')throw new Error('Emphasis output must stay under Projects/.');
  const inputs=await Promise.all([args.captions,args.wav,...(args.envelope?[args.envelope]:[]),...(args.source?[args.source]:[])].map(inputPath));
  if(inputs.some(input=>input.toLowerCase()===out.toLowerCase()))throw new Error('Emphasis output would overwrite an input.');
  const json=JSON.parse(await fs.readFile(inputs[0],'utf8'));
  const captions=Array.isArray(json)?json:(json.captions??json.words??json);
  const metadata=json.captions && !Array.isArray(json.captions)?json.captions:json;
  const reviewer=args['reviewed-by']??(metadata.status==='reviewed'?metadata.reviewer:undefined);
  if(typeof reviewer!=='string' || !reviewer.trim())throw new Error('Emphasis requires reviewed words and their reviewer; review the recording then supply --reviewed-by or reviewed caption metadata.');
  const words=validateWords(Array.isArray(captions)?captions:captions.words);
  const {sampleRate,samples}=parseWav(await fs.readFile(inputs[1]));
  if(sampleRate!==16000)throw new Error('Use the full named source as 16 kHz mono PCM WAV.');
  if(words.at(-1).endMs>samples.length/sampleRate*1000+250)throw new Error('Reviewed caption times exceed the WAV; use audio from the same complete source.');
  const head=args.envelope?validateHeadEnvelope(JSON.parse(await fs.readFile(await inputPath(args.envelope),'utf8'))):null;
  if(head){
    if(!args.source)throw new Error('--envelope needs --source to verify the head envelope belongs to the named recording.');
    const sourceRel=path.relative(ROOT,await inputPath(args.source)).replaceAll(path.sep,'/');
    const snapshot=await fileSnapshot(sourceRel);
    if(head.source.sha256!==snapshot.sha256 || Math.abs(head.source.fps-fps)>.001)throw new Error('Head envelope source hash or fps differs from the named recording.');
  }
  if(args.signoff!==undefined && args['signoff-sec']!==undefined)throw new Error('Choose --signoff or --signoff-sec.');
  let signoffFromMs=null,signoffSource='none';
  if(args['signoff-sec']!==undefined){
    signoffFromMs=Number(args['signoff-sec'])*1000;signoffSource='flag';
    if(!Number.isFinite(signoffFromMs) || signoffFromMs<0 || signoffFromMs>samples.length/sampleRate*1000)throw new Error('--signoff-sec must stay inside the source audio.');
  } else if(args.signoff!==undefined){
    const found=findSignoff(words,args.signoff);
    if(!found)throw new Error('The supplied recorded sign-off is absent from these reviewed words; resolve its text/time instead of inventing it.');
    signoffFromMs=found.fromMs;signoffSource='captions';
  }
  const result=proposeEmphasis({words,envelope:rmsEnvelope(samples,sampleRate),fps,head,cta:args.cta,signoffFromMs,minGapSec});
  await writeJson(out,result);
  const proposed=result.proposals.filter(p=>p.status==='proposed').length;
  console.log(JSON.stringify({ok:true,out:path.relative(ROOT,out).replaceAll(path.sep,'/'),proposals:result.proposals.length,proposed,needsReview:result.proposals.length-proposed,signoffFromMs,signoffSource,envelope:head?.method??null}));
} catch(error){console.error(`emphasis: ${error.message}`);process.exitCode=2;}
