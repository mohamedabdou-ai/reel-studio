import './project-tmp.mjs';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {createHash} from 'node:crypto';
import {ROOT,run,ffprobeJson,writeJson,readCachedJson} from './media.mjs';
import {checkedPath} from './job-paths.mjs';
import {withOutputTransaction} from './delivery.mjs';
import {assertRevisionDestinations} from './revision-paths.mjs';
import {SPEC,igCheck,loudness} from './ig.mjs';
import {contentHash,mediaContract,canonical} from './render-chunks.mjs';

const integer=(n,label,min=0)=>{if(!Number.isSafeInteger(n)||n<min)throw new Error(`${label} must be an integer >= ${min}.`);return n;};
const gain=(n,label)=>{if(!Number.isFinite(n)||n< -80||n>12)throw new Error(`${label} gain must be between -80 and 12 dB.`);return n;};

// Source cuts and delays share one 48 kHz sample clock. No codec-delay guesses.
export function buildAudioTimeline(manifest,overrides={}){
  if(manifest?.version!==1||!Number.isFinite(manifest.fps)||manifest.fps<=0||manifest.fps>120)throw new Error('Audio timeline needs version 1 and a valid fps.');
  integer(manifest.durationInFrames,'durationInFrames',1);
  const sync=manifest.sync??{sampleRate:48000,offsetSamples:0,basis:'timeline'};
  if(sync.sampleRate!==48000||!['timeline','measured'].includes(sync.basis)||!Number.isSafeInteger(sync.offsetSamples))throw new Error('Audio sync needs 48000 Hz, integer offsetSamples and timeline or measured basis.');
  const totalSamples=Math.round(manifest.durationInFrames*48000/manifest.fps);
  if(!Array.isArray(manifest.tracks)||manifest.tracks.length<1||manifest.tracks.length>256)throw new Error('Audio timeline needs 1-256 tracks.');
  const levels={voice:gain(Number(overrides.voiceDb??manifest.mix?.voiceDb??0),'voice'),music:gain(Number(overrides.musicDb??manifest.mix?.musicDb??-18),'music'),sfx:gain(Number(overrides.sfxDb??manifest.mix?.sfxDb??-10),'sfx')};
  const inputs=[],parts=[];
  manifest.tracks.forEach((track,index)=>{
    if(!['voice','music','sfx'].includes(track.kind)||typeof track.src!=='string'||!track.src||/[\x00-\x1f]/.test(track.src))throw new Error('Audio track needs a kind and local src.');
    integer(track.fromFrame,'fromFrame');integer(track.sourceFromFrame??0,'sourceFromFrame');integer(track.durationInFrames,'durationInFrames',1);
    if(track.fromFrame+track.durationInFrames>manifest.durationInFrames)throw new Error('Audio track exceeds the output timeline.');
    const sourceStart=Math.round((track.sourceFromFrame??0)*48000/manifest.fps);
    const sourceEnd=Math.round(((track.sourceFromFrame??0)+track.durationInFrames)*48000/manifest.fps);
    let start=sourceStart,delay=Math.round(track.fromFrame*48000/manifest.fps)+sync.offsetSamples;
    if(delay<0){start-=delay;delay=0;}
    if(start>=sourceEnd||delay>=totalSamples)throw new Error('Audio sync moves a track entirely outside the timeline.');
    const trackGain=gain(Number(track.gainDb??0),'track')+levels[track.kind];
    inputs.push({src:track.src,sourceEndSample:sourceEnd,kind:track.kind});
    // Resampling must precede atrim: start_sample is interpreted at 48 kHz.
    parts.push(`[${index}:a:0]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,atrim=start_sample=${start}:end_sample=${sourceEnd},asetpts=PTS-STARTPTS,volume=${trackGain}dB,adelay=${delay}S:all=1[a${index}]`);
  });
  parts.push(`${inputs.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${inputs.length}:duration=longest:dropout_transition=0:normalize=0,apad,atrim=end_sample=${totalSamples},asetpts=PTS-STARTPTS[outa]`);
  return {filter:parts.join(';'),inputs,totalSamples,seconds:manifest.durationInFrames/manifest.fps,sync,levels};
}

export async function streamSignature(file,kind='video'){
  const selector=kind==='video'?'v:0':'a:0';
  const {stdout}=await run('ffprobe',['-v','error','-select_streams',selector,'-show_packets','-show_data_hash','sha256','-show_entries','packet=pts_time,dts_time,duration_time,data_hash','-of','json',file]);
  const packets=JSON.parse(stdout).packets;
  if(!packets?.length||packets.some(packet=>!packet.data_hash))throw new Error(`Cannot verify unchanged ${kind} packets.`);
  return {packets:packets.length,sha256:createHash('sha256').update(canonical(packets)).digest('hex')};
}

