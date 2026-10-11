import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {editManifestSchema,editSceneSchema} from '../engine/src/prepared-edit/schema.ts';
import {formFamilies,validateData} from '../engine/src/review-editor/panels/form-schema.ts';
import {semanticFamilies} from '../engine/src/creative-kit/semantic/schema.ts';
import {recommendEditorStyle,buildEditorPlan,assertDeliveryReady} from '../scripts/lib/editor-director.mjs';
import {profileToBrief} from '../scripts/lib/branding.mjs';
import {sceneCues} from '../scripts/lib/scene-cues.mjs';
import {verifyKineticAssets} from '../scripts/lib/prepared-props.mjs';
import {CATALOG,catalogDemo} from '../engine/src/motion-concepts/catalog.ts';
import {fieldsForFamily} from '../engine/src/review-editor/panels/form-schema.ts';
import {addSceneFromTemplate} from '../engine/src/review-editor/ops/scenes.ts';

const profile=JSON.parse(await readFile(new URL('../PROFILE.example.json',import.meta.url),'utf8'));
const source={path:'Raw/example.mp4',sha256:'a'.repeat(64),fps:30,width:1080,height:1920,totalFrames:180};
const words=[{text:'فكرة',startMs:100,endMs:400,confidence:1},{text:'واضحة',startMs:500,endMs:900,confidence:1},{text:'Claude',startMs:1100,endMs:1500,confidence:1}];
export const kineticData={kicker:'THE IDEA',title:'Use the recorded words',sourceIndices:[0,1,2],lang:'ar',enter:'rise',emphasis:[{sourceIndex:2,kind:'accent'}]};
export const evidenceData={kicker:'EVIDENCE',title:'Compare the supplied images',before:{src:'examples/evidence-before.svg',width:640,height:360,label:'Before'},after:{src:'examples/evidence-after.svg',width:640,height:360,label:'After'},revealFrame:12,revealDurationFrames:30,dir:'rtl',footer:'Illustrative images: replace with your actual evidence'};
const scene=(family,data)=>({id:'example',family,fromFrame:0,durationInFrames:90,layout:'takeover',motion:'land',data:structuredClone(data)});
const manifest=(input)=>{const total=Math.max(180,input.fromFrame+input.durationInFrames);return {version:1,id:'editorial-test',purpose:'test',style:'kinetic-paper',source:{...source,totalFrames:total},segments:[{fromFrame:0,toFrame:total}],captions:{status:'draft',words},scenes:[input],sounds:[],camera:[]};};
const brief=(purpose='story',tone='calm',extra={})=>({version:1,id:'editorial-test',source:source.path,transcript:'Projects/editorial-test/words.json',...profileToBrief(profile),purpose,tone,beats:[{id:'example',fromSec:0,toSec:3,intent:'intro',data:{kicker:'Example',title:'A supplied idea',subtitle:'Review the meaning',caption:'Example'}}],...extra});

