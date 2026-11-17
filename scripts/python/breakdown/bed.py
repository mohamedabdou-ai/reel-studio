"""Bed = sustained non-percussive music under the reel; tempo is separate.

Confirmed voice, sung or spoken, is never bed evidence. Independent non-voice
harmonic series can establish a musical residual under voice. A sung/spoken
line over drums without sustained non-voice music is unmeasured: singing
cannot be distinguished from talking over a beat here. Scores describe evidence,
not calibrated probabilities or a claim to have listened to the source.
A bed sits under the reel: less than a quarter observable does not represent
the remainder. Thin evidence cannot establish presence or high-confidence absence.
"""
import numpy as np
from scipy.ndimage import percentile_filter, binary_closing, maximum_filter1d, median_filter
from scipy.signal import find_peaks
from . import dsp
from .audio_config import AUDIO_TUNING

C=AUDIO_TUNING['bed']
EPS=AUDIO_TUNING['sfx']['epsilon']


def runs(mask):
    edges=np.diff(np.r_[False,mask,False].astype(int))
    return list(zip(np.flatnonzero(edges==1),np.flatnonzero(edges==-1)))


def effect_exclusion(S,times,events,voice_gap=None):
    excluded=np.zeros(len(times),bool)
    frequencies=np.fft.rfftfreq(dsp.NFFT,1/dsp.SR)
    frame_rate=dsp.SR/dsp.HOP
    quiet=max(1,round(C['tail_quiet_sec']*frame_rate))
    window=max(1,round(C['note_window_sec']*frame_rate))
    return_ratio=10**(C['tail_return_db']/20)
    for event in sorted(events,key=lambda e:e['t']):
        start=max(0.,event['t']-C['event_pad_sec'])
        # Follow the observed tail after the measured rise, rather than letting
        # a provisional duration borrow a later unrelated sound's whole window.
        minimum=event['t']+max(0.,event.get('features',{}).get('attack',0))
        peak=event.get('features',{}).get('peakHz',0)
        if peak>0 and event.get('features',{}).get('flatness',1)<C['flatness_max']:
            edges=AUDIO_TUNING['sfx']['bands_hz']
            band=max(0,min(len(edges)-2,int(np.searchsorted(edges,peak,side='right'))-1))
            use=(frequencies>=edges[band]) & (frequencies<edges[band+1])
        else:
            use=np.ones(len(frequencies),bool)
        envelope=np.sqrt((S[use]**2).sum(axis=0))
        before=(times>=event['t']-C['tail_pre_sec']) & (times<event['t']-C['event_pad_sec'])
        if voice_gap is not None:before &= voice_gap
        before &= ~excluded
        cap=min(float(times[-1])+dsp.HOP/dsp.SR,
                minimum+AUDIO_TUNING['sfx']['max_event_sec'])
        following=(times>=minimum)&(times<=cap)
        baseline=float(np.median(envelope[before])) if before.any() else float(np.min(envelope[following])) if following.any() else 0.
        threshold=max(EPS,baseline*return_ratio)
        first=int(np.searchsorted(times,minimum))
        last=int(np.searchsorted(times,cap,side='right'))
        end=cap
        for a,b in runs(envelope[first:last]<=threshold):
            if b-a>=quiet:
                end=max(minimum,float(times[min(first+a,len(times)-1)]))+C['event_pad_sec']
                break
        # A tail must keep falling. End it at the start of the first complete
        # note window whose drop is below the existing return tolerance.
        for i in range(first,max(first,last-window)):
            if envelope[i]<max(EPS,envelope[i+window])*return_ratio:
                end=min(end,max(minimum,float(times[i])))
                break
        end=min(end,cap)
        excluded |= (times>=start)&(times<=end)
    return excluded


def _peaks(spectrum,frequencies):
    peaks,_=find_peaks(spectrum,prominence=EPS)
    refined=[]
    for k in peaks:
        y=np.log(np.maximum(spectrum[k-1:k+2],EPS))
        offset=.5*(y[0]-y[2])/(y[0]-2*y[1]+y[2]+EPS)
        refined.append(frequencies[k]+np.clip(offset,-.5,.5)*(frequencies[1]-frequencies[0]))
    return peaks,np.asarray(refined)


def _voice_root(freq,weights):
    V=AUDIO_TUNING['speech']
    choices=[d/order for d in np.diff(freq) for order in range(1,C['voicing_max_gap_orders']+1)
             if V['pitch_min_hz']<=d/order<=V['pitch_max_hz']]
    best,score=None,0.
    tolerance=dsp.SR/dsp.NFFT/2
    for root in choices:
        orders=np.rint(freq/root).astype(int)
        match=(orders>0)&(np.abs(freq-orders*root)<=tolerance)
        used=np.unique(orders[match])
        if len(used)<C['voicing_series_peaks'] or not np.any(np.diff(used)==1):continue
        density=len(used)/max(1,used[-1]-used[0]+1)
        value=float(weights[match].sum())
        if density>=C['voicing_series_density'] and value>score:best,score=root,value
    return best


