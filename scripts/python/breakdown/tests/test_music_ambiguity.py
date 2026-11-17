import unittest
from unittest.mock import patch
import numpy as np
from breakdown import dsp, sound
from breakdown.speech_activity import independent_activity
from breakdown.audio_config import AUDIO_TUNING, BEAT_CONFIDENCE_MIN, NO_INSTRUMENT_CONFIDENCE_CAP, TEMPO_REASONS
from breakdown.rhythm import metrical_alternatives
from breakdown.tests.test_speech_rhythm import voice, kit

SR = dsp.SR


def instrument(duration=6, note_rate=2, vibrato=False, frequencies=None):
    t = np.arange(round(duration * SR)) / SR
    notes = np.array(frequencies if frequencies is not None else [220., 293.66, 349.23, 261.63, 392., 329.63])
    f = notes[(t * note_rate).astype(int) % len(notes)]
    if vibrato:
        f = notes[0] * (1 + .03 * np.sin(2 * np.pi * 5.2 * t))
    phase = 2 * np.pi * np.cumsum(f) / SR
    return sum(.08 / k * np.sin(k * phase) for k in range(1, 13)).astype(np.float32)


def held_vowel(duration=6):
    t = np.arange(round(duration * SR)) / SR
    f0 = 135.
    out = np.zeros(len(t))
    for k in range(1, 25):
        formants = sum(np.exp(-((k * f0 - c) / w) ** 2) for c, w in [(650, 180), (1300, 250), (2500, 350)])
        out += .2 * formants / k * np.sin(2 * np.pi * k * f0 * t)
    return out.astype(np.float32)


def kick_hat(duration=6, bpm=120):
    out = kit(bpm, duration=duration)
    rng = np.random.default_rng(542)
    t = np.arange(round(.05 * SR)) / SR
    for at in np.arange(0, duration, 60 / bpm):
        i = round(at * SR)
        hat = np.diff(rng.standard_normal(len(t)), prepend=0) * .035 * np.exp(-65 * t)
        n = min(len(t), len(out) - i)
        out[i:i+n] += hat[:n]
    return out


def sung_line(duration=6):
    t = np.arange(round(duration * SR)) / SR
    notes = np.array([135., 180., 160., 200., 150., 225.])
    pitch = notes[(t * 2).astype(int) % len(notes)] * (1 + .012 * np.sin(2 * np.pi * 5.1 * t))
    phase = 2 * np.pi * np.cumsum(pitch) / SR
    return sum(.3 / k * np.sin(k * phase) * sum(np.exp(-((k * pitch - c) / w) ** 2)
               for c, w in [(650,180),(1300,250),(2500,350)]) for k in range(1,25)).astype(np.float32)


