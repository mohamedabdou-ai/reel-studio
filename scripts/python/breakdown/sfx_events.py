"""Local multi-band transients. Speech predicts a background, never vetoes time."""
import numpy as np
from scipy.signal import stft, find_peaks
from scipy.ndimage import percentile_filter, maximum_filter1d, gaussian_filter1d, median_filter
from . import dsp
from .audio_config import AUDIO_TUNING

C = AUDIO_TUNING['sfx']


def acceptance_reasons(event):
    """The only reporting rule; effect type is deliberately absent."""
    reasons = []
    if event['strength'] < C['candidate_grade_min']: reasons.append('below-false-alarm-grade')
    if not event['audibleRise']: reasons.append('total-rise-unverified')
    if not event['effectRulePassed']: reasons.append('speech-shape-unverified')
    return reasons


def speech_effect_branches(event):
    """Independent tonal evidence must not be locked to the vocal harmonic comb."""
    duration = event['end']-event['t']
    return {
        'tonal':event['lineShare'] >= C['speech_tonal_share'] and not event.get('voiceAligned',False)
                and (event['attack'] <= C['attack_probe_sec'] or duration >= C['speech_sweep_sec']),
        'click':event['band'] >= len(C['bands_hz'])-3 and event['attack'] <= C['speech_click_attack_sec'] and event['impulseDur'] <= C['speech_click_duration_sec'],
        'sweep':duration >= C['speech_sweep_sec'] and len(event['bands']) >= C['speech_sweep_bands'],
        'bass':event['peakHz'] < C['speech_model_band_hz'][0] and event['attack'] <= C['speech_plosive_sec'],
    }


def _context(values, percentile, frame_rate, guard=True, past_only=False):
    radius = max(1, round(C['context_sec'] * frame_rate / 2))
    footprint = np.ones((1, 2 * radius + 1), bool)
    if guard:
        gap = min(radius - 1, round(C['guard_sec'] * frame_rate))
        footprint[:, radius-gap:radius+gap+1] = False
    if past_only:
        footprint[:,radius:] = False
    return percentile_filter(values, percentile, footprint=footprint, mode='reflect')


def _vocal_comb(signal, peak, residual, frequencies, raw):
    V = AUDIO_TUNING['speech']
    at = round(peak * dsp.SR)
    # Estimate voice before the attack: a later effect must not destroy the
    # pitch evidence and turn the preceding syllable into a second effect.
    start = max(0,at-V['frame'])
    clip = signal[start:start+V['frame']]
    clip = np.pad(clip,(0,max(0,V['frame']-len(clip))))
    clip = clip - clip.mean()
    ac = np.correlate(clip,clip,mode='full')[len(clip)-1:]
    lo,hi = int(dsp.SR/V['pitch_max_hz']),int(dsp.SR/V['pitch_min_hz'])
    lag = lo + int(np.argmax(ac[lo:hi+1]))
    if ac[lag] / (ac[0]+C['epsilon']**2) < V['periodicity']:
        # Word starts have no preceding pitch. A following voiced window can
        # explain their harmonic comb; an isolated effect cannot create one.
        clip = signal[at:at+V['frame']]
        clip = np.pad(clip,(0,max(0,V['frame']-len(clip))))
        clip = clip-clip.mean()
        ac = np.correlate(clip,clip,mode='full')[len(clip)-1:]
        lag = lo+int(np.argmax(ac[lo:hi+1]))
        if ac[lag] / (ac[0]+C['epsilon']**2) < V['periodicity']:
            return False, 0
    pitch = dsp.SR/lag
    near = np.abs(frequencies/pitch-np.rint(frequencies/pitch)) <= max(C['speech_harmonic_width'],(frequencies[1]-frequencies[0])/pitch)
    peaks,_ = find_peaks(residual,prominence=float(residual.max())*V['peak_prominence'])
    raw_peaks,_ = find_peaks(raw,prominence=float(raw.max())*V['peak_prominence'])
    return bool(sum(near[raw_peaks]) >= C['speech_harmonic_peaks'] and residual[near].sum() >= C['speech_harmonic_share']*residual.sum()), sum(near[peaks])


