// tests/magazine-coverage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameRenderer} from '../scripts/lib/ssr-frames.mjs';
import {SCENE_FAMILIES, STYLE_METAS} from '../engine/src/styles/registry.ts';
import {editSceneSchema} from '../engine/src/prepared-edit/schema.ts';
import {DESIGN_COVERAGE, SYSTEM_PENDING, drawnByStyle, undrawnScenes} from '../engine/src/styles/design-coverage.ts';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';
import {getPreviewDefinition} from '../engine/src/library-preview/fixtures.ts';
import {readFile} from 'node:fs/promises';
import {bundleEngine} from './helpers/engine-bundle.mjs';

const STYLE = 'magazine-interview';
const otherOwned = new Set(STYLE_METAS.filter(m => m.id !== STYLE).flatMap(m => m.ownScenes));
const families = SCENE_FAMILIES.filter(f => f !== 'project-scene' && !otherOwned.has(f));
const layoutsOf = (family) => {
  const shape = editSceneSchema.def.left.options.find(o => o.shape.family.value === family).shape.layout;
  return shape.options ?? [shape.value];
};

test('every family is drawn by the magazine system or listed as pending', () => {
  for (const family of families) {
    if (SYSTEM_PENDING[STYLE].includes(family)) { assert.equal(DESIGN_COVERAGE[STYLE][family], undefined, `${family} is pending and drawn`); continue; }
    assert.equal(DESIGN_COVERAGE[STYLE][family], 'all', `${family} must be drawn by the magazine system in every layout`);
  }
});

test('Group B integration leaves no pending magazine families', () => {
  assert.deepEqual([...SYSTEM_PENDING[STYLE]], []);
});

// Footage families need prepared plates, so they are checked by their adapter tests and the stills review instead.
const FOOTAGE = new Set(['screens', 'screen-recording', 'screen-focus', 'kinetic-hook']);
// getPreviewDefinition throws on an unknown key; its scene lives at definition.fixture.scene (fixtures.ts:272).
const sample = (family) => ARABIC_SCENES.find(s => s.family === family) ?? (() => {
  try { return getPreviewDefinition(`scene:${family}`).fixture?.scene ?? null; } catch { return null; }
})();

// Initialize the real frame harness before bundleEngine installs its fake document.
const renderer = await createFrameRenderer();
test('what the table says is what the renderer draws', async t => {
  let checked = 0;
  for (const family of families.filter(f => !FOOTAGE.has(f))) {
    const base = sample(family);
    if (!base) continue;
    for (const layout of layoutsOf(family)) {
      const scene = {...structuredClone(base), layout};
      if (!editSceneSchema.safeParse(scene).success) continue;
      const html = renderer.renderScene({scene, style: STYLE, frame: Math.min(60, scene.durationInFrames - 1)});
      assert.equal(/data-style-system="magazine-interview"/.test(html), drawnByStyle(STYLE, family, layout), `${family}@${layout}`);
      checked++;
    }
  }
  assert.ok(checked >= 30, `only ${checked} family layouts were rendered; fix sample() before trusting this test`);
  t.diagnostic(`checked ${checked} magazine family layouts`);
});

test('undrawnScenes lists only pending families in a magazine edit, and nothing in other styles', () => {
  const scenes = [{id: 'a', family: 'intro', layout: 'split'}, {id: 'b', family: 'message-board', layout: 'takeover'}, {id: 'c', family: 'project-scene', layout: 'takeover'}];
  assert.deepEqual(undrawnScenes({style: STYLE, scenes}).map(s => s.id), []);
  assert.deepEqual(undrawnScenes({style: 'section-deck', scenes}), []);
});

