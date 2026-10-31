import {DesignText} from '../../../style-kit/digits';
import {FittedContent} from '../../../style-kit/content-fit';
import {displayWeight,displayLineHeight} from '../../../style-kit/design-safety';
// Fixed magazine-interview drawing from the approved V4 pilot.
// Law of the style: a premium print magazine, page by page. Navy and cream pages, gold hairlines, folios, thin/heavy type contrast.
import React from 'react';
import {useProbe} from '../../../core/safe';
import {balancedLines} from './page-parts';
import {AbsoluteFill, Easing, spring, useCurrentFrame} from 'remotion';
import {fitOnLines, fitToBox, measure} from '../../../core/type';
import {useTypographyFont} from '../../../creative-kit/chapter-theme';
import type {SceneCopy} from '../../scene-copy';
import {ownSceneCopy as sceneCopy} from '../../../style-kit/design-safety';
import {magazineCopy} from '../designs/copy';
export {sceneCopy};

// ---------- palette and constants ----------

export type Theme = {name: 'navy' | 'cream'; ground: string; ink: string; dim: string; gold: string; hair: string; faint: string; tagInk: string};
export const NAVY: Theme = {name: 'navy', ground: '#081321', ink: '#F5F3EC', dim: '#BBCED9', gold: '#F3C776', hair: 'rgba(243,199,118,0.34)', faint: 'rgba(245,243,236,0.10)', tagInk: '#081321'};
export const CREAM: Theme = {name: 'cream', ground: '#F5F0E4', ink: '#0B1A2C', dim: '#55616F', gold: '#B8862E', hair: 'rgba(184,134,46,0.42)', faint: 'rgba(11,26,44,0.10)', tagInk: '#0B1A2C'};

export const AR = 'Alexandria';
export const MONO = "'IBM Plex Mono', monospace";
export const SERIF = "'Source Serif 4', Alexandria, serif";
export const W = 1080, X0 = 65, X1 = 1015, CW = X1 - X0;
export const FPS = 30;
export const THIN = 200, HEAVY = 800;
/** Vertical offset (as a fraction of the number size) that top-aligns the thin suffix with the digits like a superscript. */
export const SUF_TOP = -0.135;
export const expo = Easing.bezier(0.16, 1, 0.3, 1);
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const ramp = (f: number, at: number, dur: number, ease: (t: number) => number = expo) => ease(clamp01((f - at) / Math.max(1, dur)));
/** A critically damped spring: settles without any overshoot. */
export const glide = (f: number, at: number, stiffness = 110) => spring({frame: f - at, fps: FPS, config: {damping: 200, stiffness, mass: 1}});
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const num = (n: number) => Math.round(n).toLocaleString('en-US');
/** The lower right rail is reserved for the platform UI; animated text includes its full travel. */
export const railInset = (top:number,height:number,side:'left'|'right') => side==='right' && top+height>1150 ? 162 : 0;


const warnings=new Set<string>();
export const fitWarning=(text:string,width:number,size:number,lines:number)=>{
  const warning='magazine-interview fit-warning: '+JSON.stringify({text,width,size,lines});
  if(!warnings.has(warning)){if(warnings.size>=256)warnings.clear();warnings.add(warning);console.warn(warning);}
};
const MagazineContext=React.createContext<{copy:SceneCopy;font:string}>({copy:sceneCopy({lang:'ar'}),font:AR});
export const useMagazine=()=>React.useContext(MagazineContext);
export const MagazineScope:React.FC<{data:unknown;children?:React.ReactNode}>=({data,children})=>{
  const font=useTypographyFont() ?? AR;
  const copy=sceneCopy(data);
  return <MagazineContext.Provider value={{copy,font}}>{copy.ar?children:<div style={{display:'contents',direction:copy.dir,textAlign:copy.align}}>{children}</div>}</MagazineContext.Provider>;
};
export const useType=()=>{
  const {font}=useMagazine();
  return {
    wid:(text:string,size:number,weight:number,family=font)=>wid(text,size,weight,family),
    fit:(text:string,o:Parameters<typeof fit>[1])=>fit(text,o,font),
    planHeadline:(text:string,o:Parameters<typeof planHeadline>[1])=>planHeadline(text,o,font),
    planColumn:(text:string,width:number,size:number,weight:number)=>{
      for(let s=size;s>=44;s-=2){const r=wrapWords(text.split(/\s+/),s,weight,width,width,font);if(r.ok&&r.lines.length<=3)return {lines:r.lines,size:s,box:Math.round(s*1.24)};}
      return fit(text,{width,size:44,min:44,lines:3,weight,lh:1.24},font);
    },
  };
};
// ---------- type helpers ----------

