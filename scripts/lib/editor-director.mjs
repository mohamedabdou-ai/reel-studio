import './project-tmp.mjs';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {EDITION_STYLE_IDS as STYLE_IDS, EDITION_DEFAULT_STYLE_IDS as DEFAULT_STYLE_IDS, getStyleProfile} from '../../engine/src/creative-kit/styles.ts';
import {introSchema, proofSchema, processSchema, comparisonSchema, commentSchema, followSchema} from '../../engine/src/creative-kit/schema.ts';
import {kineticSceneVariants} from '../../engine/src/creative-kit/kinetic/schema.ts';
import {librarySceneVariants} from '../../engine/src/motion-library/schema.ts';
import {screenRecordingVariants} from '../../engine/src/screen-recording/schema.ts';
import {semanticSceneVariants} from '../../engine/src/creative-kit/semantic/schema.ts';
import {editManifestSchema, editSceneSchema} from '../../engine/src/prepared-edit/schema.ts';
import {compileEdit} from '../../engine/src/prepared-edit/timeline.ts';
import {ROOT, atomicJson, checkedPath, ensureOutput, readJson, relativePath, slug, object, finite, digest, fileSnapshot, withFileLock} from './job-paths.mjs';
import {inspectEditSource, importEditCaptions, loadEditProject, prepareEditProject} from './edit-project.mjs';
import {soundRecipe} from './job-sound.mjs';
import {validateMotionPlan} from './motion-plan.mjs';
import {SPEC} from './ig.mjs';
import {spawn} from 'node:child_process';
import {normalizeCreatorProfile,validateEditorSource} from './branding.mjs';
import {endingIssues,resolveEnding} from './endings.mjs';
import {normalizeBrand} from './branding.mjs';
import {normalizePreferences} from './branding.mjs';
import {resolvePreferences, WRITING_GUIDES} from '../../engine/src/core/preference-options.ts';
import {applyBrandToScenes} from '../../engine/src/core/brand.ts';
import {editCues} from './scene-cues.mjs';
import {loadStylePalette, planSfxEvents} from './sfx-events.mjs';

const EMPHASIS_DEFAULTS = Object.freeze({holdSec: 1.5});
import {emphasisPunch, composeTrack, toManifestKeys, PUNCH_KINDS, PUNCH_CAPS} from '../../engine/src/core/camera.ts';

export const EDITOR_PURPOSES = Object.freeze(['explainer','case-study','tutorial','comparison','opinion','story']);
export const EDITOR_TONES = Object.freeze(['energetic','calm','editorial']);
export const EDITOR_SOUND_MODES = Object.freeze(['recipes','auto']);
const KINETIC_SCHEMAS=Object.fromEntries([...kineticSceneVariants,...librarySceneVariants,...screenRecordingVariants,...semanticSceneVariants].map(schema=>[schema.shape.family.value,schema]));
export const BEAT_FAMILIES = Object.freeze({hook:'intro',intro:'intro',evidence:'proof',proof:'proof',steps:'process',process:'process',
  comparison:'comparison',comment:'comment','comment-cta':'comment',follow:'follow','follow-cta':'follow',
  ...Object.fromEntries(Object.keys(KINETIC_SCHEMAS).map(family=>[family,family]))});
const DATA_SCHEMAS = {intro:introSchema,proof:proofSchema,process:processSchema,comparison:comparisonSchema,comment:commentSchema,follow:followSchema,
  ...Object.fromEntries(Object.entries(KINETIC_SCHEMAS).map(([family,schema])=>[family,schema.shape.data]))};
const SEMANTIC_FAMILIES=semanticSceneVariants.map(schema=>schema.shape.family.value);
const defaultLayout=family=>SEMANTIC_FAMILIES.includes(family)?'takeover':KINETIC_SCHEMAS[family]?.shape.layout.value??(['process','comparison','follow','data-story'].includes(family)?'takeover':'split');

const PURPOSE_FIT = {
  explainer: {'section-deck':16,'split-canvas':13,'kinetic-paper':12,'stepped-editorial':10},
  'case-study': {'calligraphic-receipts':18,'stepped-editorial':13,'section-deck':12,'paper-collage':9},
  tutorial: {'section-deck':16,'split-canvas':13,'kinetic-paper':12,'calligraphic-receipts':8},
  comparison: {'split-canvas':18,'judgment-board':13,'section-deck':12,'paper-collage':10},
  opinion: {'judgment-board':18,'stepped-editorial':13,'kinetic-paper':10,'calligraphic-receipts':8},
  story: {'paper-collage':18,'kinetic-paper':13,'calligraphic-receipts':10,'stepped-editorial':9},
};
const TONE_FIT = {
  energetic: {'kinetic-paper':6,'split-canvas':4,'paper-collage':4,'judgment-board':2},
  calm: {'section-deck':4,'calligraphic-receipts':3,'paper-collage':2},
  editorial: {'stepped-editorial':6,'judgment-board':4,'calligraphic-receipts':4,'paper-collage':2},
};
const SOUND_FOR_FAMILY = {intro:'soft-transition',proof:'counter-accent',process:'paper-reveal',comparison:'paper-reveal',comment:'ui-confirmation',follow:'soft-transition',
  'token-lens':'highlight-swipe','meter-receipt':'counter-accent','ticket-offer':'restrained-reveal','comment-stack':'ui-confirmation','chapter-quote':'chapter-shift','route-stops':'paper-reveal',
  'kinetic-hook':'restrained-reveal','image-compare':'paper-reveal',checklist:'highlight-swipe',count:'counter-accent',screens:'soft-transition',
  statement:'soft-transition',outcome:'ui-confirmation','creator-cta':'ui-confirmation','screen-focus':'soft-transition','screen-recording':'soft-transition','data-story':'counter-accent'};
