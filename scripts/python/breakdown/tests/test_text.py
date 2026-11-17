# scripts/python/breakdown/tests/test_text.py
import unittest

import cv2
import numpy as np

from breakdown import ocr_backend, text


def close(a, b, tolerance=40):
    if a is None or b is None:
        return a is b
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return sum((x - y) ** 2 for x, y in zip(pa, pb)) ** 0.5 <= tolerance


class Logical(unittest.TestCase):
    def test_reverses_visual_arabic(self):
        self.assertEqual(ocr_backend.to_logical("حاجنلا رس", True), "سر النجاح")

    def test_keeps_numbers_readable(self):
        self.assertEqual(ocr_backend.to_logical("12 ةوطخ", True), "خطوة 12")

    def test_logical_input_is_untouched(self):
        self.assertEqual(ocr_backend.to_logical("سر النجاح", False), "سر النجاح")


class Blocks(unittest.TestCase):
    def test_two_lines_make_one_block(self):
        blocks = text.group_blocks([([10, 100, 200, 130], "سطر أول", 0.9), ([20, 135, 190, 165], "سطر تاني", 0.8)])
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["text"], "سطر أول\nسطر تاني")

    def test_tracking_prefers_complete_reading_over_a_confident_fragment(self):
        rect = [10,10,180,40]
        cues = text.track([(0,[{'rect':rect,'text':'alpha beta','score':.94}]),(.5,[{'rect':rect,'text':'pha beta','score':.96}])],.5)
        self.assertEqual(len(cues),1)
        self.assertEqual(cues[0]['best'],'alpha beta')

    def test_track_joins_samples_and_tolerates_one_miss(self):
        blk = {"rect": [10, 10, 100, 40], "text": "سر النجاح", "score": 0.9}
        cues = text.track([(0.0, [blk]), (0.5, [blk]), (1.0, []), (1.5, [blk]), (2.0, [])], 0.5)
        self.assertEqual(len(cues), 1)
        self.assertEqual((cues[0]["first"], cues[0]["last"]), (0.0, 1.5))


def feat(contrast, w, h, cx=0.5):
    return {"contrast": contrast, "w": w, "h": h, "cx": cx}


class Entrance(unittest.TestCase):
    def test_cut(self):
        self.assertEqual(text.classify_entrance([feat(0, 0, 0), feat(80, 0.8, 0.6)], 30), "cut")

    def test_fade(self):
        self.assertEqual(text.classify_entrance([feat(0, 0, 0)] + [feat(c, 0.8, 0.6) for c in (20, 40, 60, 80)], 30), "fade")

    def test_pop(self):
        self.assertEqual(text.classify_entrance([feat(0, 0, 0)] + [feat(80, 0.8 * s, 0.6 * s) for s in (0.5, 0.8, 1.0)], 30), "pop")

    def test_typewriter_right_to_left(self):
        feats = [feat(0, 0, 0)] + [feat(80, 0.8 * s, 0.6, 0.5 + 0.4 * (1 - s) / 2) for s in (0.3, 0.6, 1.0)]
        self.assertEqual(text.classify_entrance(feats, 30), "typewriter")

    def test_slide(self):
        feats = [feat(0, 0, 0)] + [feat(80, 0.8, 0.6, cx) for cx in (0.2, 0.3, 0.4, 0.5)]
        self.assertEqual(text.classify_entrance(feats, 30), "slide")


class Style(unittest.TestCase):
    def test_outlined_white_text(self):
        img = np.full((400, 600, 3), (90, 140, 60), np.uint8)
        cv2.putText(img, "SALE", (160, 230), cv2.FONT_HERSHEY_SIMPLEX, 3, (0, 0, 0), 18, cv2.LINE_AA)
        cv2.putText(img, "SALE", (160, 230), cv2.FONT_HERSHEY_SIMPLEX, 3, (255, 255, 255), 8, cv2.LINE_AA)
        style = text.text_style(img, [150, 155, 440, 245])
        self.assertTrue(close(style["fill"], "#ffffff"), style)
        self.assertTrue(close(style["stroke"], "#000000"), style)
        self.assertIsNone(style["box"])

    def test_boxed_text(self):
        img = np.full((400, 600, 3), (200, 120, 40), np.uint8)
        cv2.rectangle(img, (120, 130), (480, 270), (0, 0, 0), -1)
        cv2.putText(img, "SALE", (160, 230), cv2.FONT_HERSHEY_SIMPLEX, 3, (10, 214, 255), 8, cv2.LINE_AA)
        style = text.text_style(img, [150, 160, 420, 240])
        self.assertTrue(close(style["fill"], "#ffd60a"), style)
        self.assertTrue(close(style["box"], "#000000"), style)


if __name__ == "__main__":
    unittest.main()
