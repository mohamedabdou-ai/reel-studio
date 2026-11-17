"""Lag families supported by repeated spectral/temporal pulse classes.

Grid precision penalizes double tempo's empty slots; onset coverage penalizes
half tempo's missed pulses. A kit adds independent hat/backbeat accent evidence.
"""
import numpy as np
from scipy.signal import find_peaks
from .audio_config import AUDIO_TUNING, BEAT_CONFIDENCE_MIN, NO_INSTRUMENT_CONFIDENCE_CAP, TEMPO_REASONS

R = AUDIO_TUNING['rhythm']


def _background(S, at):
    previous = S[:, max(0, at - R['background_back_frames']):max(0, at - R['background_guard_frames'])]
    return np.median(previous ** 2, axis=1) if previous.shape[1] else np.zeros(S.shape[0])


def event_signature(S, at):
    # Use the attack's positive spectral change: a previous effect's falling
    # tail is not a new pulse component. This changes only rhythm templates,
    # never the SFX detector's envelope or candidate thresholds.
    lo, hi = max(0, at - R['attack_back_frames']), min(S.shape[1], at + R['attack_ahead_frames'])
    flux = np.maximum(0, np.diff(S[:, lo:hi], axis=1))
    spec = np.sqrt(np.mean(flux ** 2, axis=1)) if flux.shape[1] else np.zeros(S.shape[0])
    return spec / (np.linalg.norm(spec) + 1e-18)


def _descriptor(S, at, next_at=None):
    from . import dsp
    signature = event_signature(S, at)
    power = signature ** 2
    freq = np.fft.rfftfreq(dsp.NFFT, 1 / dsp.SR)
    edges = [*R['band_edges_hz'], dsp.SR / 2 + 1]
    bands = np.sqrt([power[(freq >= a) & (freq < b)].sum() for a, b in zip(edges, edges[1:])])
    bands /= np.linalg.norm(bands) + 1e-18
    # Background subtraction creates exact zero bins. Spectral entropy remains
    # meaningful there; geometric-mean flatness would misclassify noise as tonal.
    entropy = float(-np.sum(power * np.log(power + 1e-18)) / np.log(len(power)))
    broad = entropy >= R['noise_entropy']
    background = _background(S, at)
    early = float(np.maximum(S[:, at:min(S.shape[1], at + R['early_frames'])] ** 2 - background[:, None], 0).sum())
    end = min(S.shape[1], at + R['tail_end_frames'], next_at - R['next_attack_guard_frames'] if next_at is not None else S.shape[1])
    tail = float(np.maximum(S[:, min(end, at + R['tail_start_frames']):end] ** 2 - background[:, None], 0).sum()) / (early + 1e-18)
    centroid = float(np.dot(freq, power))
    role = 'kick' if bands[0] ** 2 >= R['kick_low_share'] else 'hat' if broad and (centroid > R['hat_centroid_hz'] or tail < R['hat_tail_ratio']) else 'snare' if broad else 'tonal'
    return {'role': role, 'signature': signature, 'bands': bands, 'tail': tail}


def matches_pulse(S, at, group, boundary=False):
    # Timing membership cannot certify the spectrum of a fresh candidate.
    value = _descriptor(S, at)
    if at in group['centres'] or boundary:
        # Re-verify spectral shape even for recorded members. The coarse bands
        # tolerate noise realization and a clipped file-boundary attack.
        return bool(np.dot(value['bands'],group['bands']) >= R['band_cosine'])
    if value['role'] != group['role']:
        return False
    if group['role'] == 'kick':
        return bool(np.dot(value['signature'], group['signature']) >= R['kick_cosine'])
    return bool(np.dot(value['bands'], group['bands']) >= R['band_cosine']
                and max(value['tail'], group['tail']) <= R['tail_ratio_limit'] * max(R['tail_floor'], min(value['tail'], group['tail'])))


def pulse_groups(S, weights, frame_rate):
    from . import dsp
    env = dsp.onset_envelope(S)
    peaks, _ = find_peaks(env, prominence=R['peak_prominence'], distance=max(1, int(R['peak_distance_sec'] * frame_rate)))
    groups = []
    for index, at in enumerate(peaks):
        if weights[at] <= 0:
            continue
        value = _descriptor(S, int(at), int(peaks[index + 1]) if index + 1 < len(peaks) else None)
        role, signature = value['role'], value['signature']
        if role == "tonal":
            continue
        match = next((g for g in groups if g['role'] == role and
                      (np.dot(g['signature'], signature) >= R['kick_cosine'] if role == 'kick' else
                       np.dot(g['bands'], value['bands']) >= R['band_cosine'] and max(g['tail'], value['tail']) <= R['tail_ratio_limit'] * max(R['tail_floor'], min(g['tail'], value['tail'])))), None)
        if match is None:
            groups.append({**value, "centres": [int(at)]})
        else:
            match["centres"].append(int(at))
            match["signature"] = match["signature"] + signature
            match["signature"] /= np.linalg.norm(match["signature"]) + 1e-18
            match['bands'] = match['bands'] + value['bands']; match['bands'] /= np.linalg.norm(match['bands']) + 1e-18
            match['tail'] = (match['tail'] * (len(match['centres']) - 1) + value['tail']) / len(match['centres'])
    return [g for g in groups if len(g["centres"]) >= R['min_pulses'] and (g["centres"][-1] - g["centres"][0]) / frame_rate >= R['min_span_sec']]


