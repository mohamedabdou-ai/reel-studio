import './project-tmp.mjs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT,run,writeJson,readCachedJson} from './media.mjs';
import {verifyPreparedProps} from './prepared-props.mjs';
import {compileEdit} from '../../engine/src/prepared-edit/timeline.ts';
import {plateGate,validateHeadFlags,headGatePlan,headCheckArgv,headGateResult,installHeadEnvelope,headMethodConflict,envelopeProblems,readEnvelopeBack} from './delivery-gates.mjs';

const capture=argv=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,argv,{cwd:ROOT,windowsHide:true});let stdout='',stderr='';
  child.stdout.on('data',data=>{stdout+=data;});child.stderr.on('data',data=>{stderr+=data;});
  child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
});

export function rangeGates(args){
  if([args['motion-crop'],args['motion-plan'],args['motion-exempt']].filter(Boolean).length!==1||args['motion-exempt']&&args['motion-exempt']!=='static-graphics')throw new Error('Range delivery needs --motion-crop, --motion-plan or --motion-exempt static-graphics.');
  return {
    pictureGate:async(metadata,dir)=>{
      if(metadata.composition!=='PreparedEdit')throw new Error('Range delivery needs a prepared-manifest replacement.');
      const props=await verifyPreparedProps(metadata.props),totalFrames=compileEdit(props.edit).durationInFrames;
      if(totalFrames!==metadata.totalFrames||Math.abs(props.edit.source.fps-metadata.fps)>.00001)throw new Error('Prepared range metadata disagrees with its authored timeline.');
      const propsFile=path.join(dir,'prepared-props.json');await writeJson(propsFile,props);
      const plates=plateGate({comp:'PreparedEdit',mode:'deliver',props,inputProps:props,noCheck:false});
      if(plates.action==='refuse')throw new Error(`Prepared plate guard refused: ${plates.messages.join(' | ')}`);
      if(plates.action==='check'){
        const result=await run(process.execPath,[path.join(ROOT,'scripts/plates.mjs'),'check','--fps',String(metadata.fps),'--only',plates.only.join(',')],{cwd:ROOT,allowFail:true});
        let report;try{report=JSON.parse(result.stdout);}catch{throw new Error('Prepared plate guard returned incomplete data.');}
        if(!result.ok||(report.problems??[]).some(problem=>!problem.warn))throw new Error('Prepared plate guard failed.');
      }
      const safeDir=path.join(dir,'safe'),step=Number(args['safe-step']??.5);
      if(!(step>0&&step<=.5))throw new Error('--safe-step must be positive and <= 0.5 seconds.');
      await run(process.execPath,[path.join(ROOT,'scripts/safe-check.mjs'),'--comp','PreparedEdit','--props-file',propsFile,'--step',String(step),'--out',safeDir,...(args.channel==='ads'?['--strict-ads']:[]),...(args['safe-bands']?['--bands',path.resolve(args['safe-bands'])]:[])],{cwd:ROOT});
      const HEAD=await import('./head-envelope.mjs'),flags=validateHeadFlags(args,{mode:'deliver',comp:'PreparedEdit',manifestComps:HEAD.MANIFEST_GEOMETRY_COMPS});
      const plan=headGatePlan({comp:'PreparedEdit',flags,footageMounted:plates.only.length>0,manifestComps:HEAD.MANIFEST_GEOMETRY_COMPS,presenter:props.edit.presenter!==false});
      let head={status:plan.status,ran:false,reason:plan.reason};
      if(plan.run){
        const installed=flags.envelope?await installHeadEnvelope(path.resolve(flags.envelope),HEAD):null;
        if(installed){const conflict=headMethodConflict({requested:flags.method,installedMethod:installed.provided.method});if(conflict)throw new Error(conflict);}
        const headDir=path.join(dir,'head'),ran=await capture(headCheckArgv({script:path.join(ROOT,'scripts/head-check.mjs'),comp:'PreparedEdit',propsFile,outDir:headDir,plan,flags:installed?{...flags,method:installed.provided.method}:flags}));
        const report=await readCachedJson(path.join(headDir,'report.json')),result=headGateResult({exitCode:ran.code,report,exitCodes:HEAD.HEAD_EXIT,reviewedBy:args['face-reviewed-by']??null});
        const problems=installed?envelopeProblems({provided:installed.provided,report,cachedAfter:await readEnvelopeBack(installed.target,HEAD)}):[];
        if(result.block||problems.length)throw new Error(`Range head gate ${result.status}: ${result.reason??problems.join('; ')}`);
        head={...result,ran:true};
      }
      return {safe:{ok:true,stepSec:step},head,plates};
    },
    motionGate:async(video)=>{
      if(args['motion-exempt'])return {exempt:'static-graphics',presenterChecked:false};
      const result=await run(process.execPath,[path.join(ROOT,'scripts/motion-check.mjs'),'--video',video,...(args['motion-plan']?['--plan',path.resolve(args['motion-plan'])]:['--crop',String(args['motion-crop'])])],{cwd:ROOT});
      const report=JSON.parse(result.stdout);if(!report.ok)throw new Error('Range motion gate failed.');return report;
    }
  };
}
