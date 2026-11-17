# scripts/python/breakdown/yamnet_backend.py
import csv

import numpy as np

_SESSION = None
_NAMES = None
TYPE_MAP = {"Whoosh, swoosh, swish": "whoosh", "Thump, thud": "impact", "Bang": "impact", "Smash, crash": "impact",
            "Ding": "ding", "Chime": "ding", "Bell": "ding", "Ding-dong": "ding", "Cash register": "ding",
            "Click": "click", "Tick": "click", "Typing": "click", "Computer keyboard": "click",
            "Pop": "pop", "Boing": "pop"}


def _load(model_path, class_map):
    global _SESSION, _NAMES
    if _SESSION is None:
        import onnxruntime as ort
        _SESSION = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        with open(class_map, encoding="utf-8") as handle:
            _NAMES = [row["display_name"] for row in csv.DictReader(handle)]
    return _SESSION, _NAMES


def label(segment, model_path, class_map):
    """segment: mono float32 at 16 kHz. Returns {"label", "type", "score"}."""
    session, names = _load(model_path, class_map)
    feed = {session.get_inputs()[0].name: segment.astype(np.float32)}
    scores = session.run(None, feed)[0]
    mean = scores.mean(axis=0) if scores.ndim == 2 else scores
    best = int(np.argmax(mean))
    return {"label": names[best], "type": TYPE_MAP.get(names[best]), "score": round(float(mean[best]), 3)}


def speech_scores(signal, model_path, class_map):
    """Use the installed model's Speech class, without deriving voice from ASR."""
    session, names = _load(model_path, class_map)
    index = names.index("Speech")
    window, hop, out = int(.975 * 16000), int(.48 * 16000), []
    for start in range(0, len(signal), hop):
        clip = signal[start:start + window]
        if len(clip) < window:
            clip = np.pad(clip, (0, window - len(clip)))
        scores = session.run(None, {session.get_inputs()[0].name: clip.astype(np.float32)})[0]
        mean = scores.mean(axis=0) if scores.ndim == 2 else scores
        out.append({"start": round(start / 16000, 3), "end": round(min(len(signal), start + window) / 16000, 3), "score": round(float(mean[index]), 3)})
    return out
