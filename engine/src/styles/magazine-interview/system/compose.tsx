import React from 'react';
import {useVideoConfig} from 'remotion';
import type {FamilyDesignProps} from '../../family-designs';
import type {AdaptedData} from '../../../creative-kit/compose/adapters/kinetic';
type PageData=ComposeData|AdaptedData;
import {composePaper, pageRegions, type ComposeData} from '../../../creative-kit/compose/schema';
import {resolveComposeAt} from '../../../creative-kit/compose/timing';
import {pickScale} from '../../../creative-kit/compose/layout';
import {designWarning} from '../../../style-kit/design-safety';
import {magazineZones} from './zones';
import {CREAM, NAVY, Page, MagazineScope, useMagazine, type Theme} from './base';
import {MAGAZINE_PARTS} from './parts';
import {cardLayout} from './parts/card';
import {estimatePartHeight} from '../../../creative-kit/compose/budget';

/** Give the magazine scope the page's own words so the furniture shares its direction. */
const copyProbe = (parts: readonly PageData['parts'][number][]) => ({text: parts.map((p: any) => p.text ?? p.title ?? p.label ?? p.messages?.[0]?.text ?? p.items?.[0]?.text ?? p.items?.[0]?.title ?? p.source?.steps?.map((step:any)=>step.label??step.title??'').join(' ') ?? p.source?.images?.map((image:any)=>image.label).join(' ') ?? '').filter(Boolean).join(' ')});

const Parts: React.FC<{data: PageData; sceneId: string; scene: {fromFrame: number; durationInFrames: number}; layout: 'split' | 'takeover'; seam: number; words: NonNullable<FamilyDesignProps['words']>; th: Theme}> =
  ({data, sceneId, scene, layout, seam, words, th}) => {
    const {fps} = useVideoConfig();
    const {copy,font} = useMagazine();
    const zone = magazineZones(seam)[layout];
    const rowCards=data.arrangement==='grid'||data.arrangement==='two-column';
    const bodyParts=pageRegions(data.parts).body;
    const {scale, placed} = pickScale(data as ComposeData, zone, copy.dir,(part,width,scale,shrink)=>{
      if(!rowCards||part.kind!=='card'||part.variant==='stamp')return undefined;
      const index=bodyParts.findIndex(p=>p.id===part.id),row=bodyParts.slice(index-index%2,index-index%2+2);
      // Keep the card's existing self-fit constraint, then measure its actual content.
      const height=Math.max(...row.map(p=>estimatePartHeight(p,width,scale,shrink)));
      return cardLayout(part,width,height,scale,!!part.emphasis,font).h;
    });
    if (placed.overflow > 0) designWarning('magazine-interview', {compose: sceneId, layout, overflow: placed.overflow});
    const cells = new Set(rowCards ? pageRegions(data.parts).body.map(p => p.id) : []);
    return <>{data.parts.map(part => {
      const Part = MAGAZINE_PARTS[part.kind];
      const at = resolveComposeAt(part.at, scene, words, fps) ?? 0;
      const box=placed.boxes[part.id];
      const loneMedia=layout==='takeover'&&data.parts.length===1&&part.kind==='media';
      return <Part key={part.id} part={part} box={box} at={at} emphasis={!!part.emphasis} th={th} dir={copy.dir} fps={fps} scale={scale} cell={cells.has(part.id)} {...(loneMedia?{mediaCenterY:zone.y+zone.height/2-box.y}:{})}/>;
    })}</>;
  };

/** Authored compose scenes and style adapters both draw through the same page. */
export const MagazineComposePage: React.FC<FamilyDesignProps & {data: PageData}> = ({scene, data, seam, sectionIndex = 1, words = []}) => {
  const layout = scene.layout === 'split' ? 'split' : 'takeover';
  const th = composePaper(data as ComposeData) === 'cream' ? CREAM : NAVY;
  const folio = String(Math.max(1, sectionIndex) * 12).padStart(2, '0');
  const body = <Parts data={data} sceneId={scene.id} scene={scene} layout={layout} seam={seam} words={words} th={th}/>;
  if (layout === 'takeover') return <MagazineScope data={copyProbe(data.parts)}><Page th={th} section={data.section ?? ''} page={folio}>{body}</Page></MagazineScope>;
  return <MagazineScope data={copyProbe(data.parts)}><div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: seam, overflow: 'hidden'}}><Page th={th} section={data.section ?? ''} page={folio} bottom={false}>{body}</Page></div></MagazineScope>;
};