def steady_background(S):
    """Frequency-separated bed residual; a vocal harmonic series is removed."""
    rate=dsp.SR/dsp.HOP;freq=np.fft.rfftfreq(dsp.NFFT,1/dsp.SR)
    width=max(1,round(C['line_hold_sec']*rate))
    low=percentile_filter(S,C['low_percentile'],size=(1,width),mode='nearest')
    high=percentile_filter(S,C['high_percentile'],size=(1,width),mode='nearest')
    neighbours=median_filter(low,size=(C['line_neighbours'],1),mode='nearest')
    held=(low>=EPS)&(low/np.maximum(high,EPS)>=10**(-C['stable_span_db']/20))
    held &= low>=neighbours*10**(C['stable_span_db']/20)
    # A robust percentile window alone is insufficient: a brief note can
    # occupy its middle quantiles. Require an actual uninterrupted held run.
    for k in range(len(held)):
        for a,b in runs(held[k]):
            if (b-a)/rate<C['line_hold_sec']:held[k,a:b]=False
    background=np.zeros_like(S);families=np.zeros(S.shape[1],int);has_lines=np.zeros(S.shape[1],bool)
    step=max(1,round(C['line_sample_sec']*rate));tolerance=dsp.SR/dsp.NFFT/2
    for i in range(0,S.shape[1],step):
        peaks,locations=_peaks(low[:,i],freq)
        valid=held[peaks,i];peaks,locations=peaks[valid],locations[valid]
        raw_peaks,raw_freq=_peaks(S[:,i],freq)
        root=_voice_root(raw_freq,S[raw_peaks,i]**2)
        keep=np.ones(len(peaks),bool)
        if root is not None:
            keep=np.abs(locations-np.rint(locations/root)*root)>tolerance
        peaks,locations=peaks[keep],locations[keep]
        roots=[]
        for f in locations:
            if not any(abs(f-round(f/r)*r)<=tolerance for r in roots):roots.append(float(f))
        end=min(S.shape[1],i+step);families[i:end]=len(roots);has_lines[i:end]=len(peaks)>0
        if len(roots)>=C['independent_series_min']:
            mask=np.zeros(S.shape[0],bool);mask[peaks]=True
            mask=maximum_filter1d(mask.astype(np.uint8),size=3)>0
            background[:,i:end]=low[:,i:end]*mask[:,None]
    return background,families,has_lines,low


