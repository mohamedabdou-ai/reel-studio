import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {withOutputTransaction} from '../scripts/lib/delivery.mjs';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const fixture = async(t) => {
  const dir=await fs.mkdtemp(path.join(ROOT,'state/tmp/runtime-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return dir;
};
const chunks=()=>import('../scripts/lib/render-chunks.mjs');
const audio=()=>import('../scripts/lib/audio-revision.mjs');
const segment=()=>import('../scripts/lib/segment-revision.mjs');

test('cache identity changes with props, same-size source bytes, fonts and audio policy',async(t)=>{
  const {renderIdentity}=await chunks(),dir=await fixture(t);
  await fs.mkdir(path.join(dir,'src')); await fs.mkdir(path.join(dir,'public'));
  await fs.writeFile(path.join(dir,'src','scene.ts'),'scene');
  await fs.writeFile(path.join(dir,'public','voice.wav'),'aaaa');
  await fs.writeFile(path.join(dir,'public','font.woff2'),'font');
  const input={engineRoot:dir,props:{title:'a'},settings:{crf:16,audio:'full-track'},policy:{version:1}};
  const original=await renderIdentity(input);
  assert.notEqual(original,await renderIdentity({...input,props:{title:'b'}}));
  const stamp=(await fs.stat(path.join(dir,'public','voice.wav'))).mtime;
  await fs.writeFile(path.join(dir,'public','voice.wav'),'bbbb'); await fs.utimes(path.join(dir,'public','voice.wav'),stamp,stamp);
  assert.notEqual(original,await renderIdentity(input));
  const next=await renderIdentity(input); await fs.writeFile(path.join(dir,'public','font.woff2'),'FONT');
  assert.notEqual(next,await renderIdentity(input));
  assert.notEqual(await renderIdentity(input),await renderIdentity({...input,policy:{version:2}}));
});

test('input scanning fails closed when a required tree cannot be read',async(t)=>{
  const {renderIdentity}=await chunks(),dir=await fixture(t);
  await assert.rejects(renderIdentity({engineRoot:dir,props:{},settings:{}}),/scan|ENOENT/);
});

test('bundle media identity detects an atomic same-size replacement with unchanged timestamps',async(t)=>{
  const {publicContentHash}=await import('../scripts/lib/bundle.mjs'),dir=await fixture(t),file=path.join(dir,'image.png');
  await fs.writeFile(file,'aaaa');const stamp=(await fs.stat(file)).mtime,first=await publicContentHash(dir);
  const replacement=path.join(dir,'replacement');await fs.writeFile(replacement,'bbbb');await fs.utimes(replacement,stamp,stamp);await fs.rename(replacement,file);
  assert.notEqual(first,await publicContentHash(dir));
});

test('chunk budget accounts for simultaneous spill, retained video, audio and assembly',async()=>{
  const {chunkBudget}=await chunks();
  const budget=chunkBudget({frames:18000,chunkFrames:300,jobs:2,fps:30,width:1080,height:1920,freeRamBytes:0,freeDiskBytes:1,videoMaxBitsPerSec:20e6});
  assert.equal(budget.ok,false);
  assert.ok(budget.spillBytes>=600*600000);
  assert.ok(budget.retainedBytes>=600*20e6/8);
  assert.ok(budget.assemblyBytes>=budget.retainedBytes);
  assert.ok(budget.needDiskBytes>=budget.spillBytes+budget.retainedBytes+budget.assemblyBytes+budget.audioBytes);
});

test('interrupted chunk run resumes only exact verified chunks with a bounded queue',async(t)=>{
  const {renderChunks}=await chunks(),dir=await fixture(t);
  let active=0,max=0,calls=[];
  const render=async({range,out})=>{calls.push(range[0]); active++; max=Math.max(max,active); await new Promise(r=>setTimeout(r,5)); active--; if(range[0]===4)throw Error('interrupt'); await fs.writeFile(out,String(range));};
  const validate=async(_file,range)=>({frames:range[1]-range[0]+1,codec:'h264'});
  const opts={cacheRoot:dir,key:'a'.repeat(64),frames:8,chunkFrames:2,jobs:2,render,validate};
  await assert.rejects(renderChunks(opts),/interrupt/); assert.ok(max<=2);
  calls=[];
  const result=await renderChunks({...opts,render:async({range,out})=>{calls.push(range[0]);await fs.writeFile(out,String(range));}});
  assert.ok(!calls.includes(0)&&!calls.includes(2)); assert.equal(result.parts.length,4);
  calls=[]; await fs.writeFile(result.parts[0].file,'corrupt');
  await renderChunks({...opts,render:async({range,out})=>{calls.push(range[0]);await fs.writeFile(out,String(range));}});
  assert.ok(calls.includes(0));
  calls=[];
  await renderChunks({...opts,key:'b'.repeat(64),render:async({range,out})=>{calls.push(range[0]);await fs.writeFile(out,String(range));}});
  assert.equal(calls.length,4);
});

test('a failed media scan leaves no reusable chunk marker',async(t)=>{
  const {renderChunks}=await chunks(),dir=await fixture(t);
  const opts={cacheRoot:dir,key:'c'.repeat(64),frames:2,chunkFrames:2,jobs:1,render:async({out})=>fs.writeFile(out,'bad'),validate:async()=>{throw Error('decoder scan failed');}};
  await assert.rejects(renderChunks(opts),/scan failed/);
  const files=await fs.readdir(path.join(dir,opts.key));
  assert.equal(files.some(n=>n.endsWith('.json')),false);
});

test('input changes during chunk rendering cannot produce a reusable mixed-state marker',async(t)=>{
  const {renderChunks,createRenderInputGuard}=await chunks(),dir=await fixture(t);
  await fs.mkdir(path.join(dir,'src'));await fs.mkdir(path.join(dir,'public'));const source=path.join(dir,'public','source.mp4');await fs.writeFile(source,'original');
  const guard=await createRenderInputGuard({engineRoot:dir,props:{}});
  const key='e'.repeat(64),cache=path.join(dir,'cache');
  await assert.rejects(renderChunks({cacheRoot:cache,key,frames:2,chunkFrames:2,jobs:1,assertInputs:guard.check,render:async({out})=>{await fs.writeFile(out,'chunk');await fs.writeFile(source,'replaced');},validate:async()=>({frames:2})}),/inputs changed/);
  assert.equal((await fs.readdir(path.join(cache,key))).some(name=>name.endsWith('.json')),false);
  const changed=await createRenderInputGuard({engineRoot:dir,props:{}});assert.notEqual(changed.revision,guard.revision);
});

test('audio timeline resamples before sample trims and keeps music and SFX gains independent',async()=>{
  const {buildAudioTimeline}=await audio();
  const manifest={version:1,fps:30,durationInFrames:120,sync:{sampleRate:48000,offsetSamples:0,basis:'timeline'},tracks:[
    {kind:'voice',src:'voice.wav',fromFrame:0,sourceFromFrame:15,durationInFrames:90},
    {kind:'music',src:'music.wav',fromFrame:0,sourceFromFrame:0,durationInFrames:120},
    {kind:'sfx',src:'sfx.wav',fromFrame:60,sourceFromFrame:0,durationInFrames:15}
  ]};
  const plan=buildAudioTimeline(manifest,{musicDb:-20,sfxDb:-6});
  assert.match(plan.filter,/aresample=48000[^;]*atrim=start_sample=24000:end_sample=168000/);
  assert.match(plan.filter,/volume=-20dB/); assert.match(plan.filter,/volume=-6dB/);
  assert.match(plan.filter,/adelay=96000S/); assert.equal(plan.totalSamples,192000);
  assert.equal(plan.sync.offsetSamples,0);
});

test('audio sync is explicit measured or inherited samples, never an assumed AAC correction',async()=>{
  const {buildAudioTimeline}=await audio();
  const base={version:1,fps:30,durationInFrames:30,tracks:[{kind:'voice',src:'v.wav',fromFrame:0,sourceFromFrame:0,durationInFrames:30}]};
  assert.equal(buildAudioTimeline(base).sync.offsetSamples,0);
  assert.match(buildAudioTimeline({...base,sync:{sampleRate:48000,basis:'measured',offsetSamples:96}}).filter,/adelay=96S/);
  assert.throws(()=>buildAudioTimeline({...base,sync:{sampleRate:44100,basis:'measured',offsetSamples:96}}),/48000/);
  assert.throws(()=>buildAudioTimeline({...base,tracks:[{...base.tracks[0],fromFrame:-1}]}),/fromFrame/);
});

test('audio revision refuses output and QC paths that alias an original audio source before probing',async(t)=>{
  const {reviseAudio}=await audio(),dir=await fixture(t),base=path.join(dir,'base.mp4'),track=path.join(dir,'voice.mp4');
  await fs.writeFile(base,'original base');await fs.writeFile(track,'original audio input');
  const manifest={version:1,fps:30,durationInFrames:30,tracks:[{kind:'voice',src:path.relative(ROOT,track).replaceAll('\\','/'),fromFrame:0,sourceFromFrame:0,durationInFrames:30}]};
  await assert.rejects(reviseAudio({base,manifest,out:track}),/source input/);
  assert.equal(await fs.readFile(track,'utf8'),'original audio input');
  const hardlink=path.join(dir,'voice-alias.mp4');await fs.link(track,hardlink);
  await assert.rejects(reviseAudio({base,manifest,out:hardlink}),/source input/);
  assert.equal(await fs.readFile(hardlink,'utf8'),'original audio input');
  const out=path.join(dir,'new.mp4'),qc=`${out}.qc.json`;await fs.copyFile(track,qc);
  const alias={...manifest,tracks:[{...manifest.tracks[0],src:path.relative(ROOT,qc).replaceAll('\\','/')}]};
  await assert.rejects(reviseAudio({base,manifest:alias,out}),/source input/);
  assert.equal(await fs.readFile(qc,'utf8'),'original audio input');
});

test('Windows case aliases preserve accepted audio and picture masters',{skip:process.platform!=='win32'},async(t)=>{
  const {reviseAudio}=await audio(),{spliceRevision}=await segment(),dir=await fixture(t),base=path.join(dir,'master.mp4'),track=path.join(dir,'voice.mp4'),replacement=path.join(dir,'replacement.mp4');
  await fs.writeFile(base,'accepted master');await fs.writeFile(track,'source audio');await fs.writeFile(replacement,'prepared range');
  const manifest={version:1,fps:30,durationInFrames:30,tracks:[{kind:'voice',src:path.relative(ROOT,track).replaceAll('\\','/'),fromFrame:0,sourceFromFrame:0,durationInFrames:30}]};
  await assert.rejects(reviseAudio({base,manifest,out:base.toUpperCase()}),/source input/);
  await assert.rejects(spliceRevision({base,replacement,out:base.toUpperCase(),range:[0,29]}),/source input/);
  assert.equal(await fs.readFile(base,'utf8'),'accepted master');
});

test('prepared range outputs cannot replace source, plate, verified assets, sound or props companions',async(t)=>{
  const {assertPreparedRevisionDestinations}=await import('../scripts/lib/revision-paths.mjs'),dir=await fixture(t);
  const names=['source.mp4','asset.mp4','sound.mp4','props.json'],files=Object.fromEntries(names.map(name=>[name,path.join(dir,name)]));
  for(const file of Object.values(files))await fs.writeFile(file,'preserved input');
  const rel=file=>path.relative(ROOT,file).replaceAll('\\','/');
  const props={edit:{source:{path:rel(files['source.mp4'])}},assets:[{path:rel(files['asset.mp4'])}],sfx:rel(files['sound.mp4'])};
  for(const file of Object.values(files))await assert.rejects(assertPreparedRevisionDestinations(file,props,{propsFile:files['props.json']}),/source input/);
  const publicDir=path.join(ROOT,'engine/public'),plateSrc=path.relative(publicDir,files['source.mp4']).replaceAll('\\','/');
  await assert.rejects(assertPreparedRevisionDestinations(files['source.mp4'],{plate:{src:plateSrc}}),/source input/);
  const companionOutput=path.join(dir,'new.mp4'),propsFile=`${companionOutput}.qc.json`;await fs.writeFile(propsFile,'preserved props');
  await assert.rejects(assertPreparedRevisionDestinations(companionOutput,props,{propsFile}),/source input/);
  for(const file of Object.values(files))assert.equal(await fs.readFile(file,'utf8'),'preserved input');
});

test('range replacement rejects incompatible fps, dimensions, codec and profile',async()=>{
  const {assertSpliceCompatibility}=await segment();
  const base={codec:'h264',profile:'High',width:1080,height:1920,fps:30,pixelFormat:'yuv420p',frames:180};
  assert.doesNotThrow(()=>assertSpliceCompatibility(base,{...base,frames:30},[60,89]));
  for(const key of ['fps','width','codec','profile'])assert.throws(()=>assertSpliceCompatibility(base,{...base,frames:30,[key]:key==='fps'?25:key==='width'?720:'other'},[60,89]),/incompatible/);
  assert.throws(()=>assertSpliceCompatibility(base,{...base,frames:31},[60,89]),/frame count/);
});

test('range splice graph uses exact decoded frame cuts and preserves the entire base audio',async()=>{
  const {splicePlan}=await segment();
  const plan=splicePlan({base:'base.mp4',replacement:'segment.mp4',out:'out.mp4',range:[60,89],frames:180,fps:30});
  assert.match(plan.filter,/trim=end_frame=60/);assert.match(plan.filter,/trim=start_frame=90/);
  assert.ok(plan.args.includes('0:a:0')); const i=plan.args.indexOf('-c:a');assert.equal(plan.args[i+1],'copy');
  assert.ok(!plan.args.includes('-shortest'));
});

test('range revisions reject changed cuts, global styling, and visual changes outside the replacement',async()=>{
  const {assertRangeProps}=await segment();
  const props={edit:{id:'test',style:'paper-collage',source:{fps:30},segments:[{fromFrame:0,toFrame:120}],captions:{words:[]},scenes:[]},plate:{src:'same.mp4'}};
  assert.doesNotThrow(()=>assertRangeProps(props,{...props,edit:{...props.edit,scenes:[{fromFrame:30,durationInFrames:30,family:'title',text:'new'}]}},[30,59],120));
  assert.throws(()=>assertRangeProps(props,{...props,edit:{...props.edit,scenes:[{fromFrame:0,durationInFrames:30,family:'title',text:'new'}]}},[30,59],120),/outside/);
  assert.throws(()=>assertRangeProps(props,{...props,edit:{...props.edit,style:'liquid-glass'}},[30,59],120),/global/);
  assert.throws(()=>assertRangeProps(props,{...props,edit:{...props.edit,segments:[{fromFrame:10,toFrame:130}]}},[0,119],120),/source|cuts/);
});

test('same-path media changes outside a replacement cannot be mislabeled as revised picture',async()=>{
  const {assertRangeProps}=await segment();
  const props={edit:{id:'test',style:'paper-collage',source:{fps:30},segments:[{fromFrame:0,toFrame:120}],captions:{words:[]},scenes:[{fromFrame:0,durationInFrames:30,data:{src:'outside.png'}},{fromFrame:30,durationInFrames:30,data:{src:'inside.png'}}]},plate:{src:'same.mp4'},assets:[{path:'engine/public/outside.png',sha256:'a'},{path:'engine/public/inside.png',sha256:'b'}]};
  assert.throws(()=>assertRangeProps(props,{...props,assets:[{...props.assets[0],sha256:'changed'},props.assets[1]]},[30,59],120),/asset.*outside|outside.*asset/);
  assert.doesNotThrow(()=>assertRangeProps(props,{...props,assets:[props.assets[0],{...props.assets[1],sha256:'changed'}]},[30,59],120));
  const shared={...props,edit:{...props.edit,scenes:[...props.edit.scenes,{fromFrame:60,durationInFrames:30,data:{src:'inside.png'}}]}};
  assert.throws(()=>assertRangeProps(shared,{...shared,assets:[props.assets[0],{...props.assets[1],sha256:'changed'}]},[30,59],120),/asset.*outside|outside.*asset/);
});

test('omitted-word insertion cannot silently change caption emphasis outside a replacement',async()=>{
  const {assertRangeProps}=await segment();
  const omitted={text:'omitted',startMs:0,endMs:400},visible={text:'visible',startMs:1000,endMs:1400};
  const props={edit:{id:'test',style:'paper-collage',source:{fps:30},segments:[{fromFrame:30,toFrame:90}],captions:{words:[omitted,visible],emphasis:[{sourceIndex:1,kind:'underline'}]},scenes:[]},plate:{src:'same.mp4'}};
  const next={...props,edit:{...props.edit,captions:{...props.edit.captions,words:[omitted,{text:'new omitted',startMs:500,endMs:700},visible]}}};
  assert.throws(()=>assertRangeProps(props,next,[30,59],60),/Caption changes outside/);
});

test('a killed producer can resume its output transaction but live and ambiguous locks remain protected',async(t)=>{
  const dir=await fixture(t),out=path.join(dir,'out.mp4'),lock=`${out}.render.lock`;
  await fs.writeFile(lock,JSON.stringify({version:1,pid:99999999,token:'11111111-1111-1111-1111-111111111111'}));
  await withOutputTransaction(out,async(staged)=>fs.writeFile(staged,'new'));
  assert.equal(await fs.readFile(out,'utf8'),'new');
  await fs.writeFile(lock,JSON.stringify({version:1,pid:process.pid,token:'11111111-1111-1111-1111-111111111111'}));
  await assert.rejects(withOutputTransaction(out,async()=>{}),/already/);
  await fs.writeFile(lock,'');await assert.rejects(withOutputTransaction(out,async()=>{}),/already|unknown/);
  assert.equal(await fs.readFile(out,'utf8'),'new');
});

test('actual killed process releases resume ownership while concurrent producers are rejected',{timeout:20000},async(t)=>{
  const dir=await fixture(t),out=path.join(dir,'killed.mp4');
  const module=pathToFileURL(path.join(ROOT,'scripts/lib/delivery.mjs')).href;
  const code=`import {withOutputTransaction} from ${JSON.stringify(module)};await withOutputTransaction(${JSON.stringify(out)},async()=>{console.log('locked');setInterval(()=>{},1000);await new Promise(()=>{});});`;
  const child=spawn(process.execPath,['--input-type=module','--eval',code],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error(`producer exited ${code}`)));});
  await assert.rejects(withOutputTransaction(out,async()=>{}),/already/);
  const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await stopped;
  await withOutputTransaction(out,async(staged)=>fs.writeFile(staged,'resumed'));
  assert.equal(await fs.readFile(out,'utf8'),'resumed');
});
