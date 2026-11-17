# scripts/python/breakdown/text.py
import difflib
import math
import unicodedata

import cv2
import numpy as np

from .frames import iter_frames, video_info, only_intervals
from .ocr_backend import read_lines


def box_rect(points):
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def iou(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def group_blocks(lines, regions=None):
    if regions:
        groups = {}
        for line in lines:
            rect = line[0]
            cx,cy = (rect[0]+rect[2])/2,(rect[1]+rect[3])/2
            region = next((i for i,r in enumerate(regions) if r[0]<=cx<=r[2] and r[1]<=cy<=r[3]), -1)
            groups.setdefault(region,[]).append(line)
        return [b for group in groups.values() for b in group_blocks(group)]
    # OCR may split a line at a number, a colour change or a wide word gap.
    rows = []
    for rect, words, score in sorted(lines, key=lambda line: (line[0][1], line[0][0])):
        height = rect[3] - rect[1]
        for row in rows:
            r = row['rect']
            overlap = min(r[3], rect[3]) - max(r[1], rect[1])
            distance = max(0, rect[0] - r[2], r[0] - rect[2])
            if overlap >= .55 * min(height, r[3] - r[1]) and distance <= .75 * max(height, r[3] - r[1]):
                row['parts'].append((rect[0], words, score))
                row['rect'] = _union([r, rect])
                break
        else:
            rows.append({'rect': list(rect), 'parts': [(rect[0], words, score)]})
    def row_text(parts):
        letters = ''.join(p[1] for p in parts)
        rtl = sum(unicodedata.bidirectional(c) in ('R','AL') for c in letters)
        ltr = sum(unicodedata.bidirectional(c) == 'L' for c in letters)
        return ' '.join(p[1] for p in sorted(parts,reverse=rtl>ltr))
    lines = [(r['rect'], row_text(r['parts']), float(np.mean([p[2] for p in r['parts']]))) for r in rows]
    blocks = []
    for rect, words, score in sorted(lines, key=lambda line: line[0][1]):
        height = rect[3] - rect[1]
        for blk in blocks:
            r = blk["rect"]
            overlap = min(r[2], rect[2]) - max(r[0], rect[0])
            if overlap > .35 * min(r[2] - r[0], rect[2] - rect[0]) and 0 <= rect[1] - r[3] < 1.1 * max(height, blk['heights'][-1]):
                blk["rect"] = [min(r[0], rect[0]), r[1], max(r[2], rect[2]), rect[3]]
                blk["lines"].append(words)
                blk["scores"].append(score)
                blk['boxes'].append(rect)
                blk['heights'].append(height)
                break
        else:
            blocks.append({"rect": list(rect), "lines": [words], "scores": [score], 'boxes': [rect], 'heights': [height]})
    return [{"rect": b["rect"], "text": "\n".join(b["lines"]), "score": float(np.mean(b["scores"])), 'lineBoxes': b['boxes']} for b in blocks]


def similar(a, b):
    return difflib.SequenceMatcher(None, ''.join(a.casefold().split()), ''.join(b.casefold().split()), autojunk=False).ratio()


def same_block(a, b):
    r, s = a['rect'], b['rect']
    inter = max(0, min(r[2], s[2]) - max(r[0], s[0])) * max(0, min(r[3], s[3]) - max(r[1], s[1]))
    area = min((r[2]-r[0])*(r[3]-r[1]), (s[2]-s[0])*(s[3]-s[1]))
    left, right = ''.join(a['best'].casefold().split()), ''.join(b['text'].casefold().split())
    partial = min(len(left), len(right)) >= 3 and (left in right or right in left)
    return inter / max(1, area) > .75 and (similar(left, right) >= .55 or partial)


def track(samples, gap):
    cues = []
    for t, blocks in samples:
        active = [c for c in cues if t - c["last"] <= 2 * gap + 1e-6]
        for blk in blocks:
            matches = [c for c in active if same_block(c, blk)]
            match = max(matches, key=lambda c: similar(c['best'], blk['text']), default=None)
            if match:
                match["last"] = t
                match["rects"].append(blk["rect"])
                match['rect'] = _union(match['rects'])
                match['observations'].append((t, blk))
                if blk["score"] * math.log1p(len(blk["text"])) > match["bestScore"] * math.log1p(len(match["best"])):
                    match["best"], match["bestScore"] = blk["text"], blk["score"]
            else:
                cue = {"first": t, "last": t, "rect": blk["rect"], "rects": [blk["rect"]], "best": blk["text"], "bestScore": blk["score"], 'observations': [(t, blk)]}
                cues.append(cue)
                active.append(cue)
    # A complete reading can arrive after its independently tracked fragments.
    for parent in sorted(cues, key=lambda c: -len(c['best'])):
        if parent.get('removed'):
            continue
        for child in cues:
            if child is parent or child.get('removed'):
                continue
            if child['first'] > parent['last'] + gap or parent['first'] > child['last'] + gap:
                continue
            if same_block(parent, {'rect': child['rect'], 'text': child['best']}):
                parent['first'] = min(parent['first'], child['first'])
                parent['last'] = max(parent['last'], child['last'])
                parent['rects'] += child['rects']
                parent['rect'] = _union(parent['rects'])
                parent['observations'] += child['observations']
                child['removed'] = True
    cues = [c for c in cues if not c.get('removed')]
    return cues


def ncc(a, b):
    a = a.astype(np.float32) - a.mean()
    b = b.astype(np.float32) - b.mean()
    d = math.sqrt(float((a * a).sum()) * float((b * b).sum()))
    return float((a * b).sum() / d) if d > 0 else 0.0


def presence_features(frames, absent, final_mask):
    feats = []
    for f in frames:
        diff = np.abs(f.astype(np.int16) - absent.astype(np.int16))
        contrast = float(diff[final_mask].mean()) if final_mask.any() else 0.0
        ys, xs = np.nonzero(diff > 40)
        if len(xs) < 5:
            feats.append({"contrast": contrast, "w": 0.0, "h": 0.0, "cx": 0.5})
            continue
        h, w = f.shape
        feats.append({"contrast": contrast, "w": (xs.max() - xs.min() + 1) / w, "h": (ys.max() - ys.min() + 1) / h, "cx": float(xs.mean()) / w})
    return feats


def classify_entrance(feats, fps):
    """feats run from the last absent frame to the first fully present frame."""
    final, steps = feats[-1], len(feats) - 1
    if steps <= 1 or final["contrast"] <= 0:
        return "cut"
    visible = [f for f in feats if f["w"] > 0]
    if len(visible) >= 3 and final["w"] > 0 and final["h"] > 0:
        w0, h0 = visible[0]["w"] / final["w"], visible[0]["h"] / final["h"]
        cx = [f["cx"] for f in visible]
        move = cx[-1] - cx[0]
        if abs(move) >= 0.1 and w0 >= 0.85 and all((b - a) * move >= -1e-3 for a, b in zip(cx, cx[1:])):
            return "slide"
        if w0 < 0.6 and h0 > 0.85:
            return "typewriter"
        if w0 < 0.85 and h0 < 0.85 and steps / fps <= 0.35:
            return "pop"
    ratios = [f["contrast"] / final["contrast"] for f in feats]
    if steps >= 3 and ratios[1] < 0.75 and all(b - a >= -0.05 for a, b in zip(ratios, ratios[1:])):
        return "fade"
    return "other"


def _hex(bgr):
    b, g, r = (int(round(float(v))) for v in bgr)
    return f"#{max(0, min(255, r)):02x}{max(0, min(255, g)):02x}{max(0, min(255, b)):02x}"


def _lab(bgr):
    return cv2.cvtColor(np.uint8([[bgr]]), cv2.COLOR_BGR2LAB).reshape(3).astype(float)


def _blend_distance(p, a, b):
    """Lab distance from p to the segment a-b: small when p is only an antialiasing mix of a and b."""
    ab = b - a
    denom = float(ab @ ab)
    t = 0.0 if denom == 0 else min(1.0, max(0.0, float((p - a) @ ab) / denom))
    return float(np.linalg.norm(p - (a + t * ab)))


def text_style(frame, rect, line_height=None):
    H, W = frame.shape[:2]
    x0, y0, x1, y1 = (int(v) for v in rect)
    height = max(1, int(line_height or (y1 - y0)))
    pad = max(4, int(0.15 * height))
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    roi = frame[Y0:Y1, X0:X1]
    if not roi.size:
        return {"fill": None, "stroke": None, "box": None, "highlight": None}
    data = roi.reshape(-1, 3).astype(np.float32)
    k = min(4, len(data))
    _, labels, centers = cv2.kmeans(data, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0), 3, cv2.KMEANS_PP_CENTERS)
    labels = labels.reshape(roi.shape[:2])
    border = np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    bg = int(np.bincount(border, minlength=k).argmax())
    explicit_box = None
    foreground_region = np.ones(labels.shape, bool)
    # A solid rectangle surrounding glyph holes is a text box, unlike an outline.
    for color in range(k):
        if color == bg:
            continue
        count, _, components, _ = cv2.connectedComponentsWithStats((labels == color).astype(np.uint8))
        for component in components[1:count]:
            x, y, box_width, box_height, area = map(int, component)
            if area > .35 * labels.size and area / max(1,box_width*box_height) > .8 and x > 0 and y > 0 and x+box_width < labels.shape[1] and y+box_height < labels.shape[0]:
                bg = color
                explicit_box = _hex(centers[color])
                foreground_region[:] = False
                foreground_region[y:y+box_height,x:x+box_width] = True
                break
        if explicit_box:
            break
    lab = np.array([_lab(c) for c in centers])
    counts = np.bincount(labels[foreground_region], minlength=k).astype(float)
    candidates = [c for c in range(k) if c != bg and counts[c] >= 0.03 * labels.size and np.linalg.norm(lab[c] - lab[bg]) > 25]
    if not candidates:
        return {"fill": None, "stroke": None, "box": None, "highlight": None}
    ordered = sorted(candidates, key=lambda c: -counts[c])
    fill, stroke = ordered[0], None
    outlined = []
    for inner in ordered:
        ring_inner = (cv2.dilate((labels == inner).astype(np.uint8), np.ones((5,5),np.uint8)) > 0) & (labels != inner) & foreground_region
        for outer in ordered:
            coverage = float((ring_inner & (labels == outer)).sum()) / max(1,ring_inner.sum())
            if inner != outer and coverage > .5 and _blend_distance(lab[outer],lab[inner],lab[bg]) > 20:
                outlined.append((coverage,inner,outer))
    if outlined:
        _, fill, stroke = max(outlined)
    known = [bg, fill] + ([stroke] if stroke is not None else [])
    pairs = [(p, q) for i, p in enumerate(known) for q in known[i + 1:]]
    glyph = counts[fill] + (counts[stroke] if stroke is not None else 0.0)
    highlight = next((c for c in ordered if c not in known and counts[c] >= 0.15 * glyph
                      and min(_blend_distance(lab[c], lab[p], lab[q]) for p, q in pairs) > 20), None)
    box = explicit_box
    border_pixels = np.concatenate([roi[0, :], roi[-1, :], roi[:, 0], roi[:, -1]]).reshape(-1, 3)
    border_lab = cv2.cvtColor(border_pixels.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)
    uniform = float(np.median(np.linalg.norm(border_lab - lab[bg], axis=1))) < 8 and float(np.mean(border == bg)) >= 0.75
    if uniform:
        gap = height
        ox0, oy0, ox1, oy1 = max(0, X0 - gap), max(0, Y0 - gap), min(W, X1 + gap), min(H, Y1 + gap)
        band = np.concatenate([frame[oy0:oy0 + 4, ox0:ox1].reshape(-1, 3), frame[max(oy0, oy1 - 4):oy1, ox0:ox1].reshape(-1, 3),
                               frame[oy0:oy1, ox0:ox0 + 4].reshape(-1, 3), frame[oy0:oy1, max(ox0, ox1 - 4):ox1].reshape(-1, 3)])
        if len(band):
            band_lab = cv2.cvtColor(band.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)
            if float(np.mean(np.linalg.norm(band_lab - lab[bg], axis=1) > 20)) >= 0.6:
                box = _hex(centers[bg])
    return {"fill": _hex(centers[fill]), "stroke": _hex(centers[stroke]) if stroke is not None else None,
            "box": box, "highlight": _hex(centers[highlight]) if highlight is not None else None}