export const wid = (text: string, size: number, weight: number, family = AR) => measure(text, {fontFamily: family, fontSize: size, fontWeight: weight}).width;

/** Fit one weight of text on N lines and return the lines so each can rise through its own padded mask. */
export const fit = (text: string, o: {width: number; size: number; min: number; lines: number; weight: number; lh?: number; family?: string}, font = AR) => {
  o={...o,weight:o.weight>=700?displayWeight(o.family??font,AR,o.weight):o.weight};
  const lh = displayLineHeight(o.family??font,AR,o.lh ?? 1.28);
  let r = fitOnLines(text, {fontFamily: o.family ?? font, fontSize: o.size, fontWeight: o.weight}, {maxBoxWidth: o.width, maxLines: o.lines, min: o.min, max: o.size, lineHeight: lh});
  const fits = r.fits;
  if (!fits) {
    fitWarning(text, o.width, o.min, o.lines);
    r = fitToBox(text, {fontFamily:o.family ?? font,fontSize:o.min,fontWeight:o.weight}, {maxBoxWidth:o.width,maxLines:o.lines,fontSize:o.min,lineHeight:lh});
  }
  const size = r.fontSize as number;
  return {size, lines: r.lines as string[], box: Math.round(size * lh), fits};
};

export const wrapWords = (words: string[], size: number, weight: number, first: number, rest: number, font = AR): {lines: string[]; ok: boolean} => {
  const lines: string[] = [];
  let cur = '', ok = true;
  const limit = () => (lines.length === 0 ? first : rest);
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && wid(t, size, weight, font) > limit()) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  lines.forEach((l, i) => { if (wid(l, size, weight, font) > (i === 0 ? first : rest) + 0.5) ok = false; });
  return {lines, ok};
};

// ---------- the contrast headline ----------

export type HRow = {text: string; key: boolean; drop?: string};
export type HPlan = {size: number; dropSize: number; rows: HRow[]; box: number; dropBox: number; keyWidth: number; height: number};
export const DROP_WEIGHT = 300;

/** One phrase at weight 200, the key phrase at 800, same size. The first word can sit larger in gold as a drop cap. */
export const planHeadline = (title: string, o: {drop?: boolean; max: number; min: number; lines: number; width?: number; thinWeight?: number; maxHeight?: number}, font = AR): HPlan => {
  const width = o.width ?? CW;
  const words = title.trim().split(/\s+/);
  const n = words.length;
  const dropWord = o.drop && n > 2 ? words[0] : undefined;
  const rest = dropWord ? words.slice(1) : words;
  const kc = Math.min(rest.length, n <= 3 ? 1 : n <= 6 ? 2 : 3);
  const thinW = rest.slice(0, rest.length - kc), keyW = rest.slice(rest.length - kc);
  while(thinW.length && Array.from(thinW.at(-1)!).length<=3)keyW.unshift(thinW.pop()!);
  const thinWeight = displayWeight(font,AR,o.thinWeight ?? THIN);
  let best: HPlan | null = null;
  for (let s = o.max; s >= o.min && !best; s -= 2) {
    const D = dropWord ? Math.round(s * 1.75) : 0;
    const dw = dropWord ? wid(dropWord, D, DROP_WEIGHT, font) : 0;
    const first = dropWord ? width - dw - 40 : width;
    const thin = wrapWords(thinW, s, thinWeight, first, width, font);
    if(thin.lines.some(l=>!l.includes(' ') && Array.from(l).length<=3))continue;
    const key = wrapWords(keyW, s, displayWeight(font,AR,HEAVY), width, width, font);
    if (!thin.ok || !key.ok) continue;
    const rows: HRow[] = [];
    if (dropWord) {
      if (thin.lines.length) { rows.push({text: thin.lines[0], key: false, drop: dropWord}); thin.lines.slice(1).forEach((t) => rows.push({text: t, key: false})); }
      else rows.push({text: '', key: false, drop: dropWord});
    } else thin.lines.forEach((t) => rows.push({text: t, key: false}));
    key.lines.forEach((t) => rows.push({text: t, key: true}));
    if (rows.length > o.lines) continue;
    const box = Math.round(s * displayLineHeight(font,AR,1.2)), dropBox = Math.round(D * displayLineHeight(font,AR,1.3));
    const height = rows.reduce((a, r) => a + (r.drop ? Math.max(dropBox, box) : box), 0);
    if (o.maxHeight && height > o.maxHeight) continue;
    best = {size: s, dropSize: D, rows, box, dropBox, keyWidth: wid(key.lines[key.lines.length - 1] ?? '', s, displayWeight(font,AR,HEAVY), font), height};
  }
  if (!best) {
    fitWarning(title,width,o.min,o.lines);
    const r=fit(title,{width,size:o.min,min:o.min,lines:o.lines,weight:HEAVY,lh:1.2},font);
    const rows=r.lines.map((text,i)=>({text,key:i===r.lines.length-1}));
    best={size:o.min,dropSize:0,rows,box:r.box,dropBox:0,keyWidth:wid(rows.at(-1)?.text ?? '',o.min,HEAVY,font),height:rows.length*r.box};
  }
  return best;
};