const text = (value,label,max=200) => {
  if(typeof value!=='string' || !value.trim() || value.length>max) throw new Error(`${label} must be nonblank text (maximum ${max} characters).`);
  return value;
};
const choice = (value,values,label) => {
  if(!values.includes(value)) throw new Error(`${label} must be one of ${values.join(', ')}.`);
  return value;
};
const style = value => choice(value,STYLE_IDS,'style');
const pathsOverlap=(a,b)=>{a=a.toLowerCase();b=b.toLowerCase();return a===b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);};
const assertOutput=(value,id,inputs=[])=>{
  relativePath(value);
  if(!value.startsWith(`Projects/${id}/`)) throw new Error(`Editor outputs must stay in Projects/${id}/.`);
  if(inputs.some(input=>pathsOverlap(value,input))) throw new Error(`Output would overwrite a source, transcript or other input: ${value}`);
  return value;
};
async function preflightPreparation(manifestPath,manifest,additionalInputs=[]) {
  assertOutput(manifestPath,manifest.id);
  const inputs=[manifestPath,manifest.source.path,...additionalInputs];
  inputs.forEach(relativePath);
  const outputs=['props.json','preparation.json','timeline.json','captions.srt','sounds.hits.json','sounds.wav']
    .map(name=>`Projects/${manifest.id}/prepared/${name}`);
  outputs.forEach(output=>assertOutput(output,manifest.id,inputs));
  await Promise.all(outputs.map(output=>checkedPath(output,{write:true,project:manifest.id})));
}

export function listEditorStyles() {
  return {ok:true,styles:STYLE_IDS.map(id=>getStyleProfile(id)),selection:'One explicit or deterministically recommended style per video. Approval metadata is preserved.'};
}

export function validateEditorBrief(raw) {
  object(raw,['version','id','source','sourceKind','transcript','creator','brand','purpose','tone','style','preferences','fontFamily','captionsGrouping','captionsPresentation','writingStyle','recentStyles','captionsReviewedBy','captionsMode','signoffFromSec','endAtSec','beats','footage','transitions','sound','segments'],'editor brief');
  if(raw.version!==1) throw new Error('Editor brief version must be 1.');
  slug(raw.id); const creator=normalizeCreatorProfile(raw.creator);
  validateEditorSource({source:raw.source,transcript:raw.transcript}); relativePath(raw.source); relativePath(raw.transcript);
  choice(raw.purpose,EDITOR_PURPOSES,'purpose');choice(raw.tone,EDITOR_TONES,'tone');
  if(raw.style!==undefined) style(raw.style);
  if(raw.preferences!==undefined) normalizePreferences(raw.preferences);
  if(raw.fontFamily!==undefined) editManifestSchema.shape.fontFamily.parse(raw.fontFamily);
  if(raw.writingStyle!==undefined) editManifestSchema.shape.writingStyle.parse(raw.writingStyle);
  if(raw.captionsGrouping!==undefined) editManifestSchema.shape.captions.shape.grouping.parse(raw.captionsGrouping);
  if(raw.captionsPresentation!==undefined) editManifestSchema.shape.captions.shape.presentation.parse(raw.captionsPresentation);
  if(raw.recentStyles!==undefined) {
    if(!Array.isArray(raw.recentStyles) || raw.recentStyles.length>50) throw new Error('recentStyles must be an array, newest first (maximum 50).');
    raw.recentStyles.forEach(style);
  }
  if(raw.captionsReviewedBy!==undefined) text(raw.captionsReviewedBy,'captions reviewer');
  if(raw.signoffFromSec!==undefined) finite(raw.signoffFromSec,0,600,'signoffFromSec');
  if(raw.endAtSec!==undefined) finite(raw.endAtSec,0.000001,600,'endAtSec');
  if(raw.sound!==undefined) choice(raw.sound,EDITOR_SOUND_MODES,'sound');
  if(raw.sourceKind!==undefined) choice(raw.sourceKind,['presenter','screen'],'sourceKind');
  const brand=raw.brand===undefined||raw.brand===null?null:normalizeBrand(raw.brand);
  if(raw.emphasisFile!==undefined) {
    relativePath(raw.emphasisFile);
    if([raw.source,raw.transcript].some(input=>input.toLowerCase()===raw.emphasisFile.toLowerCase())) throw new Error('The emphasis file must differ from the source and transcript.');
    text(raw.emphasisApprovedBy,'emphasis approver');
  } else if(raw.emphasisApprovedBy!==undefined) throw new Error('emphasisApprovedBy needs an emphasisFile.');
  if(raw.footage?.pip!==undefined) throw new Error('Picture-in-picture is not available in this edition.');
  if(raw.segments!==undefined) {
    if(!Array.isArray(raw.segments) || !raw.segments.length || raw.segments.length>300) throw new Error('segments must list 1 to 300 approved source ranges.');
    let end=0;
    for(const range of raw.segments) {
      object(range,['fromFrame','toFrame'],'segment');
      if(!Number.isInteger(range.fromFrame) || !Number.isInteger(range.toFrame) || range.fromFrame<end || range.toFrame<=range.fromFrame) throw new Error('segments must be ordered, disjoint whole-frame source ranges.');
      end=range.toFrame;
    }
  }
  if(!Array.isArray(raw.beats) || !raw.beats.length || raw.beats.length>300) throw new Error('A brief needs between 1 and 300 authored beats.');
  let last=0;const ids=new Set();
  const beats=raw.beats.map(beat=>{
    object(beat,['id','fromSec','toSec','intent','data','layout','motion'],'beat');slug(beat.id,'beat id');
    if(ids.has(beat.id)) throw new Error('Beat IDs must be unique.');ids.add(beat.id);
    finite(beat.fromSec,0,600,'beat fromSec');finite(beat.toSec,0,600,'beat toSec');
    if(beat.toSec<=beat.fromSec) throw new Error('Beat intervals must have a toSec greater than fromSec.');
    if(beat.fromSec<last) throw new Error('Beats must be ordered without overlaps.');last=beat.toSec;
    choice(beat.intent,Object.keys(BEAT_FAMILIES),'beat intent');
    const family=BEAT_FAMILIES[beat.intent],data=DATA_SCHEMAS[family].strict().parse(beat.data);
    editSceneSchema.parse({id:beat.id,family,fromFrame:0,durationInFrames:4320000,
      layout:beat.layout??defaultLayout(family),motion:beat.motion??'land',data});
    return {...beat,data};
  });
  return {...raw,creator,brand,beats,
    ...(raw.footage===undefined?{}:{footage:editManifestSchema.shape.footage.parse(raw.footage)}),
    ...(raw.transitions===undefined?{}:{transitions:editManifestSchema.shape.transitions.parse(raw.transitions)}),
    ...(raw.captionsMode===undefined?{}:{captionsMode:editManifestSchema.shape.captions.shape.mode.parse(raw.captionsMode)})};
}

