import unittest
from unittest.mock import patch

import cv2
import numpy as np

from breakdown import shots, text
from breakdown.panels import moving_panel


class TextContinuity(unittest.TestCase):
    def test_static_multiline_fragments_have_one_lifespan(self):
        complete = text.group_blocks([([10,10,110,30],'First title',.95),([10,42,110,62],'Second line',.95)])
        partial = text.group_blocks([([10,10,110,30],'First title',.94)])
        cues = text.track([(i*.5, complete if i%3 else partial) for i in range(10)], .5)
        self.assertEqual(len(cues),1)
        self.assertEqual(cues[0]['best'],'First title\nSecond line')
        self.assertEqual((cues[0]['first'],cues[0]['last']),(0,4.5))

    def test_replacement_at_same_position_is_not_same_text(self):
        def block(words):
            return {'rect':[10,10,150,40],'text':words,'score':.95}
        cues = text.track([(0,[block('First message')]),(.5,[block('First message')]),
                           (1,[block('Different content')]),(1.5,[block('Different content')])],.5)
        self.assertEqual(len(cues),2)

    def test_number_and_words_join_without_joining_neighbouring_panel(self):
        blocks = text.group_blocks([([5,10,15,28],'1)',.9),([22,10,95,28],'Choice one',.9),
                                    ([130,10,190,28],'Panel label',.9)])
        self.assertEqual(len(blocks),2)
        self.assertEqual(blocks[0]['text'],'1) Choice one')

    def test_arabic_parts_keep_reading_order(self):
        # Code points keep this fixture independent of terminal encodings.
        right, left = '\u0633\u0631', '\u0627\u0644\u0646\u062c\u0627\u062d'
        blocks = text.group_blocks([([60,10,90,30],right,.99),([10,10,55,30],left,.99)])
        self.assertEqual(blocks[0]['text'],right+' '+left)

    def test_clear_short_word_survives_while_unstable_fragments_do_not(self):
        def cue(values):
            return text.track([(i*.5,[{'rect':[10,10,30,30],'text':v,'score':.99}]) for i,v in enumerate(values)],.5)[0]
        self.assertTrue(text.reliable_cue(cue(['AI','AI','AI'])))
        self.assertFalse(text.reliable_cue(cue(['(','(','('])))
        self.assertFalse(text.reliable_cue(cue(['10','10','10'])))

    def test_list_prefix_outside_one_ocr_row_is_still_measured(self):
        rows = [[10,10,110,30],[10,42,110,62],[35,74,110,94]]
        cue = {'observations':[(0,{'lineBoxes':rows}),(.5,{'lineBoxes':rows})]}
        boxes = text.stable_line_boxes(cue)
        self.assertEqual(boxes[2][0],10)
        frame = np.zeros((110,140,3),np.uint8)
        for x0,y0,x1,y1 in rows:
            frame[y0:y1,x0:x1]=(150,150,150)
        frame[74:94,10:25]=(0,200,255)
        self.assertEqual(text.highlight_row(frame,boxes),2)

    def test_list_highlight_steps_are_events_not_new_cues(self):
        boxes = [[10,20+i*32,110,40+i*32] for i in range(3)]
        def frames(_path,every=1,**kwargs):
            for i in range(120):
                if i%every:
                    continue
                frame = np.zeros((180,220,3),np.uint8)
                selected = min(2,i//40)
                for j,(x0,y0,x1,y1) in enumerate(boxes):
                    frame[y0:y1,x0:x1] = (0,220,255) if j==selected else (160,160,160)
                yield i,i/30,frame
        def read(_frame,_models,_visual):
            return [([[x0,y0],[x1,y0],[x1,y1],[x0,y1]],f'{j+1}) Choice {j+1}',.98)
                    for j,(x0,y0,x1,y1) in enumerate(boxes)]
        info = {'fps':30,'frames':120,'width':220,'height':180}
        with patch.object(text,'video_info',return_value=info),patch.object(text,'iter_frames',side_effect=frames),patch.object(text,'read_lines',side_effect=read):
            result = text.analyse({'proxy':'generated','models':{}})['text']
        self.assertEqual(len(result),1,result)
        self.assertEqual(result[0]['start'],0)
        self.assertAlmostEqual(result[0]['end'],4,delta=.05)
        self.assertEqual([e['lineIndex'] for e in result[0]['events']],[1,2])
        self.assertAlmostEqual(result[0]['events'][0]['t'],40/30,delta=.1)

    def test_tiny_unstable_ocr_does_not_create_a_cue(self):
        frame = np.full((100,100,3),90,np.uint8)
        def frames(_path,every=1,**kwargs):
            return iter((i,i/30,frame) for i in range(60) if i%every==0)
        with patch.object(text,'video_info',return_value={'fps':30,'frames':60,'width':100,'height':100}),patch.object(text,'iter_frames',side_effect=frames),patch.object(text,'read_lines',return_value=[([[5,5],[20,5],[20,20],[5,20]],'(', .95)]):
            self.assertEqual(text.analyse({'proxy':'generated','models':{}})['text'],[])


class PanelChanges(unittest.TestCase):
    @staticmethod
    def frames():
        rng = np.random.default_rng(71)
        patterns = [rng.integers(0,60,(96,80,3),dtype=np.uint8)+np.array(c,np.uint8)
                    for c in [(140,0,0),(0,140,0),(0,0,140),(100,100,0)]]
        for i in range(210):
            frame = np.full((160,120,3),40,np.uint8)
            cv2.putText(frame,'FIXED',(5,14),cv2.FONT_HERSHEY_SIMPLEX,.35,(255,255,255),1)
            if i < 45:
                image = patterns[0]
            elif i < 90:
                image = patterns[1]
            elif i < 135:
                image = patterns[2]
            elif i < 147:
                alpha = (i-134)/12
                image = cv2.addWeighted(patterns[2],1-alpha,patterns[3],alpha,0)
            else:
                image = patterns[3]
            # Small motion keeps this a video panel, rather than a static card.
            frame[32:128,24:104] = np.roll(image,i//6,axis=1)
            yield i,i/30,frame

    def test_panel_switches_inside_still_frame_and_dissolves(self):
        frames = list(self.frames())
        def stream(_path,width=None,every=1,gray=False,**kwargs):
            for i,t,frame in frames:
                if i%every:
                    continue
                if width:
                    frame = cv2.resize(frame,(width,round(frame.shape[0]*width/frame.shape[1])))
                yield i,t,cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY) if gray else frame
        with patch.object(shots,'video_info',return_value={'fps':30}),patch.object(shots,'iter_frames',side_effect=stream):
            result = shots.analyse({'proxy':'generated'})
        self.assertTrue(result['panels'],result)
        for t in (1.5,3):
            self.assertTrue(any(abs(c['t']-t)<=2/30 and c.get('scope')=='region' for c in result['cuts']),result)
        self.assertTrue(any(r['kind']=='dissolve' and r.get('scope')=='region' and 4.4<r['start']<4.7 for r in result['transitions']),result)

    def test_global_motion_and_title_pop_do_not_establish_a_panel(self):
        rng = np.random.default_rng(42)
        whole = [rng.integers(0,256,(120,80),dtype=np.uint8) for _ in range(120)]
        self.assertIsNone(moving_panel(whole,30))
        title = [np.zeros((120,80),np.uint8) for _ in range(120)]
        for f in title[30:]:
            f[10:20,10:70]=255
        self.assertIsNone(moving_panel(title,30))

    def test_generated_encoded_panel_is_detected_without_mocking_decoder(self):
        import pathlib
        import tempfile
        root = pathlib.Path(__file__).resolve().parents[4]/'state/tmp'
        with tempfile.TemporaryDirectory(dir=root) as directory:
            filename = str(pathlib.Path(directory)/'generated-panel.avi')
            writer = cv2.VideoWriter(filename,cv2.VideoWriter_fourcc(*'MJPG'),30,(120,160))
            self.assertTrue(writer.isOpened())
            try:
                for _,_,frame in self.frames():
                    writer.write(frame)
            finally:
                writer.release()
            result = shots.analyse({'proxy':filename})
            self.assertTrue(result['panels'])
            self.assertEqual(len(result['cuts']),2,result)
            self.assertEqual(len(result['transitions']),1,result)
            self.assertEqual(result['transitions'][0]['kind'],'dissolve')

    def test_two_frame_opening_spike_is_not_a_shot(self):
        self.assertEqual(shots.enforce_min_shot([2,45],[.5]*90,30),[45])


if __name__ == '__main__':
    unittest.main()
