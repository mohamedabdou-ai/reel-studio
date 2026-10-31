import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {moveLogApi,drawLog,sampleTimes} from './helpers/arabic-move-log.mjs';
import {bundleEngine} from './helpers/engine-bundle.mjs';

const {moves}=await moveLogApi();
const original=JSON.parse(readFileSync(new URL('./fixtures/arabic-move-default-ops.json',import.meta.url),'utf8'));
for(const [name,C] of Object.entries(moves))test(name+': default canvas operations match the pre-E0 capture',()=>{
  // The pre-change JSON capture represents both signed zeros as 0, as Canvas does.
  assert.deepEqual(JSON.parse(JSON.stringify(sampleTimes.map(t=>drawLog(C,t)))),original[name]);
  assert.deepEqual(JSON.parse(JSON.stringify(sampleTimes.map(t=>drawLog(C,t,{})))),original[name]);
});
test('pulse:0 removes the decrypt scale operation',()=>{
  const before=drawLog(moves.Decrypt,1.46),after=drawLog(moves.Decrypt,1.46,{pulse:0});
  assert.ok(before.some(op=>op[0]==='scale'&&op[1]>1));
  assert.deepEqual(after,before.filter(op=>op[0]!=='scale'));
});
test('nibShadow:false removes decorative nib tilt and shadow',()=>{
  const before=drawLog(moves.PenWrite,.3),after=drawLog(moves.PenWrite,.3,{nibShadow:false});
  assert.ok(before.some(op=>op[0]==='rotate'));
  assert.ok(before.some(op=>op[1]==='shadowBlur'));
  assert.deepEqual(after,before.filter(op=>op[0]!=='rotate'&&!['shadowColor','shadowBlur'].includes(op[1])));
});
test('barTilt:0 and barJag:0 draw level rectangular redaction bars',()=>{
  const log=drawLog(moves.RedactedStamp,.7,{barTilt:0,barJag:0});
  assert.ok(log.some(op=>op[0]==='lineTo'));
  assert.ok(log.filter(op=>op[0]==='rotate').every(op=>op[1]===0));
  const ys=new Set(log.filter(op=>op[0]==='lineTo').map(op=>op[2]));
  assert.deepEqual([...ys].sort((a,b)=>a-b),[-13.95,13.95]);
});
const {fit,EchoStack}=await bundleEngine(`export {fit} from './engine/src/arabic-type/canvas'; export {EchoStack} from './engine/src/arabic-type/moves/echo-stack';`,{ssr:true});

const textDraws=log=>{
  let alpha=1,fill,stroke;const draws=[];
  for(const op of log){
    if(op[0]==='set'){
      if(op[1]==='globalAlpha')alpha=op[2];
      if(op[1]==='fillStyle')fill=op[2];
      if(op[1]==='strokeStyle')stroke=op[2];
    }else if(op[0]==='fillText'||op[0]==='strokeText')draws.push({method:op[0],args:op.slice(1),alpha,color:op[0]==='fillText'?fill:stroke});
  }
  return draws;
};

test('echo-stack: omitted, empty and false echoFill keep identical default operations',()=>{
  for(const t of [...sampleTimes,12/30,160/30,7.5]){
    const before=drawLog(EchoStack,t);
    assert.deepEqual(drawLog(EchoStack,t,{}),before);
    assert.deepEqual(drawLog(EchoStack,t,{echoFill:false}),before);
    const draws=textDraws(before);assert.equal(draws.filter(d=>d.method==='strokeText').length,6);
    assert.equal(draws[3].method,'fillText');assert.equal(draws[3].color,'#fc0');
  }
});