export function recommendEditorStyle(raw) {
  const brief=validateEditorBrief(raw);
  // New styles enter the automatic pool only when authored semantic beats warrant them.
  // Legacy briefs retain the original automatic pool and explicit choices always win.
  const eligibility={'liquid-glass':['token-lens','meter-receipt'],'campaign-tickets':['ticket-offer','comment-stack'],'magazine-interview':['chapter-quote'],'scrapbook-route':['route-stops']};
  const eligible=Object.entries(eligibility).filter(([,families])=>brief.beats.some(beat=>families.includes(BEAT_FAMILIES[beat.intent]))).map(([id])=>id);
  const candidates=[...DEFAULT_STYLE_IDS,...eligible].map((id,index)=>{
    const contentScore=PURPOSE_FIT[brief.purpose][id]??4;
    const toneScore=TONE_FIT[brief.tone][id]??0;
    const semanticScore=eligible.includes(id)?24:0;
    const recentIndex=(brief.recentStyles??[]).indexOf(id);
    const repetitionPenalty=recentIndex<0?0:Math.max(2,12-recentIndex*2);
    const reasons=[`Content fit: ${brief.purpose} (${contentScore} editorial points).`,`Tone fit: ${brief.tone} (${toneScore} points).`];
    if(semanticScore)reasons.push(`Authored ${eligibility[id].join('/')} beats qualify this visual grammar (${semanticScore} points).`);
    if(repetitionPenalty) reasons.push(`Used recently at position ${recentIndex+1}; subtract ${repetitionPenalty} points to reduce repetition.`);
    return {style:id,score:contentScore+toneScore+semanticScore-repetitionPenalty,contentScore,toneScore,...(semanticScore?{semanticScore}:{}),repetitionPenalty,reasons,index};
  }).sort((a,b)=>b.score-a.score || a.index-b.index).map(({index:_,...candidate})=>candidate);
  const savedStyle=brief.preferences?.style.mode==='fixed'?brief.preferences.style.value:undefined;
  const selected=brief.style??savedStyle??candidates[0].style;
  const reasons=brief.style?[`Explicit style ${selected} is pinned; content scores and recent use do not override it.`]
    :savedStyle?[`Saved style ${selected} is pinned; this video can override it explicitly.`]:candidates[0].reasons;
  return {method:'deterministic-rules-v1',style:selected,explicit:brief.style!==undefined||savedStyle!==undefined,reasons,candidates,profile:getStyleProfile(selected)};
}


