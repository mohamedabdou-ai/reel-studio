# scripts/python/breakdown/tests/test_overlays_look.py
import unittest

import numpy as np

from breakdown import look, overlays


class Overlays(unittest.TestCase):
    def test_still_block_over_moving_content(self):
        stack = np.random.default_rng(0).integers(0, 255, (8, 160, 96), dtype=np.uint8)
        stack[:, 16:48, 8:40] = 128
        boxes = overlays.static_regions(stack)
        self.assertEqual(len(boxes), 1)
        self.assertEqual(boxes[0][:4], [8, 16, 32, 32])

    def test_still_shot_has_no_overlay(self):
        stack = np.repeat(np.random.default_rng(1).integers(0, 255, (1, 160, 96), dtype=np.uint8), 8, axis=0)
        self.assertEqual(overlays.static_regions(stack), [])


class Look(unittest.TestCase):
    def test_grey_frames_are_bw(self):
        ramp = np.tile(np.linspace(0, 255, 64).astype(np.uint8), (64, 1))
        self.assertEqual(look.label(look.metrics([np.dstack([ramp] * 3)])), "bw")

    def test_saturated_frames_are_vivid(self):
        frame = np.zeros((64, 64, 3), np.uint8)
        frame[..., 2] = 255
        frame[:, 32:, 1] = 200
        self.assertEqual(look.label(look.metrics([frame])), "vivid")



class OverlayReliability(unittest.TestCase):
    def test_zooming_texture_with_a_fixed_overlay_keeps_recall(self):
        import cv2
        base=np.random.default_rng(31).integers(0,255,(160,96),dtype=np.uint8)
        frames=[]
        for index in range(10):
            matrix=cv2.getRotationMatrix2D((48,80),0,1+.04*index)
            frame=cv2.warpAffine(base,matrix,(96,160),borderMode=cv2.BORDER_REFLECT)
            frame[16:48,8:40]=128
            frames.append(frame)
        boxes=overlays.static_regions(np.stack(frames))
        self.assertTrue(any(b[:4]==[8,16,32,32] for b in boxes),boxes)

    def test_brief_transition_after_static_content_is_not_overlay_evidence(self):
        first=np.random.default_rng(41).integers(0,255,(160,96),dtype=np.uint8)
        frames=np.repeat(first[None],10,axis=0)
        frames[-2:]=np.random.default_rng(42).integers(0,255,(2,160,96),dtype=np.uint8)
        frames[:,16:48,8:40]=128
        self.assertEqual(overlays.static_regions(frames),[])

    def test_cell_averages_cannot_hide_pixel_motion(self):
        base=np.indices((160,96)).sum(axis=0)%2*200
        frames=np.stack([np.roll(base,k%2,axis=1) for k in range(8)]).astype(np.uint8)
        self.assertEqual(overlays.static_regions(frames),[])
    def test_encoded_motion_cases_preserve_labelled_overlay_recall(self):
        import cv2
        import pathlib
        import tempfile
        root=pathlib.Path(__file__).resolve().parents[4]/'state/tmp'
        truth=[8/160,16/96,32/160,32/96]
        with tempfile.TemporaryDirectory(dir=root) as directory:
            for motion in ('zoom','pan','moving-noise'):
                video=str(pathlib.Path(directory)/(motion+'.avi'))
                writer=cv2.VideoWriter(video,cv2.VideoWriter_fourcc(*'MJPG'),10,(160,96))
                self.assertTrue(writer.isOpened())
                rng=np.random.default_rng(66)
                base=rng.integers(0,255,(96,160),dtype=np.uint8)
                for index in range(24):
                    if motion=='zoom':
                        matrix=cv2.getRotationMatrix2D((80,48),0,1+.02*index)
                        frame=cv2.warpAffine(base,matrix,(160,96),borderMode=cv2.BORDER_REFLECT)
                    elif motion=='pan':
                        frame=np.roll(base,index*4,axis=1)
                    else:
                        frame=rng.integers(0,255,(96,160),dtype=np.uint8)
                    frame[16:48,8:40]=128
                    writer.write(cv2.cvtColor(frame,cv2.COLOR_GRAY2BGR))
                writer.release()
                found=overlays.analyse({'proxy':video,'shots':[{'id':'S01','start':0,'end':2.4}]})['overlays']
                def iou(box):
                    x,y,w,h=box;X,Y,W,H=truth
                    inter=max(0,min(x+w,X+W)-max(x,X))*max(0,min(y+h,Y+H)-max(y,Y))
                    return inter/(w*h+W*H-inter)
                self.assertTrue(any(iou(item['box'])>.75 for item in found),(motion,found))

    def test_mean_level_separates_light_and_dark_grounds(self):
        light = np.full((48, 48, 3), 235, np.uint8)
        dark = np.full((48, 48, 3), 20, np.uint8)
        self.assertGreater(look.metrics([light])["meanLevel"], 85)
        self.assertLess(look.metrics([dark])["meanLevel"], 12)
        self.assertIsNone(look.metrics([])["meanLevel"])

if __name__ == '__main__':
    unittest.main()