const designSource = await readFile(new URL('../engine/src/styles/magazine-interview/designs/index.ts',import.meta.url),'utf8');
const routes = [...designSource.matchAll(/'([^']+)'\s*:\s*(?:takeoverOrPage\(\w+\s*,\s*|page\()((?:classic|semantic|kinetic)\.\w+)\)/g)].map(match=>({family:match[1],adapter:match[2]}));
const api = await bundleEngine(`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {MagazineComposePage} from './engine/src/styles/magazine-interview/system/compose';
  import {MAGAZINE_INTERVIEW_DESIGNS} from './engine/src/styles/magazine-interview/designs';
  import {classic,semantic,kinetic} from './engine/src/creative-kit/compose/adapters';
  const adapters={classic,semantic,kinetic};
  const withFrame=(fps,frame,run)=>{
    const before=[globalThis.__SSR_FRAME__,globalThis.__SSR_FPS__];
    globalThis.__SSR_FRAME__=frame;globalThis.__SSR_FPS__=fps;
    try{return run();}finally{[globalThis.__SSR_FRAME__,globalThis.__SSR_FPS__]=before;}
  };
  const props=scene=>({scene,style:'magazine-interview',seam:1080,geometry:{},aspect:1,sectionIndex:2});
  export const adapted=(ref,scene,fps=30)=>withFrame(fps,150,()=>{
    const [group,name]=ref.split('.'),data=adapters[group][name](scene,fps);
    return {paper:data.paper??null,html:renderToStaticMarkup(<MagazineComposePage {...props(scene)} data={data}/>)};
  });
  export const registered=(scene,fps,frame)=>withFrame(fps,frame,()=>{
    const Design=MAGAZINE_INTERVIEW_DESIGNS[scene.family];
    return renderToStaticMarkup(<Design {...props(scene)}/>);
  });
  export const mediaOnly=data=>withFrame(30,150,()=>renderToStaticMarkup(<MagazineComposePage {...props({id:'direction',family:'compose',layout:'takeover',motion:'land',fromFrame:0,durationInFrames:360,data})} data={data}/>));
`,{ssr:true,media:true,timeline:true,plateStub:true});

test('every page adapter draws a navy adapted ground in both layouts', () => {
  assert.equal(routes.length,17,'every page(...) and takeoverOrPage(...) route must be checked');
  for(const route of routes) for(const layout of ['takeover','split']){
    const base=sample(route.family);
    assert.ok(base,`missing ${route.family} sample`);
    const result=api.adapted(route.adapter,{...structuredClone(base),layout,durationInFrames:360});
    assert.equal(result.paper,null,`${route.family}/${layout} must leave paper unset`);
    // This checks the adapted branch; takeoverOrPage's retained takeover is covered by parity.
    assert.equal(result.html.match(/\bbackground:(#[a-f0-9]{6})/i)?.[1].toUpperCase(),'#081321',`${route.family}/${layout}`);
  }
});

const normalizeIdle=html=>html.replace(/<[a-z][^>]*\bdata-idle="[^"]*"[^>]*>/gi,tag=>tag.replace(/\sstyle="[^"]*"/g,''));
test('registered adapter routes pass the real 60fps clock and hold still', () => {
  for(const route of routes){
    const base=sample(route.family),layout=route.adapter.startsWith('classic.')?'split':layoutsOf(route.family)[0];
    const scene={...structuredClone(base),layout,durationInFrames:360};
    const first=api.registered(scene,60,300),last=api.registered(scene,60,359);
    assert.ok(normalizeIdle(first)===normalizeIdle(last),`${route.family} changes during the 60fps hold`);
  }
});

test('English media-only page furniture follows sequence titles and pair labels', () => {
  const sources=[
    {kind:'sequence',steps:[{offsetFrames:0,still:'projects/demo/a.png',title:'English capture'}]},
    {kind:'pair',images:[{src:'projects/demo/a.png',label:'Before'},{src:'projects/demo/b.png',label:'After'}]},
  ];
  for(const source of sources){
    const html=api.mediaOnly({arrangement:'hero',parts:[{id:'media',kind:'media',at:{frame:0},emphasis:true,source}]});
    assert.match(html,/ISSUE/);
    assert.match(html,/text-align:left/);
    assert.doesNotMatch(html,/العدد/);
  }
});
