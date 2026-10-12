import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/job-paths.mjs';
import {loadProjectScenePack,projectSceneBuild} from '../scripts/lib/project-scenes.mjs';
import {normalizeGraphicsSpec} from '../scripts/lib/graphics-project.mjs';
test('the shipped custom-scene example builds with the actual shared font modules',async t=>{
  const id=`example-build-${Math.random().toString(16).slice(2)}`,dir=path.join(ROOT,'Projects',id);
  await fs.cp(path.join(ROOT,'instructions','examples','project-scene'),dir,{recursive:true});
  t.after(async()=>{assert.equal(path.dirname(dir),path.join(ROOT,'Projects'));await fs.rm(dir,{recursive:true,force:true});});
  const raw=JSON.parse(await fs.readFile(path.join(dir,'graphics-spec.json'),'utf8'));
  raw.id=id;raw.projectScenePack=`Projects/${id}/scene-pack.json`;
  raw.projectScenes=await loadProjectScenePack(raw.projectScenePack,{id});
  const edit=normalizeGraphicsSpec(raw),built=await projectSceneBuild(edit);
  assert.ok(built.files.some(file=>file.path.endsWith('engine/public/fonts/manifest.json')));
  assert.ok(built.files.some(file=>file.path.endsWith('scenes/IdeaFlow.tsx')));
  assert.equal(edit.scenes[0].data.component,'idea-flow');
});
