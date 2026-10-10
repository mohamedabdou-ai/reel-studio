import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {mkdir, writeFile, link, stat, rm} from 'node:fs/promises';
import {ROOT,run} from '../scripts/lib/media.mjs';
import {inspectEditSource,prepareEditProject} from '../scripts/lib/edit-project.mjs';

test('a verified prepared plate shared with a render bundle can be reused without writing it',async t=>{
  const id=`cache-test-${randomUUID().slice(0,8)}`;
  const project=`Projects/${id}`,publicDir=`engine/public/_prepared/${id}`;
  const paths=[project,publicDir].map(relative=>path.resolve(ROOT,relative));
  t.after(async()=>{for(const file of paths){
    const relative=path.relative(ROOT,file);
    assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative));
    await rm(file,{recursive:true,force:true});
  }});
  await mkdir(paths[0],{recursive:true});
  const sourceFile=`${project}/source.mp4`;
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=blue:s=360x640:r=30:d=1',
    '-f','lavfi','-i','sine=frequency=700:sample_rate=48000:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-profile:v','high',
    '-c:a','aac','-shortest',path.join(ROOT,sourceFile)]);
  const {source}=await inspectEditSource(sourceFile);
  const manifest={version:1,id,purpose:'test',style:'section-deck',source,segments:[{fromFrame:0,toFrame:30}],
    captions:{status:'reviewed',reviewer:'Creator',words:[]},scenes:[],sounds:[],camera:[],presenter:false};
  const manifestFile=`${project}/edit.json`;
  await writeFile(path.join(ROOT,manifestFile),JSON.stringify(manifest));
  const first=await prepareEditProject(manifestFile,{proxy:false});
  const plate=path.join(ROOT,first.plate),before=await stat(plate);
  await link(plate,path.join(paths[0],'bundle-plate.mp4'));
  assert.ok((await stat(plate)).nlink>1);
  const second=await prepareEditProject(manifestFile,{proxy:false});
  assert.equal(second.plateCached,true);
  assert.equal(second.plate,first.plate);
  const after=await stat(plate);
  assert.equal(after.ino,before.ino);
  assert.equal(after.mtimeMs,before.mtimeMs);
});