def _pad(rect, shape, pad=8):
    h, w = shape[:2]
    return [max(0, int(rect[0]) - pad), max(0, int(rect[1]) - pad), min(w, int(rect[2]) + pad), min(h, int(rect[3]) + pad)]


def _union(rects):
    return [min(r[0] for r in rects), min(r[1] for r in rects), max(r[2] for r in rects), max(r[3] for r in rects)]


def _edge(crops, template, fps, entering):
    """crops: [(t, gray)] in time order. Returns (time the text first/last shows, kind).

    Correlation ignores contrast, so a half-faded title already correlates well: the cue
    time is when the pattern first appears, and "fully present" also needs the crop's
    contrast to reach the template's."""
    seq = crops if entering else list(reversed(crops))
    if not seq:
        return None, "other"
    tstd = float(template.std()) + 1e-6
    scores = [ncc(g, template) for _, g in seq]
    strength = [float(g.std()) / tstd for _, g in seq]
    appear = next((k for k, s in enumerate(scores) if s >= 0.55), None)
    if appear is None:
        return None, "other"
    if appear == 0:
        return seq[0][0], "other"  # already on screen when the window starts
    full = next((k for k in range(appear, len(seq)) if scores[k] >= 0.8 and 0.85 <= strength[k] <= 1.15), appear)
    window = [g for _, g in seq[appear - 1:full + 1]]
    mask = np.abs(template.astype(np.int16) - window[0].astype(np.int16)) > 40
    return seq[appear][0], classify_entrance(presence_features(window, window[0], mask), fps)


