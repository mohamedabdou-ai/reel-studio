import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {FamilyDesignProps} from '../../family-designs';
import {useProbe} from '../../../core/safe';
import {displayDigitList} from '../../../core/digits';
import {useDigits} from '../../../creative-kit/digits';
import {useDesignText} from '../../../style-kit/digits';
import {EASE, clamp01} from '../../../core/motion';
import {stretchWord} from '../../../arabic/kashida';
import {SPOKEN_EXIT_FRAMES, UNDERLINE_DELAY, UNDERLINE_DUR} from '../../../creative-kit/kinetic-words';
import {assignLines, tokenizeSpoken, resolveEmphasis, reservedText, tokenFlow, placeTokens, stretchWidths, stretchAmount, stretchRoom, stretchCount, enterPose, tokenEnter, ENTER_FRAMES, drawProgress} from '../../../creative-kit/kinetic-words-logic';
import {NAVY, Ground, Furniture, Kicker, Mask, MagazineScope, SERIF, fitWarning, useMagazine, useType} from '../system/base';
import {balancedLines} from '../system/page-parts';
import {magazineZones} from '../system/zones';
import {smallNumeralStyle} from '../system/numerals';

type Scene = Extract<FamilyDesignProps['scene'], {family: 'kinetic-text'}>;
const Drawing: React.FC<FamilyDesignProps & {scene: Scene}> = ({scene, words = [], seam, sectionIndex = 0}) => {
  const f = useCurrentFrame(), {fps} = useVideoConfig(), probe = useProbe(), digits = useDigits();
  const {copy, font} = useMagazine(), {fit, wid} = useType(), d = scene.data;
  const show = useDesignText(), page = show(String(sectionIndex + 1).padStart(2,'0')), numeral = smallNumeralStyle(page, 34);
  if (d.title && wid(d.title, 32, 600) > 922) fitWarning(d.title, 922, 32, 1);
  const zone = magazineZones(seam)[scene.layout];
  const chosen = words.filter(w => d.sourceIndices.includes(w.sourceIndex));
  const shown = displayDigitList(chosen.map(w => w.text), digits);
  const tokens = tokenizeSpoken(chosen.map((w, i) => ({...w, text: shown[i]})), {origin: scene.fromFrame});
  const kinds = resolveEmphasis(tokens, d.emphasis ?? []);
  const longest = tokens.map((t, i) => reservedText(t.text, kinds[i]));
  const text = longest.join(' '), top = zone.y + (d.title ? 94 : 0);
  const available = Math.max(0, zone.y + zone.height - top);
  const limit = Math.max(1, Math.min(scene.layout === 'takeover' ? 3 : Infinity, Math.floor(available / Math.round(34 * 1.3))));
  let t = fit(text, {width: zone.width, size: scene.layout === 'split' ? 74 : 150, min: 34, lines: Math.min(scene.layout === 'split' ? 2 : 3, limit), weight: 800, lh: 1.3});
  if (!t.fits || t.box * t.lines.length > available) {
    t = {...t, size: 34, box: Math.round(34 * 1.3), lines: balancedLines(text, 34, 800, zone.width, font)};
    if (t.lines.length > limit || t.lines.some(l => wid(l, 34, 800) > zone.width)) fitWarning(text, zone.width, 34, limit);
  }
  const lines = assignLines(longest.map(text => ({text})), t.lines);
  const forms = tokens.map((token, i) => kinds[i].includes('stretch') ? stretchWidths(token.text, s => wid(s, t.size, 800)) : [wid(token.text, t.size, 800, kinds[i].includes('latin') ? SERIF : font)]);
  const placed = placeTokens(lines.map(row => row.map(i => forms[i].length > 1 ? probe !== null ? forms[i].at(-1)! : stretchRoom(forms[i], stretchAmount(f, tokens[i].enterFrame, tokens[i].endFrame, fps)) : forms[i][0])), {gap: wid(' ', t.size, 800), lineBox: t.box, width: zone.width, dir: copy.dir, align: 'start', flows: lines.map(row => row.map(i => tokenFlow(tokens[i].text)))});
  const rects = new Map(lines.flat().map((index, i) => [index, placed.rects[i]]));
  const fade = probe !== null ? 1 : f >= scene.durationInFrames ? 0 : clamp01((scene.durationInFrames - f) / SPOKEN_EXIT_FRAMES);
  return <div data-p1-family="kinetic-text" data-direction={copy.dir} style={{position: 'absolute', inset: 0, height: scene.layout === 'split' ? seam : 1920, overflow: 'hidden'}}>
    <Ground th={NAVY}/>
    <div data-p1-folio={scene.layout === 'takeover' ? 'true' : 'false'} data-number-face={numeral.fontFamily} data-number-weight={numeral.fontWeight} data-number-shown={page} style={{position: 'absolute', inset: 0, '--p1-numeral-face': numeral.fontFamily, '--p1-numeral-weight': numeral.fontWeight} as React.CSSProperties}>
      <style>{'[data-p1-folio="true"] > div:last-child{font-family:var(--p1-numeral-face)!important;font-weight:var(--p1-numeral-weight)!important;font-variant-numeric:tabular-nums}'}</style>
      <Furniture th={NAVY} section="" page={page} bottom={scene.layout !== 'split'}/>
    </div>
    <div data-p1-box="spoken-zone" data-top={zone.y} data-bottom={zone.y + zone.height} style={{position: 'absolute', left: zone.x, top: zone.y, width: zone.width, height: zone.height, overflow: 'hidden'}}>
      {d.title ? <Kicker th={NAVY} text={d.title} top={0} right={0} at={0}/> : null}
      <div data-p1-size={t.size} data-p1-fit={t.fits && placed.fits} data-p1-line-box={t.box} data-p1-rows={lines.length} style={{position: 'absolute', left: 0, top: top - zone.y, width: zone.width, height: scene.layout === 'takeover' ? Math.min(available, 3 * t.box) : available, overflow: 'hidden', opacity: fade}}>
        {tokens.map((token, i) => {
          const rect = rects.get(i)!, entry = tokenEnter(d.enter, kinds[i]).enter, local = f - token.enterFrame;
          const pose = enterPose(entry, local, 1);
          const k = probe !== null ? 1 : entry === 'pop' ? local < 0 ? 0 : EASE.land((local + 1) / ENTER_FRAMES.pop) : 1 - pose.rise / 0.42;
          const word = kinds[i].includes('stretch') ? probe !== null ? longest[i] : stretchWord(token.text, stretchCount(f, token.enterFrame, token.endFrame, fps)) : token.text;
          return <div key={`${token.sourceIndex}:${token.part}`} data-p1-token={token.sourceIndex} data-enter-frame={token.enterFrame} data-x={rect.left} data-y={rect.top} data-width={rect.width} data-height={rect.height} style={{position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height, overflow: 'hidden', opacity: probe !== null ? 1 : pose.opacity}}>
            <Mask h={rect.height} pad={Math.round(t.size * 0.34)} k={k} rise={rect.height * 0.42}><div style={{fontFamily: kinds[i].includes('latin') ? SERIF : font, fontWeight: 800, fontSize: t.size, lineHeight: `${rect.height}px`, direction: copy.dir, textAlign: 'center', color: kinds[i].some(kind => ['accent', 'stretch', 'pop'].includes(kind)) ? NAVY.gold : NAVY.ink, whiteSpace: 'nowrap'}}><bdi dir="auto">{word}</bdi></div></Mask>
            {kinds[i].includes('underline') ? <div data-underline-at={token.enterFrame + UNDERLINE_DELAY} style={{position: 'absolute', bottom: 0, [copy.side]: 0, height: 4, width: rect.width * (probe !== null ? 1 : drawProgress(f, token.enterFrame + UNDERLINE_DELAY, UNDERLINE_DUR)), background: NAVY.gold}}/> : null}
          </div>;
        })}
      </div>
    </div>
  </div>;
};
export const KineticText: React.FC<FamilyDesignProps> = props => props.scene.family === 'kinetic-text' ? <MagazineScope data={{lang: props.scene.data.lang}}><Drawing {...props} scene={props.scene}/></MagazineScope> : null;
