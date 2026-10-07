import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {FAMILY} from '../core/fonts';
import {CanvasFill, SafeRoot} from '../core/safe';
import type {SafeProps} from '../core/safe';
import {handleFontSize, nameFontSize, readableOn} from './doctor-layout';

export type DoctorProps = SafeProps & {
  name: string;
  handle: string | null;
  followCard: boolean;
  cta: string | null;
  signOff: string | null;
  brand: {primary: string; accent: string; background: string | null; text: string | null};
  noPlates?: boolean;
};

export const doctorDefaults: DoctorProps = {
  name: 'Reel Studio',
  handle: null,
  followCard: false,
  cta: null,
  signOff: null,
  brand: {primary: '#101827', accent: '#4D8DFF', background: null, text: null},
};


export const calculateDoctorMetadata: CalculateMetadataFunction<DoctorProps> = ({props}) => ({props: {...props, plates: [], noPlates: true}});

export const Doctor: React.FC<DoctorProps> = ({name, handle, followCard, cta, signOff, brand, probe, guides}) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const background = brand.background ?? brand.primary;
  const text = brand.text ?? readableOn(background);
  const onAccent = readableOn(brand.accent);
  const block: React.CSSProperties = {position: 'absolute', left: 120, right: 120, fontFamily: `'${FAMILY.cairo}', sans-serif`, textAlign: 'center', direction: 'rtl', opacity: enter};
  return (
    <SafeRoot probe={probe} guides={guides}>
      <CanvasFill background={background} />
      <div style={{...block, top: 330, color: text, transform: `translateY(${(1 - enter) * 24}px)`}}>
        <div style={{fontSize: nameFontSize(name), fontWeight: 900, lineHeight: 1.15, overflowWrap: 'anywhere'}}>{name}</div>
        <div style={{margin: '28px auto 0', width: 160, height: 10, borderRadius: 5, background: brand.accent}} />
        <div style={{marginTop: 24, fontSize: 44, fontWeight: 700}}>الاستوديو جاهز</div>
      </div>
      {followCard && handle ? (
        <div style={{...block, left: 140, right: 140, top: 760, height: 200, borderRadius: 36, background: brand.accent, color: onAccent, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18}}>
          <div style={{fontSize: handleFontSize(handle), fontWeight: 800, whiteSpace: 'nowrap', direction: 'ltr'}}>{handle}</div>
          <div style={{fontSize: 36, fontWeight: 800, padding: '6px 36px', borderRadius: 999, background: onAccent, color: brand.accent, direction: 'ltr'}}>Follow</div>
        </div>
      ) : null}
      {cta ? <div style={{...block, top: 1000, color: text, fontSize: 44, fontWeight: 700}}>اكتب «{cta}» في الكومنتات</div> : null}
      {signOff ? <div style={{...block, right: 240, top: 1200, color: text, fontSize: 40, fontWeight: 700}}>{signOff}</div> : null}
    </SafeRoot>
  );
};
