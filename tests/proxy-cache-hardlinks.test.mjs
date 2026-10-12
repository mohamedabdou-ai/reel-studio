import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,link,symlink,stat,utimes,appendFile,rm} from 'node:fs/promises';
import {ROOT,run} from '../scripts/lib/media.mjs';

test('a verified proxy and companion shared with a render bundle remain reusable and immutable',async t=>{
  const directory=path.join(ROOT,'Projects',`proxy-cache-test-${randomUUID().slice(0,8)}`);
  t.after(async()=>{
    const relative=path.relative(ROOT,directory);
    assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative));
    await rm(directory,{recursive:true,force:true});
  });
  await mkdir(directory,{recursive:true});
  const source=path.join(directory,'source.mp4'),out=path.join(directory,'proxy.mp4'),meta=`${out}.proxy.json`;
  const alias=path.join(directory,'bundle-proxy.mp4'),metaAlias=path.join(directory,'bundle-proxy.json');
  await run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=blue:s=360x640:r=30:d=1',
    '-c:v','libx264','-pix_fmt','yuv420p',source]);
  const proxy=async(...extra)=>run(process.execPath,[path.join(ROOT,'scripts/proxy.mjs'),source,'--height','180','--out',out,...extra],{cwd:ROOT});
  const first=JSON.parse((await proxy()).stdout);
  assert.equal(first.cached,false);
  const bytes=await readFile(out),metadataBytes=await readFile(meta),before=await stat(out);
  await link(out,alias);
  await link(meta,metaAlias);
  assert.ok((await stat(out)).nlink>1);
  assert.ok((await stat(meta)).nlink>1);
  const sourceStat=await stat(source);
  await utimes(source,sourceStat.atime,new Date(sourceStat.mtimeMs+2000));

  const second=JSON.parse((await proxy()).stdout);
  assert.equal(second.cached,true);
  assert.deepEqual(await readFile(out),bytes);
  assert.deepEqual(await readFile(alias),bytes);
  assert.deepEqual(await readFile(metaAlias),metadataBytes);
  const after=await stat(out),sourceAfter=await stat(source);
  assert.equal(after.ino,before.ino);
  assert.equal(after.mtimeMs,before.mtimeMs);
  assert.equal(second.sourceIdentity.lastModified,Math.floor(sourceAfter.mtimeMs));
  assert.equal(JSON.parse(await readFile(meta,'utf8')).sourceIdentity.lastModified,Math.floor(sourceAfter.mtimeMs));

  await assert.rejects(proxy('--out',path.join(ROOT,'..','proxy-cache-outside.mp4')),/project-root-relative|Unsafe path/);
  for(const protectedRoot of ['Raw','Reference']){
    await assert.rejects(proxy('--out',path.join(ROOT,protectedRoot,'proxy-cache-output.mp4')),/read-only/);
  }
  await assert.rejects(proxy('--out',path.join(ROOT,'.git','proxy-cache-output.mp4')),/control directories/);
  const realDirectory=path.join(directory,'real-cache'),junction=path.join(directory,'junction-cache');
  await mkdir(realDirectory);
  await symlink(realDirectory,junction,'junction');
  await assert.rejects(proxy('--out',path.join(junction,'proxy.mp4')),/Symlinks and junctions/);

  await assert.rejects(proxy('--force'),/shared hard link|hardlinked/);
  assert.deepEqual(await readFile(alias),bytes);
  await appendFile(out,'tampered');
  const tampered=await readFile(alias);
  await assert.rejects(proxy(),/shared hard link|hardlinked/);
  assert.deepEqual(await readFile(alias),tampered);
});
