import unittest
from unittest.mock import patch

import numpy as np
from scipy.signal import butter, sosfilt
from breakdown import dsp, sound
from breakdown.speech_activity import independent_activity, combine_activity

SR = dsp.SR


def voice(duration=6):
    t = np.arange(int(duration * SR)) / SR
    f0 = 125 + 12 * np.sin(2 * np.pi * .6 * t)
    phase = 2 * np.pi * np.cumsum(f0) / SR
    out = np.zeros(len(t))
    for harmonic in range(1, 25):
        frequency = harmonic * f0
        formants = sum(np.exp(-((frequency - center) / width) ** 2) for center, width in [(650, 180), (1300, 250), (2500, 350)])
        out += np.sin(harmonic * phase) * formants / harmonic
    return (out * (.4 + .3 * np.sin(2 * np.pi * 4.3 * t)) * .5).astype(np.float32)


def kit(bpm, duration=12, sync=False):
    out = np.zeros(round(duration * SR), np.float32)
    period = 60 / bpm
    rng = np.random.default_rng(304)
    def add(at, clip):
        first = round(at * SR)
        if first < len(out):
            out[first:first + min(len(clip), len(out) - first)] += clip[:len(out) - first]
    def tone(freq, length, gain, decay):
        t = np.arange(round(length * SR)) / SR
        return (gain * np.sin(2 * np.pi * freq * t) * np.exp(-decay * t)).astype(np.float32)
    if not sync:
        for at in np.arange(0, duration, period):
            add(at, tone(55, .3, .5, 25))
    else:
        for beat in np.arange(0, duration / period, 4):
            for offset in [0, 1.5, 2.75]:
                add((beat + offset) * period, tone(55, .3, .5, 25))
            for offset in np.arange(0, 4, .5):
                t = np.arange(round(.06 * SR)) / SR
                noise = rng.standard_normal(len(t))
                add((beat + offset) * period, (np.diff(noise, prepend=0) * .035 * np.exp(-65 * t)).astype(np.float32))
            for offset in [1, 3]:
                t = np.arange(round(.16 * SR)) / SR
                add((beat + offset) * period, (rng.standard_normal(len(t)) * .12 * np.exp(-25 * t)).astype(np.float32))
    return out