/** A line that rises 30 px with a fade inside a mask padded well above and below, so dots and hamzas are never cut. */
export const Mask: React.FC<{h: number; pad: number; k: number; rise?: number; children: React.ReactNode}> = ({h, pad, k, rise = 30, children}) =>
  <div data-event-progress={k} style={{position: 'relative', boxSizing: 'content-box', height: h, overflow: 'hidden', paddingTop: pad, paddingBottom: pad, marginTop: -pad, marginBottom: -pad,
    paddingLeft: 48, paddingRight: 48, marginLeft: -48, marginRight: -48}}>
    <div style={{height: h, transform: `translateY(${(1 - k) * rise}px)`, opacity: clamp01(k * 1.8)}}>{children}</div>
  </div>;

export const Headline: React.FC<{plan: HPlan; th: Theme; top: number; at: number; stagger?: number; marker?: boolean; markerAt?: number; right?: number; width?: number; dropColor?: string}> = (p) => {
  const {copy,font:AR}=useMagazine();
  const f = useCurrentFrame();
  const stagger = p.stagger ?? 7;
  const {plan} = p;
  let y = 0, keyIdx = 0;
  const lastKey = plan.rows.map((r) => r.key).lastIndexOf(true);
  const out: React.ReactNode[] = [];
  let markerTop = 0;
  plan.rows.forEach((r, i) => {
    const k = ramp(f, p.at + i * stagger, 20);
    const h = r.drop ? Math.max(plan.dropBox, plan.box) : plan.box;
    const pad = Math.round((r.drop ? plan.dropSize : plan.size) * 0.34);
    // The key phrase lands at weight 200 and thickens to 800 once, over 14 frames.
    const w = r.key ? mix(THIN, HEAVY, ramp(f, p.at + i * stagger + 14 + keyIdx * 2, 14, Easing.bezier(0.4, 0, 0.2, 1))) : THIN;
    if (r.key) keyIdx++;
    if (i === lastKey) markerTop = y + plan.box * 1.03;
    out.push(<Mask key={i} h={h} pad={pad} k={k}>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 40, height: h, direction: copy.dir, whiteSpace: 'nowrap'}}>
        {r.drop ? <span style={{fontFamily: AR, fontWeight: displayWeight(AR,'Alexandria',DROP_WEIGHT), fontSize: plan.dropSize, lineHeight: `${Math.round(plan.dropSize * 0.9)}px`, color: p.dropColor ?? p.th.gold}}>{r.drop}</span> : null}
        {r.text ? <span style={{fontFamily: AR, fontWeight: displayWeight(AR,'Alexandria',w), fontSize: plan.size, lineHeight: `${plan.box}px`, color: p.th.ink}}>{r.text}</span> : null}
      </div>
    </Mask>);
    y += h;
  });
  const mk = ramp(f, p.markerAt ?? p.at + 46, 22);
  return <div data-cue-at={p.at} data-event-progress={ramp(f,p.at,20)} style={{position: 'absolute', top: p.top, [copy.side]: p.right ?? W - X1, width: p.width ?? CW, direction: copy.dir, display: 'flex', flexDirection: 'column'}}>
    {p.marker ? <div style={{position: 'absolute', top: markerTop, [copy.side]: 0, width: (plan.keyWidth + 14) * mk, height: 13, background: p.th.gold, opacity: 0.96}}/> : null}
    {out}
  </div>;
};

