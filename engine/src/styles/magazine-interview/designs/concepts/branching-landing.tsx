import {cutPath, getBoundingBox, getLength} from '@remotion/paths';
import {roundRect, type Rect} from '../../../../motion-concepts/geometry';
import React from 'react';
import {dirOf, rectStyle} from '../../../../motion-concepts/shared';
import {AR, MONO, NAVY as t, fitWarning, useMagazine, wid} from '../../system/base';
import {balancedLines} from '../../system/page-parts';
import {smallNumeralStyle} from '../../system/numerals';
import {DOCK_COPY} from './copy-own';

/** These are drawing sections inside the existing card, not new mechanism geometry. */
export function outcomeSections(rect: Rect) {
  const card = roundRect(rect);
  const labelRow = {x: card.x + 12, y: card.y + 4, width: card.width - 24, height: 40};
  const outcome = {x: card.x + 16, y: card.y + 149, width: card.width - 32, height: card.height - 151};
  const body = {x: card.x + 16, y: labelRow.y + labelRow.height + 12, width: card.width - 32,
    height: outcome.y - 12 - (labelRow.y + labelRow.height + 12)};
  return {labelRow, body, outcome};
}

const trimmed = new Map<string, string>();
/** A drawing-only prefix of the native curve. Its 3px stroke stops at the card edge. */
export function routeAtCard(d: string, rect: Rect) {
  const stop = roundRect(rect).y - 1.5, key = `${stop}:${d}`;
  const cached = trimmed.get(key);
  if (cached !== undefined) return cached;
  let from = 0, to = getLength(d);
  for (let i = 0; i < 32; i++) {
    const at = (from + to) / 2;
    if (getBoundingBox(cutPath(d, at)).y2 <= stop) from = at;
    else to = at;
  }
  const result = cutPath(d, from);
  if (trimmed.size >= 16) trimmed.clear();
  trimmed.set(key, result);
  return result;
}


type Face = {fontFamily: string; fontWeight: number};
/** One line first; only after reaching 34px can the name wrap, then ellipsize. */
export function dockPlan(name: string, score: string, id: string, body: Rect, font: string, face: Face) {
  const partsAt = (size: number) => {
    const separatorWidth = wid(DOCK_COPY.separator, size, 600, font);
    const fullScoreWidth = Math.ceil(wid(score, size, face.fontWeight, face.fontFamily));
    const minimumName = wid(DOCK_COPY.ellipsis, size, 600, font);
    const scoreWidth = Math.max(0, Math.min(fullScoreWidth, body.width - separatorWidth - minimumName));
    const nameLimit = Math.max(0, body.width - separatorWidth - scoreWidth);
    return {size, lineBox: Math.round(size * 1.18), separatorWidth, scoreWidth, fullScoreWidth, nameLimit};
  };
  let p = partsAt(34), lines: string[] = [], ellipsized = false;
  for (let size = 36; size >= 34; size--) {
    const attempt = partsAt(size);
    if (attempt.scoreWidth >= attempt.fullScoreWidth && wid(name, size, 600, font) <= attempt.nameLimit && attempt.lineBox <= body.height) {
      p = attempt; lines = [name]; break;
    }
  }
  if (!lines.length) {
    p = partsAt(34);
    const wrap = (text: string) => balancedLines(text, 34, 600, p.nameLimit, font);
    const fits = (candidate: string[]) => candidate.length <= 2 && candidate.length * p.lineBox <= body.height && candidate.every(l => wid(l, 34, 600, font) <= p.nameLimit);
    lines = wrap(name);
    if (!fits(lines)) {
      fitWarning(name, p.nameLimit, 34, 2); ellipsized = true;
      const glyphs = [...new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(name)].map(s => s.segment);
      lines = [DOCK_COPY.ellipsis];
      for (let end = glyphs.length - 1; end >= 0; end--) {
        const candidate = wrap(glyphs.slice(0, end).join('').trimEnd() + DOCK_COPY.ellipsis);
        if (fits(candidate)) {lines = candidate; break;}
      }
    }
  }
  if (p.scoreWidth < p.fullScoreWidth) fitWarning(score, p.scoreWidth, p.size, 1);
  const nameWidth = Math.min(p.nameLimit, Math.max(0, ...lines.map(l => Math.ceil(wid(l, p.size, 600, font)))));
  const rowHeight = lines.length * p.lineBox;
  const idHeight = 32, idFits = rowHeight + 6 + idHeight <= body.height && wid(id, 28, 500, MONO) <= body.width;
  return {...p, lines, nameWidth, rowHeight, idHeight, showId: idFits, ellipsized};
}

export const DockedToken: React.FC<{name: string; score: string; id: string; body: Rect; opacity: number}> = ({name, score, id, body, opacity}) => {
  const {font, copy} = useMagazine();
  const numeric = /[0-9٠-٩]/u.test(score);
  const style = smallNumeralStyle(score);
  const face: Face = dirOf(score) === 'rtl' && !numeric ? {fontFamily: AR, fontWeight: 600} : {fontFamily: style.fontFamily as string, fontWeight: style.fontWeight as number};
  const p = dockPlan(name, score, id, body, font, face);
  const totalWidth = p.nameWidth + p.separatorWidth + p.scoreWidth;
  return <div data-docked-token="true" data-docked-body={JSON.stringify(body)} data-docked-lines={p.lines.length} data-docked-ellipsis={String(p.ellipsized)}
    style={{...rectStyle(body), overflow: 'hidden', opacity, direction: copy.dir}}>
    <div data-docked-row="true" style={{position: 'absolute', top: 0, [copy.side]: 0, width: totalWidth, height: p.rowHeight, display: 'flex', direction: copy.dir, alignItems: 'flex-end'}}>
      <div data-docked-part="name" data-docked-size={p.size} style={{fontFamily: font, fontWeight: 600, fontSize: p.size, lineHeight: `${p.lineBox}px`, color: t.ink, width: p.nameWidth, height: p.rowHeight, overflow: 'hidden', textAlign: copy.align, flex: 'none'}}>
        {p.lines.map((line, i) => <div key={i} style={{whiteSpace: 'pre'}}><bdi dir="auto">{line}</bdi></div>)}
      </div>
      <div data-docked-part="separator" data-docked-size={p.size} style={{fontFamily: font, fontWeight: 600, fontSize: p.size, lineHeight: `${p.lineBox}px`, color: t.dim, width: p.separatorWidth, whiteSpace: 'pre', flex: 'none'}}>{DOCK_COPY.separator}</div>
      <div data-docked-part="score" data-docked-size={p.size} style={{...face, fontSize: p.size, lineHeight: `${p.lineBox}px`, fontVariantNumeric: 'tabular-nums', color: t.gold, width: p.scoreWidth, height: p.lineBox, overflow: 'hidden', flex: 'none'}}>
        <bdi dir={numeric ? 'ltr' : 'auto'} style={numeric ? {direction: 'ltr', unicodeBidi: 'isolate-override', whiteSpace: 'pre'} : {whiteSpace: 'pre'}}>{score}</bdi>
      </div>
    </div>
    {p.showId ? <div data-docked-part="id" data-docked-size={28} style={{position: 'absolute', top: p.rowHeight + 6, [copy.side]: 0, width: body.width, height: p.idHeight, fontFamily: MONO, fontWeight: 500, fontSize: 28, lineHeight: '32px', color: t.dim, textAlign: copy.align, overflow: 'hidden'}}><bdi dir="ltr">{id}</bdi></div> : null}
  </div>;
};