// Track canvas state and copy the scratch draw at composite time: the real
// implementation reuses the same canvas, so retaining only its reference hides bugs.
const identity={a:1,b:0,c:0,d:1,e:0,f:0};
const echoLayerHarness=()=>{
  const composites=[],scratchDraws=[],clears=[],strokes=[],allocations=[],measurements=[];
  const makeContext=(canvas,isScratch)=>{
    let state={globalAlpha:1,globalCompositeOperation:'source-over',transform:{...identity},window:null},stack=[];
    const methods={canvas,
      save(){stack.push({...state,transform:{...state.transform}});},restore(){state=stack.pop();},
      setTransform(...args){state.transform=args.length===1?{...args[0]}:Object.fromEntries(['a','b','c','d','e','f'].map((k,i)=>[k,args[i]]));},
      getTransform(){return {...state.transform};},
      beginPath(){state.window=null;},rect(...rect){state.window=rect;},clip(){},
      clearRect(...args){clears.push({canvas,args,transform:{...state.transform}});canvas.lastDraw=null;},
      measureText(value){
        const size=Number(/([\d.]+)px/.exec(state.font)[1]);
        // A deep bowl exceeds the old .35-size descent, as in the reviewed ع.
        const metrics={width:value.length*12,actualBoundingBoxAscent:1.1*size,actualBoundingBoxDescent:.6*size};
        if(isScratch)measurements.push({font:state.font,...metrics});return metrics;
      },
      fillText(...args){const draw={...state,transform:{...state.transform},window:[...state.window],args};scratchDraws.push(draw);canvas.lastDraw=draw;},
      strokeText(...args){strokes.push(args);},
      drawImage(source,...args){composites.push({...state,transform:{...state.transform},args,source,draw:source.lastDraw});},
    };
    return new Proxy(methods,{get:(o,k)=>k in o?o[k]:state[k],set:(o,k,v)=>{state[k]=v;return true;}});
  };
  const canvas={width:1080,height:1920},main=makeContext(canvas,false);
  main.setTransform(4,0,0,4,0,0);
  const documentBefore=globalThis.document;
  const run=(times)=>{
    globalThis.document={createElement(tag){assert.equal(tag,'canvas');const scratch={width:300,height:150};const ctx=makeContext(scratch,true);scratch.getContext=()=>ctx;allocations.push(scratch);return scratch;}};
    try {for(const t of times){
      const p={text:'one two',font:'Alexandria',size:40,ink:'#fff',accent:'#fc0',fps:30,durationInFrames:240,width:canvas.width,height:canvas.height,look:{echoFill:true}};
      EchoStack(p).props.draw(main,t,p);
    }}finally{if(documentBefore===undefined)delete globalThis.document;else globalThis.document=documentBefore;}
  };
  return {run,main,canvas,composites,scratchDraws,clears,strokes,allocations,measurements};
};