def highlight_row(frame, boxes):
    """Measure colour emphasis, without interpreting the words or list semantics."""
    values = []
    for rect in boxes:
        x0, y0, x1, y1 = map(int, rect)
        roi = frame[max(0,y0):y1, max(0,x0):x1]
        if not roi.size:
            return None
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        foreground = hsv[:,:,2] > 90
        values.append(float(((hsv[:,:,1] > 80) & foreground).sum()) / max(1,int(foreground.sum())))
    ordered = sorted(values, reverse=True)
    if len(ordered) < 3 or ordered[0] < .02 or ordered[0] < ordered[1] * 1.7 + .005:
        return None
    return int(np.argmax(values))


def highlight_events(states, min_hold=.15):
    runs = []
    for t, row in states:
        if row is None:
            continue
        if runs and runs[-1]['row'] == row and t - runs[-1]['end'] <= .25:
            runs[-1]['end'] = t
        else:
            runs.append({'t': t, 'end': t, 'row': row})
    stable = [r for r in runs if r['end'] - r['t'] >= min_hold]
    events, previous = [], None
    for run in stable:
        if previous is not None and run['row'] != previous:
            events.append({'t': round(run['t'], 3), 'kind': 'highlight-change', 'lineIndex': run['row'], 'score': .7})
        previous = run['row']
    return events


