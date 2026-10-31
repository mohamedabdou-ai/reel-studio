import React from 'react';
import {useCurrentFrame} from 'remotion';
import {HEAVY, THIN, SERIF, clamp01, fit, wid, fitWarning, mix, ramp, useMagazine, useType} from '../base';
import {balancedLines} from '../page-parts';
import {displayWeight} from '../../../../style-kit/design-safety';
import {DesignText} from '../../../../style-kit/digits';
import {sized, ticketStubPlan} from '../../../../creative-kit/compose/budget';
import type {Box} from '../../../../style-kit/system/types';
import type {MagazinePartProps} from './index';

const Frame: React.FC<{box: Box; children?: React.ReactNode; clip?: boolean}> = ({box, children, clip}) =>
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, overflow: clip ? 'hidden' : undefined}}>{children}</div>;
const rise = (f: number, at: number, d = 30) => ({opacity: clamp01(ramp(f, at, 20) * 1.7), transform: `translateY(${(1 - ramp(f, at, 22)) * d}px)`});
const heavyOf = (font: string, w = HEAVY) => displayWeight(font, 'Alexandria', w);
const Iso: React.FC<{children: string}> = ({children}) => <bdi dir="auto">{children}</bdi>;

/** Real fitted card contents, shared with the row planner. No estimates of line count. */
export function cardLayout(part:any,width:number,height:number,scale:number,emphasis:boolean,font:string){
  const v=part.variant??'plain',pad=46;
  const stubPlan=v==='ticket'?ticketStubPlan(part.value??'',width,(text,size,numeric)=>wid(text,size,numeric?400:600,numeric?SERIF:font)):null;
  const stub=stubPlan?.width??0,inner=width-pad*2-stub,button=v==='follow'?116:0;
  let tsize=sized('card',scale)+(emphasis?8:0),dsize=sized('detail',scale);
  const lay=()=>{
    const title0=fit(part.title,{width:inner,size:tsize,min:40,lines:2,weight:700,lh:1.25},font);
    const title=title0.lines.length>1?{...title0,lines:balancedLines(part.title,title0.size,700,inner,font)}:title0;
    const body0=part.body?fit(part.body,{width:inner,size:dsize,min:34,lines:3,weight:400,lh:1.35},font):null;
    const body=body0&&body0.lines.length>1?{...body0,lines:balancedLines(part.body,body0.size,400,inner,font)}:body0;
    const valueSize=Math.round(title.size*1.25),valueH=part.value&&v!=='follow'&&v!=='ticket'?20+Math.round(valueSize*1.2):0;
    const h=Math.max(stubPlan?Math.round(stubPlan.size*1.2)*stubPlan.lines.length:0,pad*2-12+title.box*title.lines.length+(body?12+body.box*body.lines.length:0)+valueH+button);
    return {title,body,valueSize,h};
  };
  let L=lay();while(L.h>height&&(tsize>40||dsize>34)){tsize=Math.max(40,tsize-4);dsize=Math.max(34,dsize-2);L=lay();}
  return {...L,pad,stub,stubPlan,inner};
}

