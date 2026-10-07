export function validateMotionPlan(plan,video) {
  if (plan?.version!==1 || !Array.isArray(plan.segments) || !plan.segments.length) throw new Error('Invalid motion plan');
  if (!Number.isInteger(video.frames) || video.frames<2 || !(video.fps>0)) throw new Error('Video frame count and fps are required');
  let cursor=0, presenters=0;
  for(const segment of plan.segments) {
    const {from,to,kind,crop,reason}=segment;
    if (!Number.isInteger(from) || !Number.isInteger(to) || to<=from || to>video.frames) throw new Error('Invalid motion frame interval');
    if(from!==cursor) throw new Error('Motion intervals must be contiguous and ordered');
    if(kind==='presenter') {
      if(typeof crop!=='string' || !/^\d+:\d+:\d+:\d+$/.test(crop)) throw new Error('Presenter crop must be w:h:x:y');
      const [w,h,x,y]=crop.split(':').map(Number);
      if(w<2 || h<2 || x+w>video.width || y+h>video.height) throw new Error('Presenter crop is outside the video');
      presenters++;
    } else if(kind==='graphics') {
      if(typeof reason!=='string' || reason.trim().length<8) throw new Error('Hidden presenter intervals require a reason');
      if(crop) throw new Error('Graphics intervals cannot specify a presenter crop');
    } else throw new Error('Motion interval kind must be presenter or graphics');
    cursor=to;
  }
  if(cursor!==video.frames) throw new Error('Motion plan must cover the entire video');
  if(!presenters) throw new Error('A motion plan requires presenter coverage');
  return plan;
}