class MusicAmbiguity(unittest.TestCase):
    def test_changing_notes_vibrato_arpeggio_and_melody_over_bed_do_not_become_voice(self):
        t = np.arange(6 * SR) / SR
        bed = sum(.04 * np.sin(2 * np.pi * f * t) for f in [220, 277.18, 329.63])
        for i,x in enumerate([instrument(), instrument(vibrato=True), instrument(note_rate=4), instrument(note_rate=6), instrument() + bed]):
            with self.subTest(signal=i):
                a = independent_activity(x)
                self.assertFalse(a['hasVoicing'])
                self.assertEqual(a['backgroundSpans'], [])
                measured = sound.analyse_signal(x, speech=[{'start':0,'end':6}], speech_activity=a)
                self.assertIsNone(measured['tempo'])
                self.assertIn(measured['tempoReason'], TEMPO_REASONS)
                self.assertTrue(measured['bed']['present'], measured['bed'])

    def test_high_register_and_singing_keep_tempo_and_bed(self):
        notes = [440.,550.,660.,770.,880.]
        signals = [(0,instrument(frequencies=notes)), (4,sung_line())]
        for i, melodic in signals:
            with self.subTest(signal=i):
                x = melodic + kick_hat()
                activity = independent_activity(x)
                self.assertEqual(activity['backgroundSpans'], [])
                measured = sound.analyse_signal(x, speech=[{'start':0,'end':6}], speech_activity=activity)
                self.assertIsNotNone(measured['tempo'])
                self.assertAlmostEqual(measured['tempo']['bpm'],120,delta=120*.04)
                if i==4:
                    self.assertTrue(independent_activity(melodic)['hasVoicing'])
                    self.assertTrue(activity['hasVoicing'])
                    self.assertTrue(measured['speechActivity']['spans'])
                    self.assertIsNone(measured['bed']['present'],measured['bed'])
                else:
                    self.assertTrue(measured['bed']['present'], {'bed':measured['bed'],'confirmedVoice':measured['speechActivity']['spans']})

    def test_stricter_background_rule_does_not_change_sfx_voice_or_possible_spans(self):
        x = voice()
        before = independent_activity(x)
        with patch.dict(AUDIO_TUNING['speech'], {'background_formant_min_peaks':99}):
            after = independent_activity(x)
        self.assertEqual(before['spans'], after['spans'])
        self.assertEqual(before['possibleSpans'], after['possibleSpans'])
        self.assertEqual(after['backgroundSpans'], [])

    def test_held_arabic_like_vowels_and_quiet_voice_over_music_are_positive(self):
        t = np.arange(6 * SR) / SR
        bed = sum(.05 * np.sin(2 * np.pi * f * t) for f in [220, 277.18, 329.63])
        for x in [held_vowel(), voice() * .2 + bed]:
            a = independent_activity(x)
            self.assertTrue(a['hasVoicing'])
            self.assertGreater(sum(s['end'] - s['start'] for s in a['spans']), 1)
            self.assertTrue(a['ambiguousSpans'])
            self.assertLess(sum(s['end'] - s['start'] for s in a['backgroundSpans']), 3)

    def test_spectral_tilt_need_not_leave_two_resolved_formants(self):
        t = np.arange(6 * SR) / SR
        # A dark sustained vowel can resolve only its first envelope resonance.
        # Several harmonics distinguish it from an isolated ringing SFX tone.
        x = sum(.2 * np.exp(-((135 * k - 650) / 250) ** 2) / k * np.sin(2 * np.pi * 135 * k * t) for k in range(1, 25))
        result = independent_activity(x)
        self.assertTrue(result['hasVoicing'])
        self.assertGreater(sum(s['end'] - s['start'] for s in result['spans']), 5)
        self.assertEqual(result['backgroundSpans'], [])

    def test_melody_and_hallucinated_asr_do_not_erase_a_measurable_music_beat(self):
        t = np.arange(6 * SR) / SR
        bed = sum(.04 * np.sin(2 * np.pi * f * t) for f in [220, 277.18, 329.63])
        signal = instrument(note_rate=5) + bed + kit(120, duration=6) * .6
        result = sound.analyse_signal(signal, speech=[{'start':0,'end':6}])
        self.assertTrue(result['bed']['present'], result['bed'])
        self.assertIsNotNone(result['tempo'])
        self.assertAlmostEqual(result['tempo']['bpm'],120,delta=120*.04)

    def test_no_evidence_never_publishes_tempo_and_alternatives_are_metrical(self):
        self.assertLess(NO_INSTRUMENT_CONFIDENCE_CAP, BEAT_CONFIDENCE_MIN)
        self.assertIsNone(dsp.tempo(np.ones(1000), np.ones(1000), SR / dsp.HOP))
        S = dsp.spectrogram(kit(72)); _, P = dsp.hpss(S)
        result = dsp.tempo(dsp.onset_envelope(P), np.ones(S.shape[1]), SR / dsp.HOP, spectrum=S)
        self.assertAlmostEqual(result['bpm'],72,delta=72*.04)
        for alternative in result['alternatives']:
            self.assertTrue(any(abs(alternative / result['bpm'] - ratio) < .003 for ratio in [.5,2,1/3,3]))
        self.assertEqual(AUDIO_TUNING['rhythm']['min_beat_confidence'], .3)
        self.assertEqual(sound.analyse_signal(np.zeros(0))['tempoReason'], 'no-audio')

    def test_alternative_needs_half_the_best_score_and_a_metrical_relation(self):
        best = {'period':30., 'score':1.}
        candidates = [{'period':15.,'score':.499}, {'period':60.,'score':.5}, {'period':43.,'score':1.}]
        self.assertEqual(metrical_alternatives(best,candidates,60), [60.])
        self.assertEqual(metrical_alternatives(best,candidates[:1],60), [])

    def test_tempo_abstention_reasons_are_explicit_and_clear_on_success(self):
        self.assertEqual(sound.analyse_signal(np.zeros(6*SR))['tempoReason'],'no-pulses')
        self.assertEqual(sound.analyse_signal(held_vowel(duration=2))['tempoReason'],'too-short')
        for n, nonzero, expected in [(0,False,'no-audio'), (100,True,'too-short'), (1000,False,'no-pulses'), (1000,True,'low-confidence')]:
            env = np.zeros(n); env[::31] = float(nonzero)
            diagnostics = {'reason':'stale'}
            self.assertIsNone(dsp.tempo(env,np.ones(n),60,diagnostics=diagnostics))
            self.assertEqual(diagnostics['reason'],expected)
        S = dsp.spectrogram(kit(120)); _,P = dsp.hpss(S)
        diagnostics = {'reason':'stale'}
        self.assertIsNotNone(dsp.tempo(dsp.onset_envelope(P),np.ones(S.shape[1]),SR/dsp.HOP,spectrum=S,diagnostics=diagnostics))
        self.assertIsNone(diagnostics['reason'])


class HighRegisterVoiceKnownLimitation(unittest.TestCase):
    """The detector confirms these instruments as voice; bed positives stay pending."""

    def setUp(self):
        cases={
            'test_vibrato':{'frequencies':[660.],'vibrato':True},
            'test_arpeggio_four_hz':{'frequencies':[440.,550.,660.,770.,880.],'note_rate':4},
            'test_arpeggio_six_hz':{'frequencies':[440.,550.,660.,770.,880.],'note_rate':6},
        }
        x=instrument(**cases[self._testMethodName])+kick_hat()
        activity=independent_activity(x)
        # Preconditions are outside expectedFailure: an unrelated detector,
        # analyser or tempo failure must remain an actual test failure.
        self.assertTrue(activity['hasVoicing'], 'Known failure must originate in confirmed voice evidence')
        self.assertTrue(activity['spans'])
        self.measured=sound.analyse_signal(x,speech=[{'start':0,'end':6}],speech_activity=activity)
        self.assertIsNotNone(self.measured['tempo'])
        self.assertAlmostEqual(self.measured['tempo']['bpm'],120,delta=120*.04)
        self.assertIsNone(self.measured['bed']['present'],'Known limitation must abstain, never claim absence')

    @unittest.expectedFailure
    def test_vibrato(self):
        self.assertTrue(self.measured['bed']['present'],self.measured['bed'])

    @unittest.expectedFailure
    def test_arpeggio_four_hz(self):
        self.assertTrue(self.measured['bed']['present'],self.measured['bed'])

    @unittest.expectedFailure
    def test_arpeggio_six_hz(self):
        self.assertTrue(self.measured['bed']['present'],self.measured['bed'])


if __name__ == '__main__':
    unittest.main()