def stable_line_boxes(cue):
    rows = []
    for _, block in cue['observations']:
        for rect in block.get('lineBoxes',[]):
            cy = (rect[1]+rect[3])/2
            match = next((r for r in rows if abs(cy-np.median([(p[1]+p[3])/2 for p in r])) < .45*(rect[3]-rect[1])),None)
            if match is None:
                rows.append([rect])
            else:
                match.append(rect)
    boxes = sorted((_union(row) for row in rows if len(row)>=2),key=lambda r:r[1])
    # In a left-aligned list OCR sometimes misses the coloured number and starts
    # the row at its words. Recover the shared left edge from the other rows.
    if len(boxes) >= 3:
        lefts = [r[0] for r in boxes]
        height = float(np.median([r[3]-r[1] for r in boxes]))
        if max(lefts)-min(lefts) <= 1.5*height:
            for rect in boxes:
                rect[0] = min(lefts)
    return boxes


def reliable_cue(cue):
    readings = [(t,''.join(b['text'].split())) for t,b in cue['observations']]
    value = ''.join(cue['best'].split())
    if len({t for t,_ in readings}) < 2 or cue['bestScore'] < .65:
        return False
    if len(value) > 2:
        return True
    # Keep a repeatedly clear short word (e.g. AI); isolated list numbers and
    # punctuation do not establish a text element by themselves.
    return value.isalpha() and cue['bestScore'] >= .95 and len({t for t,_ in readings}) >= 3 and all(s==value for _,s in readings)


