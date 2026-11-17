# scripts/python/breakdown/tests/test_sound.py
import unittest

import numpy as np

from breakdown import dsp, sound

SR = dsp.SR


def tone(freq, dur, amp=0.5, decay=0.0):
    t = np.arange(int(dur * SR)) / SR
    return (amp * np.sin(2 * np.pi * freq * t) * np.exp(-decay * t)).astype(np.float32)


def place(total, clips):
    out = np.zeros(int(total * SR), np.float32)
    for start, clip in clips:
        i = int(start * SR)
        n = min(len(clip), len(out) - i)
        out[i:i + n] += clip[:n]
    return out


class Tempo(unittest.TestCase):
    def test_click_track_at_120(self):
        signal = place(12.0, [(k * 0.5, tone(60, 0.12, 0.8, 30)) for k in range(24)])
        env = dsp.onset_envelope(dsp.spectrogram(signal))
        info = dsp.tempo(env, np.ones_like(env), SR / dsp.HOP, spectrum=dsp.spectrogram(signal))
        self.assertAlmostEqual(info["bpm"], 120, delta=4.8)


class SfxTypes(unittest.TestCase):
    def kind(self, clip, background=None):
        signal = place(3.0, [(1.0, clip)])
        if background is not None:
            signal = signal + background[:len(signal)]
        return sound.sfx_type(sound.sfx_features(signal, 1.0))

    def test_pop(self):
        self.assertEqual(self.kind(tone(1200, 0.08, 0.5, 40)), "pop")

    def test_ding(self):
        self.assertEqual(self.kind(tone(2500, 0.5, 0.35, 6)), "ding")

    def test_impact(self):
        self.assertEqual(self.kind(tone(70, 0.45, 0.6, 8)), "impact")

    def test_click(self):
        n = int(0.03 * SR)
        noise = np.random.default_rng(0).standard_normal(n) * np.exp(-np.arange(n) / (0.006 * SR)) * 0.5
        self.assertEqual(self.kind(np.diff(noise, prepend=0).astype(np.float32)), "click")

    def test_pop_over_music_bed(self):
        bed = sum(tone(f, 3.0, 0.05) for f in (220, 277.18, 329.63))
        self.assertEqual(self.kind(tone(1200, 0.08, 0.5, 40), bed), "pop")


class Candidates(unittest.TestCase):
    def test_off_beat_hit_found_and_regular_beats_ignored(self):
        clips = [(k * 0.5, tone(55, 0.3, 0.5, 25)) for k in range(24)] + [(3.25, tone(1200, 0.08, 0.5, 40))]
        result = sound.analyse_signal(place(12.0, clips))
        times = [x["t"] for x in result["sfx"]]
        self.assertEqual(len(times), 1, result["sfx"])
        self.assertAlmostEqual(times[0], 3.25, delta=0.05)


if __name__ == "__main__":
    unittest.main()
