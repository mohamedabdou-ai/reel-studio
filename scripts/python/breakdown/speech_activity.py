"""Independent, local voice evidence; ASR text is corroboration, never a detector.

DSP requires periodic excitation and vocal spectral-envelope resonances. Pitch
motion alone is ambiguous; held vowels can retain formants at constant pitch.
Possible or music-mixed evidence cannot erase background bed/tempo observations.
No model is acquired. Optional installed YAMNet Speech scores are independent votes.
"""
import numpy as np
from scipy.signal import find_peaks
from scipy.ndimage import binary_closing, binary_opening, binary_dilation, median_filter, gaussian_filter1d

from . import dsp
from .audio_config import AUDIO_TUNING

VERSION = 1
V = AUDIO_TUNING['speech']


def _spans(mask, confidence, hop_sec, duration):
    out, start = [], None
    for i, active in enumerate(np.r_[mask, False]):
        if active and start is None:
            start = i
        elif not active and start is not None:
            end = min(duration, i * hop_sec)
            if end - start * hop_sec >= V['span_min_sec']:
                out.append({"start": round(max(0, start * hop_sec - V['pad_before_sec']), 3), "end": round(min(duration, end + V['pad_after_sec']), 3),
                            "confidence": round(float(np.mean(confidence[start:i])), 3), "evidence": "independent-voice"})
            start = None
    merged = []
    for span in out:
        if merged and span["start"] <= merged[-1]["end"]:
            merged[-1]["end"] = max(merged[-1]["end"], span["end"])
            merged[-1]["confidence"] = min(merged[-1]["confidence"], span["confidence"])
        else:
            merged.append(span)
    return merged


def _formant_evidence(power, pitch, freqs, min_peaks=None):
    """Look at the spectral envelope, not the harmonic comb or note changes.

    A harmonic instrument with a falling 1/k envelope can change notes, vibrate
    or arpeggiate without acquiring vocal-tract resonances. Held vowels retain
    those resonances even at fixed pitch and fixed level.
    """
    sigma = max(V['formant_smoothing_min_hz'], pitch * V['formant_smoothing_pitch']) / (freqs[1] - freqs[0])
    envelope = gaussian_filter1d(power, sigma=sigma)
    band = (freqs >= V['formant_low_hz']) & (freqs <= V['band_high_hz'])
    local = envelope[band]
    if not len(local) or local.max() <= 1e-18:
        return False
    peaks, _ = find_peaks(local, prominence=float(local.max()) * V['formant_prominence'])
    return len(peaks) >= (V['formant_min_peaks'] if min_peaks is None else min_peaks)


def _steady_notes(pitch, voiced, hop_sec):
    """Sustained pitch may be singing, even with a convincing vocal envelope."""
    mask = np.zeros(len(pitch), bool)
    start, low, high = None, 0.0, 0.0
    ratio = 2 ** (V['steady_note_cents'] / 1200)
    for i in range(len(pitch) + 1):
        active = i < len(pitch) and voiced[i]
        p = pitch[i] if active else 0
        if start is not None and (not active or max(high, p) / min(low, p) > ratio):
            if (i - start) * hop_sec >= V['steady_note_sec']:
                mask[start:i] = True
            start = None
        if active:
            if start is None:
                start, low, high = i, p, p
            else:
                low, high = min(low, p), max(high, p)
    return mask


