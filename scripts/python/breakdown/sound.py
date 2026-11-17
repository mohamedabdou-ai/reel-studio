# scripts/python/breakdown/sound.py
import numpy as np
from scipy.signal import butter, sosfiltfilt

from . import dsp
from .speech_activity import independent_activity, combine_activity
from .rhythm import suppression_family, matches_pulse
from .audio_config import AUDIO_TUNING, BEAT_CONFIDENCE_MIN
from .sfx_events import transient_events
from .bed import measure as measure_bed

SR = dsp.SR
RULE_ORDER = ("riser", "whoosh", "ding", "impact", "click", "pop", "hit")
C = AUDIO_TUNING['sfx']


def gap_mask(times, speech, pad=AUDIO_TUNING['speech']['mask_pad_sec']):
    mask = np.ones(len(times), bool)
    for span in speech:
        mask &= ~((times >= span["start"] - pad) & (times <= span["end"] + pad))
    return mask


def bed_info(H, P, gap, events=(), spectrum=None, possible_gap=None, beat_present=False):
    """Sustained non-percussive music, measured outside voice and effect tails."""
    return measure_bed(H+P if spectrum is None else spectrum,H,P,dsp.frame_times(H.shape[1]),gap,events,possible_gap,beat_present)


def _rms(x, hop=128):
    n = len(x) // hop
    return np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12) if n else np.zeros(0)


def _centroid(spec, freqs):
    return float((freqs * spec).sum() / (spec.sum() + 1e-12))


