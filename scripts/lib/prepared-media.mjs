export function assertPreparedMedia(probe,{frames,fps,hasAudio,countedFrames}){
  const video=probe.streams?.find(s=>s.codec_type==='video');
  const count=Number(countedFrames??video?.nb_frames);
  const [n,d]=(video?.avg_frame_rate??'0/1').split('/').map(Number);
  if(!Number.isInteger(count) || count!==frames || !Number.isFinite(n/d) || Math.abs(n/d-fps)>0.001) throw new Error('Prepared plate needs the exact expected frame count and cadence.');
  const duration=frames/fps;
  if(hasAudio){
    const audio=probe.streams?.find(s=>s.codec_type==='audio');
    const rate=Number(audio?.sample_rate),covered=Number(audio?.duration),offset=Number(audio?.start_time??0);
    const tolerance=Math.max(1/fps,2048/rate);
    if(!audio || !(rate>0) || !Number.isFinite(covered) || covered<=0 || !Number.isFinite(offset)
      || Math.abs(offset)>tolerance || Math.abs(covered-duration)>tolerance) throw new Error('Prepared audio does not cover the edit continuously within one frame/AAC boundary tolerance.');
  }
  return {frames:count,fps:n/d,duration,hasAudio};
}
