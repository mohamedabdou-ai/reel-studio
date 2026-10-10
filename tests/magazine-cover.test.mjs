import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {editSceneSchema,editManifestSchema} from '../engine/src/prepared-edit/schema.ts';
import {verifyKineticAssets} from '../scripts/lib/prepared-props.mjs';
import {ROOT,run} from '../scripts/lib/media.mjs';

const quote={chapter:'01',title:'One useful question',quote:'Start with the question.',speaker:'Example speaker',role:'Host',quoteFrame:60};
const source={path:'Raw/example.mp4',sha256:'a'.repeat(64),fps:30,width:1080,height:1920,totalFrames:90};
const cover=()=>({foreground:{src:'projects/example/foreground.png',sha256:'a'.repeat(64),width:32,height:40},box:{x:.2,y:.06,width:.6,height:.74}});
const scene=(extra={})=>({id:'cover',fromFrame:0,durationInFrames:90,family:'chapter-quote',layout:'takeover',motion:'quiet',data:{...quote,...extra}});
const manifest=(input,style='magazine-interview')=>({version:1,id:'example',purpose:'test',style,source,segments:[{fromFrame:0,toFrame:90}],captions:{status:'draft',words:[]},scenes:[input],sounds:[],camera:[]});

test('magazine cover is optional, bounded and does not replace old chapter data',()=>{
  assert.deepEqual(editSceneSchema.parse(scene()).data,quote);
  const valid=scene({cover:cover()});
  assert.equal(editSceneSchema.safeParse(valid).success,true,'A supplied foreground should be available only when explicitly authored');
  const outside=structuredClone(valid);outside.data.cover.box.x=.8;
  assert.equal(editSceneSchema.safeParse(outside).success,false);
  const split=structuredClone(valid);split.layout='split';
  assert.equal(editManifestSchema.safeParse(manifest(split)).success,false);
  assert.equal(editManifestSchema.safeParse(manifest(valid,'section-deck')).success,false);
  const instant=structuredClone(valid);instant.data.quoteFrame=0;
  assert.equal(editManifestSchema.safeParse(manifest(instant)).success,false);
});

test('prepared cover verifies real transparency, supplied bytes and dimensions',async()=>{
  const relative=`engine/public/projects/cover-test-${randomUUID()}`;
  const directory=path.resolve(ROOT,relative);
  assert.ok(directory.startsWith(path.resolve(ROOT,'engine/public/projects')+path.sep));
  await fs.mkdir(directory,{recursive:true});
  try{
    async function png(name,alpha,format='rgba'){
      const pixels=Buffer.alloc(32*40*4);
      for(let i=0;i<32*40;i++){
        pixels[i*4]=30;pixels[i*4+1]=180;pixels[i*4+2]=120;pixels[i*4+3]=alpha(i);
      }
      const raw=path.join(directory,`${name}.rgba`),out=path.join(directory,`${name}.png`);
      await fs.writeFile(raw,pixels);
      await run('ffmpeg',['-v','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size','32x40','-i',raw,'-frames:v','1','-threads','1','-pix_fmt',format,out]);
      const bytes=await fs.readFile(out);
      return {src:`${relative.slice('engine/public/'.length)}/${name}.png`,sha256:createHash('sha256').update(bytes).digest('hex'),width:32,height:40};
    }
    const foreground=await png('transparent',i=>i%32<8?0:255);
    const valid=scene({cover:{...cover(),foreground}});
    const assets=await verifyKineticAssets(manifest(valid));
    assert.equal(assets.length,1,'The actual provided foreground must participate in preparation and revision identity');
    assert.equal(assets[0].sha256,foreground.sha256);
    const wrongSize=structuredClone(valid);wrongSize.data.cover.foreground.width=31;
    await assert.rejects(()=>verifyKineticAssets(manifest(wrongSize)),/dimension/i);
    const wrongBytes=structuredClone(valid);wrongBytes.data.cover.foreground.sha256='b'.repeat(64);
    await assert.rejects(()=>verifyKineticAssets(manifest(wrongBytes)),/hash|bytes/i);
    for(const [name,alpha,format] of [['opaque',()=>255,'rgba'],['empty',()=>0,'rgba'],['no-alpha',()=>255,'rgb24']]){
      const bad=scene({cover:{...cover(),foreground:await png(name,alpha,format)}});
      await assert.rejects(()=>verifyKineticAssets(manifest(bad)),/transparen|alpha|visible/i);
    }
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
