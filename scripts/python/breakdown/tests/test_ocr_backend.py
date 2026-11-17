import unittest
from unittest.mock import patch
import types
from collections import OrderedDict
import numpy as np
from breakdown import ocr_backend as ocr


class Decode(unittest.TestCase):
    def test_ctc_collapses_repeated_tokens_but_resets_on_blank(self):
        output = np.eye(4)[[1,1,0,2,2,0,1]]
        self.assertEqual(ocr.decode_ctc(output,['','A','B',' ']),('ABA',1.0))

    def test_empty_and_malformed_recognition_are_distinct(self):
        self.assertEqual(ocr.decode_ctc(np.zeros((0,3)),['','A',' ']),('',0))
        with self.assertRaises(ValueError):
            ocr.decode_ctc(np.zeros((2,4)),['','A',' '])
        with self.assertRaises(ValueError):
            ocr.decode_ctc(np.full((2,3),np.nan),['','A',' '])


class Detection(unittest.TestCase):
    def test_probability_thresholds_and_image_coordinates(self):
        probability = np.zeros((40,100),np.float32)
        self.assertEqual(ocr.detection_boxes(probability,(80,200,3)),[])
        probability[10:20,10:70] = .9
        boxes = ocr.detection_boxes(probability,(80,200,3))
        self.assertEqual(len(boxes),1)
        box,score = boxes[0]
        self.assertGreater(score,.8)
        self.assertTrue((box>=0).all())
        self.assertTrue((box[:,0]<200).all() and (box[:,1]<80).all())
        probability *= .4
        self.assertEqual(ocr.detection_boxes(probability,(80,200,3)),[])

    def test_bad_detection_is_not_silently_reported_as_no_text(self):
        with self.assertRaises(ValueError):
            ocr.detection_boxes(np.full((40,100),np.nan),(80,200,3))

    def test_perspective_crop_and_degenerate_box(self):
        image = np.zeros((60,100,3),np.uint8)
        crop = ocr.crop_line(image,[[20,10],[80,15],[75,30],[15,25]])
        self.assertEqual(crop.shape[2],3)
        self.assertGreater(crop.shape[1],crop.shape[0])
        self.assertIsNone(ocr.crop_line(image,[[20,10]]*4))


class Sessions(unittest.TestCase):
    def test_worker_thread_limit_parks_idle_onnx_pools(self):
        entries=[];settings=[]
        options=types.SimpleNamespace(add_session_config_entry=lambda k,v:entries.append((k,v)))
        def session(path,*,sess_options,providers):
            settings.append(sess_options.intra_op_num_threads)
            return types.SimpleNamespace(get_modelmeta=lambda:types.SimpleNamespace(custom_metadata_map={'character':'A'}))
        fake=types.SimpleNamespace(SessionOptions=lambda:options,InferenceSession=session)
        with patch.dict('sys.modules',{'onnxruntime':fake}),patch.dict('os.environ',{'REEL_ANALYSIS_THREADS':'3'}),patch('os.cpu_count',return_value=8):
            ocr.LocalOCR({'det':'det','rec':'rec'})
        self.assertEqual(settings,[3,3])
        self.assertEqual(entries,[('session.intra_op.allow_spinning','0'),('session.inter_op.allow_spinning','0')])

    def test_exact_crop_bytes_are_reused_but_any_difference_runs_recognition(self):
        calls=[]
        reader=ocr.LocalOCR.__new__(ocr.LocalOCR)
        reader.characters=['','A'];reader.rec_cache=OrderedDict()
        reader.rec=types.SimpleNamespace(get_inputs=lambda:[types.SimpleNamespace(name='pixels')],
            run=lambda *_:(calls.append(1) or [np.array([[[0.,1.]]],np.float32)]))
        image=np.full((30,90,3),40,np.uint8)
        self.assertEqual(reader.recognise(image),('A',1.))
        self.assertEqual(reader.recognise(image.copy()),('A',1.));self.assertEqual(len(calls),1)
        image[0,0,0]+=1;reader.recognise(image);self.assertEqual(len(calls),2)
        for i in range(520):
            crop=image.copy();crop[0,1]=[i%256,i//256,0];reader.recognise(crop)
        self.assertLessEqual(len(reader.rec_cache),512)

    def test_full_read_cache_is_exact_and_cannot_be_mutated_by_a_caller(self):
        calls=[]
        reader=ocr.LocalOCR.__new__(ocr.LocalOCR);reader.read_cache=OrderedDict()
        reader.det=types.SimpleNamespace(get_inputs=lambda:[types.SimpleNamespace(name='pixels')],
            run=lambda *_:(calls.append(1) or [np.zeros((1,1,32,32),np.float32)]))
        image=np.zeros((32,32,3),np.uint8)
        result=reader.read(image);result.append('caller mutation')
        self.assertEqual(reader.read(image.copy()),[])
        self.assertEqual(len(calls),1)
        image[0,0,0]=1;reader.read(image);self.assertEqual(len(calls),2)
        for i in range(130):
            changed=image.copy();changed[0,1]=[i,0,0];reader.read(changed)
        self.assertLessEqual(len(reader.read_cache),128)

    def test_sessions_are_cpu_only_and_dictionary_is_embedded(self):
        calls=[]
        def session(path,*,sess_options,providers):
            calls.append((path,providers))
            return types.SimpleNamespace(get_modelmeta=lambda:types.SimpleNamespace(custom_metadata_map={'character':'A\nB'}))
        fake = types.SimpleNamespace(SessionOptions=lambda:types.SimpleNamespace(),InferenceSession=session)
        with patch.dict('sys.modules',{'onnxruntime':fake}):
            reader=ocr.LocalOCR({'det':'named-det.onnx','rec':'named-rec.onnx','keys':None})
        self.assertEqual(calls,[('named-det.onnx',['CPUExecutionProvider']),('named-rec.onnx',['CPUExecutionProvider'])])
        self.assertEqual(reader.characters,['','A','B',' '])


if __name__ == '__main__':
    unittest.main()
