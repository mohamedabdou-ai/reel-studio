import './lib/project-tmp.mjs';
import {parseArgs} from './lib/media.mjs';
import {initEditProject,loadEditProject,importEditCaptions,prepareEditProject} from './lib/edit-project.mjs';

try{
  const args=parseArgs(process.argv.slice(2));
  const [action,manifest]=args._;
  let result;
  if(action==='init' && args.id && args.source) result=await initEditProject({id:args.id,source:args.source,style:args.style});
  else if(action==='validate' && manifest){const {manifest:m,compiled}=await loadEditProject(manifest);result={ok:true,id:m.id,scenes:m.scenes.length,captions:m.captions.status,...compiled};}
  else if(action==='captions' && manifest && args.from) result=await importEditCaptions(manifest,args.from);
  else if(action==='prepare' && manifest) result=await prepareEditProject(manifest,{proxy:!args['no-proxy'],outDir:args['out-dir'],onProgress:m=>process.stderr.write(`[edit] ${m}\n`)});
  else throw new Error('Usage: edit-project.mjs init --id <project> --source Raw/file.mp4 | validate <manifest> | captions <manifest> --from <captions.json> | prepare <manifest> [--no-proxy] [--out-dir Projects/<id>/<dir>]');
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(`edit-project: ${error.message}`);process.exitCode=1;}