def sfx_features(signal, t, hop=C['feature_hop'], event=None):
    i = int(t * SR)
    pre = signal[max(0, i - int(C['feature_pre_sec'] * SR)):i]
    first = max(0, i - int(C['feature_lookback_sec'] * SR))
    last_time = min(t+C['feature_ahead_sec'],event.get('next',t+C['feature_ahead_sec'])) if event else t+C['feature_ahead_sec']
    last = min(len(signal), int(last_time * SR) + hop)
    seg = signal[first:last]
    feature_signal = signal
    if event:
        if event['end']-event['t'] >= C['riser_attack_sec']:
            low,high = C['bands_hz'][min(event['bands'])],C['bands_hz'][max(event['bands'])+1]
        else:
            n = round(C['feature_attack_sec']*SR)
            attack = np.pad(signal[i:i+n],(0,max(0,i+n-len(signal))))
            prior = np.pad(signal[max(0,i-n):i],(max(0,n-i),0))
            power = np.maximum(np.abs(np.fft.rfft(attack*np.hanning(n)))**2-np.abs(np.fft.rfft(prior*np.hanning(n)))**2,0)
            frequency = np.fft.rfftfreq(n,1/SR)[int(np.argmax(power))]
            band = max(0,min(len(C['bands_hz'])-2,int(np.searchsorted(C['bands_hz'],frequency,side='right'))-1))
            low,high = C['bands_hz'][band:band+2]
        # Broadband attacks need the full mixture envelope even when only one
        # proposal band cleared its local threshold.
        n = round(C['feature_attack_sec']*SR)
        attack = np.pad(signal[i:i+n],(0,max(0,i+n-len(signal))))
        power = np.abs(np.fft.rfft(attack*np.hanning(n)))**2
        flatness = np.exp(np.mean(np.log(power+1e-12)))/(power.mean()+1e-12)
        if flatness >= C['broadband_flatness']:
            low,high = 0,SR/2+1
        if low > 0 or high < SR/2:
            cutoff = [low,high] if low > 0 and high < SR/2 else low if low > 0 else high
            kind = 'bandpass' if isinstance(cutoff,list) else 'highpass' if low > 0 else 'lowpass'
            feature_signal = sosfiltfilt(butter(C['feature_filter_order'],cutoff,btype=kind,fs=SR,output='sos'),signal)
    seg = feature_signal[first:last]
    pre = feature_signal[max(0,i-int(C['feature_pre_sec']*SR)):i]
    env = _rms(feature_signal[first:last], hop)
    base = float(np.median(_rms(feature_signal[max(0,i-int(C['feature_pre_sec']*SR)):i], hop))) if len(pre) >= hop else 0.0
    if not len(env):
        return {'riseAboveBaseline':0.,'attack':0.,'decay':0.,'dur':0.,'centroid':0.,'peakHz':0.,'flatness':0.,'rising':False}
    search = max(0, (i - first) // hop)
    peak_i = search + int(np.argmax(env[search:])) if search < len(env) else len(env)-1
    lift = max(float(env[peak_i]) - base, 1e-9)
    above = env - base
    start_i = peak_i
    while start_i > 0 and above[start_i - 1] > C['boundary_share'] * lift:
        start_i -= 1
    end_i = peak_i
    while end_i < len(env) - 1 and above[end_i + 1] > C['boundary_share'] * lift:
        end_i += 1
    attack, decay = (peak_i - start_i) * hop / SR, (end_i - peak_i) * hop / SR
    a = start_i * hop
    b = min(len(seg), max(a + 512, (end_i + 1) * hop))
    event = seg[a:b]
    window = np.hanning(len(event))
    spec = np.abs(np.fft.rfft(event * window)) ** 2
    if len(pre) >= len(event):
        spec = np.maximum(spec - np.abs(np.fft.rfft(pre[-len(event):] * window)) ** 2, 0)
    freqs = np.fft.rfftfreq(len(event), 1 / SR)
    flatness = float(np.exp(np.mean(np.log(spec + 1e-12))) / (spec.mean() + 1e-12))
    rising = False
    if attack >= C['riser_attack_sec']:
        half = a + (peak_i * hop - a) // 2
        first, second = seg[a:half], seg[half:peak_i * hop]
        if len(first) >= 256 and len(second) >= 256:
            rising = _centroid(np.abs(np.fft.rfft(second)) ** 2, np.fft.rfftfreq(len(second), 1 / SR)) > C['riser_centroid_ratio'] * _centroid(np.abs(np.fft.rfft(first)) ** 2, np.fft.rfftfreq(len(first), 1 / SR))
    return {"riseAboveBaseline": round(float(env[peak_i]) - base, 6), "attack": round(attack, 3), "decay": round(decay, 3), "dur": round(attack + decay, 3), "centroid": round(_centroid(spec, freqs), 1),
            "peakHz": round(float(freqs[int(np.argmax(spec))]), 1), "flatness": round(flatness, 3), "rising": rising}


def sfx_type(f):
    if f["attack"] >= C['riser_attack_sec'] and f["rising"]:
        return "riser"
    if 0.15 <= f["dur"] <= 1.0 and f["attack"] >= 0.03 and f["flatness"] >= C['broadband_flatness']:
        return "whoosh"
    # A beat kick inside a ding's tail drags the centroid down; the dominant peak keeps the ding.
    if f["flatness"] < 0.1 and f["decay"] >= 0.2 and max(f["centroid"], f["peakHz"]) >= 1500:
        return "ding"
    if f["centroid"] < 1500 and f["peakHz"] < 1500 and f["attack"] < 0.02 and f["decay"] >= 0.15:
        return "impact"
    if f["dur"] < 0.06 and f["centroid"] >= 2500:
        return "click"
    if f["dur"] < 0.15 and f["attack"] < 0.02:
        return "pop"
    return "hit"


def _matches_component(spectrum, group, event, times):
    near = [at for at in group['centres'] if abs(event['t']-times[at]) <= AUDIO_TUNING['rhythm']['grid_tolerance_sec']]
    if not near and event['t'] <= times[0]:
        # At a file boundary there is no previous FFT. Prepend silence only for
        # the template comparison; this is generic, not a special kick rule.
        local = np.column_stack([np.zeros(spectrum.shape[0]),spectrum[:,:AUDIO_TUNING['rhythm']['tail_end_frames']+1]])
        matched = matches_pulse(local,1,group,boundary=True)
    else:
        matched = any(matches_pulse(spectrum,int(at),group) for at in near)
    if not matched:
        return False
    freq = np.fft.rfftfreq(dsp.NFFT,1/SR)
    band = (freq>=C['bands_hz'][event['band']]) & (freq<C['bands_hz'][event['band']+1])
    # A one-off effect on a recorded pulse cannot teach its own template.
    expected = np.median(spectrum[:,group['centres']]**2,axis=1)
    expected = expected/(expected.sum()+C['epsilon']**2)
    if expected[band].sum() < C['cross_band_floor']**2 and event['bandPowerShare'] >= C['cross_band_floor']**2:
        return False  # A quiet independent component, even under a louder kick.
    if event['bandLineShare'] >= C['speech_tonal_share'] and event['bandPowerShare'] >= C['cross_band_floor']**2 and np.any(band):
        peak = freq[np.flatnonzero(band)[np.argmax(expected[band])]]
        if abs(peak-event['bandPeakHz']) > SR/C['frame']:
            return False  # Resolved line differs by more than one analysis bin.
    return True


def candidates(envelope, times, gap, beats, anchors, frame_rate, spectrum=None, rhythm=(), signal=None):
    beats = np.asarray(beats, float)
    beat_level = float(np.median([envelope[np.argmin(np.abs(times - b))] for b in beats])) if len(beats) else None
    found = []
    if signal is None:
        raise ValueError('transient detection requires the audio signal')
    for event in transient_events(signal, lambda at:np.interp(at,times,(~gap).astype(float)) >= .5):
        t = event['t']
        p = int(np.argmin(np.abs(times - event['peak'])))
        on_beat = bool(any(abs(t-b) <= AUDIO_TUNING['rhythm']['grid_tolerance_sec'] for b in beats)
                       or any(abs(t-times[at]) <= AUDIO_TUNING['rhythm']['grid_tolerance_sec'] for g in rhythm for at in g['centres']))
        template = next((g for g in rhythm if spectrum is not None and _matches_component(spectrum,g,event,times)),None) if on_beat or p==0 else None
        if template is not None:
            on_beat = True
        if on_beat:
            different = bool(rhythm) and template is None
            level = float(np.median(envelope[template["centres"]])) if template is not None else beat_level
            if not different and (level is None or envelope[p] < AUDIO_TUNING['rhythm']['pulse_level_contrast'] * level):
                continue
        found.append({'t':round(t,3), 'strength':round(event['strength'],2), 'onBeat':on_beat,
                      'evidence':event['mode'], 'effectBranches':event['branches'], 'voiceAligned':event['voiceAligned'],
                      'gradeThreshold':C['candidate_grade_min'], 'attackRiseDb':round(event['riseDb'],2), '_event':event})
    found.sort(key=lambda c:c['t'])
    for a,b in zip(found,found[1:]):
        a['_event']['next'] = b['t']
    return found


def analyse_signal(signal, speech=(), anchors=(), cuts=(), yamnet=None, speech_activity=None):
    signal = np.asarray(signal, dtype=np.float32)
    if signal.ndim != 1 or not np.isfinite(signal).all():
        raise ValueError("expected finite mono audio")
    duration = len(signal) / SR
    if not len(signal):
        return {"bed": None, "tempo": None, "tempoReason": 'no-audio', "beats": [], "cutsOnBeat": None, "sfx": [], 'sfxCandidates':[]}
    S = dsp.spectrogram(signal)
    times = dsp.frame_times(S.shape[1])
    frame_rate = SR / dsp.HOP
    H, P = dsp.hpss(S)
    independent = speech_activity if speech_activity is not None else independent_activity(signal, yamnet)
    if abs(independent["durationSec"] - duration) > 1 / SR:
        raise ValueError("speech evidence does not belong to this audio duration")
    activity = combine_activity(independent, speech)
    gap = gap_mask(times, activity["spans"] + activity.get('possibleSpans', []))
    background_gap = gap_mask(times, activity.get('backgroundSpans', activity['spans']))
    tempo_diagnostics = {}
    tempo_info = dsp.tempo(dsp.onset_envelope(P), background_gap.astype(np.float32), frame_rate, spectrum=S, diagnostics=tempo_diagnostics)
    beats = []
    rhythm = []
    if tempo_info and tempo_info["confidence"] >= BEAT_CONFIDENCE_MIN:
        beats = dsp.beat_grid(dsp.onset_envelope(P), background_gap.astype(np.float32), frame_rate, tempo_info["periodFrames"])
        rhythm = suppression_family(S, background_gap.astype(np.float32), frame_rate, tempo_info["periodFrames"])
    cut_list = list(cuts)
    on_beat = {"share": None, "chance": None, "synced": None}
    if tempo_info and beats and len(cut_list) >= 4:
        period = 60.0 / tempo_info["bpm"]
        hits = sum(1 for c in cut_list if min(abs(b - c) for b in beats) <= 0.07)
        share, chance = hits / len(cut_list), min(1.0, 0.14 / period)
        on_beat = {"share": round(share, 3), "chance": round(chance, 3), "synced": share >= max(0.5, 1.8 * chance)}
    sfx, sfx_candidates = [], []
    raw_flux = np.r_[0., np.maximum(np.diff(S,axis=1),0).sum(axis=0)]
    for c in candidates(raw_flux, times, gap, beats, list(anchors), frame_rate, S, rhythm, signal=signal):
        if c["t"] >= duration - .008:
            continue
        event = c.pop('_event')
        features = sfx_features(signal, c["t"], event=event)
        kind = sfx_type(features)
        reasons = event['rejectionReasons']
        status = 'needs-confirmation' if reasons else 'confirmed'
        hint = None
        if yamnet:
            from .yamnet_backend import label
            i = int(c["t"] * SR)
            segment = signal[max(0, i - int(0.25 * SR)):max(0, i - int(0.25 * SR)) + int(0.975 * SR)]
            if len(segment) == int(0.975 * SR):
                hint = label(segment, yamnet["model"], yamnet["classMap"])
        (sfx_candidates if reasons else sfx).append({**c, "dur": features["dur"], "type": kind, "features": features, "yamnet": hint,
                    'typeConfidence':'low' if kind=='hit' else 'medium',
                    'status':status,'confidence':'low' if reasons else 'high','detection':'candidate' if reasons else 'effect',
                    'candidateReasons':reasons,'confirmHow':f'Listen to the original audio at {c["t"]}s.',
                    "score": 0.45 if reasons else 0.75})
    if tempo_info:
        tempo_info = {k: v for k, v in tempo_info.items() if k != "periodFrames"}
    beats = [t for t in beats if t < duration]
    bed_gap=gap_mask(times,activity['spans'],pad=0)
    possible_gap=gap_mask(times,activity.get('possibleSpans',[]),pad=0)
    bed = bed_info(H,P,bed_gap,sfx+sfx_candidates,spectrum=S,possible_gap=possible_gap,beat_present=tempo_info is not None)
    return {"bed": bed, "tempo": tempo_info, "tempoReason": tempo_diagnostics['reason'],
            "beats": beats, "cutsOnBeat": on_beat, "sfx": sfx, 'sfxCandidates':sfx_candidates, "speechActivity": activity,
            "beatFamily": {"method": "repeated-spectral-pulses", "classes": [{"role": g["role"], "count": len(g["centres"])} for g in rhythm],
                           "pulses": sorted(set(float(times[p]) for g in rhythm for p in g["centres"]))}}


def analyse(request):
    signal = dsp.load_wav(request["wav"])
    return {"sound": analyse_signal(signal, request.get("speech") or [], request.get("anchors") or [], request.get("cuts") or [], request.get("yamnet"), request.get("speechActivity"))}
