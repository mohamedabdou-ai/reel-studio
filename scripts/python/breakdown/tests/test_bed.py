import unittest
from unittest.mock import patch
import numpy as np
from breakdown import dsp,sound,bed
from breakdown.tests.test_speech_rhythm import voice,kit
from breakdown.tests.test_music_ambiguity import instrument,held_vowel
from breakdown.tests.test_sound import place,tone
from breakdown.speech_activity import independent_activity

SR=dsp.SR


def pad(duration=6,gain=.03):
    t=np.arange(round(duration*SR))/SR
    return sum(gain*np.sin(2*np.pi*f*t) for f in [220,277.18,329.63]).astype(np.float32)


def measure(x,spans=(),events=(),beat_present=False,voice_pad=.1):
    S=dsp.spectrogram(x);H,P=dsp.hpss(S);times=dsp.frame_times(S.shape[1])
    return bed.measure(S,H,P,times,sound.gap_mask(times,spans,pad=voice_pad),events,beat_present=beat_present)


class Beds(unittest.TestCase):
    def test_kick_only_is_not_sustained_music(self):
        for bpm in [66,120,174]:self.assertFalse(measure(kit(bpm))['present'])

    def test_quiet_pad_under_voice_is_visible_in_observable_pauses(self):
        spans=[{'start':0,'end':1},{'start':2,'end':3},{'start':4,'end':5}]
        x=pad(gain=.005)+place(6,[(0,voice(1)),(2,voice(1)),(4,voice(1))])
        result=measure(x,spans)
        self.assertTrue(result['present'],result);self.assertGreater(result['evidence']['sustainedSec'],.5)

    def test_voice_alone_with_pauses_is_not_a_bed(self):
        spans=[{'start':0,'end':1},{'start':2,'end':3},{'start':4,'end':5}]
        x=place(6,[(0,voice(1)),(2,voice(1)),(4,voice(1))])
        self.assertFalse(measure(x,spans)['present'])

    def test_harmonic_effects_and_their_observed_tails_are_excluded(self):
        x=place(8,[(1,tone(2500,1.5,.35,3)),(4,tone(1200,1.2,.3,4))])
        events=[{'t':1,'dur':.1,'status':'confirmed','features':{'peakHz':2500,'flatness':0,'attack':.008}},
                {'t':4,'dur':.1,'status':'needs-confirmation','detection':'candidate','features':{'peakHz':1200,'flatness':0,'attack':.008}}]
        result=measure(x,events=events)
        self.assertFalse(result['present'],result)

    def test_melody_with_drums_is_a_bed(self):
        self.assertTrue(measure(instrument()+kit(120,6)*.4)['present'])

    def test_too_short_evidence_is_unmeasured(self):
        result=measure(pad(.2),[{'start':0,'end':.2}])
        self.assertIsNone(result['present']);self.assertIn('insufficient',result['reason']);self.assertEqual(result['score'],0)

    def test_continuous_voice_has_no_bed_at_lower_confidence(self):
        for x in [voice(),held_vowel()]:
            result=sound.analyse_signal(x, speech=[{'start':0,'end':6}])['bed']
            self.assertIs(result['present'],False,result);self.assertLess(result['score'],.5)

    def test_talking_with_point_three_second_gaps_over_pad_full_path(self):
        x=pad(gain=.005)+place(6,[(0,voice(1.7)),(2,voice(1.7)),(4,voice(1.7))])
        result=sound.analyse_signal(x,speech=[{'start':i,'end':i+1.7} for i in [0,2,4]])['bed']
        self.assertTrue(result['present'],result)

    def test_confidence_comes_from_duration_coverage_and_stability(self):
        full=measure(pad());short=measure(pad(1))
        self.assertTrue(full['present']);self.assertTrue(short['present'])
        self.assertGreater(full['score'],short['score']);self.assertIn('coverage',short['evidence'])

    def test_isolated_note_and_scattered_residue_do_not_cover_a_reel(self):
        for clips in [[(1,pad(1))],[(i,pad(.15)) for i in [0,1,2,3,4,5]],
                      [(i,voice(.15)) for i in [0,1,2,3,4,5]]]:
            result=measure(place(6,clips))
            self.assertFalse(result['present'],result)
            self.assertLess(result['evidence']['coverage'],.5)
            self.assertLessEqual(result['score'],bed.C['residual_absence_score_max'])

    def test_thin_observations_cannot_claim_music_from_faint_or_ambiguous_residue(self):
        spans=[{'start':i,'end':i+1.75} for i in [0,2,4]]
        talking=place(6,[(i,voice(1.75)) for i in [0,2,4]])
        noise=np.random.default_rng(438).normal(0,.001,6*SR).astype(np.float32)
        for residue,expected in [(noise,False),(tone(2300,6,.02),None)]:
            with self.subTest(expected=expected):
                x=talking+residue
                result=measure(x,spans,voice_pad=0)
                self.assertIs(result['present'],expected,result)
                self.assertGreater(result['evidence']['observableShare'],0)
                self.assertLess(result['evidence']['observableShare'],.25)
                if expected is None:
                    self.assertGreaterEqual(result['evidence']['sustainedSec'],.5)
                    self.assertGreaterEqual(result['evidence']['coverage'],.5)
                self.assertLessEqual(result['score'],bed.C['residual_absence_score_max'])

    def test_quiet_steady_pad_with_thin_observation_abstains_instead_of_absence(self):
        spans=[{'start':i,'end':i+1.75} for i in [0,2,4]]
        talking=place(6,[(i,voice(1.75)) for i in [0,2,4]])
        quiet_pad=tone(2300,6,.001)+tone(4600,6,.0003)
        result=measure(talking+quiet_pad,spans,voice_pad=0)
        self.assertLess(result['evidence']['observableShare'],.25)
        self.assertGreaterEqual(result['evidence']['observedBelowSpeechDb'],30)
        self.assertIsNone(result['present'],result)

    def test_full_path_continuous_talking_short_gaps_and_faint_residue_never_has_bed(self):
        spans=[{'start':i,'end':i+1.75,'confidence':1.} for i in [0,2,4]]
        x=place(6,[(i,voice(1.75)) for i in [0,2,4]])+tone(2300,6,.001)
        activity=independent_activity(x)
        # Known synthetic voice intervals isolate the bed regression from VAD
        # padding; all spectral, event, and bed stages still run in analyse_signal.
        activity={**activity,'hasVoicing':True,'independentSpans':spans,'spans':spans}
        result=sound.analyse_signal(x,speech=spans,speech_activity=activity)['bed']
        self.assertIsNot(result['present'],True,result)
        self.assertLess(result['evidence']['observableShare'],.25)
        self.assertLessEqual(result['score'],bed.C['residual_absence_score_max'])

    def test_coverage_denominator_excludes_unobservable_confirmed_voice(self):
        result=measure(place(6,[(0,voice(4)),(4,pad(2))]),[{'start':0,'end':4}])
        self.assertTrue(result['present'],result)
        self.assertGreater(result['evidence']['coverage'],.9)
        self.assertLess(result['evidence']['observableSec'],3)

    def test_talking_over_a_beat_without_music_abstains(self):
        x=voice()+kit(120,6)
        result=sound.analyse_signal(x,speech=[{'start':0,'end':6}])
        self.assertTrue(result['speechActivity']['spans'])
        self.assertIsNot(result['bed']['present'],True,result['bed'])
        # Bed policy with an affirmative beat measurement is independent of
        # whether this mixture's tempo analyser can certify that measurement.
        self.assertIsNone(measure(x,result['speechActivity']['spans'],beat_present=True)['present'])

    def test_no_baseline_and_a_flat_candidate_cannot_hide_the_reel(self):
        times=dsp.frame_times(375);S=np.zeros((dsp.NFFT//2+1,len(times)))
        S[100]=.1
        excluded=bed.effect_exclusion(S,times,[{'t':0,'features':{'attack':0}}])
        self.assertFalse(excluded[times>.1].any())

    def test_falling_tail_has_a_cap_and_keeps_a_one_point_five_second_ding(self):
        times=dsp.frame_times(375);S=np.zeros((dsp.NFFT//2+1,len(times)))
        S[100]=np.exp(-4*times)
        excluded=bed.effect_exclusion(S,times,[{'t':0,'features':{'attack':0}}])
        self.assertTrue(excluded[(times>=.1)&(times<=1.5)].all())
        self.assertFalse(excluded[times>2.2].any())

    def test_cap_wins_before_a_long_tail_returns_to_a_silent_baseline(self):
        times=dsp.frame_times(375);S=np.zeros((dsp.NFFT//2+1,len(times)))
        S[100]=np.where(times>=1,np.exp(-4*np.maximum(0,times-1)),0)
        excluded=bed.effect_exclusion(S,times,[{'t':1,'features':{'attack':0}}])
        self.assertTrue(excluded[(times>=1)&(times<3.2)].all())
        self.assertFalse(excluded[times>3.2].any())

    def test_stationary_noise_is_not_music(self):
        self.assertFalse(measure(np.random.default_rng(36).normal(0,.02,6*SR).astype(np.float32))['present'])

    def test_bed_result_cannot_change_tempo_or_effects(self):
        x=pad()+kit(120,6)+place(6,[(1.35,tone(1200,.08,.5,40))])
        before=sound.analyse_signal(x)
        with patch('breakdown.sound.bed_info',return_value={'present':None,'score':0.,'reason':'forced unavailable evidence'}):
            after=sound.analyse_signal(x)
        self.assertTrue(before['sfx']);self.assertEqual(before['sfx'],after['sfx'])
        self.assertEqual(before['tempo'],after['tempo'])


if __name__=='__main__':unittest.main()
