import test from 'node:test';
import assert from 'node:assert/strict';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';
import {renderFamilyDesign} from './helpers/magazine-design-ssr.mjs';
import {bundleEngine} from './helpers/engine-bundle.mjs';
import {moveLogApi,drawLog} from './helpers/arabic-move-log.mjs';

const module='engine/src/styles/magazine-interview/designs/arabic-type.tsx';
const base=structuredClone(ARABIC_SCENES.find(s=>s.family==='arabic-type'));
const render=(scene,frame)=>renderFamilyDesign({module,exportName:'ArabicType',scene,frame});
const api=await bundleEngine(`export {MAGAZINE_TYPE_LOOK,STAMP_BOX} from './${module}'; export {arabicTypeCues,arabicTypeMinimumSeconds} from './engine/src/arabic-type/timing'; export {fit} from './engine/src/arabic-type/canvas';`,{ssr:true});
const variants=[['decrypt',160],['pen-write',190],['redacted-stamp',140]];

for(const [move,settled] of variants)for(const frame of [0,30,settled,239])test(`arabic-type ${move} frame ${frame}: real designSet, finite canvas and correct font`,async()=>{
  const scene=structuredClone(base);scene.data.move=move;if(move==='redacted-stamp')scene.data.stamp='نموذج';
  const html=await render(scene,frame);
  assert.match(html,/data-style-system="magazine-interview"/);assert.doesNotMatch(html,/NaN|Infinity|undefined/);
  assert.match(html,new RegExp('data-arabic-move="'+move+'"'));assert.match(html,new RegExp('data-arabic-font="'+(move==='pen-write'?'Noto Naskh Arabic':'Alexandria')+'"'));
  assert.match(html,/clip-path:inset\(350px 65px/);
});

test('English copy flips furniture left; approved poster geometry and stamp cue stay exact',async()=>{
  const english=structuredClone(base);english.data.text='A clear idea 2024';assert.match(await render(english,160),/direction:ltr;text-align:left/);
  const scene=structuredClone(base);Object.assign(scene.data,{move:'redacted-stamp',stamp:'نموذج'});
  const at=api.arabicTypeCues(scene.data,30).find(c=>c.kind==='stamp').frame;assert.equal(at,90);
  assert.doesNotMatch(await render(scene,at-1),/data-magazine-stamp/);const html=await render(scene,140);
  assert.match(html,/left:432px;top:990px;width:304px;height:148px/);assert.match(html,/rotate\(-2.5deg\) scale\(1\)/);
  assert.match(html,/border:2px solid #F3C776/);assert.match(html,/inset:6px;border:1px solid #F3C776/);
});

test('decrypt DOM percent keeps its 28px dim role and uses shared tabular numeral style',async()=>{
  const html=await render(base,160),percent=html.match(/data-decrypt-progress="1"[\s\S]*?<div style="([^"]*)"/)[1];
  assert.match(percent,/font-size:28px/);assert.match(percent,/font-weight:500/);assert.match(percent,/color:#BBCED9/);assert.match(percent,/font-variant-numeric:tabular-nums/);
});

test('the magazine look removes native pulse, nib shadow and redaction bar tilt/jag',async()=>{
  const {moves}=await moveLogApi(),look=api.MAGAZINE_TYPE_LOOK;
  assert.deepEqual(look,{pulse:0,nibShadow:false,barTilt:0,barJag:0,echoFill:true,videoFocusY:0.33});
  assert.ok(!drawLog(moves.Decrypt,1.46,look).some(op=>op[0]==='scale'));
  const pen=drawLog(moves.PenWrite,.3,look);assert.ok(!pen.some(op=>op[0]==='rotate'||['shadowBlur','shadowColor'].includes(op[1])));
  const bars=drawLog(moves.RedactedStamp,.7,look);assert.ok(bars.filter(op=>op[0]==='rotate').every(op=>op[1]===0));
  assert.deepEqual([...new Set(bars.filter(op=>op[0]==='lineTo').map(op=>op[2]))].sort((a,b)=>a-b),[-13.95,13.95]);
});

test('magazine echo-stack receives echoFill while retaining its 34px native fit floor',async()=>{
  const probe=await bundleEngine(`
    import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
    import {ArabicType} from './engine/src/styles/magazine-interview/designs/arabic-type';
    export const render=scene=>renderToStaticMarkup(<ArabicType scene={scene} seam={1080} geometry={{}} style="magazine-interview" aspect={1}/>);
  `,{ssr:true,sourceOverrides:{'engine/src/arabic-type/moves/index.ts':`
    import React from 'react';
    export const ARABIC_MOVE_COMPONENTS={'echo-stack':p=>React.createElement('span',{'data-native-echo-fill':String(p.look?.echoFill),'data-native-floor':p.fitFloor})};
  `}});
  const html=probe.render({...base,data:{...base.data,move:'echo-stack'}});
  assert.match(html,/data-native-echo-fill="true"/);assert.match(html,/data-native-floor="8.5"/);
});

test('only echo-stack masks the type zone at the exact frame-pixel stops, preserving every clipPath',async()=>{
  const expected='linear-gradient(to bottom, transparent 350px, #000 430px, #000 1070px, transparent 1150px)';
  const properties=['mask-image','-webkit-mask-image','mask-size','-webkit-mask-size'];
  for(const move of ['decrypt','pen-write','redacted-stamp','dots-drop','letters-snap','kufi-tiles','kashida-stretch','echo-stack','word-melt','unblur','video-in-letters']){
    const scene=structuredClone(base);Object.assign(scene.data,{text:'جميل',move});
    if(move==='word-melt')scene.data.to='ثقة';if(move==='video-in-letters')scene.data.media='library-preview/synthetic-screen.mp4';
    for(const frame of [0,160,239]){
      const html=await render(scene,frame),zone=html.match(/<div data-type-zone="" style="([^"]*)"/)[1];
      const style=Object.fromEntries(zone.split(';').map(value=>{const split=value.indexOf(':');return [value.slice(0,split),value.slice(split+1)];}));
      assert.equal(style['clip-path'],`inset(350px 65px ${move==='decrypt'?840:770}px 65px)`);
      if(move==='echo-stack'){
        assert.equal(style['mask-image'],expected);assert.equal(style['-webkit-mask-image'],expected);
        assert.equal(style['mask-size'],'100% 100%');assert.equal(style['-webkit-mask-size'],'100% 100%');
      }else for(const key of properties)assert.ok(!Object.hasOwn(style,key),`${move} zone must not have ${key}`);
    }
  }
});

test('E0 canvas floor warns without throwing',()=>{
  const ctx={font:'',measureText(text){return {width:text.length*Number(/([\d.]+)px/.exec(this.font)[1])};}},warnings=[],warn=console.warn;
  console.warn=message=>warnings.push(message);
  try{assert.equal(api.fit(ctx,'W'.repeat(160),'Alexandria',64,226,34/4),34/4);}finally{console.warn=warn;}
  assert.ok(warnings.some(w=>w.includes('fit-warning')&&w.includes('"floor":8.5')));
});

test('the magazine passes its 34px canvas floor and long text warns at that floor',async()=>{
 const probe=await bundleEngine(`
  import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
  import {ArabicType} from './engine/src/styles/magazine-interview/designs/arabic-type';
  export const render=scene=>renderToStaticMarkup(<ArabicType scene={scene} seam={1080} geometry={{}} style="magazine-interview" aspect={1}/>);
 `,{ssr:true,sourceOverrides:{'engine/src/arabic-type/moves/index.ts':`
  import React from 'react';import {fit} from '../canvas';
  const Draw=p=>{const ctx={font:'',measureText:t=>({width:t.length*Number(/([\\d.]+)px/.exec(ctx.font)[1])})};const size=fit(ctx,p.text,p.font,64,226,p.fitFloor);return React.createElement('span',{'data-native-floor':p.fitFloor,'data-native-size':size});};
  export const ARABIC_MOVE_COMPONENTS=new Proxy({},{get:()=>Draw});
 `}});
 const scene={...base,data:{...base.data,text:'W'.repeat(160),move:'decrypt'}};
 const warnings=[],warn=console.warn;let html;try{console.warn=(...args)=>warnings.push(args.join(' '));html=probe.render(scene);}finally{console.warn=warn;}
 assert.match(html,/data-native-floor="8.5"/);assert.match(html,/data-native-size="8.5"/);
 assert.ok(warnings.some(w=>w.includes('fit-warning')&&w.includes('"floor":8.5')));
});

test('a native decrypt without fitFloor still shrinks below the magazine floor',async()=>{
 const {moves}=await moveLogApi();
 const draw=floor=>{const fonts=[],ctx=new Proxy({font:'',measureText(value){return {width:value.length*Number(/([\d.]+)px/.exec(this.font)[1])};}},{get:(o,k)=>k in o?o[k]:()=>{},set(o,k,v){o[k]=v;if(k==='font')fonts.push(Number(/([\d.]+)px/.exec(v)[1]));return true;}});
  const p={text:'W'.repeat(160),font:'Alexandria',size:64,ink:'#fff',accent:'#fc0',fps:30,durationInFrames:1800,width:1080,height:1920,...(floor===undefined?{}:{fitFloor:floor})};
  moves.Decrypt(p).props.draw(ctx,30,p);return Math.min(...fonts);
 };
 assert.equal(draw(34/4),34/4);assert.ok(draw(undefined)<34/4);
});

for(const move of ['dots-drop','letters-snap','kufi-tiles','kashida-stretch','echo-stack','word-melt','unblur','video-in-letters'])test(`native ${move}: first/settled/last markup remains finite`,async()=>{
  const scene=structuredClone(base);Object.assign(scene.data,{text:'جميل',move});
  if(move==='word-melt')scene.data.to='ثقة';if(move==='video-in-letters')scene.data.media='library-preview/synthetic-screen.mp4';
  const intro=Math.ceil((api.arabicTypeMinimumSeconds(scene.data)-.6)*30),settled=Math.min(210,Math.max(90,intro));
  for(const frame of [0,settled,239]){
    const html=await render(scene,frame);assert.doesNotMatch(html,/NaN|Infinity|undefined/);assert.match(html,new RegExp('data-arabic-move="'+move+'"'));
  }
});
