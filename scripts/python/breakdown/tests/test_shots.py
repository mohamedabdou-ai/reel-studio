# scripts/python/breakdown/tests/test_shots.py
import unittest

import numpy as np

from breakdown import shots


class DetectCuts(unittest.TestCase):
    def test_single_spike_is_a_cut(self):
        scores = [0.0] + [0.01] * 59
        changed = [0.0] * 60
        scores[30], changed[30] = 0.8, 0.9
        self.assertEqual(shots.raw_candidates(scores, changed, 30.0), [30])

    def test_title_pop_is_not_a_cut(self):
        scores = [0.0] + [0.01] * 59
        changed = [0.0] * 60
        scores[30], changed[30] = 0.8, 0.1
        self.assertEqual(shots.raw_candidates(scores, changed, 30.0), [])

    def test_flash_pair_is_removed(self):
        cands, flashes = shots.split_flashes([30, 34], lambda i, j: (i, j) == (30, 34), 30.0)
        self.assertEqual((cands, flashes), ([], [(30, 34)]))

    def test_min_shot_keeps_the_stronger_cut(self):
        scores = [0.0] * 60
        scores[30], scores[35] = 0.5, 0.9
        self.assertEqual(shots.enforce_min_shot([30, 35], scores, 30.0), [35])

    def test_gradual_span_between_quiet_stretches(self):
        scores = [0.0] * 90
        for k in range(40, 52):
            scores[k] = 0.1
        self.assertEqual(shots.gradual_spans(scores, [], 30.0), [(39, 51)])


def blend(a, b, n):
    return [((1 - k / (n - 1)) * a + (k / (n - 1)) * b).astype(np.uint8) for k in range(n)]


class Gradual(unittest.TestCase):
    def test_dissolve(self):
        a = np.zeros((64, 36, 3), float)
        a[:, :18] = 200
        b = np.zeros((64, 36, 3), float)
        b[:32] = 120
        self.assertEqual(shots.classify_gradual(blend(a, b, 10))[0], "dissolve")

    def test_fade_through_black(self):
        a = np.full((64, 36, 3), 180.0)
        b = np.full((64, 36, 3), 160.0)
        black = np.zeros_like(a)
        self.assertEqual(shots.classify_gradual(blend(a, black, 6)[:-1] + blend(black, b, 6))[0], "fade")

    def test_slide_left(self):
        wide = np.random.default_rng(1).integers(0, 255, (64, 200, 3), dtype=np.uint8)
        clip = [np.ascontiguousarray(wide[:, k * 4:k * 4 + 72]) for k in range(10)]
        self.assertEqual(shots.classify_gradual(clip), ("slide", "left"))


if __name__ == "__main__":
    unittest.main()