export function buildEditorPlan(raw,source,captions,{delivery=false,emphasis}={}) {
  const brief=validateEditorBrief(raw),selection=recommendEditorStyle(brief);
  const defaults=brief.preferences?resolvePreferences(brief.preferences,{purpose:brief.purpose,tone:brief.tone,style:selection.style}):{};
  const preferences={...defaults,...Object.fromEntries(['fontFamily','writingStyle','captionsGrouping','captionsPresentation'].filter(key=>brief[key]!==undefined).map(key=>[key,brief[key]]))};
  if(source.path!==brief.source) throw new Error('Inspected source path disagrees with the named brief source.');
  const duration=source.totalFrames/source.fps;
  if(brief.endAtSec!==undefined && brief.endAtSec>duration+1e-7) throw new Error('endAtSec exceeds the inspected source duration.');
  const retainedFrames=brief.endAtSec===undefined?source.totalFrames:Math.round(brief.endAtSec*source.fps);
  if(retainedFrames<1) throw new Error('endAtSec must retain at least one complete source frame.');
  const segments=brief.segments??[{fromFrame:0,toFrame:retainedFrames}];
  if(segments.at(-1).toFrame>retainedFrames) throw new Error('segments must end inside the retained source.');
  const editFrames=segments.reduce((sum,range)=>sum+range.toFrame-range.fromFrame,0);
  const editFrame=(sec,edge)=>{
    const at=Math.round(sec*source.fps);let offset=0;
    for(const range of segments) {
      if(edge==='start'?at<range.toFrame:at<=range.toFrame) return offset+Math.max(0,at-range.fromFrame);
      offset+=range.toFrame-range.fromFrame;
    }
    return offset;
  };
  const imported=Array.isArray(captions)?captions:captions?.captions??captions?.words;
  if(!Array.isArray(imported)) throw new Error('Expected word captions with text/startMs/endMs.');
  const words=imported.map(w=>({text:w.text,startMs:w.startMs,endMs:w.endMs,confidence:w.confidence??null}));
  if(brief.endAtSec!==undefined && words.some(word=>word.endMs>retainedFrames/source.fps*1000+0.000001)) {
    throw new Error('endAtSec cannot cut or omit supplied caption speech. Place the endpoint after the last reviewed word.');
  }
  if(delivery && !brief.captionsReviewedBy) throw new Error('Delivery needs reviewed captions and an explicit captionsReviewedBy reviewer.');
  const scenes=brief.beats.map(beat=>{
    if(beat.toSec>retainedFrames/source.fps+1e-7) throw new Error(`Beat ${beat.id} exceeds the retained source duration.`);
    const fromFrame=editFrame(beat.fromSec,'start'),toFrame=editFrame(beat.toSec,'end');
    if(toFrame<=fromFrame) throw new Error(`Beat ${beat.id} occupies no complete source frame.`);
    const family=BEAT_FAMILIES[beat.intent];
    return editSceneSchema.parse({id:beat.id,family,fromFrame,durationInFrames:toFrame-fromFrame,
      layout:beat.layout??defaultLayout(family),
      motion:beat.motion??(brief.tone==='calm'?'quiet':brief.tone==='energetic'?'stagger':selection.profile.grammar.motion),data:beat.data});
  });
  const ending=resolveEnding({creator:brief.creator,words,signoffFromSec:brief.signoffFromSec});
  const signoffFromFrame=ending.signoffFromSec===null?undefined:editFrame(ending.signoffFromSec,'start');
  const branded=applyBrandToScenes(selection.style,brief.brand??null,scenes);
  let camera=[],emphasisRecord=null;
  if(brief.emphasisFile!==undefined) {
    if(emphasis===undefined) throw new Error(`The brief names emphasisFile ${brief.emphasisFile}; load it and pass it to the planner.`);
    const approved=validateEmphasisProposals(emphasis,{words,fps:source.fps});
    camera=emphasisCameraKeys(approved,{fps:source.fps,limitFrame:signoffFromFrame??retainedFrames,anchored:brief.footage!==undefined});
    emphasisRecord={file:brief.emphasisFile,approvedBy:brief.emphasisApprovedBy,proposals:approved.length,keys:camera.length};
  }
  const manifest=editManifestSchema.parse({version:1,id:brief.id,purpose:delivery?'delivery':'test',style:selection.style,creator:ending.creator,...(branded.brand?{brand:branded.brand}:{}),source,
    ...(preferences.fontFamily===undefined?{}:{fontFamily:preferences.fontFamily}),
    ...(preferences.writingStyle===undefined?{}:{writingStyle:preferences.writingStyle}),
    segments,captions:{status:brief.captionsReviewedBy?'reviewed':'draft',
      ...(preferences.captionsGrouping===undefined?{}:{grouping:preferences.captionsGrouping}),
      ...(preferences.captionsPresentation===undefined?{}:{presentation:preferences.captionsPresentation}),
      ...(brief.captionsMode===undefined?{}:{mode:brief.captionsMode}),
      ...(brief.captionsReviewedBy?{reviewer:brief.captionsReviewedBy}:{}),words},scenes:branded.scenes,sounds:[],camera,
    ...(signoffFromFrame===undefined?{}:{signoffFromFrame}),...(brief.sourceKind==='screen'?{presenter:false}:{}),
    ...(brief.footage===undefined?{}:{footage:brief.footage}),...(brief.transitions===undefined?{}:{transitions:brief.transitions})});
  if(delivery) assertDeliveryReady(manifest);
  const decision={version:1,method:selection.method,contentPurpose:brief.purpose,tone:brief.tone,selection,
    preferences:{...preferences,...(preferences.writingStyle?{writingGuide:WRITING_GUIDES[preferences.writingStyle]}:{})},
    claims:'Supplied beat data only; transcript words are not used to invent claims.',
    authoredOverrides:{footage:manifest.footage??null,transitions:manifest.transitions??[]},
    timeline:{segments:manifest.segments,durationInFrames:editFrames,endAtSec:brief.endAtSec??null},
    source:{path:source.path,sha256:source.sha256,frames:source.totalFrames,fps:source.fps},
    transcript:{path:brief.transcript,status:manifest.captions.status,reviewer:manifest.captions.reviewer??null,words:words.length,mode:manifest.captions.mode??null},
    beatDecisions:scenes.map((scene,index)=>({id:scene.id,intent:brief.beats[index].intent,family:scene.family,fromFrame:scene.fromFrame,
      durationInFrames:scene.durationInFrames,layout:scene.layout,motion:scene.motion,dataOrigin:'Explicit authored beat data',
      rounding:{fromSec:brief.beats[index].fromSec,toSec:brief.beats[index].toSec},soundCandidate:SOUND_FOR_FAMILY[scene.family]})),
    reviewRequired:['Check source-specific framing and timing in rendered media.','Verify all on-screen copy and supplied evidence.',
      'Review style adaptation separately from source approval.','Preserve comment CTA, complete follow handle, recorded signoff and hard stop.'],
    ...(emphasisRecord?{emphasis:emphasisRecord}:{}),notices:[...ending.notices,...branded.notices]};
  return {manifest,decision};
}


export function assertDeliveryReady(manifest) {
  if(manifest?.purpose!=='delivery') throw new Error('Delivery requires manifest purpose: delivery. Author it explicitly with plan --deliver after review.');
  if(manifest.captions?.status!=='reviewed') throw new Error('Delivery requires reviewed captions.');
  text(manifest.captions.reviewer,'captions reviewer');
  if(!manifest.captions.words?.length) throw new Error('Delivery requires nonempty reviewed caption words.');
  if(!manifest.scenes?.length) throw new Error('Delivery requires authored scenes.');
  const m=editManifestSchema.parse(manifest),compiled=compileEdit(m),signoff=m.signoffFromFrame;
  if(compiled.issues.length) throw new Error('Delivery caption cuts need review before rendering.');
  if(m.scenes.some(scene=>scene.fromFrame+scene.durationInFrames>signoff)) throw new Error('All visual scenes must finish before the recorded signoff.');
  const endingProblems=endingIssues(m);
  if(endingProblems.length) throw new Error(`Delivery ending: ${endingProblems.join(' ')}`);
  return {ok:true,captionStatus:m.captions.status,reviewer:m.captions.reviewer,signoffFromFrame:signoff};
}




