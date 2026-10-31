// magazine-interview proof-screen: the page is a printed figure plate, a cream sheet with a thin gold frame on a navy page.
// Blocks are typeset, not boxed. When the camera lands, a gold ring draws round the focus block and a leader runs out to a pull-quote.
import React from 'react';
import {Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {useProbe} from '../../../core/safe';
import type {FamilyDesignProps} from '../../family-designs';
import type {ProofBlock, ProofScreenData} from '../../../creative-kit/proof-screen/schema';
import {proofCameraAt, proofFocusFrame} from '../../../creative-kit/proof-screen/timing';
import {displayWeight} from '../../../style-kit/design-safety';
import {CREAM, NAVY, HEAVY, MONO, THIN, W, Diamond, Ground, MagazineScope, MarkRing, QuoteGlyph, clamp01, ramp, useMagazine, useType} from './kit';
import {Header, Settled, balancedLines, decimalsOf, useFormat, useHeaderPlan} from './family-parts';

// plate geometry, in canvas pixels: a 960 px sheet, a gold frame 20 px inside it, content 76 px from its edges; the pull-quote panel overlaps its lower edge by OVER
const PW = 950, PL = 65, PR = PL + PW, FI = 20, CP = 76, CWP = PW - 2 * CP;
const TOP = 300, BOTTOM = 1150, OVER = 44, RING = 18, PADY = 18, EDGE = 12;
const TEXT_WEIGHT = 300;
const sheet = CREAM, page = NAVY;
/** Secondary ink: warm, so dimmed blocks stay readable instead of going cool grey. */
const muted = '#5B5244';

const smooth = (t: number) => { const k = clamp01(t); return k * k * (3 - 2 * k); };

type Block<K extends ProofBlock['kind']> = Extract<ProofBlock, {kind: K}>;
type Typeset = {size: number; lines: string[]; box: number};
type Placed = {i: number; x: number; y: number; w: number; h: number; bx: number; bw: number; col: 0 | 1 | 2; node: React.ReactNode};
type Ctx = {font: string; heavy: number; wid: (text: string, size: number, weight: number, family?: string) => number; value: (n: number) => string};

// ---------- views: each reads the scene frame itself, so the measured layout can be built once ----------

const Rise: React.FC<{at: number; dist?: number; children?: React.ReactNode}> = ({at, dist = 22, children}) => {
  const k = ramp(useCurrentFrame(), at, 22);
  return <div style={{opacity: clamp01(k * 1.7), transform: `translateY(${(1 - k) * dist}px)`}}>{children}</div>;
};

const LineStack: React.FC<{t: Typeset; weight: number; color: string; at: number; align?: 'left' | 'right'}> = ({t, weight, color, at, align}) => {
  const {copy, font} = useMagazine();
  return <>{t.lines.map((line, j) => <Rise key={j} at={at + j * 4}>
    <div style={{height: t.box, lineHeight: `${t.box}px`, fontFamily: font, fontWeight: weight, fontSize: t.size, color, whiteSpace: 'nowrap', direction: copy.dir, textAlign: align ?? copy.align}}>{line}</div>
  </Rise>)}</>;
};

const HeadingView: React.FC<{t: Typeset; at: number}> = ({t, at}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  return <>
    <div style={{height: 4, width: 64 * ramp(f, at, 22), background: sheet.gold, marginBottom: 18, [copy.ar ? 'marginLeft' : 'marginRight']: 'auto'}}/>
    <LineStack t={t} weight={displayWeight(font, 'Alexandria', HEAVY)} color={sheet.ink} at={at}/>
  </>;
};

/** A transcript paragraph: a gold diamond marks the first voice, a short gold rule the second. */
const ParagraphView: React.FC<{t: Typeset; weight: number; at: number; align?: 'left' | 'right'; mark?: 'diamond' | 'dash'}> = ({t, weight, at, align, mark}) => {
  const f = useCurrentFrame();
  const {copy} = useMagazine();
  const side = align ?? copy.align, k = ramp(f, at, 20);
  return <div style={{position: 'relative'}}>
    {mark === 'diamond' ? <Diamond size={14} color={sheet.gold} style={{position: 'absolute', top: t.box / 2 - 7, [side]: -34, opacity: k}}/> : null}
    {mark === 'dash' ? <div style={{position: 'absolute', top: t.box / 2 - 1, [side]: -38, width: 26 * k, height: 2.5, background: sheet.gold}}/> : null}
    <LineStack t={t} weight={weight} color={sheet.ink} at={at} align={align}/>
  </div>;
};

const RowView: React.FC<{t: Typeset; value: string | null; at: number}> = ({t, value, at}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const last = t.lines.length - 1;
  return <>
    {t.lines.slice(0, last).map((line, j) => <LineStack key={j} t={{...t, lines: [line]}} weight={600} color={sheet.ink} at={at + j * 4}/>)}
    <Rise at={at + last * 4}>
      <div style={{display: 'flex', alignItems: 'baseline', direction: copy.dir, height: t.box}}>
        {value ? null : <Diamond size={12} color={sheet.gold} style={{alignSelf: 'center', marginInlineEnd: 20}}/>}
        <span style={{fontFamily: font, fontWeight: 600, fontSize: t.size, lineHeight: `${t.box}px`, color: sheet.ink, whiteSpace: 'nowrap'}}>{t.lines[last]}</span>
        {value ? <>
          <div style={{flex: 1, alignSelf: 'flex-end', marginBottom: t.box * 0.27, marginInline: 18, height: 0, borderBottom: `4px dotted ${sheet.gold}`, clipPath: `inset(0 ${(1 - ramp(f, at + 8, 26)) * 100}% 0 0)`}}/>
          <span style={{fontFamily: font, fontWeight: THIN + 80, fontSize: 52, lineHeight: `${t.box}px`, color: sheet.ink, direction: 'ltr', whiteSpace: 'nowrap'}}>{value}</span>
        </> : null}
      </div>
    </Rise>
  </>;
};

const StatView: React.FC<{value: string; S: number; nw: number; label: Typeset | null; cell: boolean; at: number}> = ({value, S, nw, label, cell, at}) => {
  const {copy, font} = useMagazine();
  return <Rise at={at}>
    <div style={{display: 'flex', flexDirection: cell ? 'column' : 'row', alignItems: cell ? 'stretch' : 'center', gap: cell ? 10 : 40, direction: copy.dir}}>
      <div style={{height: Math.round(S * 0.82), flex: 'none', width: cell ? undefined : nw, direction: 'ltr', textAlign: copy.align, fontFamily: font, fontWeight: THIN, fontSize: S, lineHeight: `${S}px`, color: sheet.ink, whiteSpace: 'nowrap'}}>
        <div style={{marginTop: -S * 0.1}}>{value}</div>
      </div>
      {label ? <div style={{flex: 1}}>{label.lines.map((line, j) => <div key={j} style={{height: label.box, lineHeight: `${label.box}px`, fontFamily: font, fontWeight: 400, fontSize: label.size, color: muted, whiteSpace: 'nowrap', textAlign: copy.align}}>{line}</div>)}</div> : null}
    </div>
  </Rise>;
};

const ButtonView: React.FC<{t: Typeset; w: number; h: number; at: number}> = ({t, w, h, at}) => {
  const f = useCurrentFrame();
  const {copy, font} = useMagazine();
  const frame = ramp(f, at + 2, 26);
  return <Rise at={at}>
    <div style={{position: 'relative', width: w, height: h}}>
      <svg width={w} height={h} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <rect x={1.5} y={1.5} width={w - 3} height={h - 3} fill="none" stroke={sheet.gold} strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frame}/>
        <rect x={8} y={8} width={w - 16} height={h - 16} fill="none" stroke={sheet.gold} strokeOpacity={0.45} strokeWidth={1} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frame}/>
      </svg>
      <Diamond size={14} color={sheet.gold} style={{position: 'absolute', [copy.side]: 30, top: h / 2 - 7}}/>
      <div style={{position: 'absolute', top: 18, [copy.side]: 70, direction: copy.dir}}>
        {t.lines.map((line, j) => <div key={j} style={{height: t.box, lineHeight: `${t.box}px`, fontFamily: font, fontWeight: displayWeight(font, 'Alexandria', HEAVY), fontSize: t.size, color: sheet.ink, whiteSpace: 'nowrap', textAlign: copy.align}}>{line}</div>)}
      </div>
    </div>
  </Rise>;
};

