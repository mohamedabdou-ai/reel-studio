# scripts/python/breakdown/overlays.py
import cv2
import numpy as np

from .frames import iter_frames, video_info


def static_regions(stack, still=1.5, moving=6.0, cell=8):
    t, h, w = stack.shape
    gh, gw = h // cell, w // cell
    if t < 4 or not gh or not gw:
        return []
    values = stack.astype(np.float32)
    # A short transition at the shot edge does not establish a moving background.
    moving_steps = np.percentile(np.abs(np.diff(values, axis=0)), 70, axis=(1, 2)) >= moving
    if float(moving_steps.mean()) < .5:
        return []
    # Cell means can stay constant while detailed pixels move (especially zooms).
    pixel_std = values.std(axis=0)
    std = np.percentile(pixel_std[:gh*cell,:gw*cell].reshape(gh,cell,gw,cell),75,axis=(1,3))
    if float(np.median(pixel_std)) < moving:
        return []
    count, _, stats, _ = cv2.connectedComponentsWithStats((std < still).astype(np.uint8), connectivity=4)
    boxes = []
    for k in range(1, count):
        x, y, bw, bh, area = (int(v) for v in stats[k])
        share = area / float(gh * gw)
        edges = (x == 0) + (y == 0) + (x + bw == gw) + (y + bh == gh)
        if 0.01 <= share <= 0.35 and edges < 3:
            boxes.append([x * cell, y * cell, bw * cell, bh * cell, round(share, 4)])
    return boxes


def kind_for(box, w, h):
    x, y, bw, bh, share = box
    corner = (x < 0.2 * w or x + bw > 0.8 * w) and (y < 0.2 * h or y + bh > 0.8 * h)
    if share >= 0.12:
        return "pip"
    if share <= 0.03 and corner:
        return "logo"
    return "sticker"


def analyse(request):
    path = request["proxy"]
    shots = [s for s in request["shots"] if s["end"] - s["start"] >= 1.0]
    every = max(1, int(round(video_info(path)["fps"] / 5)))
    buckets = {s["id"]: [] for s in shots}
    for _, t, frame in iter_frames(path, width=160, every=every, gray=True):
        shot = next((s for s in shots if s["start"] + 0.1 <= t < s["end"] - 0.1), None)
        if shot:
            buckets[shot["id"]].append(frame)
    items = []
    for s in shots:
        if len(buckets[s["id"]]) < 4:
            continue
        stack = np.stack(buckets[s["id"]])
        h, w = stack.shape[1:]
        for box in static_regions(stack):
            items.append({"shotId": s["id"], "start": s["start"], "end": s["end"], "kind": kind_for(box, w, h),
                          "box": [round(box[0] / w, 3), round(box[1] / h, 3), round(box[2] / w, 3), round(box[3] / h, 3)], "score": 0.5})
    for panel in request.get('panels', []):
        items.append({'start':panel['start'],'end':panel['end'],'box':panel['box'],'kind':'pip','score':panel['score'],
                      'evidence':'rectangular motion within a stationary surround; frame-in-frame interpretation needs confirmation'})
    return {"overlays": items}
