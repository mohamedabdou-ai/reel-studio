import React from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {FAMILY} from '@reel-studio/core/fonts';
import {CanvasFill, SafeExempt} from '@reel-studio/core/safe';

type Props = {
  values: Record<string, unknown>;
  style: string;
  layout: 'split' | 'takeover';
  motion: 'land' | 'stagger' | 'quiet';
  durationInFrames: number;
  seam: number;
  headBox: unknown;
};
type Values = {title: string; resultLabel: string; accent: string; items: {label: string}[]};
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ease = Easing.bezier(0.22, 0.8, 0.24, 1);
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const TEXT = '#F3F1E8';
const MUTED = '#9CB1B9';
const BG = '#102B36';

/** Synthetic illustration: the same three SVG objects gather, become bars, and resolve. */
export default function IdeaFlow({values, durationInFrames}: Props) {
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame(); // Sequence-local frame, also used by PreparedEdit.
  const v = values as Values;
  const clock = frame / fps;
  const timelineScale = Math.max(0.01, durationInFrames / fps / 12);
  const t = clock / timelineScale;
  const phase = (from: number, to: number) => interpolate(t, [from, to], [0, 1], {...clamp, easing: ease});
  const gather = phase(1.8, 4.1);
  const chart = phase(5.1, 7.6);
  const focus = phase(8.9, 10.4);
  const show = phase(0, 0.55);
  const titleChange = phase(9.7, 10.35);
  const processOpacity = (1 - chart) * phase(0.7, 1.3);
  const inputPoints = [{x: 275, y: 670, r: -8}, {x: 695, y: 720, r: 7}, {x: 330, y: 1150, r: -5}];
  const gatheredPoints = [{x: 425, y: 910}, {x: 550, y: 890}, {x: 487, y: 1005}];
  const bars = [{x: 342, h: 168}, {x: 490, h: 310}, {x: 638, h: 230}];
  const pulse = Math.sin(t * Math.PI * 1.9) * 0.5 + 0.5;
  const label = (text: string, x: number, y: number, size: number, fill = TEXT, weight = 700) => (
    <text x={x} y={y} fontSize={size} fill={fill} fontWeight={weight} textAnchor="middle"
      direction="rtl" style={{unicodeBidi: 'plaintext', letterSpacing: 0}}>{text}</text>
  );

  return <CanvasFill background={BG}>
    <SafeExempt>
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 46% 46%, #204553 0%, #102B36 65%)'}} />
    </SafeExempt>
    <svg viewBox="0 0 1080 1920" width="100%" height="100%"
      style={{position: 'absolute', inset: 0, fontFamily: FAMILY.cairo, overflow: 'hidden'}}>
      <g opacity={show}>
        <rect x="354" y="330" width="272" height="46" rx="23" fill="#264752" />
        {label('تجربة توضيحية', 490, 363, 24, '#C7D7DB', 600)}
        <g opacity={1 - titleChange} transform={`translate(0 ${-10 * titleChange})`}>
          {label(v.title, 490, 474, 46)}
        </g>
        <g opacity={titleChange} transform={`translate(0 ${12 * (1 - titleChange)})`}>
          {label(v.resultLabel, 490, 474, 52, v.accent, 800)}
        </g>
        <line x1="440" y1="517" x2="540" y2="517" stroke={v.accent} strokeWidth="5" strokeLinecap="round" />
        {label('نجمع • نرتّب • نختار', 490, 565, 25, MUTED, 600)}
      </g>

      <g opacity={show * (1 - chart)}>
        {inputPoints.map((p, i) => <path key={`link-${i}`} d={`M ${p.x} ${p.y} Q ${490 + (i - 1) * 70} ${p.y} 490 930`}
          fill="none" stroke="#537580" strokeWidth="2.5" strokeDasharray="8 12" strokeDashoffset={-t * 24}
          opacity={0.52 * (1 - gather)} />)}
      </g>

      <g opacity={processOpacity}>
        <circle cx="490" cy="940" r={148 + pulse * 9} fill="none" stroke={v.accent} strokeWidth="2" opacity={0.15 + gather * 0.25} />
        <circle cx="490" cy="940" r="130" fill="#1C3C48" stroke="#6B8A92" strokeWidth="2" />
        <circle cx="490" cy="940" r="111" fill="none" stroke={v.accent} strokeWidth="5"
          strokeDasharray={`${100 + gather * 598} 700`} strokeLinecap="round"
          transform={`rotate(${-90 + t * 19} 490 940)`} opacity="0.75" />
        <g opacity={1 - gather}>
          <path d="M 455 903 L 475 921 L 521 875 M 455 940 L 475 958 L 521 912" fill="none"
            stroke={v.accent} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          {label('نرتّبها', 490, 994, 32)}
        </g>
      </g>

      <g opacity={chart}>
        <rect x="163" y="659" width="654" height="596" rx="35" fill="#173743" stroke="#496670" strokeWidth="2" />
        {label('شكل الفكرة بعد الترتيب', 490, 717, 26, '#C7D7DB', 600)}
        {[860, 970, 1080].map(y => <line key={y} x1="233" y1={y} x2="747" y2={y} stroke="#365460" strokeWidth="1.5" strokeDasharray="4 10" />)}
        <line x1="230" y1="1112" x2="750" y2="1112" stroke="#719099" strokeWidth="2" />
        <path d="M 320 823 Q 490 730 660 813" fill="none" stroke={v.accent} strokeWidth="3"
          opacity={0.38 * chart * (1 - focus)} strokeDasharray="5 9" />
      </g>

      {v.items.map((item, i) => {
        const p = inputPoints[i];
        const g = gatheredPoints[i];
        const b = bars[i];
        const localShow = phase(0.15 + i * 0.18, 0.75 + i * 0.18);
        const x = mix(mix(p.x, g.x, gather), b.x, chart);
        const y = mix(mix(p.y, g.y, gather), 1110 - b.h / 2, chart);
        const w = mix(mix(190, 83, gather), 76, chart);
        const h = mix(mix(116, 64, gather), b.h, chart);
        const rotate = mix(p.r * (1 - gather), 0, chart);
        const selected = i === 1;
        const opacity = show * localShow * (selected ? 1 : 1 - focus * 0.48);
        return <g key={`input-${i}`} data-idea-object={`input-${i}`} opacity={opacity}
          transform={`translate(${x} ${y + (1 - localShow) * 16}) rotate(${rotate})`}>
          <rect x={-w / 2 + 7 * (1 - chart)} y={-h / 2 + 8 * (1 - chart)} width={w} height={h}
            rx={mix(19, 10, chart)} fill="#071D26" opacity="0.55" />
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={mix(19, 10, chart)}
            fill={selected ? v.accent : ['#F2C879', v.accent, '#8ECBDD'][i]} stroke="#102B36" strokeWidth="2" />
          <g opacity={1 - gather}>
            <circle cx={-61} cy={-31} r="7" fill="#102B36" opacity="0.45" />
            <line x1="-46" y1="-31" x2="-5" y2="-31" stroke="#102B36" strokeWidth="4" opacity="0.22" strokeLinecap="round" />
          </g>
          <g opacity={1 - gather * (1 - chart)}>
            {label(item.label, 0, mix(21, h / 2 + 57, chart), mix(31, 27, chart), chart > 0.7 ? TEXT : BG, 800)}
          </g>
          {selected && <g opacity={focus}>
            <rect x="-52" y={-h / 2 - 61} width="104" height="41" rx="20" fill={v.accent} />
            {label('نبدأ هنا', 0, -h / 2 - 32, 21, BG, 800)}
            <path d={`M -48 ${-h / 2 - 5} L -48 ${h / 2 + 5} M 48 ${-h / 2 - 5} L 48 ${h / 2 + 5}`}
              stroke={v.accent} strokeWidth="3" opacity="0.8" fill="none" />
          </g>}
        </g>;
      })}

      <g opacity={show}>
        <rect x="246" y="1296" width="488" height="64" rx="32" fill="#244550" />
        {label('مثال توضيحي — مش بيانات حقيقية', 490, 1339, 23, '#B6CBD1', 600)}
        <g opacity={focus}>
          <circle cx="410" cy="1410" r="5" fill={v.accent} />
          <line x1="425" y1="1410" x2="555" y2="1410" stroke={v.accent} strokeWidth="2" opacity="0.5" />
          <circle cx="570" cy="1410" r="5" fill={v.accent} />
        </g>
      </g>
    </svg>
  </CanvasFill>;
}