const ImageView: React.FC<{src: string; ih: number; caption: Typeset | null; at: number}> = ({src, ih, caption, at}) => {
  const {copy, font} = useMagazine();
  return <Rise at={at}>
    <div style={{height: ih, padding: 10, boxSizing: 'border-box', border: `1.5px solid ${sheet.gold}`}}>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block'}}/>
    </div>
    {caption ? <div style={{marginTop: 14}}>{caption.lines.map((line, j) => <div key={j} style={{height: caption.box, lineHeight: `${caption.box}px`, fontFamily: font, fontWeight: 400, fontSize: caption.size, color: muted, whiteSpace: 'nowrap', textAlign: copy.align, direction: copy.dir}}>{line}</div>)}</div> : null}
  </Rise>;
};

// ---------- measuring: every block is typeset once for a scale K, and K is the largest that fits the plate ----------

const sizes = (base: number, K: number, lo: number, hi: number, step = 2) => {
  const top = Math.max(lo, Math.min(hi, Math.round(base * K / step) * step)), out: number[] = [];
  for (let s = top; s >= lo; s -= step) out.push(s);
  return out;
};

const layout = (d: ProofScreenData, c: Ctx, K: number): {items: Placed[]; rules: {x?: number; y: number; h?: number; w?: number}[]; bodyH: number} => {
  const {wid, value, font, heavy} = c;
  const setLines = (text: string, list: number[], weight: number, width: number, maxLines: number): Typeset => {
    const sets = list.map(size => ({size, lines: balancedLines(text, size, weight, width, font)}));
    const fewest = Math.min(...sets.map(s => s.lines.length));
    const pick = sets.find(s => s.lines.length === fewest && s.lines.length <= maxLines) ?? sets[sets.length - 1];
    return {...pick, box: Math.round(pick.size * 1.34)};
  };
  const lineWidth = (t: Typeset, weight: number) => Math.max(0, ...t.lines.map(l => wid(l, t.size, weight)));
  const gap = Math.max(22, Math.min(40, Math.round(32 * K)));
  const stats = d.blocks.filter((b): b is Block<'stat'> => b.kind === 'stat');
  const COLW = (CWP - 56) / 2;
  const fitStat = (width: number, max: number) => {
    let S = max;
    while (S > 64 && Math.max(0, ...stats.map(b => wid(value(b.value), S, THIN))) > width) S -= 4;
    return S;
  };
  const SD = fitStat(COLW, Math.min(156, Math.round(132 * K))), SW = fitStat(CWP * 0.5, Math.min(180, Math.round(150 * K)));
  const at = (i: number) => 6 + i * 4;
  const paint = (b: ProofBlock, i: number, mode: 'web' | 'chat' | 'cell', width: number): Pick<Placed, 'w' | 'h' | 'node'> & {bleed?: boolean} => {
    switch (b.kind) {
      case 'heading': {
        const t = setLines(b.text, sizes(68, K, 60, 88, 4), heavy, width, 3);
        return {w: lineWidth(t, heavy), h: 22 + t.box * t.lines.length, node: <HeadingView t={t} at={at(i)}/>};
      }
      case 'text': {
        const chat = mode === 'chat', weight = chat ? (i % 2 ? THIN + 40 : 600) : TEXT_WEIGHT;
        const t = setLines(b.text, chat ? sizes(44, K, 38, 58) : sizes(40, K, 34, 52), weight, width, 5);
        return {w: lineWidth(t, weight), h: t.box * t.lines.length, node: <ParagraphView t={t} weight={weight} at={at(i)} align={chat && i % 2 ? 'left' : undefined} mark={chat ? (i % 2 ? 'dash' : 'diamond') : undefined}/>, bleed: chat};
      }
      case 'row': {
        const v = b.value === undefined ? null : value(b.value);
        const t = setLines(b.text, sizes(44, K, 34, 54), 600, width - (v ? wid(v, 52, THIN + 80) + 100 : 40), 3);
        return {w: width, h: t.box * t.lines.length, node: <RowView t={t} value={v} at={at(i)}/>};
      }
      case 'stat': {
        const cell = mode === 'cell', S = cell ? SD : SW, v = value(b.value), nw = wid(v, S, THIN), nh = Math.round(S * 0.82);
        const label = b.text ? setLines(b.text, sizes(38, K, 34, 46), 400, cell ? width : width - nw - 40, 3) : null;
        const lh = label ? label.box * label.lines.length : 0;
        return {w: cell ? Math.max(nw, label ? lineWidth(label, 400) : 0) : width, h: cell ? nh + (label ? 10 + lh : 0) : Math.max(nh, lh), node: <StatView value={v} S={S} nw={nw} label={label} cell={cell} at={at(i)}/>};
      }
      case 'button': {
        const t = setLines(b.text, sizes(46, K, 38, 58), heavy, width - 2 * 44 - 40, 2);
        const w = Math.min(width, lineWidth(t, heavy) + 2 * 44 + 40), h = t.box * t.lines.length + 36;
        return {w, h, node: <ButtonView t={t} w={w} h={h} at={at(i)}/>};
      }
      default: {
        const caption = b.text ? setLines(b.text, [36, 34], 400, width, 2) : null, ih = Math.max(260, Math.min(420, Math.round(340 * K)));
        return {w: width, h: ih + (caption ? 14 + caption.box * caption.lines.length : 0), node: <ImageView src={b.src} ih={ih} caption={caption} at={at(i)}/>};
      }
    }
  };
  const items: Placed[] = [], rules: {x?: number; y: number; h?: number; w?: number}[] = [];
  let y = PADY;
  const add = (i: number, x: number, p: ReturnType<typeof paint>, col: 0 | 1 | 2, at0 = y) => {
    const margin = p.bleed ? 34 : 0;
    items.push({i, x, y: at0, w: p.w, h: p.h, bx: p.bleed && i % 2 === 0 ? x - margin : x, bw: p.w + margin, col, node: p.node});
  };
  if (d.page === 'dashboard') {
    for (let i = 0; i < d.blocks.length;) {
      const b = d.blocks[i], nb = d.blocks[i + 1];
      if (b.kind === 'stat') {
        const a = paint(b, i, 'cell', COLW), n = nb && nb.kind === 'stat' ? paint(nb, i + 1, 'cell', COLW) : null;
        const h = Math.max(a.h, n ? n.h : 0);
        add(i, 0, a, 1);
        if (n) { add(i + 1, COLW + 56, n, 2); rules.push({x: COLW + 28, y: y - 8, h: h + 16}); }
        y += h + gap;
        rules.push({y: y - gap / 2, w: CWP});
        i += n ? 2 : 1;
      } else {
        const p = paint(b, i, 'web', CWP);
        add(i, 0, p, 0);
        y += p.h + gap;
        i += 1;
      }
    }
    if (rules.length && rules[rules.length - 1].w) rules.pop();
  } else {
    d.blocks.forEach((b, i) => {
      const chat = d.page === 'chat', width = chat ? Math.round(CWP * 0.8) : CWP;
      const p = paint(b, i, chat ? 'chat' : 'web', width);
      add(i, chat ? (i % 2 ? CWP - p.w - 14 : 14) : 0, p, 0);
      y += p.h + gap;
    });
  }
  return {items, rules, bodyH: y - gap + PADY};
};