/** Plain lines of one weight, each rising through its own mask. */
export const Lines: React.FC<{text: string; top: number; width?: number; right?: number; size: number; min: number; lines: number; weight?: number; color: string; at: number;
  stagger?: number; align?: 'right' | 'center' | 'left'; family?: string; lh?: number; shadow?: string}> = (p) => {
  const {copy,font:AR}=useMagazine();
  const {fit}=useType();
  const f = useCurrentFrame();
  let width = p.width ?? CW;
  let t = fit(p.text, {width, size: p.size, min: p.min, lines: p.lines, weight: p.weight ?? 400, lh: p.lh, family: p.family});
  const lower = p.top+t.box*t.lines.length+30>1150;
  if(lower && width>788){width=788;t=fit(p.text,{width,size:p.size,min:p.min,lines:p.lines,weight:p.weight??400,lh:p.lh,family:p.family});}
  return <div style={{position: 'absolute', top: p.top, [copy.side]: (p.right ?? W - X1)+railInset(p.top,t.box*t.lines.length+30,copy.side), width, direction: copy.dir, display: 'flex', flexDirection: 'column'}}>
    {t.lines.map((line, i) => <Mask key={i} h={t.box} pad={Math.round(t.size * 0.34)} k={ramp(f, p.at + i * (p.stagger ?? 7), 20)}>
      <div style={{fontFamily: p.family ?? AR, fontWeight: (p.weight??400)>=700?displayWeight(p.family??AR,'Alexandria',p.weight??400):p.weight??400, fontSize: t.size, lineHeight: `${t.box}px`, height: t.box, color: p.color, whiteSpace: 'nowrap',
        textAlign: p.align ?? copy.align, textShadow: p.shadow}}>{line}</div>
    </Mask>)}
  </div>;
};

// ---------- page furniture ----------

export const Diamond: React.FC<{size?: number; color: string; style?: React.CSSProperties}> = ({size = 11, color, style}) =>
  <div style={{width: size, height: size, background: color, transform: 'rotate(45deg)', flex: 'none', ...style}}/>;

/** Gold hairline that draws from the right. */
export const Rule: React.FC<{top: number; width: number; at: number; dur?: number; color: string; h?: number; right?: number}> = ({top, width, at, dur = 22, color, h = 2, right}) => {
  const f = useCurrentFrame();
  const {copy}=useMagazine();
  return <div style={{position: 'absolute', top, [copy.side]: right ?? W - X1, width: width * ramp(f, at, dur), height: h, background: color}}/>;
};

