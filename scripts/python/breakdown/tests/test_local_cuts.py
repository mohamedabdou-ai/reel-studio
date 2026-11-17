import unittest
from unittest.mock import patch
import cv2
import numpy as np
from breakdown import local_cuts,shots
from breakdown.visual_config import VISUAL_TUNING

C=VISUAL_TUNING['local_cuts']
FPS=30


def lab(frame):
    w=C['analysis_width'];small=cv2.resize(frame,(w,round(frame.shape[0]*w/frame.shape[1])),interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(small,cv2.COLOR_BGR2LAB)


def clip(a,b):return [lab(a)]*20+[lab(b)]*20


def analyse(frames):
    def iterator(path,width=None,**kwargs):
        for i,f in enumerate(frames):
            out=f if width is None else cv2.resize(f,(width,round(f.shape[0]*width/f.shape[1])),interpolation=cv2.INTER_AREA)
            yield i,i/FPS,out
    with patch('breakdown.shots.iter_frames',side_effect=iterator),patch('breakdown.shots.video_info',return_value={'fps':FPS}):
        return shots.analyse({'proxy':'fake-local-fixture.mp4'})


class LocalCuts(unittest.TestCase):
    def test_picture_swaps_at_varied_sizes_and_positions(self):
        for x,y,w,h in [(5,20,16,30),(75,120,35,45),(20,40,85,80)]:
            a=np.full((192,128,3),35,np.uint8);b=a.copy()
            a[y:y+h,x:x+w]=[0,0,240];b[y:y+h,x:x+w]=[240,100,0]
            found=local_cuts.detect(clip(a,b),FPS)
            self.assertEqual(set(found),{20},(x,y,w,h,found))

    def test_chroma_change_is_not_lost_in_grayscale(self):
        a=np.full((192,128,3),40,np.uint8);b=a.copy()
        a[30:80,30:90]=[0,0,255];b[30:80,30:90]=[0,130,0]
        self.assertEqual(set(local_cuts.detect(clip(a,b),FPS)),{20})

    def test_caption_swap_every_one_point_five_seconds_is_not_a_cut(self):
        frames=[]
        for text in ['ONE TWO','THREE','FOUR FIVE','SIX']:
            f=np.full((192,128,3),40,np.uint8)
            cv2.putText(f,text,(6,165),cv2.FONT_HERSHEY_SIMPLEX,.4,(255,255,255),1,cv2.LINE_AA)
            frames.extend([lab(f)]*45)
        self.assertEqual(local_cuts.detect(frames,FPS),{})

    def test_detailed_caption_edges_keep_region_boxes_for_the_ocr_merge_veto(self):
        # Geometry alone cannot reject these: the unchanged detailed background
        # gives the glyph patch high entropy. JS merge tests pin the OCR veto.
        rng=np.random.default_rng(93)
        base=rng.integers(0,180,(192,128,3),dtype=np.uint8)
        caption=base.copy()
        cv2.putText(caption,'BIG TEXT',(8,164),cv2.FONT_HERSHEY_SIMPLEX,.55,(0,0,0),5,cv2.LINE_AA)
        cv2.putText(caption,'BIG TEXT',(8,164),cv2.FONT_HERSHEY_SIMPLEX,.55,(255,255,255),2,cv2.LINE_AA)
        result=analyse([base]*30+[caption]*30+[base]*30)
        self.assertEqual(len(result['cuts']),2,result['cuts'])
        self.assertTrue(all(c.get('scope')=='region' and c.get('box') for c in result['cuts']))
        self.assertEqual(len(result['shots']),1)

    def test_highlight_behind_same_text_is_not_a_cut(self):
        frames=[]
        for color in [(40,40,40),(100,80,20)]:
            f=np.full((192,128,3),30,np.uint8);cv2.rectangle(f,(8,143),(120,169),color,-1)
            cv2.putText(f,'SAME TEXT',(10,161),cv2.FONT_HERSHEY_SIMPLEX,.4,(255,255,255),1,cv2.LINE_AA)
            frames.append(f)
        self.assertEqual(local_cuts.detect(clip(*frames),FPS),{})

    def test_slow_camera_move_is_not_a_cut(self):
        wide=np.random.default_rng(39).integers(0,256,(192,240,3),dtype=np.uint8)
        frames=[wide[:,i:i+128] for i in range(60)]
        self.assertEqual(local_cuts.detect([lab(f) for f in frames],FPS),{})
        self.assertEqual(analyse(frames)['cuts'],[])

    def test_whole_frame_cut_is_counted_once(self):
        a=np.full((192,128,3),20,np.uint8);b=np.full_like(a,200)
        result=analyse([a]*30+[b]*30)
        self.assertEqual(len(result['cuts']),1,result['cuts']);self.assertEqual(result['cuts'][0]['frame'],30)
        self.assertEqual(len(result['shots']),2)

    def test_local_replacement_is_a_partial_swap_inside_one_shot(self):
        a=np.full((192,128,3),35,np.uint8);b=a.copy()
        a[40:100,30:90]=[0,0,240];b[40:100,30:90]=[240,100,0]
        result=analyse([a]*30+[b]*30)
        self.assertEqual(len(result['cuts']),1,result['cuts'])
        cut=result['cuts'][0]
        self.assertEqual(cut['scope'],'region');self.assertFalse(cut['shotBoundary'])
        self.assertEqual(len(cut['box']),4);self.assertEqual(len(result['shots']),1)
        self.assertIn('boundaryRatio',cut['evidence'])

    def test_region_score_varies_with_hold_strength(self):
        a=np.full((96,64),20,np.uint8);b=a.copy();b[20:70,10:50]=180
        exact=[a]*20+[b]*20
        drifting=[a.copy() for _ in range(20)]+[b.copy() for _ in range(20)]
        drifting[18][20:70,10:50]+=10
        strong=local_cuts.boundary_evidence(exact,20,[10,20,50,70],FPS)
        weak=local_cuts.boundary_evidence(drifting,20,[10,20,50,70],FPS)
        self.assertGreater(strong['score'],weak['score']);self.assertTrue(weak['qualified'])

    def test_coherent_sparse_displacement_keeps_its_jump_classification(self):
        a=np.full((192,128,3),40,np.uint8);b=a.copy()
        cv2.rectangle(a,(20,70),(40,90),(255,255,255),-1)
        cv2.rectangle(b,(70,70),(90,90),(255,255,255),-1)
        result=analyse([a]*30+[b]*30)
        self.assertEqual(len(result['cuts']),1,result['cuts']);self.assertEqual(result['cuts'][0]['kind'],'jump')


if __name__=='__main__':unittest.main()