def independent_activity(signal, yamnet=None):
    x = np.asarray(signal, dtype=np.float32)
    if x.ndim != 1 or not np.isfinite(x).all():
        raise ValueError("voice evidence requires finite mono audio")
    duration, hop, size = len(x) / dsp.SR, V['hop'], V['frame']
    count = max(1, int(np.ceil(len(x) / hop)))
    padded = np.pad(x, (0, max(0, (count - 1) * hop + size - len(x))))
    frames = np.lib.stride_tricks.sliding_window_view(padded, size)[::hop][:count].astype(np.float64)
    frames -= frames.mean(axis=1, keepdims=True)
    power = np.mean(frames * frames, axis=1)
    windowed = frames * np.hanning(size)
    spectrum = np.abs(np.fft.rfft(windowed, axis=1)) ** 2
    freqs = np.fft.rfftfreq(size, 1 / dsp.SR)
    ac = np.fft.irfft(np.abs(np.fft.rfft(windowed, 2 * size, axis=1)) ** 2, axis=1)[:, :size]
    ac /= ac[:, :1] + 1e-18
    lo, hi = int(dsp.SR / V['pitch_max_hz']), int(dsp.SR / V['pitch_min_hz'])
    pitch_lag = np.argmax(ac[:, lo:hi + 1], axis=1) + lo
    periodic = ac[np.arange(count), pitch_lag]
    pitch = dsp.SR / pitch_lag
    band = (freqs >= V['band_low_hz']) & (freqs <= V['band_high_hz'])
    band_share = spectrum[:, band].sum(axis=1) / (spectrum.sum(axis=1) + 1e-18)
    # Oversized rank-filter windows can crash native SciPy on very short audio.
    # Existing reels retain the exact old window; only short inputs are clamped.
    background_frames=min(V['background_frames'],count if count%2 else count-1)
    background = median_filter(spectrum, size=(max(1,background_frames), 1))
    residual = np.maximum(spectrum - background, 0)
    residual_ac = np.fft.irfft(residual, n=size, axis=1)
    residual_ac /= residual_ac[:, :1] + 1e-18
    residual_lag = np.argmax(residual_ac[:, lo:hi + 1], axis=1) + lo
    residual_periodic = residual_ac[np.arange(count), residual_lag]
    residual_pitch = dsp.SR / residual_lag
    stationary_share = np.minimum(spectrum, background).sum(axis=1) / (spectrum.sum(axis=1) + 1e-18)
    formants, background_formants = np.zeros(count, bool), np.zeros(count, bool)
    rich, weak_rich = np.zeros(count, bool), np.zeros(count, bool)
    for i in range(count):
        peaks, _ = find_peaks(spectrum[i], prominence=max(1e-16, float(spectrum[i].max()) * V['peak_prominence']), distance=V['peak_distance_bins'])
        rich[i] = sum(V['band_low_hz'] <= freqs[p] <= V['band_high_hz'] for p in peaks) >= V['strong_peaks']
        formants[i] = _formant_evidence(spectrum[i], pitch[i], freqs) or (
            residual_periodic[i] >= V['periodicity'] and _formant_evidence(residual[i], residual_pitch[i], freqs, V['residual_formant_min_peaks']))
        # A high instrument may be assigned a subharmonic inside the voice
        # pitch range. Smooth its observed harmonic spacing too; otherwise its
        # individual harmonics masquerade as separate vocal formants.
        spacing = float(np.median(np.diff(freqs[peaks]))) if len(peaks) > 1 else pitch[i]
        background_formants[i] = _formant_evidence(spectrum[i], max(pitch[i], spacing), freqs, V['background_formant_min_peaks'])
        # Muffled voices can retain only the fundamental and a weak harmonic.
        # This is enough to keep ASR conservative, not enough to mask effects.
        amplitude = np.sqrt(spectrum[i])
        weak_peaks, _ = find_peaks(amplitude, prominence=max(1e-12, float(amplitude.max()) * V['peak_prominence']), distance=V['peak_distance_bins'])
        harmonics = {int(round(freqs[p] / pitch[i])) for p in weak_peaks if V['pitch_min_hz'] <= freqs[p] <= V['band_high_hz']
                     and abs(freqs[p] / pitch[i] - round(freqs[p] / pitch[i])) <= V['harmonic_tolerance']}
        weak_rich[i] = len(harmonics) >= V['weak_harmonics']
    active = power > max(V['power_floor'], float(power.max()) * V['relative_activity'])
    periodic_evidence = np.maximum(periodic, residual_periodic)
    seeds = active & rich & (periodic_evidence >= V['periodicity']) & (band_share >= V['band_share'])
    # Residual formants can support quiet speech over a stationary music bed.
    # A resonance without multiple harmonics can be a single ringing effect.
    confirmed = active & rich & formants & (periodic_evidence >= V['periodicity'])
    confidence = np.clip(V['confidence_base'] + V['confidence_periodic'] * periodic_evidence
                         + V['confidence_band'] * np.minimum(band_share / V['confidence_band_reference'], 1), 0, 1)
    # A stationary harmonic test tone is not speech. Assess variation over a
    # 0.4 s neighbourhood, independent of token boundaries or transcript words.
    varied, possible_seeds = np.zeros(count, bool), active & weak_rich & (periodic >= V['periodicity'])
    for i in np.flatnonzero(seeds | possible_seeds):
        a, b = max(0, i - V['neighbour_frames']), min(count, i + V['neighbour_frames'] + 1)
        use = (seeds | possible_seeds)[a:b]
        if use.sum() >= V['neighbour_min_frames']:
            p = pitch[a:b][use]
            energy = power[a:b][use]
            pulses, _ = find_peaks(energy, prominence=max(1e-18, float(energy.max()) * V['syllable_prominence']))
            intervals = np.diff(pulses) * hop / dsp.SR
            syllabic = bool(len(intervals) and np.any((intervals >= 1 / V['syllable_max_hz']) & (intervals <= 1 / V['syllable_min_hz'])))
            # A single decaying harmonic effect changes level but has neither
            # pitch variation nor repeated syllabic modulation.
            varied[i] = np.std(p) / max(1, np.mean(p)) >= V['pitch_cv'] or syllabic
    core = binary_opening(confirmed, structure=np.ones(V['opening_frames']))
    # Formants need not be resolved in every phoneme. Extend a sustained vocal
    # core only into independently harmonic/modulated neighbouring evidence;
    # neither a transcript nor a single instrument attack can start a span.
    supported = core | ((seeds | possible_seeds) & varied & binary_dilation(core, structure=np.ones(2 * V['neighbour_frames'] + 1)))
    mask = binary_opening(binary_closing(supported, structure=np.ones(V['closing_frames'])), structure=np.ones(V['opening_frames']))
    possible_mask = binary_opening(binary_closing((possible_seeds | seeds) & varied, structure=np.ones(V['closing_frames'])), structure=np.ones(V['opening_frames']))
    # One formant may support the SFX voice mask, but cannot erase background.
    # Singing also has formants: sustained notes remain ambiguous for bed/tempo.
    steady_notes = _steady_notes(pitch, active & (periodic >= V['periodicity']), hop / dsp.SR)
    background_mask = mask & background_formants & varied & ~steady_notes & (stationary_share < V['background_share'])
    neural = {"available": False, "status": "absent", "reason": "Installed YAMNet Speech model is absent; DSP evidence is used."}
    if yamnet:
        try:
            from .yamnet_backend import speech_scores
            votes = speech_scores(x, yamnet["model"], yamnet["classMap"])
            neural = {"available": True, "status": "measured", "windows": votes}
            for vote in votes:
                if vote["score"] >= V['neural_speech']:
                    a, b = max(0, int(vote["start"] * dsp.SR / hop)), min(count, int(np.ceil(vote["end"] * dsp.SR / hop)))
                    mask[a:b] = True
                    confidence[a:b] = np.maximum(confidence[a:b], vote["score"])
        except Exception as error:
            neural = {"available": False, "status": "failed", "reason": str(error)}
    spans = _spans(mask, confidence, hop / dsp.SR, duration)
    possible = _spans(possible_mask, np.minimum(confidence * V['weak_scale'], V['weak_cap']), hop / dsp.SR, duration)
    ambiguous_mask = ((possible_mask | mask) & ~background_mask)
    ambiguous = _spans(ambiguous_mask, np.minimum(confidence, V['weak_cap']), hop / dsp.SR, duration)
    background_spans = _spans(background_mask, confidence, hop / dsp.SR, duration)
    return {"schema": VERSION, "durationSec": round(duration, 6), "method": "dsp-formants-ambiguity-v2", "hasVoicing": bool(spans),
            "possibleVoicing": bool(possible), "possibleSpans": possible, "ambiguousSpans": ambiguous,
            "backgroundSpans": background_spans, "independentSpans": spans, "spans": spans, "yamnet": neural}


def combine_activity(independent, asr_spans):
    if independent.get("schema") != VERSION or not isinstance(independent.get("independentSpans"), list):
        raise ValueError("invalid independent speech evidence")
    out, supported = [], set()
    for voice in independent["independentSpans"]:
        hits = [i for i, s in enumerate(asr_spans) if s["start"] <= voice["end"] + V['asr_window_sec'] and s["end"] >= voice["start"] - V['asr_window_sec']]
        supported.update(hits)
        out.append({**voice, "confidence": round(min(1.0, voice["confidence"] + (V['asr_boost'] if hits else 0)), 3),
                    "evidence": "independent+asr" if hits else "independent-voice"})
    return {**independent, "spans": out, "asrSupported": len(supported), "asrCannotCreateSpans": True}


def analyse(request):
    result = independent_activity(dsp.load_wav(request["wav"]), request.get("yamnet"))
    return {"speechActivity": combine_activity(result, request.get("speech") or [])}
