import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import cv2
import numpy as np
from breakdown import frames


class SampledFrames(unittest.TestCase):
    def test_grab_retrieve_preserves_pixels_and_interval_sampling(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()/'state/tmp') as directory:
            file=str(Path(directory)/'test.avi')
            writer=cv2.VideoWriter(file,cv2.VideoWriter_fourcc(*'MJPG'),30,(64,96))
            for i in range(60):writer.write(np.full((96,64,3),i*3,np.uint8))
            writer.release()
            expected=[];cap=cv2.VideoCapture(file);i=0
            while True:
                ok,image=cap.read()
                if not ok:break
                if i%3==0:expected.append((i,i/30,cv2.cvtColor(frames.resize_width(image,32),cv2.COLOR_BGR2GRAY)))
                i+=1
            cap.release()
            actual=list(frames.iter_frames(file,width=32,every=3,gray=True))
            self.assertEqual(len(actual),len(expected))
            for a,b in zip(expected,actual):
                self.assertEqual(a[:2],b[:2]);np.testing.assert_array_equal(a[2],b[2])
            with frames.only_intervals([(.5,.6)]):selected=list(frames.iter_frames(file,every=3))
            self.assertEqual([i for i,_,_ in selected],[15,18])

    def test_ninety_seconds_sixty_fps_creates_no_frame_files(self):
        counters={'retrieve':0}
        class Capture:
            def __init__(self,*args):self.i=-1
            def isOpened(self):return True
            def get(self,key):return 60
            def grab(self):self.i+=1;return self.i<5400
            def retrieve(self):counters['retrieve']+=1;return True,np.zeros((960,540,3),np.uint8)
            def read(self):raise AssertionError('unsampled BGR reads are forbidden')
            def release(self):pass
        with tempfile.TemporaryDirectory(dir=Path.cwd()/'state/tmp') as directory:
            source=Path(directory)/'source.mp4';source.write_bytes(b'fixture')
            with patch('breakdown.frames.cv2.VideoCapture',Capture),patch('tempfile.mkstemp',side_effect=AssertionError('frame spool is forbidden')):
                count=sum(1 for _ in frames.iter_frames(str(source),every=30))
            self.assertEqual(count,180);self.assertEqual(counters['retrieve'],180)
            self.assertEqual(list(Path(directory).iterdir()),[source])
            self.assertTrue(all(f.stat().st_size<1024**3 for f in Path(directory).iterdir()))