export const CardPart: React.FC<MagazinePartProps<any>> = ({part, box, at, th, scale, emphasis, cell}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const {fit} = useType();
  const v = part.variant ?? 'plain';
  const titleInk=emphasis?th.ground:th.ink,bodyInk=emphasis?th.ground:th.dim,valueInk=emphasis?th.ground:th.gold;
  if (v === 'stamp') {
    const st = ramp(f, part.pressFrame ?? at + 6, 14);
    const t = fit(part.title, {width: box.width - 120, size: 92, min: 56, lines: 1, weight: 800});
    return <Frame box={box}>
      <div style={{position: 'absolute', left: 30, right: 30, top: (box.height - t.box - 60) / 2, height: t.box + 60, transform: `rotate(-2.5deg) scale(${mix(1.12, 1, st)})`, opacity: clamp01(st * 2), ...(f < at && st > 0 ? {visibility:'hidden' as const} : {}),
        border: `4px solid ${th.gold}`, outline: `1.5px solid ${th.gold}`, outlineOffset: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', direction: copy.dir}}>
        <span style={{fontFamily: font, fontWeight: heavyOf(font), fontSize: t.size, lineHeight: `${t.box}px`, color: th.gold, whiteSpace: 'nowrap'}}><Iso>{part.title}</Iso></span>
      </div>
    </Frame>;
  }
  const L=cardLayout(part,box.width,box.height,scale,emphasis,font);
  const {pad,stub,stubPlan,inner}=L;
  if (L.h > box.height) fitWarning(part.title, inner, 40, 0);
  if(stubPlan&&!stubPlan.fits)fitWarning(part.value,stub-32,30,2);
  const {title, body, valueSize} = L;
  const H = cell ? box.height : Math.min(box.height, L.h);
  const top = cell ? 0 : Math.max(0, (box.height - H) * 0.42);
  const frameP = ramp(f, at, 30);
  const press = part.pressFrame ?? at + 50;
  const followed = v === 'follow' && f >= press + 3;
  const fillP = ramp(f, press + 3, 8);
  return <Frame box={box}>
    <div style={{position: 'absolute', left: 0, top, width: box.width, height: H, ...(v==='ticket'?{overflow:'hidden'}:{})}}>
      <svg width={box.width} height={H} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
        <rect x={0.75} y={0.75} width={box.width - 1.5} height={H - 1.5} fill={emphasis ? th.ink : 'none'} fillOpacity={emphasis && frameP < 1 ? frameP : undefined} stroke={th.gold} strokeWidth={1.5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frameP}/>
        {v === 'ticket' ? <line x1={copy.ar ? stub : box.width - stub} x2={copy.ar ? stub : box.width - stub} y1={14} y2={H - 14} stroke={th.gold} strokeWidth={2} strokeDasharray="2 12" strokeLinecap="round" opacity={frameP}/> : null}
      </svg>
      {v === 'ticket' ? <>
        <div style={{position: 'absolute', top: -14, [copy.opposite]: stub - 14, width: 28, height: 28, borderRadius: 14, background: th.ground, border: `1.5px solid ${th.gold}`, opacity: frameP}}/>
        <div style={{position: 'absolute', bottom: -14, [copy.opposite]: stub - 14, width: 28, height: 28, borderRadius: 14, background: th.ground, border: `1.5px solid ${th.gold}`, opacity: frameP}}/>
        {part.value && stubPlan ? <div style={{position: 'absolute', top: 0, bottom: 0, [copy.opposite]: 0, width: stub, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow:'hidden',whiteSpace:stubPlan.numeric?'nowrap':undefined,direction: stubPlan.numeric?'ltr':copy.dir,
          fontFamily: stubPlan.numeric?SERIF:font, fontWeight:stubPlan.numeric?undefined:600, fontSize: stubPlan.size, color: valueInk, opacity: ramp(f, at + 20, 16)}}>{stubPlan.numeric?<DesignText>{part.value}</DesignText>:<div style={{width:stub-32,textAlign:'center'}}>{stubPlan.lines.map((line,i)=><div key={i} style={{whiteSpace:'nowrap',lineHeight:`${Math.round(stubPlan.size*1.2)}px`}}><DesignText>{line}</DesignText></div>)}</div>}</div> : null}
      </> : null}
      <div style={{position: 'absolute', top: pad - 6, [copy.side]: pad, width: inner, direction: copy.dir, ...rise(f, at + 8)}}>
        {title.lines.map((l, i) => <div key={i} style={{fontFamily: font, fontWeight: heavyOf(font, 700), fontSize: title.size, lineHeight: `${title.box}px`, color: titleInk, whiteSpace: 'nowrap', textAlign: copy.align}}>
          <Iso>{l}</Iso>{v === 'input' && i === title.lines.length - 1 ? <span data-idle="caret" style={{display: 'inline-block', width: 4, height: title.size, marginInlineStart: 10, verticalAlign: 'middle', background: th.gold, opacity: Math.floor(f / 15) % 2 ? 0.2 : 1}}/> : null}
        </div>)}
        {body ? <div style={{marginTop: 12}}>{body.lines.map((l, i) => <div key={i} style={{fontFamily: font, fontWeight: 400, fontSize: body.size, lineHeight: `${body.box}px`, color: bodyInk, whiteSpace: 'nowrap', textAlign: copy.align}}><Iso>{l}</Iso></div>)}</div> : null}
        {part.value && v !== 'follow' && v !== 'ticket' ? <div style={{marginTop: 20, fontFamily: font, fontWeight: THIN, fontSize: valueSize, lineHeight: `${Math.round(valueSize * 1.2)}px`, color: valueInk, whiteSpace: 'nowrap', textAlign: copy.align, opacity: ramp(f, (part.pressFrame ?? at + 20), 16)}}><DesignText>{part.value}</DesignText></div> : null}
        {v === 'follow' ? <div style={{position: 'relative', marginTop: 28, width: Math.min(inner, 480), height: 88, [copy.ar ? 'marginLeft' : 'marginRight']: 'auto', transform: `scale(${f >= press && f < press + 5 ? 0.97 : 1})`}}>
          <div style={{position: 'absolute', inset: 0, border: `1.5px solid ${th.gold}`}}/>
          <div style={{position: 'absolute', inset: 0, background: th.gold, clipPath: copy.ar ? `inset(0 0 0 ${(1 - fillP) * 100}%)` : `inset(0 ${(1 - fillP) * 100}% 0 0)`}}/>
          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, direction: copy.dir}}>
            {followed ? <svg width="40" height="40" viewBox="0 0 100 100"><path d="M24 53 L43 72 L78 31" fill="none" stroke={th.tagInk} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ramp(f, press + 4, 10)}/></svg> : null}
            <span style={{fontFamily: font, fontWeight: heavyOf(font, 700), fontSize: 42, lineHeight: '60px', color: followed && fillP > 0.5 ? th.tagInk : valueInk, whiteSpace: 'nowrap'}}>{part.value ?? ''}</span>
          </div>
        </div> : null}
      </div>
    </div>
  </Frame>;
};
