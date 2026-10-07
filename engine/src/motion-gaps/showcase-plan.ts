export const SLATE_FRAMES=24;
export type ShowcaseSlot={slateFrom:number;labFrom:number;labFrames:number};

export function showcasePlan(durations:readonly number[],slateFrames:number=SLATE_FRAMES):{slots:ShowcaseSlot[];durationInFrames:number}{
  let cursor=0;
  const slots=durations.map(labFrames=>{
    if(!Number.isInteger(labFrames) || labFrames<1)throw new RangeError(`Lab duration must be a positive integer frame count: ${labFrames}`);
    const slot={slateFrom:cursor,labFrom:cursor+slateFrames,labFrames};
    cursor+=slateFrames+labFrames;
    return slot;
  });
  return {slots,durationInFrames:cursor};
}