export function autoSoundPlan(manifest,palette) {
  const fps=manifest.source.fps,durationInFrames=compileEdit(manifest).durationInFrames;
  const limit=manifest.signoffFromFrame??durationInFrames;
  const planned=planSfxEvents(editCues(manifest),palette,{fps,signoffFromFrame:manifest.signoffFromFrame,durationInFrames});
  const durations=new Map(Object.values(palette.entries).flatMap(entry=>entry.recipe?[[entry.recipe.id,entry.recipe.duration]]:[]));
  const sounds=[],dropped=[];
  for(const event of planned.events) {
    const duration=durations.get(event.recipe);
    if(duration===undefined) throw new Error(`Palette recipe ${event.recipe} is not in the resolved ${palette.style} palette.`);
    if(event.atFrame/fps+duration>limit/fps+1e-7) {dropped.push({atFrame:event.atFrame,recipe:event.recipe,reason:'recipe-crosses-signoff'});continue;}
    sounds.push({atFrame:event.atFrame,recipe:event.recipe,gain:event.gain});
  }
  return {style:planned.style,maxPerSec:planned.maxPerSec,sounds,decisions:planned.decisions,dropped};
}













export function validateEmphasisProposals(raw,{words,fps}={}) {
  object(raw,['version','proposals'],'emphasis proposals');
  if(raw.version!==1) throw new Error('Emphasis proposals version must be 1.');
  if(!Array.isArray(raw.proposals) || raw.proposals.length>200) throw new Error('Emphasis proposals must be an array (maximum 200).');
  let last=-1;
  return raw.proposals.map((p,index)=>{
    object(p,['wordIndex','atFrame','kind','scale','anchor','reason','status'],`emphasis proposal ${index}`);
    finite(p.wordIndex,0,19999,'emphasis wordIndex',{integer:true});
    if(words!==undefined && p.wordIndex>=words.length) throw new Error(`Emphasis proposal ${index} names word ${p.wordIndex}, outside the transcript.`);
    finite(p.atFrame,0,4320000,'emphasis atFrame',{integer:true});
    if(words!==undefined && fps!==undefined) {
      const word=words[p.wordIndex];
      const expected=Math.floor(word.startMs*fps/1000+1e-7);
      if(p.atFrame!==expected) throw new Error(`Emphasis proposal ${index} atFrame ${p.atFrame} does not match word ${p.wordIndex} at ${fps} fps `+
        `(expected ${expected}); re-run scripts/emphasis.mjs with --fps ${fps} against the reviewed transcript.`);
    }
    if(p.atFrame<=last) throw new Error('Emphasis proposals must be strictly ordered by atFrame.');
    last=p.atFrame;
    choice(p.kind,PUNCH_KINDS,'emphasis kind');
    finite(p.scale,PUNCH_CAPS.min,PUNCH_CAPS.max,'emphasis scale');
    if(p.anchor!==null) {object(p.anchor,['x','y'],'emphasis anchor');finite(p.anchor.x,0,1,'emphasis anchor x');finite(p.anchor.y,0,1,'emphasis anchor y');}
    text(p.reason,'emphasis reason',400);
    if(p.status==='NEEDS-REVIEW') throw new Error(`Emphasis proposal ${index} is still NEEDS-REVIEW; resolve or delete it before planning.`);
    if(p.status!=='proposed') throw new Error(`Emphasis proposal ${index} status must be proposed.`);
    return {...p};
  });
}








export function emphasisCameraKeys(proposals,{fps,limitFrame,anchored=false}={}) {
  finite(fps,1,120,'fps');
  const holdFrames=Math.round(EMPHASIS_DEFAULTS.holdSec*fps);
  const parts=proposals.map(p=>{
    if(p.kind==='slow-push' && p.atFrame<1) throw new Error(`Emphasis proposal at frame ${p.atFrame} needs at least one earlier frame for a slow-push.`);
    const pushFrames=p.kind==='slow-push'?Math.min(30,p.atFrame):undefined;
    return emphasisPunch({kind:p.kind,atFrame:p.atFrame,scale:p.scale,holdFrames,
      ...(pushFrames!==undefined?{pushFrames}:{}),...(anchored && p.anchor?{anchor:p.anchor}:{})});
  });
  const keys=composeTrack(parts);
  keys.forEach((key,i)=>{
    if(key.frame>=limitFrame) throw new Error(`Emphasis camera key ${i} at frame ${key.frame} crosses the recorded signoff or edit end (${limitFrame}).`);
    if(i && key.frame<=keys[i-1].frame) throw new Error('Emphasis camera keys must be strictly ordered.');
  });
  return anchored
    ? keys.map(k=>({atFrame:k.frame,scale:k.scale,focusX:k.ax,focusY:k.ay,ease:'bezierCam'}))
    : toManifestKeys(keys).map(k=>({atFrame:k.atFrame,scale:k.scale,focusX:k.focusX,focusY:k.focusY,ease:'bezierCam'}));
}