def measure(S,H,P,times,voice_gap,events=(),possible_gap=None,beat_present=False):
    frame_rate=dsp.SR/dsp.HOP
    if possible_gap is None:possible_gap=np.ones(len(times),bool)
    background,families,has_lines,_=steady_background(S)
    excluded=effect_exclusion(S,times,events)
    clean=~excluded
    ordinary=voice_gap & clean
    independent_supported=(families>=C['independent_series_min'])&clean
    # Each STFT observation covers NFFT samples, not just its last hop.
    # frame_times places it at the window end minus half a hop: preceding
    # hop cells belong to that measured footprint. Require an actual residual
    # line there. Extra observable cells do not seed positive music support;
    # only the existing continuity rule can bridge supported note intervals.
    independent_eligible=independent_supported.copy()
    for offset in range(1,dsp.NFFT//dsp.HOP):
        independent_eligible[:-offset] |= independent_supported[offset:]
    independent_eligible &= has_lines & clean
    observable=ordinary|independent_eligible
    observable_share=float(observable.mean()) if len(times) else 0.
    available=float(ordinary.sum()/frame_rate);fraction=float(ordinary.mean()) if len(times) else 0.
    residual_time=float(clean.sum()/frame_rate)
    evidence={'availableSec':round(available,3),'availableFraction':round(fraction,3),
              'sustainedSec':0.,'coverage':0.,'stability':None,'residualSec':round(residual_time,3),
              'independentSeriesMax':int(families.max()) if len(families) else 0,
              'observableSec':round(float(observable.sum()/frame_rate),3),
              'observableShare':round(observable_share,3),
              'possibleVoiceFraction':round(float((observable & ~possible_gap).sum()/max(1,observable.sum())),3)}
    if residual_time<C['min_available_sec']:
        return {'present':None,'reason':'insufficient observable residual outside effect tails','score':0.,
                'harmonicShare':None,'levelDb':None,'speechToBedDb':None,'evidence':evidence}
    width=max(1,round(C['note_window_sec']*frame_rate))
    low=percentile_filter(H,C['low_percentile'],size=(1,width),mode='nearest')
    high=percentile_filter(H,C['high_percentile'],size=(1,width),mode='nearest')
    stability=low/np.maximum(high,EPS);harmonic=H**2/(H**2+P**2+EPS**2)
    bins=(low>=EPS)&(stability>=10**(-C['stable_span_db']/20))&(harmonic>=C['harmonic_share'])
    ordinary_energy=np.sqrt((H**2*bins).sum(axis=0))
    residual_energy=np.sqrt((background**2).sum(axis=0))
    energy=np.where(ordinary,ordinary_energy,residual_energy)
    power=S**2;flatness=np.exp(np.mean(np.log(power+EPS**2),axis=0))/(power.mean(axis=0)+EPS**2)
    direct=(ordinary_energy>EPS)&(flatness<C['flatness_max'])&ordinary
    independent=(residual_energy>EPS)&independent_supported
    supported=direct|independent
    bridge=max(1,round(C['close_gap_sec']*frame_rate))
    # Short masked attacks are missing observations, not proof the bed stopped.
    # Bridge note/percussion gaps, but never count excluded/voice frames as music.
    part=np.pad(supported,(bridge,bridge),mode='edge')
    closed=binary_closing(part,structure=np.ones(bridge))[bridge:-bridge]
    material=np.zeros(len(times),bool)
    for a,b in runs(closed):
        if observable[a:b].sum()/frame_rate>=C['note_window_sec']:material[a:b]=observable[a:b]
    sustained=float(material.sum()/frame_rate)
    coverage=float(material.sum()/max(1,observable.sum()))
    present=(sustained>=C['min_material_sec'] and coverage>=C['coverage_min']
             and observable_share>=C['observable_share_min'])
    stable=float(np.median(stability[bins & material[None,:]])) if np.any(bins & material[None,:]) else 0.
    duration_score=min(1.,(sustained if present else residual_time)/C['confidence_full_sec'])
    score=(duration_score*coverage*max(stable,coverage))**(1/3) if present else min(C['residual_absence_score_max'],np.sqrt(duration_score*float(clean.mean())))
    evidence.update(sustainedSec=round(sustained,3),coverage=round(coverage,3),stability=round(stable,3))
    speech=~voice_gap;total=dsp.db(np.sqrt((S**2).sum(axis=0)))
    line_time=max(((b-a)/frame_rate for a,b in runs(has_lines & clean)),default=0.)
    # With no observable frames, retain the existing vocal-only residual
    # absence/abstention path below; no undefined median invents a level.
    if observable.any() and observable_share<C['observable_share_min']:
        difference=float(np.median(total[speech])-np.median(total[observable])) if speech.any() else None
        evidence['observedBelowSpeechDb']=round(difference,1) if difference is not None else None
        absent=(difference is not None and difference>=C['residue_below_speech_db'] and line_time<C['line_hold_sec'])
        return {'present':False if absent else None,
                'reason':'less than a quarter observable; the only residue is at least 30 dB under speech' if absent else 'less than a quarter observable cannot represent a bed under the rest of the reel',
                'score':round(float(score),3) if absent else 0.,'harmonicShare':0. if absent else None,
                'levelDb':None,'speechToBedDb':None,'evidence':evidence}
    if not present and beat_present and (~voice_gap).any():
        return {'present':None,'reason':'confirmed voice over a beat without sustained non-voice music is ambiguous','score':0.,
                'harmonicShare':None,'levelDb':None,'speechToBedDb':None,'evidence':evidence}
    if not present and (available<C['min_available_sec'] or fraction<C['min_available_fraction']):
        # Isolated unresolved bins at syllable edges are not a steady line.
        if line_time>=C['line_hold_sec']:
            return {'present':None,'reason':'stable residual has insufficient independent harmonic series','score':0.,
                    'harmonicShare':None,'levelDb':None,'speechToBedDb':None,'evidence':evidence}
        score=min(score,C['residual_absence_score_max'])
    level=float(np.median(dsp.db(np.maximum(energy[material],EPS)))) if present else None
    speech_to_bed=float(np.median(total[speech]))-level if present and speech.any() else None
    return {'present':bool(present),'reason':'sustained independent non-percussive material' if present else 'no steady lines in observable bed residual',
            'score':round(float(score),3),'harmonicShare':round(float(np.median(harmonic[bins & material[None,:]])),3) if present and np.any(bins & material[None,:]) else 0.,
            'levelDb':round(level,1) if level is not None else None,'speechToBedDb':round(speech_to_bed,1) if speech_to_bed is not None else None,'evidence':evidence}
