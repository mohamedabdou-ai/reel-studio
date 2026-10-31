import path from 'node:path';
import {prepareEditProject as preparePlateProject} from './edit-project.mjs';
import {atomicJson,digest,readJson,relativePath,slug,withFileLock} from './job-paths.mjs';
import {undrawnScenes} from '../../engine/src/styles/design-coverage.ts';

// Reporting must stay outside edit-project.mjs: that file's bytes are a footage-plate key input.
// Insert after captionIssues to preserve the accepted receipt field order, including on re-entry.
const withUndrawnScenes=(report,scenes)=>Object.fromEntries(Object.entries(report)
  .filter(([key])=>key!=='undrawnScenes')
  .flatMap(([key,value])=>key==='captionIssues'?[[key,value],['undrawnScenes',scenes]]:[[key,value]]));

export async function prepareEditProject(file,options={}){
  const result=await preparePlateProject(file,options);
  relativePath(result.propsFile);
  const [projects,id]=result.propsFile.split('/');
  if(projects!=='Projects')throw new Error('Preparation props must stay in their project.');
  slug(id);
  const base=path.posix.dirname(result.propsFile),opts={project:id};
  return withFileLock(`Projects/${id}/prepare.lock`,opts,async()=>{
    const props=await readJson(result.propsFile);
    const report=await readJson(`${base}/preparation.json`);
    // Another prepare can acquire the lock between media preparation and this reporting pass.
    // Use the prepared snapshot, never a re-read of the mutable authored manifest.
    if(props.edit?.id!==id || digest(props.edit)!==result.manifestHash || report.manifestHash!==result.manifestHash
      || report.propsFile!==result.propsFile || !Object.hasOwn(result,'captionIssues') || !Object.hasOwn(report,'captionIssues')){
      throw new Error('Prepared snapshot changed during preparation report. Run prepare again.');
    }
    const scenes=undrawnScenes(props.edit);
    await atomicJson(`${base}/preparation.json`,withUndrawnScenes(report,scenes),opts);
    return withUndrawnScenes(result,scenes);
  });
}