class SpeechEvidence(unittest.TestCase):
    def test_short_audio_background_window_is_odd_and_bounded(self):
        from breakdown import speech_activity as module
        original=module.median_filter
        for duration in [.2,.9,2.]:
            with self.subTest(duration=duration):
                windows=[]
                def checked(array,size,*args,**kwargs):
                    if array.ndim==2:
                        self.assertGreaterEqual(size[0],1);self.assertLessEqual(size[0],len(array))
                        self.assertEqual(size[0]%2,1);windows.append(size[0])
                    return original(array,size,*args,**kwargs)
                with patch('breakdown.speech_activity.median_filter',side_effect=checked):
                    result=independent_activity(voice(duration))
                self.assertEqual(result['durationSec'],duration)
                self.assertTrue(windows)
                if duration==2.:self.assertEqual(windows[0],module.V['background_frames'])
                self.assertTrue(all(0<=s['start']<s['end']<=duration for s in result['spans']))

    def test_voice_only_and_voice_plus_effects_have_independent_spans(self):
        clean = voice()
        muffled = sosfilt(butter(4, 450, fs=SR, output='sos'), clean).astype(np.float32)
        for signal in [clean, clean * .001, clean + kit(120, 6) * .1]:
            result = independent_activity(signal)
            self.assertTrue(result['hasVoicing'])
            self.assertGreater(sum(s['end'] - s['start'] for s in result['spans']), 1)
            self.assertTrue(all(0 <= s['confidence'] <= 1 for s in result['spans']))
            self.assertEqual(result['yamnet']['status'], 'absent')
        uncertain = independent_activity(muffled)
        self.assertTrue(uncertain['hasVoicing'] or uncertain['possibleVoicing'])

    def test_hallucinated_asr_cannot_mask_sfx_or_harmonic_tones(self):
        t = np.arange(SR * 6) / SR
        harmonic = sum(.04 / k * np.sin(2 * np.pi * 180 * k * t) for k in range(1, 9))
        signals = [kit(160, 6), sum(.04 * np.sin(2 * np.pi * f * t) for f in [220, 277.18, 329.63]), harmonic, harmonic * np.exp(-4 * t)]
        for signal in signals:
            independent = independent_activity(signal)
            self.assertFalse(independent['hasVoicing'])
            combined = combine_activity(independent, [{'start': 0, 'end': 6}])
            self.assertEqual(combined['spans'], [])
            self.assertEqual(combined['asrSupported'], 0)

    def test_very_muffled_voice_has_conservative_evidence_even_if_formants_are_missing(self):
        muffled = sosfilt(butter(6, 250, fs=SR, output='sos'), voice()).astype(np.float32)
        evidence = independent_activity(muffled)
        self.assertTrue(evidence['hasVoicing'] or evidence['possibleVoicing'])
        self.assertTrue(all(s['confidence'] < .5 for s in evidence['possibleSpans']))

    def test_asr_only_corroborates_and_optional_neural_speech_is_independent(self):
        independent = independent_activity(voice())
        combined = combine_activity(independent, [{'start': 0, 'end': 6}])
        self.assertEqual(combined['asrSupported'], 1)
        self.assertEqual([(s['start'], s['end']) for s in combined['spans']], [(s['start'], s['end']) for s in independent['spans']])
        with patch('breakdown.yamnet_backend.speech_scores', return_value=[{'start': 0, 'end': 1, 'score': .9}]):
            neural = independent_activity(np.zeros(SR * 2), {'model': 'fake', 'classMap': 'fake'})
        self.assertTrue(neural['hasVoicing'])
        self.assertEqual(neural['yamnet']['status'], 'measured')
        with patch('breakdown.yamnet_backend.speech_scores', side_effect=RuntimeError('local model failure')):
            failed = independent_activity(np.zeros(SR * 2), {'model': 'fake', 'classMap': 'fake'})
        self.assertFalse(failed['hasVoicing']); self.assertEqual(failed['yamnet']['status'], 'failed')

    def test_bed_excludes_confirmed_voice_while_sfx_preserves_possible_voice(self):
        observed = {}
        bed, tempo, candidates = sound.bed_info, dsp.tempo, sound.candidates
        def check_bed(H, P, gap, *args, **kwargs):
            observed['bed'] = gap.copy(); return bed(H, P, gap, *args, **kwargs)
        def check_tempo(env, weights, *args, **kwargs):
            observed['tempo'] = weights.copy(); return tempo(env, weights, *args, **kwargs)
        def check_candidates(env, times, gap, *args, **kwargs):
            observed['sfx'] = gap.copy(); return candidates(env, times, gap, *args, **kwargs)
        with patch('breakdown.sound.bed_info', side_effect=check_bed), patch('breakdown.dsp.tempo', side_effect=check_tempo), patch('breakdown.sound.candidates', side_effect=check_candidates):
            sound.analyse_signal(voice(), speech=[])
        self.assertTrue(np.all(observed['bed'] >= observed['sfx']))
        self.assertTrue(np.all(observed['tempo'] >= observed['sfx']))
        self.assertFalse(observed['bed'].all())

    def test_optional_yamnet_uses_speech_class_not_the_loudest_class(self):
        from breakdown.yamnet_backend import speech_scores
        class Session:
            def get_inputs(self):
                return [type('Input', (), {'name': 'waveform'})()]
            def run(self, *_):
                return [np.array([[.99, .3]], np.float32)]
        with patch('breakdown.yamnet_backend._load', return_value=(Session(), ['Music', 'Speech'])):
            scores = speech_scores(np.zeros(SR), 'fake', 'fake')
        self.assertTrue(all(abs(s['score'] - .3) < .001 for s in scores))