def grid_fit(centres, period, weights, frame_rate):
    if not np.isfinite(period) or period < R['min_period_frames']:
        return {"score": 0.0, "coverage": 0.0, "phase": 0.0}
    times = np.asarray(centres, float)
    phases = times[np.linspace(0, len(times) - 1, min(R['max_phases'], len(times))).astype(int)] % period
    best = {"score": 0.0, "coverage": 0.0, "phase": 0.0}
    tolerance = R['grid_tolerance_sec'] * frame_rate
    for phase in phases:
        indices = np.rint((times - phase) / period)
        good = np.abs(times - phase - indices * period) <= tolerance
        grid = phase + np.arange(int(np.ceil(-phase / period)), int(np.ceil((len(weights) - phase) / period))) * period
        available = int(np.count_nonzero(weights[np.clip(np.rint(grid).astype(int), 0, len(weights) - 1)] > 0))
        coverage = float(good.mean())
        precision = min(1.0, len(set(indices[good])) / max(1, available))
        score = 2 * coverage * precision / (coverage + precision + 1e-18)
        if score > best["score"]:
            best = {"score": score, "coverage": coverage, "phase": float(phase)}
    return best


def metrical_alternatives(best, candidates, frame_rate):
    """Publish only metrical relatives with at least half the best fit's score."""
    supported = [c for c in candidates if c['score'] >= R['alternative_min_score_ratio'] * best['score']]
    return [round(60 * frame_rate / (best['period'] * factor), 1) for factor in R['lag_factors'] if factor != 1
            and any(abs(c['period'] / best['period'] - factor) <= R['relative_tolerance'] * factor for c in supported)]


