# scripts/python/breakdown/tests/test_camera.py
import math
import unittest

import cv2
import numpy as np

from breakdown import camera


def textured(seed=3, h=568, w=320):
    base = np.random.default_rng(seed).integers(0, 255, (h // 8, w // 8), dtype=np.uint8)
    return cv2.resize(base, (w, h), interpolation=cv2.INTER_NEAREST)


class Motion(unittest.TestCase):
    def test_zoom_in(self):
        img = textured()
        h, w = img.shape
        frames = [cv2.warpAffine(img, cv2.getRotationMatrix2D((w / 2, h / 2), 0, 1 + 0.01 * k), (w, h), borderMode=cv2.BORDER_REFLECT) for k in range(12)]
        samples = [camera.pair_motion(a, b) for a, b in zip(frames, frames[1:])]
        self.assertEqual(camera.classify(samples, 0.1)["label"], "zoom-in")

    def test_static(self):
        img = textured()
        self.assertEqual(camera.classify([camera.pair_motion(img, img) for _ in range(10)], 0.1)["label"], "static")

    def test_content_moving_left_means_camera_pans_right(self):
        img = textured()
        frames = [np.roll(img, -8 * k, axis=1) for k in range(10)]
        samples = [camera.pair_motion(a, b) for a, b in zip(frames, frames[1:])]
        self.assertEqual(camera.classify(samples, 0.1)["label"], "pan-right")

    def test_punch_event(self):
        still = {"logScale": 0.0, "dx": 0.0, "dy": 0.0, "rotation": 0.0, "inliers": 1.0, "flow": 0.0}
        jump = dict(still, logScale=math.log(1.3), flow=0.05)
        events = camera.punch_events([still, still, still, jump], [0.1, 0.2, 0.3, 0.4])
        self.assertEqual([(e["t"], e["kind"]) for e in events], [(0.4, "punch-in")])


if __name__ == "__main__":
    unittest.main()