const decisionMarkdown=record=>[
  '# Editor decision record','',`Project: ${record.id}`,`Method: ${record.method}`,'',
  `Selected style: ${record.selection.style}`,`Content purpose: ${record.contentPurpose}; tone: ${record.tone}.`,'',
  ...record.selection.reasons.map(reason=>`- ${reason}`),'',record.claims,'',
  'Approval and evidence metadata:','', '```json',JSON.stringify({source:record.selection.profile.source,approval:record.selection.profile.approval},null,2),'```','',
  `Source: ${record.source.path} (${record.source.frames} frames at ${record.source.fps} fps).`,
  `Retained timeline: ${record.timeline.durationInFrames} frames; explicit endAtSec: ${record.timeline.endAtSec??'full source'}.`,
  `Transcript: ${record.transcript.path}; ${record.transcript.words} words; ${record.transcript.status}; reviewer: ${record.transcript.reviewer??'none'}.`,'',
  `Explicit footage geometry: ${record.authoredOverrides.footage?'preserved':'not supplied'}; authored transitions: ${record.authoredOverrides.transitions.length}.`,'',
  ...(record.sound?[`Sound placement: automatic scene cues through the ${record.sound.style} palette; ${record.sound.placed} placed.`,'']:[]),
  ...(record.emphasis?[`Emphasis camera: ${record.emphasis.keys} keys from ${record.emphasis.proposals} approved proposals in ${record.emphasis.file} (approved by ${record.emphasis.approvedBy}).`,'']:[]),
  '| Beat | Family | Start frame | Frames | Layout | Motion | Sound |','| --- | --- | ---: | ---: | --- | --- | --- |',
  ...record.beatDecisions.map(beat=>`| ${beat.id} | ${beat.family} | ${beat.fromFrame} | ${beat.durationInFrames} | ${beat.layout} | ${beat.motion} | ${beat.soundRecipe??'none'} |`),'',
  'Review still required:','',...record.reviewRequired.map(item=>`- ${item}`),'',
  'This record describes authored data and deterministic selection. It is not proof of a passed render, safe-zone, audio or motion check.','',
].join('\n');

export async function planEditorBrief(briefPath,{out,delivery=false,replace=false}={}) {
  const brief=validateEditorBrief(await readJson(briefPath));
  const manifestPath=out??`Projects/${brief.id}/edit.json`;
  const inputs=[briefPath,brief.source,brief.transcript,...(brief.emphasisFile===undefined?[]:[brief.emphasisFile])];
  assertOutput(manifestPath,brief.id,inputs);
  if(path.extname(manifestPath).toLowerCase()!=='.json') throw new Error('Edit manifest output must end in .json.');
  const base=`Projects/${brief.id}/director/${digest(manifestPath).slice(0,12)}`;
  const outputs=[manifestPath,`${base}/import-edit.json`,`${base}/decision.json`,`${base}/decision.md`];
  outputs.forEach(output=>assertOutput(output,brief.id,inputs));
  await Promise.all(inputs.map(input=>checkedPath(input,{mustExist:true})));
  const before=await Promise.all([briefPath,brief.transcript,...(brief.emphasisFile===undefined?[]:[brief.emphasisFile])].map(p=>fileSnapshot(p)));
  const info=await inspectEditSource(brief.source);
  const emphasis=brief.emphasisFile===undefined?undefined:await readJson(brief.emphasisFile);
  const plan=buildEditorPlan(brief,info.source,await readJson(brief.transcript),{delivery,emphasis});
  const opts={project:brief.id};
  return withFileLock(`${base}/plan.lock`,opts,async()=>{
    if(!replace && await readJson(manifestPath,{optional:true})) throw new Error(`Edit output already exists: ${manifestPath}. Use --replace after reviewing the authored edits.`);
    if(brief.sound==='auto') {
      const auto=autoSoundPlan(plan.manifest,await loadStylePalette(plan.manifest.style));
      plan.manifest.sounds.push(...auto.sounds);
      plan.decision.sound={mode:'auto',style:auto.style,maxPerSec:auto.maxPerSec,placed:auto.sounds.length,decisions:auto.decisions,droppedForSignoff:auto.dropped};
      for(const beat of plan.decision.beatDecisions) {
        const placed=auto.sounds.filter(s=>s.atFrame>=beat.fromFrame && s.atFrame<beat.fromFrame+beat.durationInFrames).map(s=>s.recipe);
        if(placed.length) beat.soundRecipe=placed.join(' + ');
        else beat.soundOmitted='No palette cue was placed inside this beat.';
      }
    } else for(const [i,scene] of plan.manifest.scenes.entries()) {
      const recipe=await soundRecipe(SOUND_FOR_FAMILY[scene.family]);
      const soundEnd=scene.fromFrame+Math.ceil(recipe.duration*plan.manifest.source.fps);
      if(soundEnd<=Math.min(scene.fromFrame+scene.durationInFrames,plan.manifest.signoffFromFrame??info.source.totalFrames)) {
        plan.manifest.sounds.push({atFrame:scene.fromFrame,recipe:recipe.id,gain:brief.tone==='calm'?0.4:0.6});
        plan.decision.beatDecisions[i].soundRecipe=recipe.id;
      } else plan.decision.beatDecisions[i].soundOmitted='Recipe would cross the beat or recorded signoff.';
    }

    const staging=`${base}/import-edit.json`;
    await atomicJson(staging,{...plan.manifest,purpose:'test',captions:{status:'draft',words:[]}},opts);
    await importEditCaptions(staging,brief.transcript);
    const imported=await readJson(staging);
    const manifest=editManifestSchema.parse({...plan.manifest,captions:{...imported.captions,
      ...(plan.manifest.captions.grouping===undefined?{}:{grouping:plan.manifest.captions.grouping}),
      ...(plan.manifest.captions.presentation===undefined?{}:{presentation:plan.manifest.captions.presentation}),
      ...(brief.captionsMode===undefined?{}:{mode:brief.captionsMode}),
      ...(brief.captionsReviewedBy?{status:'reviewed',reviewer:brief.captionsReviewedBy}:{})}});
    if(delivery) assertDeliveryReady(manifest);
    const after=await Promise.all(before.map(snapshot=>fileSnapshot(snapshot.path)));
    if(digest(before)!==digest(after) || (await fileSnapshot(brief.source)).sha256!==info.source.sha256) throw new Error('Brief, transcript or source changed while planning; review the inputs before retrying.');
    const record={...plan.decision,id:brief.id,manifest:manifestPath,manifestHash:digest(manifest),inputs:before};
    await withFileLock(`Projects/${brief.id}/edit.lock`,opts,async()=>{
      if(!replace && await readJson(manifestPath,{optional:true})) throw new Error(`Edit output already exists: ${manifestPath}.`);
      await atomicJson(manifestPath,manifest,opts);
    });
    await atomicJson(`${base}/decision.json`,record,opts);
    await fs.writeFile(await ensureOutput(`${base}/decision.md`,opts),decisionMarkdown(record),'utf8');
    return {ok:true,id:brief.id,manifest:manifestPath,style:manifest.style,purpose:manifest.purpose,captionStatus:manifest.captions.status,
      scenes:manifest.scenes.length,sounds:manifest.sounds.length,notices:plan.decision.notices,decisionJson:`${base}/decision.json`,decisionRecord:`${base}/decision.md`,
      next:'Review this authored plan, then run editor prepare or editor render. Rendering does not imply visual approval.'};
  });
}