test('all existing semantic and screen scenes have real editable data forms',()=>{
  for(const family of [...semanticFamilies,'screen-recording'])assert.ok(formFamilies().includes(family),`${family} must be editable after being added`);
});
test('kinetic text uses recorded word indices and rejects missing or cut speech',()=>{
  const input=scene('kinetic-text',kineticData);
  assert.equal(editSceneSchema.safeParse(input).success,true,'The normal scene schema must accept authored kinetic text');
  assert.equal(editManifestSchema.safeParse(manifest(input)).success,true);
  const missing=structuredClone(input);missing.data.sourceIndices=[99];
  assert.equal(editManifestSchema.safeParse(manifest(missing)).success,false);
  const cut=manifest(input);cut.segments=[{fromFrame:0,toFrame:12},{fromFrame:30,toFrame:180}];
  assert.equal(editManifestSchema.safeParse(cut).success,false,'A removed word cannot be reintroduced visually');
  const repeated=structuredClone(input);repeated.data.sourceIndices=[0,0];
  assert.equal(editSceneSchema.safeParse(repeated).success,false);
  const clipped=manifest(input);clipped.segments=[{fromFrame:5,toFrame:180}];
  assert.equal(editManifestSchema.safeParse(clipped).success,false,'Kinetic words cannot present a cut-off word as intact speech');
});
test('evidence wipe bounds authored timing and media references',()=>{
  const input=scene('evidence-wipe',evidenceData);
  assert.equal(editSceneSchema.safeParse(input).success,true);
  assert.equal(editManifestSchema.safeParse(manifest(input)).success,true);
  assert.equal(validateData('evidence-wipe',input.data).ok,true);
  const outside=structuredClone(input);outside.data.revealDurationFrames=90;
  assert.equal(editManifestSchema.safeParse(manifest(outside)).success,false);
  const unsafe=structuredClone(input);unsafe.data.before.src='../private.png';
  assert.equal(editSceneSchema.safeParse(unsafe).success,false);
});
test('all eleven styles can compete automatically and explicit/profile choices win',()=>{
  const candidates=recommendEditorStyle(brief()).candidates.map(candidate=>candidate.style);
  assert.equal(new Set(candidates).size,11);
  assert.equal(recommendEditorStyle(brief('story','calm')).style,'paper-collage');
  assert.equal(recommendEditorStyle(brief('opinion','editorial')).style,'judgment-board');
  const fixed=brief();fixed.preferences.style={mode:'fixed',value:'liquid-glass'};
  assert.equal(recommendEditorStyle(fixed).style,'liquid-glass');
  assert.equal(recommendEditorStyle({...fixed,style:'stepped-editorial'}).style,'stepped-editorial');
});
test('editorial beats reach the normal director and retain literal captions',()=>{
  const raw=brief('explainer','energetic',{beats:[{id:'words',fromSec:0,toSec:3,intent:'kinetic-text',data:kineticData},{id:'evidence',fromSec:3,toSec:6,intent:'evidence-wipe',data:evidenceData}]});
  const plan=buildEditorPlan(raw,source,words);
  assert.deepEqual(plan.manifest.captions.words.map(word=>word.text),words.map(word=>word.text));
  assert.deepEqual(plan.manifest.scenes.map(item=>item.family),['kinetic-text','evidence-wipe']);
  assert.equal(plan.manifest.style,'kinetic-paper');
});
test('the comparison swap sounds on the authored reveal and verifies both real images',async()=>{
  const input=scene('evidence-wipe',evidenceData);input.fromFrame=30;
  assert.deepEqual(sceneCues(input),[{frame:30,kind:'transition',sceneId:'example'},{frame:42,kind:'swap',sceneId:'example'}]);
  const invalid=structuredClone(input);invalid.data.after.src='examples/missing-evidence.svg';
  await assert.rejects(()=>verifyKineticAssets({source,scenes:[invalid]}),/missing|ENOENT|exist/i);
});
test('reusable motion components and normal PreparedEdit entry bundle without private lab dependencies',async()=>{
  const engineRequire=createRequire(new URL('../engine/package.json',import.meta.url));
  for(const file of ['core/accents.tsx','core/speed.tsx','core/speed-math.ts','creative-kit/kinetic-words.tsx','creative-kit/kinetic-words-logic.ts','creative-kit/emphasis.tsx','creative-kit/compare.tsx','creative-kit/ui-code.tsx','creative-kit/ui-keys.tsx']){
    await access(new URL(`../engine/src/${file}`,import.meta.url)).catch(()=>assert.fail(`Reusable component missing: ${file}`));
  }
  const {buildSync}=engineRequire('esbuild');
  const output=buildSync({entryPoints:[fileURLToPath(new URL('../engine/src/prepared-edit/PreparedEdit.tsx',import.meta.url))],bundle:true,write:false,platform:'browser',format:'esm',logLevel:'silent'});
  assert.ok(output.outputFiles[0].contents.length>0);
});
test('all fifteen concepts reach validated takeover scenes and editable discriminated configurations',()=>{
  for(const concept of CATALOG){
    const input=scene('motion-concept',{concept:concept.id,config:catalogDemo(concept.id)});
    input.durationInFrames=concept.defaultFrames;
    assert.equal(editSceneSchema.safeParse(input).success,true,concept.id);
    assert.equal(editManifestSchema.safeParse(manifest(input)).success,true,concept.id);
    input.layout='split';assert.equal(editSceneSchema.safeParse(input).success,false,'Concept graphics cannot overlap the presenter');
    input.layout='takeover';input.durationInFrames=concept.minFrames-1;
    assert.equal(editManifestSchema.safeParse(manifest(input)).success,false,'Unfinished concept choreography must fail before render');
  }
  const data=fieldsForFamily('motion-concept');
  assert.equal(data[0].kind,'union');
  assert.equal(data[0].variants.length,15,'Every concept config must remain editable without raw JSON');
});
test('source-free graphics accept reviewed copy only with explicit mode and complete takeover coverage',()=>{
  const input=scene('motion-concept',{concept:'panel-reveal',config:catalogDemo('panel-reveal')});input.durationInFrames=240;
  const graphic=manifest(input);graphic.contentMode='graphics';graphic.presenter=false;graphic.purpose='delivery';graphic.captions={status:'reviewed',reviewer:'Example reviewer',words:[]};
  graphic.creator={...profileToBrief(profile).creator,ending:{cta:null,followCard:false,signOff:null}};
  assert.equal(editManifestSchema.safeParse(graphic).success,true);
  assert.equal(assertDeliveryReady(graphic).ok,true);
  const partial=structuredClone(graphic);partial.scenes[0].fromFrame=1;partial.scenes[0].durationInFrames=239;
  assert.equal(editManifestSchema.safeParse(partial).success,false);
  const draft=structuredClone(graphic);draft.captions.status='draft';
  assert.equal(editManifestSchema.safeParse(draft).success,false);
  const recording=structuredClone(graphic);delete recording.contentMode;
  assert.throws(()=>assertDeliveryReady(recording),/nonempty reviewed caption words/);
  const speech=structuredClone(graphic);delete speech.presenter;
  assert.equal(editManifestSchema.safeParse(speech).success,false);
});
test('the live editor adds reachable concepts and selects the words inside a kinetic scene',()=>{
  const available=manifest(scene('evidence-wipe',evidenceData));available.scenes=[];available.source.totalFrames=300;available.segments=[{fromFrame:0,toFrame:300}];
  const concept=addSceneFromTemplate(available,'motion-concept',{atFrame:0,durationInFrames:240});
  assert.equal(concept.ok,true,'Adding a concept must use its supported takeover layout');
  assert.equal(concept.manifest.scenes[0].layout,'takeover');
  assert.equal(addSceneFromTemplate(available,'motion-concept',{atFrame:0}).ok,true,'The Add action must provide enough default time for its choreography');
  const kinetic=addSceneFromTemplate(available,'kinetic-text',{atFrame:0,durationInFrames:90});
  assert.equal(kinetic.ok,true);
  assert.deepEqual(kinetic.manifest.scenes[0].data.sourceIndices,[0,1,2]);
  const empty=addSceneFromTemplate(available,'kinetic-text',{atFrame:90,durationInFrames:90});
  assert.equal(empty.ok,false,'A kinetic scene cannot invent words in an empty speech interval');
});
test('supplied SVG comparison evidence is hashed and intrinsic dimensions are checked',async()=>{
  const input=scene('evidence-wipe',evidenceData),assets=await verifyKineticAssets({source,scenes:[input]});
  assert.equal(assets.length,2);
  assert.ok(assets.every(asset=>asset.sha256.length===64&&asset.width===640&&asset.height===360));
  const altered=structuredClone(input);altered.data.after.width=639;
  await assert.rejects(()=>verifyKineticAssets({source,scenes:[altered]}),/dimensions/);
});
