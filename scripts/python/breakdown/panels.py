"""Conservative moving rectangular region inside a stationary composition.

Only temporal pixel evidence is measured. A framed-video interpretation still
needs review; a moving subject or a screen can produce similar evidence.
"""
import cv2
import numpy as np


def moving_panel(grays, fps):
    if len(grays) < max(12, fps * 2):
        return None
    step = max(1, round(fps / 5))
    # Sample bounded windows; a later full-screen ending must not erase a panel.
    candidates = []
    for start in range(0, len(grays) - int(fps), max(1, int(fps))):
        stack = np.stack(grays[start:min(len(grays), start + int(2 * fps)):step]).astype(np.float32)
        if len(stack) < 5:
            continue
        activity = np.percentile(np.abs(np.diff(stack, axis=0)), 75, axis=0)
        mask = (activity > 7).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        count, _, stats, _ = cv2.connectedComponentsWithStats(mask)
        h, w = mask.shape
        for x, y, bw, bh, area in stats[1:count]:
            share = bw * bh / (h * w)
            if not (.08 <= share <= .6 and bw >= .18*w and bh >= .18*h and area / (bw*bh) >= .55):
                continue
            outside = mask.copy()
            outside[y:y+bh,x:x+bw] = 0
            if outside.sum() / max(1, h*w-bw*bh) > .08:
                continue
            candidates.append([int(x),int(y),int(x+bw),int(y+bh)])
    if not candidates:
        return None
    def overlap(a,b):
        inter = max(0,min(a[2],b[2])-max(a[0],b[0])) * max(0,min(a[3],b[3])-max(a[1],b[1]))
        union = (a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-inter
        return inter / max(1,union)
    group = max(([b for b in candidates if overlap(a,b) >= .65] for a in candidates), key=len)
    # Multiple independent windows are required; one title pop is insufficient.
    if len(group) < 3:
        return None
    box = np.median(group,axis=0).astype(int).tolist()
    return box
