import {normalizeStyleId} from '../../engine/src/styles/registry.ts';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ROOT,readJson,atomicJson,relativePath} from './job-paths.mjs';
import {checkText} from './text-check.mjs';
import {checkArabic,installedFonts} from './arabic-check.mjs';
import {loadSoundCatalog} from './job-sound.mjs';

export const ACCEPT_ROLES=Object.freeze(['breakdown','analysis','editorial','assets','sound','edit','qa','delivery']);
const BANDS_FILE='scripts/data/sound-bands.json';
/** Air sweeps: the -sweep twins the policy places only with the brief's "sweeps": true, and bare sweep ids. Landings keep their old ids (directional-whoosh, highlight-swipe). */
export const SWEEP_RECIPE=/-sweep$|^(?:whoosh|swipe|sweep|riser)$/;
const abs=rel=>path.join(ROOT,...rel.split('/'));
const exists=rel=>fs.stat(abs(rel)).then(()=>true,()=>false);
const read=rel=>fs.readFile(abs(rel),'utf8');
const check=(id,ok,detail)=>({id,status:ok?'pass':'fail',detail});
/** Read a JSON artifact: null when it is absent; a malformed file adds a failing check and reads as null. */
async function load(rel,checks){
  try{return await readJson(rel);}
  catch(error){if(error.code==='ENOENT')return null;checks.push(check(`json-${path.posix.basename(rel)}`,false,`${rel}: ${error.message}`));return null;}
}
const warn=(id,detail)=>({id,status:'warn',detail});

/** Rows of the first markdown table whose header contains every given column name. */
export function tableRows(markdown,header){
  const lines=markdown.replace(/\r\n/g,'\n').split('\n');
  const start=lines.findIndex(line=>line.trim().startsWith('|')&&header.every(column=>line.includes(column)));
  if(start<0)return null;
  const rows=[];
  for(const line of lines.slice(start+2)){if(!line.trim().startsWith('|'))break;rows.push(line.split('|').slice(1,-1).map(cell=>cell.trim()));}
  return rows;
}

export function editedMinutes(manifest){
  const frames=(manifest.segments??[]).reduce((sum,segment)=>sum+(segment.toFrame-segment.fromFrame),0)||manifest.source?.totalFrames||0;
  return frames/(manifest.source?.fps||30)/60;
}

export async function bandFor({style,tone,override}){
  const bands=await readJson(BANDS_FILE);
  const key=bands.bands[override]?override:bands.bands[style]?style:bands.bands[tone]?tone:'calm';
  return {key,range:bands.bands[key],minGapSec:bands.minGapSec,gain:bands.gain};
}

const DENSITY_FLOOR_SEC=20;
/** Cues per minute against the band; under twenty seconds of edited time a per-minute rate is not meaningful, so it only warns. */
export function densityCheck(count,minutes,band){
  const perMinute=minutes>0?count/minutes:0,detail=`${perMinute.toFixed(1)} cues/min, band ${band.key} ${band.range.join('–')}`;
  if(minutes*60<DENSITY_FLOOR_SEC)return warn('cue-density',`${(minutes*60).toFixed(1)} s of edited time is too short to judge density (${detail})`);
  return check('cue-density',perMinute>=band.range[0]&&perMinute<=band.range[1],detail);
}