class LagFamily(unittest.TestCase):
    def test_slow_and_fast_pulse_fundamentals(self):
        for bpm in [66, 72, 160, 174]:
            signal = kit(bpm)
            S = dsp.spectrogram(signal)
            _, P = dsp.hpss(S)
            info = dsp.tempo(dsp.onset_envelope(P), np.ones(S.shape[1]), SR / dsp.HOP, spectrum=S)
            self.assertIsNotNone(info)
            self.assertAlmostEqual(info['bpm'], bpm, delta=bpm * .04, msg=str(info))
            self.assertGreater(info['pulseCoverage'], .8)

    def test_syncopated_kit_uses_hat_and_backbeat_instead_of_double_tempo(self):
        S = dsp.spectrogram(kit(132, sync=True))
        _, P = dsp.hpss(S)
        info = dsp.tempo(dsp.onset_envelope(P), np.ones(S.shape[1]), SR / dsp.HOP, spectrum=S)
        self.assertTrue(info['kitEvidence'], info)
        self.assertAlmostEqual(info['bpm'], 132, delta=132 * .04, msg=str(info))

    def test_beat_family_suppresses_pulses_but_keeps_spectrally_distinct_effect_on_beat(self):
        signal = kit(160)
        t = np.arange(round(.08 * SR)) / SR
        for at in [3.0, 5.1]:
            first = round(at * SR)
            signal[first:first + len(t)] += (.5 * np.sin(2 * np.pi * 1200 * t) * np.exp(-40 * t)).astype(np.float32)
        result = sound.analyse_signal(signal, speech=[{'start': 0, 'end': 12}])
        self.assertEqual(result['speechActivity']['spans'], [])
        found = result['sfx']
        for at in [3.0, 5.1]:
            self.assertTrue(any(abs(x['t'] - at) <= .15 for x in found), found)
        self.assertLessEqual(len(found), 3, found)

    def test_a_syncopated_kit_does_not_turn_its_regular_hat_and_snare_into_effects(self):
        result = sound.analyse_signal(kit(132, sync=True))
        self.assertAlmostEqual(result['tempo']['bpm'], 132, delta=132 * .04)
        self.assertLessEqual(len(result['sfx']), 2, result['sfx'])

    def test_pulse_templates_exclude_a_continuous_harmonic_bed(self):
        t = np.arange(12 * SR) / SR
        signal = kit(160) + sum(.05 * np.sin(2 * np.pi * f * t) for f in [220, 277.18, 329.63])
        result = sound.analyse_signal(signal)
        self.assertAlmostEqual(result['tempo']['bpm'], 160, delta=160 * .04)
        self.assertLessEqual(len(result['sfx']), 1, result['sfx'])

    def test_a_falling_effect_tail_does_not_make_the_next_beat_a_new_effect(self):
        t = np.arange(12 * SR) / SR
        signal = kit(120) + sum(.05 * np.sin(2 * np.pi * f * t) for f in [220, 277.18, 329.63])
        u = np.arange(round(.45 * SR)) / SR
        at = round(4.25 * SR)
        signal[at:at + len(u)] += .6 * np.sin(2 * np.pi * 70 * u) * np.exp(-8 * u)
        result = sound.analyse_signal(signal)
        self.assertTrue(any(abs(s['t'] - 4.25) <= .15 for s in result['sfx']), result['sfx'])
        self.assertFalse(any(abs(s['t'] - 4.5) <= .1 for s in result['sfx']), result['sfx'])

    def test_accented_pulses_keep_the_fundamental(self):
        signal = kit(158)
        period = 60 / 158
        for k in range(0, int(12 / period), 2):
            a, b = round(k * period * SR), min(len(signal), round((k * period + .3) * SR))
            signal[a:b] *= 1.6
        S = dsp.spectrogram(signal); _, P = dsp.hpss(S)
        info = dsp.tempo(dsp.onset_envelope(P), np.ones(S.shape[1]), SR / dsp.HOP, spectrum=S)
        self.assertAlmostEqual(info['bpm'], 158, delta=158 * .04)


if __name__ == '__main__':
    unittest.main()
