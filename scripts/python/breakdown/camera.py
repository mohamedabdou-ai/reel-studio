# scripts/python/breakdown/camera.py
import math

import cv2
import numpy as np

from .frames import iter_frames, video_info

WIDTH = 320


def pair_motion(prev, cur):
    pts = cv2.goodFeaturesToTrack(prev, maxCorners=200, qualityLevel=0.01, minDistance=8)
    if pts is None or len(pts) < 12:
        return None
    nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, cur, pts, None)
    if nxt is None or st is None:
        return None
    back, st2, _ = cv2.calcOpticalFlowPyrLK(cur, prev, nxt, None)
    if back is None or st2 is None:
        return None
    fb = np.linalg.norm(pts - back, axis=2).reshape(-1)
    good = (st.reshape(-1) == 1) & (st2.reshape(-1) == 1) & (fb < 1.0)
    if good.sum() < 12:
        return None
    p0, p1 = pts.reshape(-1, 2)[good], nxt.reshape(-1, 2)[good]
    M, inliers = cv2.estimateAffinePartial2D(p0, p1, method=cv2.RANSAC, ransacReprojThreshold=1.0)
    if M is None or inliers is None or inliers.mean() < 0.4:
        return None
    h, w = prev.shape
    centre = M @ np.array([w / 2.0, h / 2.0, 1.0])
    return {"logScale": math.log(max(float(math.hypot(M[0, 0], M[1, 0])), 1e-6)),
            "dx": float(centre[0] - w / 2.0) / w, "dy": float(centre[1] - h / 2.0) / w,
            "rotation": float(math.atan2(M[1, 0], M[0, 0])), "inliers": float(inliers.mean()),
            "flow": float(np.median(np.linalg.norm(p1 - p0, axis=1))) / w}


def _consistent(values, total):
    moving = values[np.abs(values) > 1e-4]
    return len(moving) > 0 and float(np.mean(np.sign(moving) == np.sign(total))) >= 0.8


def classify(samples, step_sec):
    usable = [s for s in samples if s]
    if len(usable) < 3:
        return {"label": "unknown", "score": 0.3, "zoomPerSec": None, "panXPerSec": None, "panYPerSec": None, "inlierRatio": None}
    duration = len(samples) * step_sec
    log_s = np.array([s["logScale"] for s in usable])
    dx = np.array([s["dx"] for s in usable])
    dy = np.array([s["dy"] for s in usable])
    flow = float(np.median([s["flow"] for s in usable]))
    inl = float(np.mean([s["inliers"] for s in usable]))
    zoom, pan_x, pan_y = float(log_s.sum() / duration), float(dx.sum() / duration), float(dy.sum() / duration)
    out = {"zoomPerSec": round(zoom, 4), "panXPerSec": round(pan_x, 4), "panYPerSec": round(pan_y, 4), "inlierRatio": round(inl, 3)}
    if flow < 0.0005 and abs(zoom) < 0.01 and abs(pan_x) < 0.01 and abs(pan_y) < 0.01:
        return {**out, "label": "static", "score": 0.85}
    if abs(zoom) >= 0.015 and _consistent(log_s, zoom):
        return {**out, "label": "zoom-in" if zoom > 0 else "zoom-out", "kenBurns": inl > 0.7, "score": 0.8}
    for rate, values, negative, positive in ((pan_x, dx, "pan-right", "pan-left"), (pan_y, dy, "tilt-down", "tilt-up")):
        if abs(rate) >= 0.02 and _consistent(values, rate):
            return {**out, "label": negative if rate < 0 else positive, "score": 0.75}
    flips = float(np.mean(np.sign(dx[1:]) != np.sign(dx[:-1]))) if len(dx) > 2 else 0.0
    spread = float(np.std(np.abs(dx)) / (np.mean(np.abs(dx)) + 1e-9))
    if flips >= 0.45 and spread >= 0.8:
        return {**out, "label": "handheld", "score": 0.6}
    return {**out, "label": "moving", "score": 0.45}


def punch_events(samples, times, threshold=math.log(1.2)):
    return [{"t": round(t, 3), "kind": "punch-in" if s["logScale"] > 0 else "punch-out", "scale": round(math.exp(s["logScale"]), 3)}
            for s, t in zip(samples, times) if s and abs(s["logScale"]) >= threshold]


def analyse(request):
    path, shots = request["proxy"], request["shots"]
    fps = video_info(path)["fps"]
    every = max(1, int(round(fps / 10)))
    per = {s["id"]: {"samples": [], "times": []} for s in shots}

    def shot_of(t):
        return next((s for s in shots if s["start"] <= t < s["end"]), None)

    prev = prev_t = None
    for _, t, frame in iter_frames(path, width=WIDTH, every=every, gray=True):
        if prev is not None:
            a, b = shot_of(prev_t), shot_of(t)
            if a and b and a["id"] == b["id"]:
                per[a["id"]]["samples"].append(pair_motion(prev, frame))
                per[a["id"]]["times"].append(round(t, 3))
        prev, prev_t = frame, t
    return {"camera": [{"shotId": s["id"], **classify(per[s["id"]]["samples"], every / fps),
                        "events": punch_events(per[s["id"]]["samples"], per[s["id"]]["times"])} for s in shots]}