export const Ground: React.FC<{th: Theme; height?: number; surface?: 'page' | 'object'}> = ({th, height = 1920, surface = 'page'}) => {
  const probe = useProbe();
  if (probe !== null && surface === 'page') return <div style={{position: 'absolute', left: 0, top: 0, width: W, height, overflow: 'hidden', background: probe}}/>;
  const cream = th.name === 'cream';
  return <div style={{position: 'absolute', left: 0, top: 0, width: W, height, overflow: 'hidden', background: th.ground}}>
    {cream
      ? <>
        <AbsoluteFill style={{background: 'radial-gradient(130% 75% at 50% 38%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 60%)'}}/>
        <AbsoluteFill style={{background: 'radial-gradient(120% 90% at 50% 50%, rgba(0,0,0,0) 58%, rgba(112,82,34,0.17) 100%)'}}/>
        <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(86,60,20,0.13) 0%, rgba(86,60,20,0.04) 3.5%, rgba(0,0,0,0) 9%)'}}/>
      </>
      : <>
        <AbsoluteFill style={{background: 'radial-gradient(85% 48% at 100% 0%, rgba(140,178,222,0.14) 0%, rgba(140,178,222,0) 70%)'}}/>
        <AbsoluteFill style={{background: 'radial-gradient(100% 60% at 0% 100%, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0) 70%)'}}/>
      </>}
    <svg width={W} height={height} style={{position: 'absolute', inset: 0, opacity: cream ? 0.17 : 0.085, mixBlendMode: cream ? 'multiply' : 'overlay'}}>
      <filter id={`grain-${th.name}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="11"/><feColorMatrix type="saturate" values="0"/></filter>
      <rect width={W} height={height} filter={`url(#grain-${th.name})`}/>
    </svg>
  </div>;
};

/** Top folio rule with the issue and section labels, and a bottom hairline with the page number. */
export const Furniture: React.FC<{th: Theme; section: string; page: string; bottom?: boolean}> = ({th, section, page, bottom = true}) => {
  const {copy,font:AR}=useMagazine();
  const f = useCurrentFrame();
  const r = ramp(f, 0, 22), t = ramp(f, 8, 18), b = ramp(f, 14, 24);
  const label: React.CSSProperties = {position: 'absolute', top: 286, fontFamily: AR, fontWeight: 400, fontSize: 30, lineHeight: '34px', color: th.dim, opacity: t, whiteSpace: 'nowrap', direction: copy.dir};
  return <>
    <div style={{position: 'absolute', top: 270, [copy.side]: X0, width: CW * r, height: 2, background: th.gold}}/>
    <div style={{...label, [copy.side]: X0}}><DesignText>{magazineCopy('issue',copy)}</DesignText></div>
    <div style={{...label, [copy.opposite]: X0}}><DesignText>{section}</DesignText></div>
    {bottom ? <>
      <div style={{position: 'absolute', top: 1424, right: W - 853, width: (853 - X0) * b, height: 1.5, background: th.gold, opacity: 0.8}}/>
      <div style={{position: 'absolute', top: 1436, [copy.side]: W - 853, fontFamily: SERIF, fontWeight: 400, fontSize: 34, lineHeight: '34px', letterSpacing: 1, color: th.gold, opacity: t, direction: 'ltr'}}><DesignText>{page}</DesignText></div>
    </> : null}
  </>;
};

export const Page: React.FC<{th: Theme; section: string; page: string; bottom?: boolean; children?: React.ReactNode}> = ({th, section, page, bottom, children}) =>
  <AbsoluteFill><Ground th={th}/><FittedContent native="Alexandria">{children}</FittedContent><Furniture th={th} section={section} page={page} bottom={bottom}/></AbsoluteFill>;

/** Gold small-caps style kicker: diamond, label and a short hairline. */
export const Kicker: React.FC<{th: Theme; text: string; top: number; at: number; right?: number}> = ({th, text, top, at, right}) => {
  const {copy,font:AR}=useMagazine();
  const f = useCurrentFrame();
  const k = ramp(f, at, 18), line = ramp(f, at + 4, 22);
  return <div style={{position: 'absolute', top, [copy.side]: right ?? W - X1, display: 'flex', alignItems: 'center', gap: 16, direction: copy.dir, opacity: clamp01(k * 1.6), transform: `translateY(${(1 - k) * 18}px)`}}>
    <Diamond color={th.gold} size={12}/>
    <div style={{fontFamily: AR, fontWeight: 600, fontSize: 32, lineHeight: '44px', color: th.gold, whiteSpace: 'nowrap'}}>{text}</div>
    <div style={{width: 230 * line, height: 1.5, background: th.gold, opacity: 0.8}}/>
  </div>;
};

/** Takeover caption: cream (navy on a cream page) Alexandria 700 over a thin gold rule, centred in x 65 to 853. No pill. */
export const MagazineCaption: React.FC<{y: number; text: string; th?: Theme; shadow?: boolean; rule?: boolean}> = ({y, text, th = NAVY, shadow, rule = true}) => {
  const {copy,font:AR}=useMagazine();
  const {fit,wid}=useType();
  const multiline = wid(text, 34, 700) > 768;
  const t = multiline ? (() => {
    for (let size = 46; size >= 34; size--) {
      const lines = balancedLines(text, size, 700, 768, AR);
      if (lines.length <= 2 && lines.every(line => wid(line, size, 700) <= 768)) return {size, lines, box: Math.round(size * displayLineHeight(AR, 'Alexandria', 1.28))};
    }
    fitWarning(text, 768, 34, 2);
    return {size: 34, lines: balancedLines(text, 34, 700, 768, AR), box: Math.round(34 * displayLineHeight(AR, 'Alexandria', 1.28))};
  })() : fit(text, {width: 788 - 20, size: 46, min: 34, lines: 1, weight: 700});
  const w = Math.max(...t.lines.map(line => wid(line, t.size, 700)));
  return <div style={{position: 'absolute', top: y, left: X0, width: 853 - X0, display: 'flex', flexDirection: 'column', alignItems: 'center', direction: copy.dir}}>
    {rule ? <div style={{width: Math.min(788, w + 80), height: 1.5, background: th.gold}}/> : null}
    <div style={{marginTop: rule ? 14 : 22, fontFamily: AR, fontWeight: 700, fontSize: t.size, lineHeight: `${t.box}px`, color: th.ink, whiteSpace: 'nowrap',
      textShadow: shadow ? '0 2px 18px rgba(0,0,0,0.65)' : undefined, ...(multiline ? {maxWidth:768,overflow:'hidden'} : {})}}>{multiline ? t.lines.map((line,i)=><div key={i}>{line}</div>) : text}</div>
  </div>;
};

// ---------- small drawn objects ----------

/** A thin gold ring that draws, with a check or a cross drawn inside it. */
export const MarkRing: React.FC<{size: number; ring: number; mark: number; kind: 'check' | 'cross'; ringColor: string; markColor: string; fillColor?: string; fill?: number}> =
  ({size, ring, mark, kind, ringColor, markColor, fillColor, fill = 0}) => {
    const u = 100 / size;
    return <svg width={size} height={size} viewBox="0 0 100 100" style={{overflow: 'visible'}}>
      {fillColor ? <circle cx="50" cy="50" r="46" fill={fillColor} opacity={0.14 * fill}/> : null}
      <circle cx="50" cy="50" r="48" fill="none" stroke={ringColor} strokeWidth={2.2 * u} transform="rotate(-90 50 50)" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ring}/>
      {kind === 'check'
        ? <path d="M27 52 L44 68 L74 34" fill="none" stroke={markColor} strokeWidth={5 * u} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - mark}/>
        : <>
          <path d="M34 34 L66 66" fill="none" stroke={markColor} strokeWidth={5 * u} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - clamp01(mark * 2)}/>
          <path d="M66 34 L34 66" fill="none" stroke={markColor} strokeWidth={5 * u} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - clamp01(mark * 2 - 1)}/>
        </>}
    </svg>;
  };