async function acceptAnalysis({task,project}){
  const checks=[];
  const intake=await load(`${task}/intake.json`,checks);
  checks.push(check('intake',!!intake&&typeof intake.edit==='string'&&Number.isFinite(intake.plateFps)&&Number.isFinite(intake.deliveryFps),'intake.json from intake.mjs with the measured plateFps and deliveryFps'));
  const analysis=await exists(`${task}/analysis.md`)?await read(`${task}/analysis.md`):'';
  checks.push(check('measurements',/## Measurements[\s\S]*plateFps[\s\S]*deliveryFps/.test(analysis),'analysis.md has Measurements with plateFps and deliveryFps'));
  checks.push(check('observations',!!tableRows(analysis,['Observation','Source time','Uncertainty']),'analysis.md has the observation table'));
  const transcriptFile=`Projects/${project}/transcript/captions.json`;
  const transcript=await load(transcriptFile,checks);const words=Array.isArray(transcript)?transcript:transcript?.captions??transcript?.words;
  checks.push(check('transcript',Array.isArray(words)&&words.length>0&&words.every(word=>typeof word.text==='string'&&Number.isFinite(word.startMs)&&Number.isFinite(word.endMs)),`${transcriptFile} has word captions`));
  const cut=await exists(`${task}/cut-table.md`)?await read(`${task}/cut-table.md`):'';
  const rows=tableRows(cut,['ID','Kind','From','To','Decision'])??[];
  const ids=rows.map(row=>Number(row[0]));
  checks.push(check('cut-table',rows.length>0&&ids.every((id,index)=>Number.isInteger(id)&&id>0&&(index===0||id>ids[index-1])),'cut-table.md rows keep ascending original IDs'));
  checks.push(check('cut-kinds',rows.every(row=>['silence','retake','filler'].includes(row[1])&&(row[1]==='silence'?row[6]==='auto':row[6]==='question')),'silence rows are auto; retake and filler rows are questions'));
  checks.push(check('questions',await exists(`${task}/questions.md`),'questions.md present'));
  checks.push(check('privacy',await exists(`${task}/privacy.md`),'privacy.md present'));
  return checks;
}

async function acceptEditorial({task}){
  const checks=[];
  const plan=await load(`${task}/plan.json`,checks);
  checks.push(check('plan-json',!!plan&&plan.version===1&&typeof plan.style==='string'&&typeof plan.reason==='string'&&plan.reason.trim().length>0&&Array.isArray(plan.beats)&&plan.beats.length>0,'plan.json has version, style, reason and beats'));
  if(!plan||!Array.isArray(plan.beats)||!plan.beats.length)return checks;
  const markdown=await exists(`${task}/EDITORIAL_PLAN.md`)?await read(`${task}/EDITORIAL_PLAN.md`):'';
  const rows=tableRows(markdown,['Beat id','Kind','Visual action','Library key'])??[];
  const sameBeats=rows.map(row=>row[1]).join('\n')===plan.beats.map(beat=>beat.id).join('\n');
  checks.push(check('plan-table',sameBeats&&rows.every(row=>row.length>=13&&row.slice(1).every(cell=>cell.length>0)),`EDITORIAL_PLAN.md has one complete 13-column row per plan beat, same ids in the same order (${rows.length} rows, ${plan.beats.length} beats)`));
  const styleLine=/^Style: (\S+) — .+/m.exec(markdown);
  checks.push(check('style-line',!!styleLine&&normalizeStyleId(styleLine[1])===normalizeStyleId(plan.style),`Style line names plan.style (${plan.style}) with a plain reason`));
  const kinds=['visual','evidence','text','presenter'];
  checks.push(check('beat-kinds',plan.beats.every(beat=>kinds.includes(beat.kind)),`each beat kind is one of ${kinds.join(', ')}`));
  let ordered=true,last=0;for(const beat of plan.beats){if(!(beat.fromSec>=last&&beat.toSec>beat.fromSec))ordered=false;last=beat.toSec;}
  checks.push(check('beats-ordered',ordered,'beats are ordered without overlaps'));
  let run=0,longest=0;for(const beat of plan.beats){run=beat.kind==='text'?run+1:0;longest=Math.max(longest,run);}
  checks.push(check('translation-test',longest<=3,`longest run of text-only beats is ${longest} (max 3)`));
  checks.push(check('hook-start',Number.isFinite(plan.beats[0].fromSec)&&plan.beats[0].fromSec<=4,'the hook beat starts within 4 s'));
  if(plan.beats[0].kind==='presenter')checks.push(warn('hook-visual','the first beat is presenter-only; a designed visual on frame 0 is the default'));
  checks.push(check('library-keys',plan.beats.filter(beat=>['visual','evidence'].includes(beat.kind)).every(beat=>typeof beat.libraryKey==='string'&&beat.libraryKey.trim()),'visual and evidence beats name a library key'));
  const ending=plan.ending??{};const want=[...(ending.comment?['comment']:[]),...(ending.follow?['follow']:[])];
  const got=plan.beats.slice(-want.length).map(beat=>String(beat.family).replace(/^glide-/,''));
  checks.push(check('ending-order',want.length===0||want.every((family,index)=>got[index]===family),`ending beats in order: ${want.join(' → ')||'none'}`));
  const result=await load(`${task}/result.json`,checks);
  checks.push(check('choices',!!result&&plan.beats.filter(beat=>beat.libraryKey).every(beat=>(result.choices??[]).some(choice=>choice?.key===beat.libraryKey)),'result.json present and every library key appears in its choices'));
  return checks;
}

async function acceptAssets({task}){
  const checks=[];
  const ledger=await load(`${task}/assets.json`,checks);const rows=Array.isArray(ledger)?ledger:ledger?.assets;
  checks.push(check('ledger',Array.isArray(rows),'assets.json is a list of rows'));
  if(!Array.isArray(rows))return checks;
  const licences=['creator-supplied','CC0','project-capture'];
  checks.push(check('rows',rows.length>0&&rows.every(row=>typeof row?.id==='string'&&typeof row.path==='string'&&typeof row.source==='string'&&row.source.trim()&&licences.includes(row.licence)&&typeof row.how==='string'),`at least one row; every row has id, path, source, licence (${licences.join(' | ')}) and how`));
  if(!rows.every(row=>typeof row?.id==='string'&&typeof row.path==='string'))return checks;
  const inside=file=>file.startsWith(`${task}/assets/`)&&!file.split('/').some(part=>part==='..'||part==='.');
  checks.push(check('inside-task',rows.every(row=>inside(row.path)),'every path is inside the task assets folder (no .. segments)'));
  const files=await fs.readdir(abs(`${task}/assets`)).catch(()=>[]);
  checks.push(check('files-listed',files.every(name=>rows.some(row=>row.path===`${task}/assets/${name}`)),'every file in assets/ has a ledger row'));
  for(const row of rows.filter(row=>inside(row.path)))checks.push(check(`exists-${row.id}`,await exists(row.path),`${row.path} exists`));
  return checks;
}

async function acceptSound({task,run,edit}){
  const checks=[];
  const cues=await load(`${task}/cues.json`,checks);
  checks.push(check('cues-json',!!cues&&cues.version===1&&Array.isArray(cues.sounds)&&!!cues.proxies&&!!cues.passage&&Array.isArray(cues.questions)&&cues.questions.length===3,'cues.json has sounds, proxies, passage and three questions'));
  if(!cues||!Array.isArray(cues.sounds))return checks;
  const editFile=edit??`${run}/tasks/edit/edit.json`;
  const manifest=await load(editFile,checks),brief=await load(`${path.posix.dirname(editFile)}/brief.json`,checks);
  const catalog=await loadSoundCatalog();const recipes=new Set(catalog.recipes.map(recipe=>recipe.id));
  checks.push(check('recipes',cues.sounds.every(sound=>recipes.has(sound.recipe)),'every recipe exists in Sound-Kits/catalog.json'));
  checks.push(check('no-sweeps',brief?.sweeps===true||cues.sounds.every(sound=>!SWEEP_RECIPE.test(String(sound.recipe))),'no air sweep (-sweep twins) unless the candidate brief sets "sweeps": true'));
  const bands=await readJson(BANDS_FILE);
  const fps=cues.fps||30,frames=cues.sounds.map(sound=>sound.atFrame).sort((a,b)=>a-b);
  let minGap=Infinity;for(let index=1;index<frames.length;index++)minGap=Math.min(minGap,(frames[index]-frames[index-1])/fps);
  checks.push(check('min-gap',frames.length<2||minGap>=bands.minGapSec,`minimum gap ${frames.length<2?'n/a':`${minGap.toFixed(2)} s`} (≥ ${bands.minGapSec} s)`));
  checks.push(check('gains',cues.sounds.every(sound=>(sound.gain>=bands.gain[0]&&sound.gain<=bands.gain[1])||(typeof sound.reason==='string'&&/gain/i.test(sound.reason))),`gains within ${bands.gain.join('–')} unless the reason explains the gain`));
  if(manifest){
    const signoff=manifest.signoffFromFrame??Infinity;
    checks.push(check('before-signoff',cues.sounds.every(sound=>sound.atFrame<signoff),'no cue at or after signoffFromFrame'));
    const follow=(manifest.scenes??[]).find(scene=>/follow$/.test(String(scene.family)));
    if(follow){const onFollow=cues.sounds.filter(sound=>sound.atFrame>=follow.fromFrame&&sound.atFrame<follow.fromFrame+follow.durationInFrames).length;checks.push(check('follow-card',onFollow<=1,`${onFollow} cue(s) on the follow card (max 1)`));}
    const minutes=editedMinutes(manifest),band=await bandFor({style:manifest.style,tone:brief?.tone,override:cues.band});
    checks.push(cues.sounds.length===0?warn('cue-density','no cues'):densityCheck(cues.sounds.length,minutes,band));
  }else checks.push(check('edit-candidate',false,`${editFile} not found or unreadable; pass --edit <the edit task's edit.json> so sign-off, follow-card and density can be checked`));
  checks.push(check('sound-review',await exists(`${task}/sound-review.md`),'sound-review.md present'));
  return checks;
}

async function acceptEdit({task,project,transcript,deliver}){
  const checks=[];
  for(const file of ['brief.json','edit.json','checks.json'])checks.push(check(`file-${file}`,await exists(`${task}/${file}`),`${file} present`));
  const manifest=await load(`${task}/edit.json`,checks),brief=await load(`${task}/brief.json`,checks),report=(await load(`${task}/checks.json`,checks))??{};
  if(!manifest||!brief)return checks;
  const {validateEditorInput}=await import('./editor-director.mjs');
  try{const valid=await validateEditorInput(`${task}/edit.json`,{delivery:!!deliver});checks.push(check('validate',valid.ok===true,'editor.mjs validate passes'));}
  catch(error){checks.push(check('validate',false,error.message));}
  let transcriptWords;
  // Compare against the project's own transcript (the analysis worker's output), not only the words the candidate carries.
  const projectTranscript=`Projects/${project}/transcript/captions.json`;
  if(!transcript&&await exists(projectTranscript))transcript=projectTranscript;
  if(!transcript)checks.push(warn('transcript-source',`${projectTranscript} not found and no --transcript given; on-screen text was compared with the candidate's own captions`));
  else if(typeof brief.transcript==='string'&&brief.transcript!==transcript)checks.push(warn('transcript-source',`brief.transcript (${brief.transcript}) differs from the transcript checked (${transcript}); confirm the brief names the reviewed transcript`));
  if(transcript){
    const words=await load(transcript,checks);
    transcriptWords=Array.isArray(words)?words:Array.isArray(words?.captions)?words.captions:words?.captions?.words??words?.words;
    if(!Array.isArray(transcriptWords)){checks.push(check('transcript',false,`${transcript} has no word captions`));return checks;}
  }
  const textResult=checkText(manifest,{transcriptWords,explanatoryText:report.explanatoryText??[],evidence:report.evidence??[]});
  checks.push(check('text-check',textResult.ok,textResult.ok?'on-screen text is spoken, listed or evidenced':textResult.problems.join('; ')));
  // Broken Arabic joins and glyphs the font lacks stop here; the items that need eyes are decided later, in the QA report.
  const arabic=checkArabic({manifest,fonts:installedFonts()});
  checks.push(check('arabic-check',arabic.ok,arabic.ok?'no broken Arabic joins or missing glyphs':arabic.problems.filter(problem=>problem.level==='fail').map(problem=>`${problem.code} at ${problem.where}`).join('; ')));
  if(arabic.counts.needsReview)checks.push(warn('arabic-review',`${arabic.counts.needsReview} Arabic item(s) need a written decision in the QA report: ${[...new Set(arabic.problems.filter(problem=>problem.level==='needs-review').map(problem=>problem.code))].join(', ')} (node scripts/arabic-check.mjs --manifest ${task}/edit.json)`));
  const minutes=editedMinutes(manifest),band=await bandFor({style:manifest.style,tone:brief.tone,override:report.band});
  const sounds=manifest.sounds??[];
  if(!sounds.length)checks.push(warn('cue-density','the candidate has no sound events'));
  else checks.push(densityCheck(sounds.length,minutes,band));
  checks.push(check('no-sweeps',brief.sweeps===true||sounds.every(sound=>!SWEEP_RECIPE.test(String(sound?.recipe))),'no air sweep (-sweep twins) unless the brief sets "sweeps": true'));
  const approved=await load(`Projects/${project}/rough-cut/approved.json`,checks);
  if(approved)checks.push(check('segments',JSON.stringify(approved.segments)===JSON.stringify(brief.segments),'brief segments equal the approved cut'));
  else checks.push(warn('segments',`Projects/${project}/rough-cut/approved.json not found; segments not compared`));
  if(await exists(`${task}/scenes`)){
    const scenes=report.projectScenes??{};
    checks.push(check('project-scenes-tsc',scenes.tsc==='ok','checks.json projectScenes.tsc is ok'));
    checks.push(check('project-scenes-safe',typeof scenes.safeCheckReport==='string'&&await exists(scenes.safeCheckReport),'checks.json projectScenes.safeCheckReport names an existing report'));
  }
  return checks;
}

async function acceptQa({task,project}){
  const checks=[];
  const report=await exists(`${task}/QC_REPORT.md`)?await read(`${task}/QC_REPORT.md`):'';
  checks.push(check('report',report.length>0,'QC_REPORT.md present'));
  for(const section of ['## File','## Technical','## Safe zones','## Head keep-out','## Encode','## Editorial','## Open problems'])
    checks.push(check(`section-${section.slice(3).toLowerCase().replace(/\s+/g,'-')}`,report.startsWith(section)||report.includes(`\n${section}`),`${section} section`));
  const safe=/## Safe zones\s+(Projects\/[^\s`)]+)/.exec(report);
  checks.push(check('safe-report',!!safe&&await exists(`${safe[1].replace(/\/summary\.md$/,'')}/summary.md`),'Safe zones cites a report folder with summary.md'));
  const needs=report.split('\n').filter(line=>/NEEDS-REVIEW/.test(line)).length,decisions=report.split('\n').filter(line=>/^\s*Decision:\s*\S/.test(line)).length;
  checks.push(check('needs-review-decided',decisions>=needs,`${needs} NEEDS-REVIEW line(s), ${decisions} Decision line(s)`));
  // Arabic: a broken join in the live edit fails; every item that needs review needs its own written Decision line under "## Arabic".
  const live=await load(`Projects/${project}/edit.json`,[]);
  if(live){
    const arabic=checkArabic({manifest:live,fonts:installedFonts()});
    if(!arabic.ok)checks.push(check('arabic-clean',false,arabic.problems.filter(problem=>problem.level==='fail').map(problem=>`${problem.code} at ${problem.where}`).join('; ')));
    if(arabic.counts.needsReview){
      const section=/\n## Arabic\n([\s\S]*?)(?=\n## |$)/.exec(`\n${report.replace(/\r\n/g,'\n')}`);
      const decided=section?(section[1].match(/^\s*Decision:\s*\S/gm)??[]).length:0;
      checks.push(check('arabic-decided',decided>=arabic.counts.needsReview,`${arabic.counts.needsReview} Arabic item(s) to review, ${decided} Decision line(s) under ## Arabic`));
    }
  }
  checks.push(check('ig-check',await exists(`${task}/ig-check.json`),'ig-check.json present'));
  checks.push(check('no-acceptance-wording',!/(creator|المستخدم|صانع المحتوى)[^\n]{0,40}(accepted|approved|وافق|اعتمد)|(accepted|approved)\s+by\s+(the\s+)?creator/i.test(report),'no creator acceptance wording'));
  return checks;
}

async function acceptDelivery({task,project}){
  const checks=[];
  const ig=await load(`${task}/ig-check.json`,checks);
  checks.push(check('ig-check',!!ig&&ig.ok===true,'ig-check.json ok'));
  checks.push(check('report',await exists(`${task}/delivery-report.md`),'delivery-report.md present'));
  checks.push(check('srt',await exists(`${task}/${project}.srt`),`${project}.srt present`));
  checks.push(check('cover',await exists(`${task}/${project}-cover.jpg`),`${project}-cover.jpg present`));
  checks.push(check('render',await exists(`Projects/${project}/renders/edit-delivery.mp4`),'renders/edit-delivery.mp4 exists'));
  const packet=await fs.stat(abs(`${task}/packet.json`)).catch(()=>null);
  const outputs=await fs.readdir(abs(`Outputs/${project}`)).catch(()=>[]);
  let touched=false;
  for(const name of outputs){const stat=await fs.stat(abs(`Outputs/${project}/${name}`));if(packet&&stat.mtimeMs>packet.mtimeMs)touched=true;}
  checks.push(check('outputs-untouched',!touched,'Outputs/<id> has no file newer than the packet'));
  return checks;
}

const AUDIO_REVIEW=id=>id==='sound.bed'||id==='sound.tempo'||/^X\d{2,}$/.test(id);
const json=text=>{try{return JSON.parse(text);}catch{return null;}};
async function acceptBreakdown({task,project}){
  const checks=[];
  const summary=await exists(`${task}/breakdown-summary.md`)?await read(`${task}/breakdown-summary.md`):'';
  const refs=[...new Set(summary.match(/ref-[0-9a-f]{12}/g)??[])];
  checks.push(check('summary',refs.length>0,'breakdown-summary.md names at least one reference id'));
  const questions=await exists(`${task}/questions.md`)?await read(`${task}/questions.md`):null;
  checks.push(check('questions',questions!==null,'questions.md present'));
  for(const ref of refs){
    const dir=`Projects/${project}/style-analysis/${ref}`;
    const b=await load(`${dir}/breakdown.json`,checks);
    checks.push(check(`breakdown-${ref}`,!!b&&b.schema===1&&b.referenceId===ref,`${dir}/breakdown.json is a schema 1 breakdown of ${ref}`));
    for(const file of ['BREAKDOWN.md','studio-recipe.md','report/report.html'])checks.push(check(`${file}-${ref}`,await exists(`${dir}/${file}`),`${dir}/${file} present`));
    if(!b)continue;
    const queue=b.reviewQueue??[];
    checks.push(check(`review-${ref}`,!queue.some(id=>!AUDIO_REVIEW(id))||await exists(`${dir}/review_tasks.json`),'the visual review pass ran for pending picture items'));
    checks.push(check(`sound-questions-${ref}`,queue.filter(AUDIO_REVIEW).every(id=>questions?.includes(id)),'questions.md lists every sound item that needs the creator\'s ear'));
  }
  const candidates=[];
  for(const file of [`Projects/${project}/STYLE_DNA.json`,`Projects/${project}/STYLE_DNA.proposal.json`])if(await exists(file))candidates.push(json(await read(file)));
  checks.push(check('dna',candidates.some(dna=>dna?.status==='draft'&&dna.generatedBy==='breakdown'&&dna.baseStyle===null&&refs.every(ref=>dna.references?.some(r=>r.id===ref))),'STYLE_DNA.json (or its proposal) is a breakdown draft with baseStyle null that covers every named reference'));
  return checks;
}

const BY_ROLE={breakdown:acceptBreakdown,analysis:acceptAnalysis,editorial:acceptEditorial,assets:acceptAssets,sound:acceptSound,edit:acceptEdit,qa:acceptQa,delivery:acceptDelivery};

export async function acceptTask({role,task,transcript,edit,deliver=false}){
  if(!ACCEPT_ROLES.includes(role))throw new Error(`Unknown role: ${role}`);
  const folder=String(task).replace(/\/+$/,'');relativePath(folder);
  if(!/^Projects\/[a-z0-9][a-z0-9-]{0,63}\/production\/[a-z0-9][a-z0-9-]{0,63}\/tasks\/[a-z0-9][a-z0-9-]{0,63}$/.test(folder))throw new Error('Use an owned Projects/<id>/production/<run>/tasks/<task> folder.');
  const packet=await readJson(`${folder}/packet.json`);
  if(packet.role!==role)throw new Error(`Packet role is ${packet.role}, not ${role}.`);
  const project=packet.project,run=folder.split('/').slice(0,4).join('/');
  let checks;
  try{checks=await BY_ROLE[role]({task:folder,project,packet,run,transcript,edit,deliver});}
  catch(error){if(!(error instanceof TypeError))throw error;checks=[check('artifacts-readable',false,`an artifact has an unexpected shape: ${error.message}`)];}
  const report={version:1,role,task:folder,basisHash:packet.claim?.basisHash??null,checkedAt:new Date().toISOString(),ok:checks.every(item=>item.status!=='fail'),checks};
  await atomicJson(`${folder}/accept.json`,report,{project});
  return report;
}
