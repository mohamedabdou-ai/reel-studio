import unittest
from unittest.mock import patch
import numpy as np
from scipy.stats import t
from breakdown import dsp, sound
from breakdown.audio_config import AUDIO_TUNING, false_alarm_grade
from breakdown.rhythm import pulse_groups, matches_pulse
from breakdown.sfx_events import speech_effect_branches, acceptance_reasons
from breakdown.tests.test_speech_rhythm import kit, voice
from breakdown.tests.test_sfx_events import click, speech_evidence, sweep
from breakdown.tests.test_sound import place, tone

C = AUDIO_TUNING['sfx']
SR = dsp.SR


class Review(unittest.TestCase):
    def test_quiet_different_pop_on_a_kick_is_kept_by_its_own_grade(self):
        x = kit(120)+place(12,[(3,tone(1200,.08,.1,40))])
        found = sound.analyse_signal(x)['sfx']
        self.assertEqual(len(found),1,found)
        self.assertAlmostEqual(found[0]['t'],3,delta=.04)
        self.assertTrue(found[0]['onBeat'])

    def test_regular_kicks_are_not_reported_even_as_candidates(self):
        self.assertEqual(sound.analyse_signal(kit(120))['sfx'],[])

    def test_timing_membership_cannot_bypass_spectral_verification(self):
        S=dsp.spectrogram(kit(120));groups=pulse_groups(S,np.ones(S.shape[1]),SR/dsp.HOP)
        group=next(g for g in groups if g['role']=='kick');at=group['centres'][2]
        altered=S.copy();altered[:,at]=0;altered[round(2500*dsp.NFFT/SR),at]=10
        self.assertFalse(matches_pulse(altered,at,group))

    def test_false_alarm_budget_and_audible_rise_are_derived(self):
        trials=(len(C['bands_hz'])-1)*SR/C['hop']
        low,high=t.ppf([C['floor_percentile']/100,C['spread_percentile']/100],C['noise_degrees_freedom'])
        self.assertAlmostEqual(t.sf(C['candidate_grade_min']*(high-low)+low,C['noise_degrees_freedom'])*trials,C['candidate_false_peaks_per_sec'],places=8)
        self.assertNotIn('grade_min',C)
        joint=C['candidate_false_peaks_per_sec']*C['total_rise_noise_probability']
        self.assertLess(joint,C['false_peaks_per_sec']);self.assertLess(joint*C['speech_shape_noise_probability'],C['false_peaks_per_sec'])
        self.assertEqual(C['epsilon'],1/65536)
        self.assertAlmostEqual(20*np.log10(C['attack_energy_rise']),6.)
        self.assertAlmostEqual(C['attack_energy_rise']**2,10**(.6))
        self.assertGreater(false_alarm_grade(.01,250,6,5),C['candidate_grade_min'])

    def test_voice_aligned_tonal_exception_does_not_tighten_other_branches(self):
        event={'t':0.,'end':.1,'lineShare':.9,'attack':.005,'band':2,'impulseDur':.02,'peakHz':1200.,'bands':{2},'voiceAligned':False}
        before=speech_effect_branches(event);after=speech_effect_branches({**event,'voiceAligned':True})
        self.assertTrue(before['tonal']);self.assertFalse(after['tonal'])
        self.assertEqual({k:v for k,v in before.items() if k!='tonal'},{k:v for k,v in after.items() if k!='tonal'})

    def test_dominant_formant_speech_has_no_reported_effects(self):
        time=np.arange(6*SR)/SR;f0=135.;x=np.zeros(len(time))
        for k in range(1,25):
            x+=.2*np.exp(-((k*f0-650)/250)**2)/k*np.sin(2*np.pi*k*f0*time)
        x*=.2+.8*(np.sin(2*np.pi*4.3*time)>0)
        found=sound.analyse_signal(x,speech_activity=speech_evidence(6))['sfx']
        self.assertEqual(found,[])

    def test_weak_detected_event_survives_as_a_listenable_candidate(self):
        grade=C['candidate_grade_min']/2
        event={'t':1.,'end':1.1,'bands':{2},'strength':grade,'effectRulePassed':False,'audibleRise':True,'mode':'speech-residual','voiceAligned':True,'lineShare':.9}
        event['rejectionReasons']=acceptance_reasons(event)
        proposal={'t':1.,'strength':grade,'onBeat':False,'evidence':'speech-residual','effectBranches':{'tonal':False},'_event':event}
        with patch('breakdown.sound.candidates',return_value=[proposal]):
            measured=sound.analyse_signal(place(3,[(1,tone(1200,.08,.3,40))]))
        self.assertEqual(measured['sfx'],[]);found=measured['sfxCandidates']
        self.assertEqual(len(found),1);self.assertEqual(found[0]['status'],'needs-confirmation')
        self.assertEqual(found[0]['detection'],'candidate');self.assertIn('below-false-alarm-grade',found[0]['candidateReasons'])
        self.assertIn('Listen',found[0]['confirmHow'])

    def test_unknown_type_is_not_an_event_rejection(self):
        with patch('breakdown.sound.sfx_type',return_value='hit'):
            measured=sound.analyse_signal(place(3,[(1,click(.4))]))
        self.assertEqual(len(measured['sfx']),1,measured)
        self.assertEqual(measured['sfx'][0]['typeConfidence'],'low')
        self.assertEqual(measured['sfx'][0]['candidateReasons'],[])

    def test_loud_effect_has_no_reported_tail_events_in_silence(self):
        for clip in [tone(70,.7,.8,8),tone(2500,.7,.5,6),click(.8)]:
            found=sound.analyse_signal(place(4,[(1,clip)]))['sfx']
            self.assertEqual(len(found),1,found)
            self.assertAlmostEqual(found[0]['t'],1,delta=.04)

    def test_near_duplicates_cannot_both_be_reported(self):
        found=sound.analyse_signal(place(4,[(1,sweep(.65,False))]))['sfx']
        self.assertEqual(len(found),1,found)

    def test_sub_measurement_floor_samples_cannot_make_an_effect(self):
        x=np.zeros(2*SR,dtype=np.float32);x[SR]=C['epsilon']/2
        self.assertEqual(sound.analyse_signal(x)['sfx'],[])

    def test_close_clicks_80_and_90_ms_apart_inside_speech(self):
        for gap in [.08,.09]:
            expected=[1.3,1.3+gap,1.3+2*gap]
            x=voice()+place(6,[(at,click(.15)) for at in expected])
            found=sound.analyse_signal(x,speech_activity=speech_evidence(6))['sfx']
            self.assertEqual(len(found),3,found)
            for event,at in zip(found,expected):self.assertAlmostEqual(event['t'],at,delta=.025)


if __name__=='__main__':unittest.main()
