import json
import unittest
from unittest.mock import patch
import numpy as np
from breakdown import sound, text, ocr_backend, shots, camera

class EdgeCases(unittest.TestCase):
    def test_short_empty_and_silent_audio_serialize(self):
        for count in (0, 1, 160, 16000):
            result = sound.analyse_signal(np.zeros(count, dtype=np.float32))
            json.dumps(result, allow_nan=False)
            self.assertEqual(result['sfx'], [])
            self.assertIsNone(result['tempo'])
        self.assertFalse(sound.analyse_signal(np.zeros(16000, dtype=np.float32))['bed']['present'])

    def test_non_finite_audio_is_rejected(self):
        with self.assertRaises(ValueError):
            sound.analyse_signal(np.array([np.nan], dtype=np.float32))

    def test_sound_result_is_standard_json_and_falling_tails_are_not_hits(self):
        rate = 16000
        times = np.arange(rate * 6) / rate
        signal = .05 * np.sin(2 * np.pi * 220 * times)
        for t in np.arange(0, 6, .5):
            tau = times - t
            signal += np.where((tau >= 0) & (tau < .3), .5 * np.sin(2*np.pi*55*tau) * np.exp(-25 * np.maximum(tau, 0)), 0)
        tau = times - 3.25
        signal += np.where((tau >= 0) & (tau < .5), .35 * np.sin(2*np.pi*2500*tau) * np.exp(-6 * np.maximum(tau, 0)), 0)
        result = sound.analyse_signal(signal.astype(np.float32))
        json.dumps(result, allow_nan=False)
        self.assertTrue(any(abs(x['t']-3.25)<.15 for x in result['sfx']))
        self.assertFalse(any(3.65 < x['t'] < 3.9 for x in result['sfx']), result['sfx'])

    def test_empty_text_and_tracks(self):
        self.assertEqual(text.group_blocks([]), [])
        self.assertEqual(text.track([(0, []), (.5, [])], .5), [])
        self.assertEqual(text.text_style(np.zeros((10,10,3),np.uint8), [20,20,30,30])['fill'], None)

    def test_missing_ocr_models_fail_before_import_or_download(self):
        with self.assertRaisesRegex(ValueError, 'local OCR model'):
            ocr_backend.engine({'det':'missing-det.onnx', 'rec':'missing-rec.onnx'})

    def test_displaced_block_and_title_pop_are_distinct(self):
        before = np.full((160,90),70,np.uint8)
        after = before.copy()
        before[60:85,10:30] = 240
        after[60:85,50:70] = 240
        self.assertTrue(shots.displaced_block(before,after))
        self.assertFalse(shots.displaced_block(np.full_like(after,70),after))

    def test_tiny_zoom_is_not_a_punch(self):
        import math
        self.assertEqual(camera.punch_events([{'logScale':math.log(1.15)}], [.1]), [])


class TextSampling(unittest.TestCase):
    def test_midpoint_between_refinement_samples_is_not_lost(self):
        def frames(_path, every=1, **_options):
            for index in range(60):
                if index % every:
                    continue
                frame = np.full((160, 100, 3), 30, np.uint8)
                if 30 <= index < 50:
                    frame[70:85, 20:80] = 255
                yield index, index / 30, frame
        def read(frame, _models, _visual):
            if frame.max() < 100:
                return []
            return [([[20,70],[80,70],[80,85],[20,85]], 'Known words', .99)]
        info = {'fps':30, 'frames':60, 'width':100, 'height':160}
        with patch.object(text, 'video_info', return_value=info), patch.object(text, 'iter_frames', side_effect=frames), patch.object(text, 'read_lines', side_effect=read):
            result = text.analyse({'proxy':'named.mp4', 'models':{}})
        self.assertEqual(len(result['text']), 1, result)
        cue = result['text'][0]
        self.assertAlmostEqual(cue['start'], 1, delta=.1)
        self.assertAlmostEqual(cue['end'], 50 / 30, delta=.15)


class ArtifactSafety(unittest.TestCase):
    def test_license_evidence_cannot_escape_scratch(self):
        import pathlib
        from breakdown.audit_wheels import evidence_target
        root = pathlib.Path(__file__).resolve().parents[4] / 'state/tmp/audit-safety'
        for entry in ('../LICENSE', '/LICENSE', 'C:/LICENSE', 'dir\\LICENSE'):
            with self.assertRaises(ValueError):
                evidence_target(root, 'package', entry)
        self.assertEqual(evidence_target(root, 'package', 'dist-info/LICENSE'), (root / 'package/dist-info/LICENSE').resolve())

    def test_ocr_engine_reuses_only_unchanged_local_models(self):
        import pathlib
        import tempfile
        root = pathlib.Path(__file__).resolve().parents[4] / 'state/tmp'
        with tempfile.TemporaryDirectory(dir=root) as directory:
            det, rec = pathlib.Path(directory)/'det.onnx', pathlib.Path(directory)/'rec.onnx'
            det.write_bytes(b'local'); rec.write_bytes(b'local')
            models = {'det':str(det),'rec':str(rec),'keys':None}
            with patch.object(ocr_backend,'LocalOCR',side_effect=lambda models: object()) as factory, patch.object(ocr_backend,'_ENGINE',None), patch.object(ocr_backend,'_MODEL_KEY',None):
                first = ocr_backend.engine(models)
                self.assertIs(first,ocr_backend.engine(models))
                det.write_bytes(b'changed model bytes')
                self.assertIsNot(first,ocr_backend.engine(models))
                self.assertEqual(factory.call_count,2)


if __name__ == '__main__':
    unittest.main()