def analyse(request):
    path, models, visual = request["proxy"], request["models"], request.get("visualOrder", True)
    info = video_info(path)
    fps, H, W = info["fps"], info["height"], info["width"]
    every = max(1, int(round(fps / 2)))
    samples = []
    for _, t, frame in iter_frames(path, every=every):
        regions = [[p['box'][0]*W,p['box'][1]*H,(p['box'][0]+p['box'][2])*W,(p['box'][1]+p['box'][3])*H]
                   for p in request.get('regions',[]) if p.get('start',0)<=t<p.get('end',float('inf'))]
        lines = [(box_rect(b), words.strip(), s) for b, words, s in read_lines(frame, models, visual) if s >= 0.5 and words.strip()]
        samples.append((t, group_blocks(lines,regions)))
    cues = track(samples, every / fps)
    # Single-sample readings and unstable tiny glyph fragments are not cues.
    cues = [c for c in cues if reliable_cue(c)]
    # A word fragment inside the same full-line cue is duplicate evidence.
    def contained(child, parent):
        a, b = child['rect'], parent['rect']
        area = max(1.0, (a[2]-a[0])*(a[3]-a[1]))
        inter = max(0,min(a[2],b[2])-max(a[0],b[0])) * max(0,min(a[3],b[3])-max(a[1],b[1]))
        small, large = ''.join(child['best'].split()), ''.join(parent['best'].split())
        return len(small) < len(large) and small in large and inter/area > .85 and parent['first'] <= child['first'] and parent['last'] >= child['last']
    cues = [c for c in cues if not any(c is not other and contained(c,other) for other in cues)]
    if not cues:
        return {"text": []}
    refine_step = max(1, int(round(fps / 10)))
    refine_fps = fps / refine_step
    windows = []
    for i, c in enumerate(cues):
        mid = (c["first"] + c["last"]) / 2
        windows += [(i, "in", max(0.0, c["first"] - 0.6), c["first"] + 0.2), (i, "out", max(0.0, c["last"] - 0.2), c["last"] + 0.6), (i, "mid", mid, mid + 1.0 / refine_fps)]
    crops, mids = {(i, k): [] for i, k, _, _ in windows}, {}
    line_boxes = {i: stable_line_boxes(c) for i, c in enumerate(cues)}
    states = {i: [] for i in range(len(cues))}
    ranges=[(a-1e-6,b+1e-6) for _,_,a,b in windows]+[(c['first'],c['last']) for i,c in enumerate(cues) if len(line_boxes[i])>=3]
    with only_intervals(ranges):
        for _, t, frame in iter_frames(path, every=refine_step):
            for i, c in enumerate(cues):
                if len(line_boxes[i]) >= 3 and c['first'] <= t <= c['last']:
                    states[i].append((t, highlight_row(frame, line_boxes[i])))
            for i, k, a, b in windows:
                if a - 1e-6 <= t <= b + 1e-6:
                    x0, y0, x1, y1 = _pad(_union(cues[i]["rects"]), frame.shape)
                    crops[(i, k)].append((t, cv2.cvtColor(frame[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)))
                    if k == "mid" and i not in mids:
                        mids[i] = frame.copy()
    items = []
    for i, c in enumerate(cues):
        if i not in mids or not crops[(i, "mid")]:
            continue
        template = crops[(i, "mid")][0][1]
        start, entrance = _edge(crops[(i, "in")], template, refine_fps, True)
        end, exit_kind = _edge(crops[(i, "out")], template, refine_fps, False)
        # No entrance/exit can be measured beyond the file edges.
        if c['first'] == 0:
            start, entrance = 0.0, 'present-at-start'
        if end is not None and end >= info['frames']/fps - 2/refine_fps:
            end, exit_kind = info['frames'] / fps - 1 / refine_fps, 'present-at-end'
        rect = _union(c["rects"])
        cy = (rect[1] + rect[3]) / 2 / H
        size = (rect[3] - rect[1]) / H / max(1, c["best"].count("\n") + 1)
        zone = "top" if cy < 0.33 else "bottom" if cy > 0.66 else "middle"
        changes = highlight_events(states[i])
        for event in changes:
            r = line_boxes[i][event['lineIndex']]
            event['box'] = [round(r[0]/W,3),round(r[1]/H,3),round((r[2]-r[0])/W,3),round((r[3]-r[1])/H,3)]
        midpoint = (c['first']+c['last'])/2
        in_panel = any(p.get('start',0)<=midpoint<p.get('end',float('inf'))
                       and p['box'][0] <= (rect[0]+rect[2])/2/W <= p['box'][0]+p['box'][2]
                       and p['box'][1] <= cy <= p['box'][1]+p['box'][3] for p in request.get('regions',[]))
        items.append({"text": c["best"], "start": round(start if start is not None else c["first"], 3), "end": round(min(info["frames"] / fps, (end if end is not None else c["last"]) + max(1, round(fps / 10)) / fps), 3),
                      "box": [round(rect[0] / W, 3), round(rect[1] / H, 3), round((rect[2] - rect[0]) / W, 3), round((rect[3] - rect[1]) / H, 3)],
                      "zone": zone, "sizePct": round(size, 4), "kind": 'scene-text' if in_panel else "title" if size >= 0.07 else "caption" if zone != "top" else "label",
                      "style": text_style(mids[i], rect, line_height=size * H), "entrance": entrance, "exit": exit_kind, "score": round(c["bestScore"], 3),
                      'reading': 'most-complete-observed', 'events': changes})
    items.sort(key=lambda x: x["start"])
    return {"text": items}
