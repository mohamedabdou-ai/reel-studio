import unittest
import numpy as np
from scipy.signal import butter, sosfilt
from breakdown import sound, dsp
from breakdown.tests.test_speech_rhythm import voice
from breakdown.tests.test_sound import tone, place

SR = dsp.SR


def speech_evidence(duration):
    return {'schema':1,'durationSec':duration,'hasVoicing':False,'independentSpans':[],
            'spans':[],'possibleSpans':[{'start':0,'end':duration,'confidence':.4}], 'backgroundSpans':[]}


def click(gain=.4):
    t = np.arange(round(.02*SR))/SR
    x = np.random.default_rng(52).standard_normal(len(t))
    return (gain*np.diff(x,prepend=0)*np.exp(-t/.004)).astype(np.float32)


def sweep(duration, rising=False):
    t = np.arange(round(duration*SR))/SR
    if rising:
        phase = 2*np.pi*(200*t + (4000-200)*t*t/(2*duration))
        return (.4*np.sin(phase)*(t/duration)).astype(np.float32)
    noise = np.random.default_rng(682).standard_normal(len(t))
    return (.18*noise*np.sin(np.pi*t/duration)**2).astype(np.float32)


class Effects(unittest.TestCase):
    def test_tiny_audio_has_no_missing_neighbour_index(self):
        for size in [1,16,128,511]:
            self.assertEqual(sound.analyse_signal(np.zeros(size,dtype=np.float32))['sfx'],[])

    def test_possible_speech_alone_syllables_plosives_and_gain_changes_have_zero_effects(self):
        clean = voice()
        plosive = sosfilt(butter(4,3500,fs=SR,output='sos'), click(.08))
        voiced = clean + place(6,[(at,plosive) for at in [.21,.96,1.71,2.46,3.21,3.96,4.71,5.46]])
        for gain in [.001,1,4]:
            for label,x in [('vowels',clean*gain),('plosives',voiced*gain)]:
                with self.subTest(gain=gain,kind=label):
                    self.assertEqual(sound.analyse_signal(x,speech_activity=speech_evidence(6))['sfx'],[])

    def test_effects_inside_possible_speech_at_several_offsets_and_levels(self):
        for at in [.61,1.37,2.81]:
            for gain in [.03,.15,.4]:
                x = voice() + place(6,[(at,click(gain))])
                found = sound.analyse_signal(x,speech_activity=speech_evidence(6))['sfx']
                self.assertEqual(len(found),1,found)
                self.assertAlmostEqual(found[0]['t'],at,delta=.04)
                self.assertEqual(found[0]['evidence'],'speech-residual')

    def test_word_onsets_and_pauses_are_not_effects(self):
        phrase = voice(.65)
        fade = np.minimum(1,np.arange(len(phrase))/(.015*SR))
        x = place(6,[(at,phrase*fade) for at in [0,.9,2.1,3.4,4.8]])
        found=sound.analyse_signal(x,speech_activity=speech_evidence(6))['sfx']
        self.assertEqual(found,[])

    def test_frication_and_breathy_consonants_are_not_clicks_or_sweeps(self):
        t = np.arange(round(.14*SR))/SR
        noise = np.random.default_rng(728).standard_normal(len(t))
        noise = sosfilt(butter(3,[4000,7000],btype='bandpass',fs=SR,output='sos'),noise)
        fricative = .06*noise*np.sin(np.pi*t/.14)**2
        x = voice()+place(6,[(at,fricative) for at in [.45,1.4,2.5,3.4,4.2,5.3]])
        found=sound.analyse_signal(x,speech_activity=speech_evidence(6))['sfx']
        self.assertEqual(found,[])

    def test_tonal_effects_and_a_zero_time_click_inside_voice(self):
        for at,clip in [(0,click(.1)),(1.37,tone(1200,.08,.15,40)),(2.1,tone(2500,.5,.15,6)),(3.23,tone(70,.45,.3,8))]:
            found = sound.analyse_signal(voice()+place(6,[(at,clip)]),speech_activity=speech_evidence(6))['sfx']
            self.assertTrue(any(abs(e['t']-at)<=.15 for e in found),found)
            self.assertEqual(len(found),1,found)

    def test_close_clicks_are_separate_attacks(self):
        for distance in [.04,.07,.11]:
            found = sound.analyse_signal(place(3,[(1,click()),(1+distance,click())]))['sfx']
            self.assertEqual(len(found),2,found)
            for event,at in zip(found,[1,1+distance]):self.assertAlmostEqual(event['t'],at,delta=.025)

    def test_close_attacks_in_different_bands_remain_separate(self):
        found = sound.analyse_signal(place(3,[(1,tone(900,.02,.4,50)),(1.04,tone(3500,.02,.4,50))]))['sfx']
        self.assertEqual(len(found),2,found)
        for event,at in zip(found,[1,1.04]):self.assertAlmostEqual(event['t'],at,delta=.025)

    def test_slow_whoosh_and_riser_each_have_one_early_onset(self):
        for rising,duration,kind in [(False,.65,'whoosh'),(True,1.1,'riser')]:
            found = sound.analyse_signal(place(4,[(1,sweep(duration,rising))]))['sfx']
            self.assertEqual(len(found),1,found)
            self.assertAlmostEqual(found[0]['t'],1,delta=.15)
            self.assertEqual(found[0]['type'],kind,found)

    def test_zero_time_and_quiet_effects_survive_a_loud_event(self):
        found = sound.analyse_signal(place(4,[(0,click(.1)),(1,click(10)),(2.1,click(.002)),(2.5,tone(1200,.08,.003,40))]))['sfx']
        self.assertEqual(len(found),4,found)
        self.assertEqual(found[0]['t'],0)
        for event,at in zip(found,[0,1,2.1,2.5]):self.assertAlmostEqual(event['t'],at,delta=.04)

    def test_quiet_addition_under_a_steady_bed_is_archived_when_total_rise_is_small(self):
        t = np.arange(5*SR)/SR
        background = .1*np.sin(2*np.pi*700*t)
        measured = sound.analyse_signal(background + place(5,[(2,click(.08))]))
        self.assertEqual(measured['sfx'],[])
        self.assertTrue(any(abs(x['t']-2)<.04 for x in measured['sfxCandidates']),measured)
        candidate=next(x for x in measured['sfxCandidates'] if abs(x['t']-2)<.04)
        self.assertIn('total-rise-unverified',candidate['candidateReasons'])
        self.assertLess(candidate['attackRiseDb'],6)


if __name__ == '__main__':unittest.main()