def estimate_tempo(envelope, weights, frame_rate, lo=R['min_bpm'], hi=R['max_bpm'], spectrum=None, diagnostics=None):
    # Optional diagnostics preserve the numeric/None API while retaining the
    # exact abstention reason for the stored sound measurement.
    def finish(result=None, reason=None):
        if reason is not None and reason not in TEMPO_REASONS:
            raise ValueError('invalid tempo reason')
        if diagnostics is not None:
            diagnostics['reason'] = reason
        return result
    env = np.asarray(envelope, float) * weights
    n = len(env)
    if not n:
        return finish(reason='no-audio')
    if n < frame_rate * R['min_duration_sec']:
        return finish(reason='too-short')
    if not np.any(env):
        return finish(reason='no-pulses')
    centered = env - env.mean()
    fft = np.fft.rfft(centered, 2 * n)
    ac = np.fft.irfft(fft * np.conj(fft))[:n]
    ac /= ac[0] + 1e-18
    low, high = max(2, int(frame_rate * 60 / hi)), min(n - 2, int(np.ceil(frame_rate * 60 / lo)))
    if high <= low:
        return finish(reason='too-short')
    peaks, _ = find_peaks(ac[low:high + 1])
    lags = sorted((int(p + low) for p in peaks), key=lambda p: -ac[p])[:R['max_ac_peaks']]
    if not lags:
        return finish(reason='no-pulses')
    groups = pulse_groups(spectrum, weights, frame_rate) if spectrum is not None else []
    instrument_support = bool(groups)
    if not groups:
        attacks, _ = find_peaks(env, prominence=max(1e-8, float(env.max()) * R['fallback_prominence']), distance=max(1, int(R['peak_distance_sec'] * frame_rate)))
        if len(attacks) < R['min_pulses']:
            return finish(reason='no-pulses')
        groups = [{"role": "pulse", "centres": list(attacks)}]
    roles = {g["role"] for g in groups}
    kit = "hat" in roles and "snare" in roles
    role_support = {role:max(len(g['centres']) for g in groups if g['role'] == role) for role in roles}
    periods = []
    for lag in lags:
        y0, y1, y2 = ac[lag - 1], ac[lag], ac[lag + 1]
        refined = lag + np.clip(.5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-18), -.5, .5)
        periods.extend(refined * factor for factor in R['lag_factors'])
    for g in groups:
        median = float(np.median(np.diff(g["centres"])))
        periods.extend(median * factor for factor in R['lag_factors'])
    candidates = []
    for period in sorted(periods):
        bpm = 60 * frame_rate / period
        if not lo <= bpm <= hi or any(abs(period - c["period"]) < R['period_dedupe_frames'] for c in candidates):
            continue
        support, total, coverage, confidence_support, confidence_total = 0.0, 0.0, 0.0, 0.0, 0.0
        for g in groups:
            multiplier = R['hat_multiplier'] if kit and g["role"] == "hat" else R['snare_multiplier'] if kit and g["role"] == "snare" else 1
            fit = grid_fit(g["centres"], period * multiplier, weights, frame_rate)
            value = fit["score"]
            if kit and g["role"] == "kick":
                value = max(value, R['sync_weight'] * grid_fit(g["centres"], period / R['sync_subdivision'], weights, frame_rate)["coverage"])
            weight = R['role_weights'].get(g["role"], 1.0)
            weight *= min(1.0, (g["centres"][-1] - g["centres"][0]) / max(1, n - 1))
            support += weight * value; coverage += weight * fit["coverage"]; total += weight
            # Keep the coverage ranking stable; sample support affects certainty.
            # Rare fragments cannot outvote a repeatedly observed timbre class.
            certainty_weight = weight * len(g['centres']) / role_support[g['role']]
            confidence_support += certainty_weight * value; confidence_total += certainty_weight
        score = support / max(total, 1e-18)
        candidates.append({"period": float(period), "score": score, "coverage": coverage / max(total, 1e-18),
                           "confidenceScore": confidence_support / max(confidence_total, 1e-18)})
    if not candidates:
        return finish(reason='low-confidence')
    candidates.sort(key=lambda c: (-c["score"], -c["coverage"], c["period"]))
    best = candidates[0]
    # Competing metrical relatives, not neighbouring numerical estimates, define
    # octave ambiguity. Triple relations enter only when supported by the data.
    relatives = [c for c in candidates[1:] if any(abs(c["period"] / best["period"] - r) <= R['relative_tolerance'] * r for r in R['lag_factors'] if r != 1)]
    rival = max((c["confidenceScore"] for c in relatives), default=0.0)
    margin = max(0.0, best["confidenceScore"] - rival)
    confidence = float(np.clip(best["confidenceScore"] * (R['confidence_base'] + min(R['confidence_margin_cap'], margin * R['confidence_margin_gain'])), 0, 1))
    if spectrum is not None and not instrument_support:
        confidence = min(confidence, NO_INSTRUMENT_CONFIDENCE_CAP)
    if not instrument_support or confidence < BEAT_CONFIDENCE_MIN:
        return finish(reason='low-confidence')
    # Only supported metrical relatives are alternatives, never nearby unrelated
    # local maxima. Emit the exact relation to the selected period.
    alternatives = metrical_alternatives(best, relatives, frame_rate)
    return finish({"bpm": round(60 * frame_rate / best["period"], 1), "alternatives": alternatives, "confidence": round(confidence, 3),
            "periodFrames": best["period"], "pulseCoverage": round(best["coverage"], 3), "ambiguityMargin": round(margin, 3),
            "method": "lag-family-spectral-coverage", "kitEvidence": kit})


def suppression_family(S, weights, frame_rate, period):
    groups = pulse_groups(S, weights, frame_rate)
    out = []
    for g in groups:
        times = np.asarray(g['centres'], float)
        supported = set()
        for factor in R['suppression_factors']:
            spacing = period * factor
            fit = grid_fit(g['centres'], spacing, weights, frame_rate)
            if fit['score'] >= R['support_min']:
                near = np.abs(times - fit['phase'] - np.rint((times - fit['phase']) / spacing) * spacing) <= R['grid_tolerance_sec'] * frame_rate
                supported.update(int(t) for t in times[near])
        # Syncopated accompaniment has empty subdivision slots. Recognize a
        # repeating two/three/four-beat pattern, rather than demanding a hit in
        # every slot or mislabelling its off-beat kicks as isolated effects.
        for beats in R['pattern_cycles']:
            cycle = period * beats
            if times[-1] - times[0] < cycle * R['minimum_cycles']:
                continue
            support = [bool(np.any(np.abs(times - at - cycle) <= R['grid_tolerance_sec'] * frame_rate)
                            or np.any(np.abs(times - at + cycle) <= R['grid_tolerance_sec'] * frame_rate)) for at in times]
            if float(np.mean(support)) >= R['support_min']:
                supported.update(int(t) for t, repeated in zip(times, support) if repeated)
        # A one-off off-beat impact can resemble a kick. It is not part of the
        # accompaniment unless its own timing is supported by the pulse family.
        if len(supported) >= R['min_pulses']:
            out.append({**g, 'centres': sorted(supported)})
    return out