export function editorRenderCommand(manifest,prepared,{delivery=false,review=false,out,frames,motionPlan,motionCrop,concurrency=4,noProxy=false,mediaEngine='offthread',png=false,crf,faceReviewedBy,voice='off',chunkFrames,chunkJobs,intentionalBlack}={}) {
  if(delivery && review) throw new Error('Choose one render mode.');
  if(delivery) assertDeliveryReady(manifest);
  if(motionPlan!==undefined && motionCrop!==undefined) throw new Error('Choose one motion mode: motionPlan or motionCrop.');
  const screenOnly=manifest.presenter===false;
  if(screenOnly && (motionPlan!==undefined || motionCrop!==undefined)) throw new Error('A screen-only source has no presenter to measure; deliver it without --motion-plan or --motion-crop.');
  if(delivery && !screenOnly && !motionPlan && !motionCrop) throw new Error('Delivery needs a measured --motion-plan or --motion-crop for the presenter.');
  if(delivery && frames!==undefined) throw new Error('Delivery requires the entire timeline; frames are only for previews/reviews.');
  finite(concurrency,1,16,'concurrency',{integer:true});choice(mediaEngine,['offthread','webcodecs'],'media engine');
  const mode=delivery?'delivery':review?'review':'preview';
  const output=out??`Projects/${manifest.id}/renders/edit-${mode}.mp4`;
  const inputs=[manifest.source.path,prepared.propsFile,prepared.sfxFile,...(motionPlan?[motionPlan]:[])];
  inputs.forEach(relativePath);
  assertOutput(output,manifest.id,inputs);
  assertOutput(`${output}.qc.json`,manifest.id,inputs);assertOutput(`${output}.checks`,manifest.id,inputs);
  if(path.extname(output).toLowerCase()!=='.mp4') throw new Error('Editor render output must end in .mp4.');
  const args=['PreparedEdit','--out',output,'--props-file',prepared.propsFile,'--sfx',prepared.sfxFile,'--channel','organic','--concurrency',String(concurrency),'--media-engine',mediaEngine,...(choice(voice,['off','clean','denoise'],'voice')==='off'?[]:['--voice',voice])];
  if(chunkFrames!==undefined){
    if(!Number.isSafeInteger(chunkFrames)||chunkFrames<1)throw new Error('chunkFrames must be a positive integer.');
    args.push('--chunk-frames',String(chunkFrames));
  }
  if(chunkJobs!==undefined){
    if(!Number.isInteger(chunkJobs)||chunkJobs<1||chunkJobs>2)throw new Error('chunkJobs must be 1 or 2.');
    args.push('--chunk-jobs',String(chunkJobs));
  }
  if(intentionalBlack!==undefined){
    const duration=compileEdit(manifest).durationInFrames;
    if(typeof intentionalBlack!=='string'||!intentionalBlack.length||intentionalBlack.length>4000)throw new Error('intentionalBlack must list reviewed a-b frame intervals.');
    const ranges=intentionalBlack.split(',');
    if(ranges.length>100||ranges.some(value=>{const match=/^(\d+)-(\d+)$/.exec(value);return !match||Number(match[1])>Number(match[2])||Number(match[2])>=duration;}))throw new Error('intentionalBlack intervals must be ordered a-b bounds inside the edit.');
    args.push('--intentional-black',intentionalBlack);
  }
  if(delivery) args.push('--deliver');else if(!review) args.push('--preview');
  if(faceReviewedBy!==undefined){if(!delivery) throw new Error('faceReviewedBy is a delivery option.');args.push('--face-reviewed-by',text(faceReviewedBy,'face reviewer'));}
  if(noProxy || delivery || review) args.push('--no-proxy');
  if(frames!==undefined) {
    const match=typeof frames==='string' && /^(\d+)-(\d+)$/.exec(frames);
    const duration=compileEdit(manifest).durationInFrames;
    if(!match || Number(match[1])>Number(match[2]) || Number(match[2])>=duration) throw new Error('frames must be an ordered a-b range inside the edit.');
    args.push('--frames',frames);
  }
  if(delivery && screenOnly) args.push('--motion-exempt','static-graphics');
  if(motionPlan!==undefined) args.push('--motion-plan',relativePath(motionPlan));
  if(motionCrop!==undefined) {
    if(typeof motionCrop!=='string' || !/^\d+:\d+:\d+:\d+$/.test(motionCrop)) throw new Error('motionCrop must be w:h:x:y.');
    const [w,h,x,y]=motionCrop.split(':').map(Number);
    if(w<2 || h<2 || x+w>1080 || y+h>1920) throw new Error('Motion crop must be inside the 1080x1920 delivery frame.');
    args.push('--motion-crop',motionCrop);
  }
  if(png) args.push('--png');
  if(crf!==undefined) {finite(crf,0,51,'crf',{integer:true});args.push('--crf',String(crf));}
  return {script:'scripts/render.mjs',args,inputs,output,qc:`${output}.qc.json`,safeReport:delivery?`${output}.checks/report.json`:null};
}




