import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleEngine} from './helpers/engine-bundle.mjs';

const api=await bundleEngine(`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {PreparedPlateProvider,usePreparedPlate,ScreenRecordingScene} from './engine/src/screen-recording/ScreenRecordingScene';
  export {boundedData,sceneTiming} from './engine/src/style-kit/design-safety';
  export {rasterize,buildGeometry} from './engine/src/motion-concepts/chaos-to-brand/scene';
  export {measureInk,fitKeyword} from './engine/src/motion-concepts/keyword-reveal/scene';
  export {getSceneTheme} from './engine/src/creative-kit/primitives';
  export {CONCEPT_BOX} from './engine/src/motion-concepts/shared';
  const Read=()=> <output>{JSON.stringify(usePreparedPlate())}</output>;
  export const plate=(plate)=>renderToStaticMarkup(plate?<PreparedPlateProvider plate={plate}><Read/></PreparedPlateProvider>:<Read/>);
  export const missingPlate=()=>renderToStaticMarkup(<ScreenRecordingScene scene={{data:{}}} style="magazine-interview"/>);
`,{ssr:true,media:true});
test('source frames survive a 240-frame scene while scene clocks retain clamping',()=>{
  const input={trimBeforeFrame:300,foreground:{sourceFromFrame:500,trimBeforeFrame:600},fromFrame:400,steps:[{atFrame:400,untilFrame:600,clip:{trimBeforeFrame:900}}],rollDuration:400};
  const before=structuredClone(input),result=api.boundedData(input,api.sceneTiming(240,'E0'));
  assert.deepEqual(result,{trimBeforeFrame:300,foreground:{sourceFromFrame:500,trimBeforeFrame:600},fromFrame:239,steps:[{atFrame:239,untilFrame:239,clip:{trimBeforeFrame:900}}],rollDuration:239});
  assert.deepEqual(input,before);
  for(const key of ['trimBeforeFrame','sourceFromFrame']) {
    for(const invalid of [-1,NaN,Infinity,-Infinity,'300',null,undefined])assert.equal(api.boundedData({[key]:invalid},api.sceneTiming(240,'E0-invalid'))[key],0);
    assert.equal(api.boundedData({[key]:300.5},api.sceneTiming(240))[key],300.5);
  }
});
test('prepared plate hook is nullable and reads the existing provider; scene error is unchanged',()=>{
  assert.equal(api.plate(null),'<output>null</output>');
  assert.match(api.plate({src:'capture.mp4',width:1920,height:1080}),/capture.mp4/);
  assert.throws(api.missingPlate,{message:'screen-recording scenes render inside PreparedEdit (PreparedPlateProvider is missing).'});
});
test('exported chaos geometry uses the native path sampler',()=>{
  assert.equal(typeof api.rasterize,'function');
  const geo=api.buildGeometry({kind:'path',d:'M0 0 L100 0 L100 100 Z',viewBox:'0 0 100 100',filled:true},api.getSceneTheme('magazine-interview'));
  assert.equal(geo.kind,'path');assert.equal(geo.filled,true);assert.ok(geo.parts.length);assert.equal(geo.vb.width,100);
});
test('browser ink measurement uses actual glyph bounds; native keyword fit is reachable',()=>{
  const before=globalThis.document,measured=[];
  const ctx={measureText(line){measured.push([line,this.direction,this.font]);return {actualBoundingBoxAscent:line==='أ'?30.2:22,actualBoundingBoxDescent:4.1};}};
  globalThis.document={createElement:()=>({getContext:()=>ctx})};
  try {
    assert.deepEqual(api.measureInk(['أ','A'],'Alexandria',40,600),{ascent:31,descent:5});
    assert.equal(measured[0][1],'rtl');assert.equal(measured[1][1],'ltr');
    const result=api.fitKeyword('Build',api.getSceneTheme('magazine-interview'),api.CONCEPT_BOX);
    assert.ok(result.fit.fits);assert.ok(result.metrics.fontSize>0);
  } finally {globalThis.document=before;}
});