def _speech_residual(power, frequencies, frame_rate):
    stride = C['speech_stride']
    reference = _context(power[:, ::stride], C['speech_percentile'], frame_rate / stride, past_only=C['speech_past_only'])
    width = max(1, round(C['speech_spread_hz'] / (frequencies[1] - frequencies[0])))
    reference = maximum_filter1d(reference, size=width, axis=0, mode='nearest')
    positions = np.arange(power.shape[1])
    reference = np.array([np.interp(positions, positions[::stride], row) for row in reference])
    use = (frequencies >= C['speech_gain_band_hz'][0]) & (frequencies <= C['speech_gain_band_hz'][1])
    ratios = power[use] / (reference[use] + C['epsilon'] ** 2)
    gain = np.percentile(ratios, C['speech_gain_percentile'], axis=0)
    model = (frequencies >= C['speech_model_band_hz'][0]) & (frequencies <= C['speech_model_band_hz'][1])
    reference[~model] = 0
    return np.maximum(power - C['speech_margin'] * reference * gain[None, :], 0)


def transient_events(signal, speech_at):
    """Return attack intervals with band evidence, before accompaniment filtering."""
    frame_rate = dsp.SR / C['hop']
    x = np.pad(np.asarray(signal), (0, max(0, C['frame'] - len(signal))))
    # Mean subtraction in a partly silent onset window creates a false DC step.
    frequencies, times, z = stft(x, fs=dsp.SR, nperseg=C['frame'], noverlap=C['frame']-C['hop'], boundary=C['boundary'], padded=True)
    power = np.abs(z) ** 2
    raw = np.array([np.sqrt(power[(frequencies >= a) & (frequencies < b)].sum(axis=0)) for a,b in zip(C['bands_hz'], C['bands_hz'][1:])])
    speech = np.asarray(speech_at(times), bool)
    envelope_residual = _speech_residual(power, frequencies, frame_rate) if speech.any() else power
    residual_power = envelope_residual
    residual = np.array([np.sqrt(residual_power[(frequencies >= a) & (frequencies < b)].sum(axis=0)) for a,b in zip(C['bands_hz'], C['bands_hz'][1:])])
    unexplained = (residual**2/(raw**2+C['epsilon']**2))**C['speech_share_exponent']
    floor = _context(raw, C['floor_percentile'], frame_rate,past_only=C['local_past_only'])
    spread = _context(raw, C['spread_percentile'], frame_rate,past_only=C['local_past_only']) - floor
    scale = np.maximum(spread, 0) + C['floor_scale'] * floor + C['cross_band_floor'] * np.sqrt((floor ** 2).sum(axis=0)) + C['epsilon']
    # The speaker can continue between close clicks. Fit phonetic background
    # after a median over the already-declared attack exclusion interval;
    # otherwise the preceding two clicks teach the third one as speech noise.
    width = 2*round(C['guard_sec']*frame_rate)+1
    residual_background = median_filter(residual,size=(1,width),mode='reflect')
    residual_floor = _context(residual_background,C['floor_percentile'],frame_rate)
    residual_spread = _context(residual_background,C['speech_noise_percentile'],frame_rate,past_only=True)-residual_floor
    speech_scale = np.maximum(residual_spread,0)+C['floor_scale']*residual_floor+C['cross_band_floor']*np.sqrt(power.sum(axis=0))+C['epsilon']
    # Numerator and denominator need the same time support. Otherwise smoothed
    # energy from the next word is divided by a still-silent frame's tiny floor.
    speech_scale = gaussian_filter1d(speech_scale,sigma=max(1,C['smooth_sec']*frame_rate),axis=1)
    total_excess = np.maximum(np.sqrt((raw**2).sum(axis=0))-np.sqrt((floor**2).sum(axis=0)),0)
    # A short waveform RMS sees real gaps hidden by overlapping FFT windows.
    short = np.pad(signal,(0,(-len(signal)) % C['hop']))
    time_energy = np.sqrt(np.mean(short.reshape(-1,C['hop'])**2,axis=1))
    proposals = []
    for mode, energy in [('local', raw), ('speech-residual', residual)]:
        if mode == 'speech-residual' and not speech.any():
            continue
        energy = gaussian_filter1d(energy, sigma=max(1, C['smooth_sec'] * frame_rate), axis=1)
        excess = np.maximum(energy - (floor if mode == 'local' else 0), 0)
        grades = excess / (speech_scale if mode == 'speech-residual' else scale)
        if mode == 'speech-residual':
            grades *= unexplained
        total_energy = np.sqrt((power if mode=='local' else residual_power).sum(axis=0))
        if mode == 'local':
            # A 32 ms FFT bridges short real silences. Full-band waveform RMS
            # measures the actual gap before a second independent attack.
            rms_times=(np.arange(len(time_energy))+.5)*C['hop']/dsp.SR
            total_energy=np.interp(times,rms_times,time_energy)
        for band, grade in enumerate(grades):
            peaks, _ = find_peaks(grade, prominence=C['grade_prominence'])
            if grade[0] >= C['grade_prominence'] and (len(grade) == 1 or grade[0] >= grade[1]):
                peaks = np.r_[0, peaks]
            for peak in peaks:
                vocal = False
                if speech[peak] != (mode == 'speech-residual'):
                    continue
                if mode == 'speech-residual':
                    novel = envelope_residual[:,peak]
                    if novel.sum() <= C['epsilon']**2:
                        continue
                    outside = (frequencies < C['speech_model_band_hz'][0]) | (frequencies > C['speech_model_band_hz'][1])
                    model_error = novel.sum() < C['speech_model_error_share']*power[:,peak].sum()
                    external = novel[outside].sum() >= C['speech_outside_share']*novel.sum()
                    if model_error and not external:
                        continue
                level = excess[band, peak]
                left = right = int(peak)
                while left and excess[band, left-1] > C['boundary_share'] * level:
                    left -= 1
                while right+1 < len(times) and excess[band, right+1] > C['boundary_share'] * level:
                    right += 1
                if mode == 'speech-residual':
                    # Do not infer timbre from the first few samples of a word.
                    # Confirm at its band-energy peak, while retaining the early
                    # onset time. External bright/bass evidence remains separate.
                    confirmation = left+int(np.argmax(raw[band,left:right+1]))
                    vocal, harmonics = _vocal_comb(signal,times[confirmation],envelope_residual[:,confirmation],frequencies,power[:,confirmation])
                    if not external and vocal and (times[confirmation]-times[left] > C['attack_probe_sec'] or harmonics >= C['speech_harmonic_peaks']):
                        continue
                if mode == 'speech-residual' and times[right]-times[left] < C['speech_plosive_sec']:
                    if not external and novel.max() < C['speech_line_share']*novel.sum():
                        continue
                if times[right] - times[left] > C['max_event_sec']:
                    continue
                if times[left] >= len(signal) / dsp.SR:
                    continue
                probe = max(1, round(C['attack_probe_sec'] * frame_rate))
                before_total = float(np.percentile(total_energy[max(0,left-probe):left],C['floor_percentile'])) if left else 0.
                if mode == 'local' and left:
                    first=max(0,int((times[left]-C['attack_probe_sec'])*frame_rate))
                    last=min(len(time_energy),int(times[left]*frame_rate))
                    if last>first and np.any(time_energy[first:last] <= C['epsilon']):
                        # A measured quiet gap is stronger evidence than FFT
                        # interpolation across the preceding attack's window.
                        before_total=C['epsilon']
                before_total = max(C['epsilon'],before_total)
                after_total = float(np.mean(total_energy[peak:min(len(times),peak+probe)]))
                band_mask = (frequencies>=C['bands_hz'][band]) & (frequencies<C['bands_hz'][band+1])
                band_indices = np.flatnonzero(band_mask)
                band_peak = int(band_indices[np.argmax(envelope_residual[band_mask,peak])])
                proposals.append({'t':0. if left == 0 else float(times[left]), 'end':float(times[right]), 'peak':float(times[peak]),
                                  'strength':float(grade[peak]), 'band':band, 'level':float(level), 'mode':mode,
                                  'voiceAligned':bool(vocal), 'audibleRise':bool(after_total > C['attack_energy_rise']*before_total),
                                  'riseDb':float(20*np.log10(max(after_total,C['epsilon'])/before_total)),
                                  'bandPeakHz':float(frequencies[band_peak]),
                                  'bandPowerShare':float(power[band_mask,peak].sum()/(power[:,peak].sum()+C['epsilon']**2)),
                                  'bandLineShare':float(envelope_residual[max(0,band_peak-1):band_peak+2,peak].sum()/(envelope_residual[band_mask,peak].sum()+C['epsilon']**2)),
                                  # Remove the known analysis-window blur from
                                  # morphology, never from the stored onset.
                                  'attack':max(0.,float(times[left+int(np.argmax(excess[band,left:right+1]))]-times[left])-C['frame']/(2*dsp.SR)),
                                  'impulseDur':max(C['hop']/dsp.SR,float(times[right]-times[left])-C['frame']/dsp.SR),
                                  'lineShare':float(envelope_residual[max(0,int(np.argmax(envelope_residual[:,peak]))-1):int(np.argmax(envelope_residual[:,peak]))+2,peak].sum()/(envelope_residual[:,peak].sum()+C['epsilon']**2)),
                                  'peakHz':float(frequencies[int(np.argmax(envelope_residual[:,peak]))]),
                                  'bassShare':float(raw[0,peak]**2/(np.sum(raw[:,peak]**2)+C['epsilon']**2))})
    # Merge the same attack across bands and noise ripples within one envelope.
    # Distinct same-band attacks survive when their valley demonstrates a reset.
    events = []
    for event in sorted(proposals, key=lambda e:(e['t'], e['peak'])):
        match = None
        for previous in reversed(events):
            a,b = np.searchsorted(times,[previous['end'],event['t']])
            bridge = total_excess[min(a,b):max(a,b)+1]
            old_peak,new_peak = np.searchsorted(times,[previous['peak'],event['peak']])
            peak_floor = min(np.linalg.norm(raw[:,old_peak]),np.linalg.norm(raw[:,new_peak]))
            continuous = bool(len(bridge) and np.min(bridge) > C['boundary_share']*peak_floor
                              and max(event['t']-previous['end'],0) <= C['max_event_sec'])
            probe = max(1,round(C['attack_probe_sec']*frame_rate))
            before = float(np.mean(np.linalg.norm(raw[:,max(0,new_peak-probe):new_peak],axis=0))) if new_peak else 0.
            fresh = np.linalg.norm(raw[:,new_peak]) > C['bridge_growth_ratio']*before+C['epsilon']
            if fresh and event['t'] > previous['t']+C['merge_attack_sec']:
                continuous = False
            if event['t'] > previous['end'] + C['merge_attack_sec'] and not continuous:
                continue
            simultaneous = (abs(event['t'] - previous['t']) <= C['merge_attack_sec']
                            or abs(event['peak']-previous['peak']) <= C['merge_attack_sec'])
            # FFT windows can overlap across a real short silence, including
            # when successive attacks occupy different bands. Check the total
            # energy valley, not just overlap of the proposed band intervals.
            mixture = np.linalg.norm(raw[:,min(old_peak,new_peak):max(old_peak,new_peak)+1],axis=0)
            time_a,time_b = sorted([min(len(time_energy)-1,round(previous['peak']*frame_rate)),min(len(time_energy)-1,round(event['peak']*frame_rate))])
            wave = time_energy[max(0,time_a):min(len(time_energy),time_b+1)]
            levels = [time_energy[k] for k in [time_a,time_b]]
            threshold = C['restart_valley']*min(levels)
            real_gap = len(wave)>2 and np.min(wave[1:-1]) < threshold
            separate_peaks = abs(event['peak']-previous['peak']) > C['merge_attack_sec']
            if separate_peaks and (real_gap or np.min(mixture) < C['restart_valley']*peak_floor):
                if real_gap:
                    resumed = (time_a+int(np.flatnonzero(wave<threshold)[-1])+1)/frame_rate
                    later = event if event['peak']>previous['peak'] else previous
                    later['t'] = max(later['t'],resumed)
                    later['attack'] = max(0.,later['peak']-later['t']-C['frame']/(2*dsp.SR))
                    later['impulseDur'] = max(C['hop']/dsp.SR,later['end']-later['t']-C['frame']/dsp.SR)
                continue
            if separate_peaks and event['mode'] == previous['mode'] == 'speech-residual':
                # Raw voice can bridge the gap between two clicks. Test the
                # independent residual component, not the continuing speaker.
                band_values = residual[event['band']]
                valley = band_values[min(old_peak,new_peak):max(old_peak,new_peak)+1]
                threshold = C['restart_valley']*min(band_values[old_peak],band_values[new_peak])
                if len(valley)>2 and np.min(valley[1:-1]) < threshold:
                    later = event if event['peak']>previous['peak'] else previous
                    resume = min(old_peak,new_peak)+int(np.flatnonzero(valley<threshold)[-1])+1
                    later['t'] = max(later['t'],float(times[min(resume,len(times)-1)]))
                    continue
            same_band = event['band'] in previous['bands']
            if same_band and not simultaneous and old_peak != new_peak:
                values = raw[event['band']] if event['mode'] == 'local' else residual[event['band']]
                valley = np.min(values[min(old_peak,new_peak):max(old_peak,new_peak)+1])
                if valley < C['restart_valley']*min(values[old_peak],values[new_peak]):
                    continue
            if simultaneous or same_band and event['t'] <= previous['end'] or continuous:
                match = previous
                break
        if match is None:
            events.append({**event, 'bands':{event['band']}})
        else:
            # Coincident peaks with unequal leading envelopes are one attack.
            # Use the stronger novel band, not a preceding voiced formant skirt.
            if abs(event['peak']-match['peak']) <= C['merge_attack_sec']:
                onset = event['t'] if event['strength'] > match['strength'] else match['t']
            else:
                onset = min(match['t'],event['t'])
            match['t'] = onset; match['end'] = max(match['end'], event['end'])
            match['bands'].add(event['band'])
            if event['strength'] > match['strength']:
                for key in ['peak','strength','level','band','mode','bassShare','lineShare','peakHz','attack','impulseDur','voiceAligned','audibleRise','riseDb','bandPeakHz','bandLineShare','bandPowerShare']:
                    match[key] = event[key]
    # Non-maximum suppression in integer analysis frames prevents duplicate
    # onsets without chaining a weak middle proposal across two real attacks.
    def priority(event):
        shape=event['mode']=='local' or any(speech_effect_branches(event).values())
        passed=event['strength']>=C['candidate_grade_min'] and event['audibleRise'] and shape
        return (not passed,-event['strength'],event['t'])
    coalesced = []
    merge_frames=round(C['merge_attack_sec']*frame_rate)
    for event in sorted(events,key=priority):
        existing=next((e for e in coalesced if abs(round(e['t']*frame_rate)-round(event['t']*frame_rate))<=merge_frames),None)
        if existing is None:
            coalesced.append(dict(event))
        else:
            existing['end']=max(existing['end'],event['end']);existing['bands']=existing['bands']|event['bands']
    accepted = []
    for event in coalesced:
        duration = event['end']-event['t']
        if duration > C['max_event_sec']:
            continue
        event['branches'] = speech_effect_branches(event) if event['mode']=='speech-residual' else {'local':True}
        event['effectRulePassed'] = bool(any(event['branches'].values()))
        event['rejectionReasons'] = acceptance_reasons(event)
        accepted.append(event)
    return sorted(accepted,key=lambda e:e['t'])