export function runStreamed(cmd,args,{cwd,onLine}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',pending='';
    const flush=line=>{if(line.trim()) try{onLine?.(line.replace(/\r$/,''));}catch{                                                }};
    child.stdout.on('data',chunk=>{stdout+=chunk;});
    child.stderr.on('data',chunk=>{
      stderr+=chunk;pending+=chunk;
      for(let i=pending.indexOf('\n');i>=0;i=pending.indexOf('\n')) {flush(pending.slice(0,i));pending=pending.slice(i+1);}
    });
    child.on('error',reject);
    child.on('close',code=>{
      flush(pending);
      if(code===0) return resolve({stdout,stderr});
      const error=new Error(`${cmd} ${args.join(' ')}\n${stderr}\nCommand failed with exit code ${code}`);
      Object.assign(error,{stdout,stderr,code});
      reject(error);
    });
  });
}

export async function validateEditorInput(file,{delivery=false}={}) {
  const data=await readJson(file);
  if(typeof data.source==='string') {
    const brief=validateEditorBrief(data);
    await Promise.all([brief.source,brief.transcript,...(brief.emphasisFile===undefined?[]:[brief.emphasisFile])].map(p=>checkedPath(p,{mustExist:true})));
    const source=(await inspectEditSource(brief.source)).source;
    const emphasis=brief.emphasisFile===undefined?undefined:await readJson(brief.emphasisFile);
    const {manifest,decision}=buildEditorPlan(brief,source,await readJson(brief.transcript),{delivery,emphasis});
    return {ok:true,kind:'brief',id:brief.id,style:manifest.style,captionStatus:manifest.captions.status,scenes:manifest.scenes.length,
      sourceFrames:source.totalFrames,selection:decision.selection,deliveryReady:delivery};
  }
  if(delivery) assertDeliveryReady(data);
  const {manifest,compiled}=await loadEditProject(file);
  return {ok:true,kind:'edit',id:manifest.id,purpose:manifest.purpose,style:manifest.style,captionStatus:manifest.captions.status,
    scenes:manifest.scenes.length,frames:compiled.durationInFrames,captionIssues:compiled.issues,deliveryReady:delivery};
}

export async function prepareEditorManifest(file,{noProxy=false,onProgress=()=>{}}={}) {
  const manifest=editManifestSchema.parse(await readJson(file));
  await preflightPreparation(file,manifest);
  return prepareEditProject(file,{proxy:!noProxy,onProgress});
}

export async function renderEditorManifest(file,options={}) {
  const raw=await readJson(file);
  if(options.delivery) assertDeliveryReady(raw);
  const authored=editManifestSchema.parse(raw);
  await preflightPreparation(file,authored,options.motionPlan?[options.motionPlan]:[]);

  const expected={propsFile:`Projects/${authored.id}/prepared/props.json`,sfxFile:`Projects/${authored.id}/prepared/sounds.wav`};
  const initial=editorRenderCommand(authored,expected,options);
  const renderOutputs=[initial.output,initial.qc,...(initial.safeReport?[initial.safeReport]:[])];
  renderOutputs.forEach(output=>assertOutput(output,authored.id,[file]));
  await Promise.all(renderOutputs.map(p=>checkedPath(p,{write:true,project:authored.id})));
  const {manifest,compiled}=await loadEditProject(file);
  if(digest(manifest)!==digest(authored)) throw new Error('Authored manifest changed during render preflight.');
  let motionIdentity;
  if(options.motionPlan) {
    motionIdentity=await fileSnapshot(options.motionPlan);
    validateMotionPlan(await readJson(options.motionPlan),{width:1080,height:1920,frames:compiled.durationInFrames,fps:manifest.source.fps});
  }
  if(options.delivery && manifest.source.fps<SPEC.video.fps.organicMin) throw new Error(`PreparedEdit delivery needs at least ${SPEC.video.fps.organicMin} fps; author an approved delivery-rate composition for lower-rate material.`);
  const prepared=await prepareEditProject(file,{proxy:!options.delivery && !options.review && !options.noProxy,onProgress:options.onProgress});
  if(prepared.manifestHash!==digest(manifest)) throw new Error('Authored manifest changed during preparation. Review the edit before rendering.');
  const command=editorRenderCommand(manifest,prepared,options);
  const started=performance.now();
  await runStreamed(process.execPath,[path.join(ROOT,command.script),...command.args],{cwd:ROOT,onLine:options.onProgress});
  if(motionIdentity && digest(await fileSnapshot(options.motionPlan))!==digest(motionIdentity)) throw new Error('Motion plan changed during rendering; the result cannot be accepted against the requested plan.');
  const qc=await readJson(command.qc),output=await fileSnapshot(command.output);
  if(qc.ok!==true || qc.comp!=='PreparedEdit' || qc.outputSha256!==output.sha256 || digest(qc.inputProps?.edit)!==digest(manifest)) throw new Error('Render output/QC does not match this authored edit.');
  const motionProven=manifest.presenter===false?qc.motion?.exempt==='static-graphics':qc.motion?.ok===true && !qc.motion.exempt;
  if(options.delivery && (qc.mode!=='deliver' || qc.igCheck?.ok!==true || qc.safe?.ok!==true || !motionProven)) throw new Error('Delivery output is missing actual encode, safe-zone or presenter-motion evidence.');
  if(command.safeReport) await checkedPath(command.safeReport,{mustExist:true});
  return {ok:true,mode:qc.mode,output:command.output,qc:command.qc,safeReport:command.safeReport,sourceHash:manifest.source.sha256,
    manifestHash:digest(manifest),motionPlan:motionIdentity??null,style:manifest.style,preparation:{plate:prepared.plate,plateCached:prepared.plateCached,
      prepareSec:prepared.prepareSec,sfx:prepared.sfxFile},renderSec:+((performance.now()-started)/1000).toFixed(3),
    timing:qc.timing,checks:{encode:qc.igCheck?.ok??null,safe:qc.safe?.ok??null,motion:qc.motion??null},visualApproval:'Review rendered media before accepting creative quality.'};
}