export async function finalMediaGate(file,{channel='organic',expectedFrames,expectedFps,requireAudio=true}={}){
  const media=await mediaContract(file);
  if(expectedFrames!==undefined&&media.frames!==expectedFrames)throw new Error('Final media frame count changed.');
  if(expectedFps!==undefined&&Math.abs(media.fps-expectedFps)>.00001)throw new Error('Final media cadence changed.');
  const probe=await ffprobeJson(file),audio=probe.streams?.find(s=>s.codec_type==='audio');
  if(requireAudio&&(!audio||audio.codec_name!=='aac'||Number(audio.sample_rate)!==48000||audio.channels!==2))throw new Error('Final media requires stereo AAC at 48000 Hz.');
  if(audio){
    const video=probe.streams.find(s=>s.codec_type==='video');
    if(Math.abs(Number(audio.duration)-media.frames/media.fps)>1/media.fps+.01)throw new Error('Final audio duration disagrees with the picture timeline.');
    if(Math.abs(Number(audio.start_time??0)-Number(video.start_time??0))>.03)throw new Error('Final audio and picture start times disagree.');
  }
  const qc=await igCheck(file,{channel,withLoudness:true});
  if(!qc.ok)throw new Error(`Final encode QC failed: ${qc.fails.join(', ')}`);
  return {media,igCheck:qc};
}

export async function reviseAudio({base,manifest,out,overrides={},channel='organic'}){
  base=await checkedPath(path.relative(ROOT,path.resolve(base)).split(path.sep).join('/'),{mustExist:true});
  const plan=buildAudioTimeline(manifest,overrides),inputs=[];
  for(const input of plan.inputs)inputs.push(await checkedPath(input.src,{mustExist:true}));
  // Resolve every source before opening a transaction: a track may itself be an
  // MP4, and an output or companion must never replace that original input.
  await assertRevisionDestinations(out,[base,`${base}.qc.json`,...inputs]);
  const baseMedia=await mediaContract(base);
  if(baseMedia.frames!==manifest.durationInFrames||Math.abs(baseMedia.fps-manifest.fps)>.00001)throw new Error('Audio timeline must match the base frame count and fps.');
  const originalVideo=await streamSignature(base),baseSha256=await contentHash(base);
  for(const [index,input]of plan.inputs.entries()){
    const file=inputs[index],probe=await ffprobeJson(file),audio=probe.streams?.find(s=>s.codec_type==='audio');
    const duration=Number(audio?.duration??probe.format?.duration);
    if(!audio||!Number.isFinite(duration)||Math.round(duration*48000)+1<input.sourceEndSample)throw new Error(`Audio source does not cover its requested samples: ${input.src}`);
  }
  return withOutputTransaction(out,async(staged,work)=>{
    const wav=path.join(work,'timeline.wav');
    await run('ffmpeg',['-v','error','-xerror','-y',...inputs.flatMap(file=>['-i',file]),'-filter_complex',plan.filter,'-map','[outa]','-c:a','pcm_f32le','-ar','48000','-ac','2',wav]);
    const wavProbe=await ffprobeJson(wav),track=wavProbe.streams?.[0];
    if(Number(track?.duration_ts)!==plan.totalSamples||Number(track?.sample_rate)!==48000)throw new Error('Audio timeline did not produce the exact expected 48 kHz sample count.');
    const target={I:SPEC.video.loudness.integratedLUFS,TP:SPEC.video.loudness.truePeakDBTP-0.5,LRA:7};
    const {stderr}=await run('ffmpeg',['-hide_banner','-nostats','-i',wav,'-af',`loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:print_format=json`,'-f','null','-']);
    const measurement=stderr.match(/\{[^{}]*"target_offset"[^{}]*\}/);
    if(!measurement)throw new Error('Audio normalization measurement failed.');
    const measured=JSON.parse(measurement[0]);
    const norm=Number.isFinite(Number(measured.input_i))?`loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true,aresample=48000,apad,atrim=end_sample=${plan.totalSamples}`:`aresample=48000,apad,atrim=end_sample=${plan.totalSamples}`;
    await run('ffmpeg',['-v','error','-xerror','-y','-i',base,'-i',wav,'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',norm,'-c:a','aac','-b:a',`${SPEC.video.audio.renderKbps}k`,'-ar','48000','-ac','2','-movflags','+faststart+negative_cts_offsets',staged]);
    const revisedVideo=await streamSignature(staged);
    if(canonical(revisedVideo)!==canonical(originalVideo))throw new Error('Audio revision changed video packets or timing.');
    if(await contentHash(base)!==baseSha256)throw new Error('Base master changed during audio revision.');
    const qc=await finalMediaGate(staged,{channel,expectedFrames:baseMedia.frames,expectedFps:baseMedia.fps});
    qc.igCheck.file=path.resolve(out);
    const measuredFinal=await loudness(staged);
    if(!measuredFinal.silent&&(Math.abs(measuredFinal.integratedLUFS-SPEC.video.loudness.integratedLUFS)>2||measuredFinal.truePeakDBTP>SPEC.video.loudness.truePeakDBTP))throw new Error('Final audio loudness or true peak failed.');
    const previous=await readCachedJson(`${base}.qc.json`);
    const verifiedPrevious=previous?.outputSha256===baseSha256?previous:null;
    const report={ok:true,operation:'audio-revision',comp:verifiedPrevious?.comp,mode:verifiedPrevious?.mode,inputProps:verifiedPrevious?.inputProps,out:path.resolve(out),base,baseSha256,outputSha256:await contentHash(staged),unchangedVideo:revisedVideo,timeline:{samples:plan.totalSamples,sampleRate:48000,sync:plan.sync,levels:plan.levels},...qc,audio:measuredFinal,inheritedPictureChecks:verifiedPrevious?{safe:verifiedPrevious.safe,head:verifiedPrevious.head,motion:verifiedPrevious.motion}:null};
    await writeJson(`${staged}.qc.json`,report);return report;
  },{sidecars:['.qc.json']});
}
