"""Local Paddle-format ONNX OCR. No package/model acquisition or third-party code."""
import os
import unicodedata
import hashlib
from collections import OrderedDict
import copy

import cv2
import numpy as np

_ENGINE = None
_MODEL_KEY = None
_LTR = set('.,:%-+/')
OCR_CACHE_LIMITS={'full_frames':128,'line_crops':512}  # Bound result metadata independently of reel length.


def has_arabic(text):
    return any(0x0600 <= ord(c) <= 0x06FF or 0xFB50 <= ord(c) <= 0xFEFF for c in text)


def to_logical(text, visual_order):
    text = unicodedata.normalize('NFKC', text)
    if not visual_order or not has_arabic(text):
        return text
    out, run = [], []
    for ch in text[::-1]:
        if ch.isascii() and (ch.isalnum() or ch in _LTR):
            run.append(ch)
        else:
            if run:
                out.append(''.join(reversed(run)))
                run = []
            out.append(ch)
    if run:
        out.append(''.join(reversed(run)))
    return ''.join(out).strip()


def ordered_quad(points):
    points = np.asarray(points, np.float32).reshape(4, 2)
    center = points.mean(axis=0)
    points = points[np.argsort(np.arctan2(points[:, 1]-center[1], points[:, 0]-center[0]))]
    return np.roll(points, -int(np.argmin(points.sum(axis=1))), axis=0)


def crop_line(image, points):
    quad = ordered_quad(points)
    width = int(round(max(np.linalg.norm(quad[1]-quad[0]), np.linalg.norm(quad[2]-quad[3]))))
    height = int(round(max(np.linalg.norm(quad[3]-quad[0]), np.linalg.norm(quad[2]-quad[1]))))
    if min(width, height) < 2:
        return None
    target = np.float32([[0, 0], [width-1, 0], [width-1, height-1], [0, height-1]])
    result = cv2.warpPerspective(image, cv2.getPerspectiveTransform(quad, target), (width, height), borderMode=cv2.BORDER_REPLICATE)
    return cv2.rotate(result, cv2.ROTATE_90_CLOCKWISE) if height > width * 1.5 else result


def detection_boxes(probability, image_shape, threshold=.3, minimum_score=.5):
    probability = np.asarray(probability, np.float32).squeeze()
    if probability.ndim != 2 or not np.isfinite(probability).all():
        raise ValueError('Invalid OCR detection probability map')
    height, width = probability.shape
    bitmap = (probability >= threshold).astype(np.uint8)
    contours, _ = cv2.findContours(bitmap, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    output = []
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:1000]:
        if cv2.contourArea(contour) < 6:
            continue
        center, size, angle = cv2.minAreaRect(contour)
        if min(size) < 3:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        mask = np.zeros((h, w), np.uint8)
        cv2.fillPoly(mask, [contour - np.array([[[x, y]]])], 1)
        score = float(cv2.mean(probability[y:y+h, x:x+w], mask)[0])
        if score < minimum_score:
            continue
        # Expand the minimum-area rectangle by the area/perimeter offset.
        # This includes glyph ascenders/descenders without polygon dependencies.
        distance = size[0] * size[1] * 1.6 / (2 * (size[0] + size[1]))
        quad = ordered_quad(cv2.boxPoints((center, (size[0]+2*distance, size[1]+2*distance), angle)))
        quad[:, 0] = np.clip(quad[:, 0] * image_shape[1] / width, 0, image_shape[1]-1)
        quad[:, 1] = np.clip(quad[:, 1] * image_shape[0] / height, 0, image_shape[0]-1)
        output.append((quad, score))
    # Suppress a word fragment contained in a detected full line.
    kept = []
    for quad, score in sorted(output, key=lambda e: -cv2.contourArea(e[0])):
        area = max(1.0, cv2.contourArea(quad))
        if any(cv2.intersectConvexConvex(quad, q)[0] / area > .85 for q, _ in kept):
            continue
        kept.append((quad, score))
    return sorted(kept, key=lambda entry: (float(entry[0][:, 1].mean()), -float(entry[0][:, 0].mean())))


def decode_ctc(probabilities, characters):
    probabilities = np.asarray(probabilities)
    if probabilities.ndim != 2 or probabilities.shape[1] != len(characters) or not np.isfinite(probabilities).all():
        raise ValueError('OCR recognition output does not match its pinned character list')
    previous, text, scores = -1, [], []
    for frame, token in enumerate(probabilities.argmax(axis=1)):
        if token != 0 and token != previous:
            text.append(characters[int(token)])
            scores.append(float(probabilities[frame, token]))
        previous = token
    return ''.join(text), float(np.mean(scores)) if scores else 0.0