for(const t of [160/30,7.5,7.66])test(`echoFill layers at t=${t}: outer to inner, opaque scratch, erase then alpha composite, whole glyph`,()=>{
  const h=echoLayerHarness();h.run([t]);
  const order=[-3,3,-2,2,-1,1,0],original=textDraws(drawLog(EchoStack,t));
  assert.equal(h.allocations.length,1);assert.equal(h.scratchDraws.length,7);assert.equal(h.composites.length,14);assert.equal(h.strokes.length,0);
  assert.deepEqual(h.allocations.map(c=>[c.width,c.height]),[[1080,1920]]);
  assert.equal(h.measurements.length,1);const measured=h.measurements[0];
  for(let i=0;i<7;i++){
    const row=order[i],scratch=h.scratchDraws[i],erase=h.composites[i*2],paint=h.composites[i*2+1];
    assert.deepEqual(scratch.args,original[row+3].args,'glyph order and baseline stay exact');
    assert.equal(scratch.globalAlpha,1);assert.equal(scratch.globalCompositeOperation,'source-over');
    assert.equal(scratch.fillStyle,row===0?'#fc0':'#fff');assert.match(scratch.font,/900 40px "Alexandria"/);
    assert.deepEqual(scratch.transform,{a:4,b:0,c:0,d:4,e:0,f:0});
    const baseline=scratch.args[2],[x,y,width,height]=scratch.window;
    assert.equal(x,0);assert.equal(width,270);assert.equal(height,measured.actualBoundingBoxAscent+measured.actualBoundingBoxDescent+2);
    assert.ok(Math.abs(y-(baseline-measured.actualBoundingBoxAscent-1))<1e-9);
    assert.ok(y+height>=baseline+measured.actualBoundingBoxDescent+1-1e-9,'includes the full bowl plus padding');
    assert.equal(erase.globalCompositeOperation,'destination-out');assert.equal(erase.globalAlpha,1);
    assert.equal(paint.globalCompositeOperation,'source-over');
    assert.ok(Math.abs(paint.globalAlpha-original[row+3].alpha*(row===0?1:.3))<1e-12);
    assert.strictEqual(erase.draw,scratch);assert.strictEqual(paint.draw,scratch);assert.strictEqual(erase.source,paint.source);
    assert.deepEqual(erase.transform,identity);assert.deepEqual(paint.transform,identity);
    assert.deepEqual(erase.args,[0,0]);assert.deepEqual(paint.args,[0,0]);
  }
  assert.equal(h.scratchDraws.at(-1).fillStyle,'#fc0','gold is the final opaque shape');
  assert.equal(h.composites.at(-1).globalAlpha,1);assert.deepEqual(h.main.getTransform(),{a:4,b:0,c:0,d:4,e:0,f:0});
  assert.equal(h.main.globalAlpha,1);assert.equal(h.main.globalCompositeOperation,'source-over','erase state must not leak to the caller');
});

test('echoFill reuses one scratch canvas across frames and resize; entrance offsets and alpha stay unchanged',()=>{
  const h=echoLayerHarness(),times=[0,12/30,160/30,7.5,7.66,7.8];h.run(times);
  assert.equal(h.allocations.length,1);assert.equal(h.clears.length,times.length*7);
  for(const clear of h.clears){assert.deepEqual(clear.args,[0,0,1080,1920]);assert.deepEqual(clear.transform,identity);}
  const order=[-3,3,-2,2,-1,1,0];
  for(let f=0;f<times.length;f++){
    const original=textDraws(drawLog(EchoStack,times[f]));
    for(let i=0;i<7;i++){
      assert.deepEqual(h.scratchDraws[f*7+i].args,original[order[i]+3].args);
      assert.ok(Math.abs(h.composites[f*14+i*2+1].globalAlpha-original[order[i]+3].alpha*(order[i]===0?1:.3))<1e-12);
    }
  }
  h.canvas.width=540;h.canvas.height=960;h.main.setTransform(2,0,0,2,0,0);h.run([160/30]);
  assert.equal(h.allocations.length,1);assert.equal(h.allocations[0].width,540);assert.equal(h.allocations[0].height,960);
  assert.deepEqual(h.scratchDraws.at(-1).transform,{a:2,b:0,c:0,d:2,e:0,f:0});
  assert.deepEqual(h.clears.at(-1).args,[0,0,540,960]);
});

test('fit retains default floor 1 and warns through designWarning at a supplied floor',()=>{
  const ctx={font:'',measureText(value){return {width:value.length*Number(/([\d.]+)px/.exec(this.font)[1])};}};
  const warnings=[],warn=console.warn;console.warn=message=>warnings.push(message);
  try {
    assert.equal(fit(ctx,'abcdefghij','Cairo',64,226),22);
    assert.equal(fit(ctx,'abcdefghij','Cairo',64,226,28),28);
    assert.equal(fit(ctx,'W'.repeat(160),'Cairo',64,226),1);
    assert.ok(warnings.some(w=>w.startsWith('arabic-type fit-warning: ')&&w.includes('"floor":28')));
    assert.ok(warnings.some(w=>w.includes('"floor":1')));
  } finally {console.warn=warn;}
});