/** A giant typographic quote mark as a graphic object: Source Serif 4 curly quotes in gold (open = U+201C, close = U+201D). */
export const QuoteGlyph: React.FC<{open: boolean; size: number; color: string; p: number; style?: React.CSSProperties}> = ({open, size, color, p, style}) =>
  <div style={{position: 'absolute', fontFamily: SERIF, fontWeight: 400, fontSize: size, lineHeight: `${size}px`, color, direction: 'ltr', whiteSpace: 'nowrap',
    opacity: clamp01(p * 1.6), transform: `translateY(${(1 - p) * 24}px)`, ...style}}>{open ? '“' : '”'}</div>;


/** Keeps the full animated quotation block at least 40 px above the measured head. */
export const statementPlacement=(height:number,head?:{y:number}|null)=>{
  const bottom=418+height+92+30;
  if(!head)return {transform:undefined,bottom,visible:true};
  const limit=head.y-40,shift=Math.min(0,limit-bottom);
  if(314+shift>=250)return {transform:shift===0?undefined:`translateY(${shift}px)`,bottom:bottom+shift,visible:true};
  const scale=Math.min(1,Math.max(0,(limit-250)/(bottom-250)));
  if(scale<=0){fitWarning('No safe space above presenter',CW,76,3);return {transform:undefined,bottom:250,visible:false};}
  return {transform:'scale('+scale+')',bottom:250+(bottom-250)*scale,visible:true};
};

Object.assign(Ground,{designBackground:true});
Object.assign(Furniture,{designBackground:true});