// ---------- the plate ----------

const Plate: React.FC<{d: ProofScreenData}> = ({d}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const probe = useProbe();
  const {copy, font} = useMagazine();
  const {wid} = useType();
  const fmt = useFormat();
  const heavy = displayWeight(font, 'Alexandria', HEAVY);
  const th = sheet;
  const focus = d.focus ?? 0;
  const value = (n: number) => fmt(n, decimalsOf(n));

  // chrome: the title in heavy type, the url in thin mono, on one row when both fit
  const setTitle = (text: string) => {
    const size = [54, 48, 44, 40].find(s => balancedLines(text, s, heavy, CWP, font).length <= 2) ?? 40;
    return {size, lines: balancedLines(text, size, heavy, CWP, font), box: Math.round(size * 1.34)};
  };
  const title = d.title ? setTitle(d.title) : null;
  // a long url breaks after a slash or a dash rather than shrinking out of sight
  const url = d.url ? ((): {size: number; lines: string[]} => {
    const whole = [28, 26, 24, 22, 20].find(sz => wid(d.url!, sz, 400, MONO) <= CWP);
    if (whole) return {size: whole, lines: [d.url!]};
    const lines: string[] = [];
    let cur = '';
    for (const part of d.url!.split(/(?<=[/?&=#-])/)) {
      if (cur && wid(cur + part, 22, 400, MONO) > CWP) { lines.push(cur); cur = part; } else cur += part;
    }
    return {size: 22, lines: [...lines, cur]};
  })() : null;
  const titleW = title ? Math.max(...title.lines.map(l => wid(l, title.size, heavy))) : 0;
  const oneRow = !!title && !!url && title.lines.length === 1 && url.lines.length === 1 && titleW + wid(url.lines[0], url.size, 400, MONO) + 60 <= CWP;
  const chromeH = (title ? title.box * title.lines.length : 0) + (url && !oneRow ? (title ? 8 : 0) + 36 * url.lines.length : 0);
  const bodyTop = FI + 24 + chromeH + (chromeH ? 26 : 8);

  // the pull-quote repeats the focus block's own words; a stat or row puts its figure in heavy type
  const fblock = d.blocks[Math.min(focus, d.blocks.length - 1)];
  const quote = fblock.kind === 'image' ? {text: fblock.text, split: undefined}
    : fblock.kind === 'stat' || fblock.kind === 'row'
      ? fblock.value !== undefined && fblock.text ? {text: `${fblock.text} ${value(fblock.value)}`, split: {thin: fblock.text, key: value(fblock.value)}} : {text: fblock.text ?? (fblock.value !== undefined ? value(fblock.value) : undefined), split: undefined}
      : {text: fblock.text, split: undefined};
  // the pull-quote sits on a navy caption panel that overlaps the plate's lower edge, text column ending at x 872
  const PANEL_L = PL + 20, PANEL_R = PR - 20, QW = PANEL_R - 128 - (PANEL_L + 28);
  const qPlan = useHeaderPlan(quote.text, QW, {max: 88, min: 56, lines: 3, maxHeight: 170, split: quote.split});
  const panelH = qPlan ? 22 + qPlan.height + 34 : 0;
  const plateMax = BOTTOM - TOP + (qPlan ? OVER - panelH : 0);
  const bottomPad = qPlan ? OVER + 6 : FI + EDGE;
  const viewMax = plateMax - bodyTop - bottomPad;

  const key = JSON.stringify([d.page, d.blocks, font, value(1234.5)]);
  const laid = React.useMemo(() => {
    const ctx: Ctx = {font, heavy, wid, value};
    let last = layout(d, ctx, 0.88);
    for (const K of [1.3, 1.22, 1.15, 1.08, 1, 0.94]) {
      const l = layout(d, ctx, K);
      if (l.bodyH <= viewMax) { last = l; break; }
    }
    return last;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, viewMax]);
  const {items, rules, bodyH} = laid;
  const plateH = Math.min(plateMax, bodyTop + bodyH + bottomPad);
  const viewH = plateH - bodyTop - bottomPad;
  const maxScroll = Math.max(0, bodyH - viewH);
  const plateTop = TOP;

  // where the camera settles: the ring fits the window, and no next block shows as a sliver under it
  const fb = items.find(it => it.i === focus) ?? items[0];
  const ringTop = fb.y - RING + 4, ringBottom = fb.y + fb.h + RING - 4;
  const below = items.filter(it => it.i !== fb.i && it.y >= fb.y + fb.h && (it.col === 0 || fb.col === 0 || it.col === fb.col));
  const nextTop = below.length ? Math.min(...below.map(it => it.y)) : undefined;
  // the window's top edge rests in the gap above a block, the ring sits fully inside, and a following block never shows as a sliver
  const lowest = ringBottom + 30 - viewH;
  const sliver = (s: number) => nextTop !== undefined && s + viewH - nextTop > 0 && s + viewH - nextTop < 90;
  const stops = [...new Set([0, maxScroll, ...items.map(it => Math.max(0, Math.min(maxScroll, it.y - 6)))])].sort((a, b) => a - b);
  const target = stops.find(s => s >= lowest - 0.5 && ringTop - s >= 20 && !sliver(s)) ?? stops.find(s => s >= lowest - 0.5) ?? maxScroll;
  const cam = proofCameraAt(f, fps, d.path, probe !== null);
  const scroll = target * (1 - (1 - clamp01(f / proofFocusFrame(fps))) ** 3);
  const frameK = ramp(f, 2, 30), hl = ramp(f, 20, 30), tint = ramp(f, 20, 24), buildK = ramp(f, 8, 26);

  // canvas coordinates of the ring and the leader
  const startX = (off: number) => (copy.ar ? PR - CP - off : PL + CP + off);
  const edgeStart = startX(fb.bx - RING), edgeEnd = startX(fb.bx + fb.bw + RING);
  const ringW = fb.bw + 2 * RING, ringH = ringBottom - ringTop;
  const ringL = Math.min(edgeStart, edgeEnd);
  const ringCY = plateTop + bodyTop + (ringTop + ringBottom) / 2 - target;
  const ringBottomY = plateTop + bodyTop + ringBottom - target;
  const qTop = plateTop + plateH - OVER;
  const nearStart = fb.bx + fb.bw / 2 < CWP / 2;
  const gutterStart = copy.ar ? PR - FI - 30 : PL + FI + 30, gutterEnd = copy.ar ? PL + FI + 30 : PR - FI - 30;
  const lane = nearStart ? gutterStart : gutterEnd, linkX = nearStart ? edgeStart : edgeEnd;
  const dropX = copy.ar ? edgeStart - 56 : edgeStart + 56;
  const byLane = below.length > 0;
  const path = byLane ? `M ${linkX} ${ringCY} L ${lane} ${ringCY} L ${lane} ${qTop}` : `M ${dropX} ${ringBottomY} L ${dropX} ${qTop}`;
  const pathLen = byLane ? Math.abs(lane - linkX) + (qTop - ringCY) : qTop - ringBottomY;
  const junctionX = byLane ? lane : dropX;
  const lk = ramp(f, 46, 30), hold = ramp(f, 50, 20);

  return <div style={{position: 'absolute', inset: 0, perspective: 2600}}>
    <div style={{position: 'absolute', inset: 0, transform: `translate(${cam.x}px,${cam.y}px) rotateX(${cam.rotateX}deg) rotateY(${cam.rotateY}deg) scale(${cam.scale / (d.path === 'focus' ? 1.04 : 1)})`, transformOrigin: `${PL + PW / 2}px ${ringCY}px`}}>
      {/* the sheet */}
      <div style={{position: 'absolute', left: PL, top: plateTop, width: PW, height: plateH, background: th.ground, boxShadow: '0 34px 70px rgba(0,0,0,0.55)', opacity: clamp01(ramp(f, 0, 14) * 1.6)}}>
        <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}><div style={{position: 'absolute', left: -PL, top: -plateTop}}><Ground th={th} surface="object"/></div></div>
        <svg width={PW} height={plateH} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <rect x={FI} y={FI} width={PW - 2 * FI} height={plateH - 2 * FI} fill="none" stroke={th.gold} strokeWidth={1.8} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frameK}/>
          <rect x={FI + 8} y={FI + 8} width={PW - 2 * FI - 16} height={plateH - 2 * FI - 16} fill="none" stroke={th.gold} strokeOpacity={0.35} strokeWidth={1} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frameK}/>
        </svg>
        {[[FI, FI], [PW - FI, FI], [FI, plateH - FI], [PW - FI, plateH - FI]].map(([x, yy], k) =>
          <Diamond key={k} size={13} color={th.gold} style={{position: 'absolute', left: x - 6.5, top: yy - 6.5, opacity: frameK}}/>)}
        <div style={{position: 'absolute', top: FI + 24, [copy.side]: CP, width: CWP, direction: copy.dir}}>
          {title && oneRow
            ? <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: title.box}}>
              <div style={{width: titleW}}><LineStack t={title} weight={heavy} color={th.ink} at={4}/></div>
              <div style={{fontFamily: MONO, fontWeight: 400, fontSize: url!.size, color: muted, direction: 'ltr', whiteSpace: 'nowrap', opacity: ramp(f, 12, 16)}}>{d.url}</div>
            </div>
            : <>
              {title ? <LineStack t={title} weight={heavy} color={th.ink} at={4}/> : null}
              {url ? <div style={{marginTop: title ? 8 : 0, opacity: ramp(f, 12, 16)}}>{url.lines.map((line, j) => <div key={j} style={{height: 36, lineHeight: '36px', fontFamily: MONO, fontWeight: 400, fontSize: url.size, letterSpacing: 0.4, color: muted, direction: 'ltr', textAlign: copy.align, whiteSpace: 'nowrap'}}>{line}</div>)}</div> : null}
            </>}
        </div>
        {chromeH ? <div style={{position: 'absolute', top: bodyTop - 16, [copy.side]: CP, width: CWP * ramp(f, 8, 26), height: 1.5, background: th.gold}}/> : null}
        {/* the typeset body, panned by the camera */}
        <div style={{position: 'absolute', top: bodyTop, left: 0, width: PW, height: viewH, overflow: 'hidden'}}>
          <div style={{position: 'absolute', left: 0, top: -scroll, width: PW}}>
            {rules.map((r, k) => <div key={k} style={{position: 'absolute', [copy.side]: CP + (r.x ?? 0), top: r.y, width: r.w ?? 1.5, height: r.h ?? 1.5, background: th.gold, opacity: 0.4 * ramp(f, 10 + k * 4, 24)}}/>)}
            <div style={{position: 'absolute', top: ringTop, [copy.side]: CP + fb.bx - RING, width: ringW, height: ringH, borderRadius: 18, background: th.gold, opacity: 0.13 * tint}}/>
            {items.map(it => {
              // a block that the window would cut fades out whole instead of showing as a ghost line
              const cut = it.i === focus ? 1 : (1 - smooth((scroll - it.y) / 24)) * (1 - smooth((it.y + it.h - scroll - viewH - 6) / 36));
              return <div key={it.i} data-proof-block={it.i} data-proof-focus={it.i === focus ? 'true' : undefined}
              style={{position: 'absolute', top: it.y, [copy.side]: CP + it.x, width: it.w, opacity: cut * (it.i === focus ? 1 : 1 - 0.4 * ramp(f, 24, 24)), filter: it.i === focus ? undefined : `sepia(${0.45 * ramp(f, 24, 24)})`, direction: copy.dir}}>{it.node}</div>;
            })}
            <svg width={PW} height={bodyH + 80} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
              <rect x={ringL - PL} y={ringTop} width={ringW} height={ringH} rx={18} fill="none" stroke={th.gold} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - hl}/>
            </svg>
          </div>
        </div>
      </div>
      {/* the proof badge on the ring, the leader and the pull-quote */}
      <div style={{position: 'absolute', left: (copy.ar ? ringL : ringL + ringW) - 30, top: plateTop + bodyTop + ringTop - target - 30, width: 60, height: 60, borderRadius: 30, background: th.ground, opacity: hold * buildK, border: `1.5px solid ${th.gold}`}}>
        <div style={{position: 'absolute', inset: 4}}><MarkRing size={52} ring={hold} mark={ramp(f, 56, 16)} kind="check" ringColor={th.gold} markColor={th.gold}/></div>
      </div>
      {qPlan ? <>
        <svg width={W} height={1920} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}}>
          <path d={path} fill="none" stroke={page.gold} strokeWidth={3} strokeLinejoin="round" pathLength={pathLen} strokeDasharray={pathLen} strokeDashoffset={pathLen * (1 - lk)}/>
        </svg>
        <div style={{position: 'absolute', top: qTop, [copy.side]: copy.ar ? W - PANEL_R : PANEL_L, width: (PANEL_R - PANEL_L) * ramp(f, 54, 18), height: panelH, boxSizing: 'border-box', background: '#0A1B2E', border: `1.5px solid ${page.gold}`, boxShadow: '0 22px 46px rgba(0,0,0,0.5)', overflow: 'hidden'}}>
          <div style={{position: 'absolute', inset: 5, border: `1px solid ${page.gold}`, opacity: 0.3}}/>
        </div>
        <Diamond size={16} color={page.gold} style={{position: 'absolute', left: junctionX - 8, top: qTop - 8, opacity: ramp(f, 70, 10)}}/>
        <QuoteGlyph open size={170} color={page.gold} p={ramp(f, 60, 24)} style={{top: qTop - 10, [copy.side]: W - PANEL_R + 26}}/>
        <Header plan={qPlan} th={page} top={qTop + 22} at={62} right={W - (PANEL_R - 128)} width={QW} rule={false}/>
      </> : null}
    </div>
  </div>;
};

export const ProofScreen: React.FC<FamilyDesignProps> = ({scene}) => {
  if (scene.family !== 'proof-screen') return null;
  return <Settled><MagazineScope data={scene.data}><Ground th={NAVY}/><Plate d={scene.data}/></MagazineScope></Settled>;
};
