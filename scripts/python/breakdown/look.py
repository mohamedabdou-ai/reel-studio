# scripts/python/breakdown/look.py
import cv2
import numpy as np

from .frames import iter_frames, video_info


def metrics(frames):
    sats, contrast, blacks, whites, shadows, highs, warmth, levels = [], [], [], [], [], [], [], []
    for f in frames:
        hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32)
        L, a, b = lab[..., 0] * 100 / 255, lab[..., 1] - 128, lab[..., 2] - 128
        chroma = np.hypot(a, b)
        sats.append(float(hsv[..., 1].mean() / 255))
        contrast.append(float(L.std()))
        blacks.append(float(np.percentile(L, 2)))
        whites.append(float(np.percentile(L, 98)))
        levels.append(float(L.mean()))
        dark, light = (L < 30) & (chroma < 20), (L > 70) & (chroma < 20)
        if dark.any():
            shadows.append(float(b[dark].mean()))
        if light.any():
            highs.append(float(b[light].mean()))
        warmth.append(float(b.mean()))

    def avg(values):
        return round(float(np.mean(values)), 3) if values else None

    return {"saturation": avg(sats), "contrast": avg(contrast), "blackLevel": avg(blacks), "whiteLevel": avg(whites),
            "shadowTint": avg(shadows), "highlightTint": avg(highs), "warmth": avg(warmth), "meanLevel": avg(levels)}


def label(m):
    sat = m["saturation"] or 0.0
    if sat < 0.06:
        return "bw"
    if (m["shadowTint"] or 0) < -4 and (m["highlightTint"] or 0) > 4:
        return "teal-orange"
    if sat >= 0.45:
        return "vivid"
    if sat < 0.18:
        return "muted"
    if (m["warmth"] or 0) > 8:
        return "warm"
    if (m["warmth"] or 0) < -6:
        return "cool"
    return "natural"


def analyse(request):
    path = request["proxy"]
    every = max(1, int(round(video_info(path)["fps"])))
    m = metrics([f for _, _, f in iter_frames(path, width=320, every=every)])
    return {"look": {"label": label(m), "metrics": m, "score": 0.6}}