class LocalOCR:
    def __init__(self, models):
        import onnxruntime as ort
        options = ort.SessionOptions()
        options.intra_op_num_threads = min(os.cpu_count() or 1, int(os.environ.get('REEL_ANALYSIS_THREADS','6')))
        options.inter_op_num_threads = 1
        if os.environ.get('REEL_ANALYSIS_THREADS'):
            # Detection and recognition own separate pools. Park an idle pool
            # instead of burning the cores reserved for the concurrent ASR.
            options.add_session_config_entry('session.intra_op.allow_spinning','0')
            options.add_session_config_entry('session.inter_op.allow_spinning','0')
        self.det = ort.InferenceSession(models['det'], sess_options=options, providers=['CPUExecutionProvider'])
        self.rec = ort.InferenceSession(models['rec'], sess_options=options, providers=['CPUExecutionProvider'])
        # The approved Arabic model embeds the immutable dictionary in its ONNX.
        character = self.rec.get_modelmeta().custom_metadata_map.get('character')
        if character is None:
            if not models.get('keys'):
                raise ValueError('Local OCR character dictionary is required; no download is attempted')
            with open(models['keys'], encoding='utf8') as handle:
                character = handle.read()
        self.characters = [''] + character.splitlines() + [' ']
        self.read_cache=OrderedDict();self.rec_cache=OrderedDict()

    def recognise(self, image):
        key=(image.shape,image.dtype.str,hashlib.sha256(image.tobytes()).digest())
        if key in self.rec_cache:
            result=self.rec_cache.pop(key);self.rec_cache[key]=result;return result
        width = min(2048, max(2, int(np.ceil(image.shape[1] * 48 / image.shape[0]))))
        padded_width = max(320, int(np.ceil(width / 32)) * 32)
        pixels = cv2.resize(image, (width, 48)).astype(np.float32).transpose(2, 0, 1) / 127.5 - 1
        tensor = np.zeros((1, 3, 48, padded_width), np.float32)
        tensor[0, :, :, :width] = pixels
        output = self.rec.run(None, {self.rec.get_inputs()[0].name: tensor})[0]
        result=decode_ctc(output[0], self.characters)
        self.rec_cache[key]=result
        if len(self.rec_cache)>OCR_CACHE_LIMITS['line_crops']:self.rec_cache.popitem(last=False)
        return result

    def read(self, image):
        if image is None or image.dtype != np.uint8 or image.ndim not in (2, 3):
            raise ValueError('OCR requires a uint8 image')
        if image.size == 0 or min(image.shape[:2]) < 2:
            return []
        if image.ndim == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        if image.shape[2] != 3:
            raise ValueError('OCR requires BGR or grayscale input')
        key=(image.shape,image.dtype.str,hashlib.sha256(image.tobytes()).digest())
        if key in self.read_cache:
            result=self.read_cache.pop(key);self.read_cache[key]=result;return copy.deepcopy(result)
        height, width = image.shape[:2]
        scale = min(1.0, 960 / max(height, width))
        size = (max(32, int(round(width*scale/32))*32), max(32, int(round(height*scale/32))*32))
        tensor = (cv2.resize(image, size).astype(np.float32) / 127.5 - 1).transpose(2, 0, 1)[None]
        probability = self.det.run(None, {self.det.get_inputs()[0].name: tensor})[0]
        result = []
        for quad, detection_score in detection_boxes(probability, image.shape):
            line = crop_line(image, quad)
            if line is None:
                continue
            text, confidence = self.recognise(line)
            if text.strip():
                result.append((quad.tolist(), text, min(detection_score, confidence)))
        self.read_cache[key]=copy.deepcopy(result)
        if len(self.read_cache)>OCR_CACHE_LIMITS['full_frames']:self.read_cache.popitem(last=False)
        return result


def engine(models):
    global _ENGINE, _MODEL_KEY
    for key in ('det', 'rec'):
        if not models.get(key) or not os.path.isfile(models[key]):
            raise ValueError(f'verified local OCR model is required: {key}; analysis never downloads')
    if models.get('keys') and not os.path.isfile(models['keys']):
        raise ValueError('Local OCR character list is missing')
    key = (os.environ.get('REEL_ANALYSIS_THREADS','6'),tuple((os.path.realpath(models[name]), os.stat(models[name]).st_size, os.stat(models[name]).st_mtime_ns)
                for name in ('det', 'rec', 'keys') if models.get(name)))
    if _ENGINE is None or key != _MODEL_KEY:
        _ENGINE = LocalOCR(models)
        _MODEL_KEY = key
    return _ENGINE


def read_lines(image, models, visual_order):
    return [(box, to_logical(text, visual_order), score) for box, text, score in engine(models).read(image)]
