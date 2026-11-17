# scripts/python/breakdown/frames.py
import cv2
import math
import os
from contextlib import contextmanager

_INTERVALS=None


@contextmanager
def only_intervals(intervals):
    global _INTERVALS
    previous=_INTERVALS;_INTERVALS=intervals
    try:yield
    finally:_INTERVALS=previous


def _capture(path):
    threads=os.environ.get('REEL_ANALYSIS_THREADS')
    if threads:return cv2.VideoCapture(path,cv2.CAP_FFMPEG,[cv2.CAP_PROP_N_THREADS,max(1,int(threads))])
    return cv2.VideoCapture(path)


def video_info(path):
    cap = _capture(path)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {path}")
    info = {"fps": float(cap.get(cv2.CAP_PROP_FPS)), "frames": int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0),
            "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}
    cap.release()
    if not math.isfinite(info["fps"]) or info["fps"] <= 0 or info["width"] <= 0 or info["height"] <= 0 or info["frames"] <= 0:
        raise ValueError("invalid video cadence, frame count or dimensions")
    return info


def resize_width(frame, width):
    if width is None or frame.shape[1] == width:
        return frame
    height = max(2, int(round(frame.shape[0] * width / frame.shape[1])))
    return cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)


def iter_frames(path, width=None, every=1, start=0.0, end=None, gray=False):
    """Decode sequentially from the first frame so times are exact (the proxy is all-intra and small)."""
    cap = _capture(path)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not math.isfinite(fps) or fps <= 0 or every < 1:
        cap.release()
        raise ValueError("valid CFR video and positive sampling step required")
    index = 0
    try:
        while True:
            ok = cap.grab()
            if not ok:
                break
            t = index / fps
            if end is not None and t > end + 1e-6:
                break
            if t + 1e-6 >= start and index % every == 0 and (_INTERVALS is None or any(a<=t<=b for a,b in _INTERVALS)):
                ok,frame=cap.retrieve()
                if not ok:raise RuntimeError('cannot retrieve selected video frame')
                out = resize_width(frame, width)
                if gray:
                    out = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
                yield index, t, out
            index += 1
    finally:
        cap.release()
