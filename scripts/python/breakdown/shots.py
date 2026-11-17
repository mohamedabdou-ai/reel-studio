# scripts/python/breakdown/shots.py
import cv2
import numpy as np

from .frames import iter_frames, video_info
from .panels import moving_panel
from .local_cuts import detect_evidence as local_swaps, boundary_evidence
from .visual_config import VISUAL_TUNING

THUMB = 128
WIDE = 320


def features(frame,with_color=False):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    hist = cv2.normalize(cv2.calcHist([hsv], [0, 1, 2], None, [16, 4, 4], [0, 180, 0, 256, 0, 256]), None).flatten()
    out=(hist, cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
    if with_color:
        width=VISUAL_TUNING['local_cuts']['analysis_width']
        small=cv2.resize(frame,(width,max(2,round(frame.shape[0]*width/frame.shape[1]))),interpolation=cv2.INTER_AREA)
        out+= (cv2.cvtColor(small,cv2.COLOR_BGR2LAB),)
    return out


def pair_score(a, b):
    hist = float(cv2.compareHist(a[0], b[0], cv2.HISTCMP_BHATTACHARYYA))
    diff = np.abs(b[1].astype(np.int16) - a[1].astype(np.int16))
    pixel = min(1.0, float(diff.mean()) / 255.0 * 4.0)
    return 0.6 * hist + 0.4 * pixel, float((diff > 25).mean())


def local_median(scores, i, half):
    window = [scores[j] for j in range(max(1, i - half), min(len(scores), i + half + 1)) if j != i]
    return float(np.median(window)) if window else 0.0


def raw_candidates(scores, changed, fps, floor=0.30, ratio=2.5, offset=0.06, min_changed=0.25):
    half = max(1, int(round(0.5 * fps)))
    return [i for i in range(1, len(scores))
            if scores[i] > floor and changed[i] > min_changed and scores[i] > ratio * local_median(scores, i, half) + offset]


def split_flashes(candidates, similar_back, fps, max_flash=0.3):
    flashes, used = [], set()
    for a, i in enumerate(candidates):
        if i in used:
            continue
        for j in candidates[a + 1:]:
            if (j - i) / fps > max_flash:
                break
            if similar_back(i, j):
                flashes.append((i, j))
                used.update({i, j})
                break
    return [c for c in candidates if c not in used], flashes


def enforce_min_shot(cuts, scores, fps, min_shot=0.35):
    kept = []
    for i in cuts:
        if i / fps < min_shot:
            continue
        if kept and (i - kept[-1]) / fps < min_shot:
            if scores[i] > scores[kept[-1]]:
                kept[-1] = i
            continue
        kept.append(i)
    return kept


def gradual_spans(scores, cuts, fps, quiet=0.02, min_len=0.2, max_len=1.5):
    cutset, spans, n, i = set(cuts), [], len(scores), 1
    lo, hi = int(round(min_len * fps)), int(round(max_len * fps))
    while i < n:
        if scores[i] < quiet or i in cutset:
            i += 1
            continue
        j = i
        while j < n and scores[j] >= quiet and j not in cutset and (j - i) <= hi:
            j += 1
        if lo <= j - i <= hi and j < n and scores[j] < quiet:
            spans.append((i - 1, j - 1))
        i = j + 1
    return spans


def _gray64(frame):
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float64)


def classify_gradual(clip):
    """clip: BGR frames from the last steady frame before the change to the last changing frame."""
    first, last = clip[0].astype(np.float32), clip[-1].astype(np.float32)
    mid = clip[len(clip) // 2].astype(np.float32)
    lum = [float(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).mean()) for f in clip]
    if min(lum) < 30 and min(lum) < 0.5 * min(lum[0], lum[-1]):
        return "fade", None
    if max(lum) > 220 and max(lum) > max(lum[0], lum[-1]) + 40:
        return "flash", None
    correlations = [cv2.phaseCorrelate(_gray64(p), _gray64(q)) for p, q in zip(clip, clip[1:])]
    shifts = [shift for shift, response in correlations if response >= 0.25]
    if len(shifts) < max(3, len(correlations) * 0.3):
        shifts = [(0.0, 0.0)]
    sx = np.array([s[0] / clip[0].shape[1] for s in shifts])
    sy = np.array([s[1] / clip[0].shape[0] for s in shifts])
    for values, negative, positive in ((sx, "left", "right"), (sy, "up", "down")):
        med = float(np.median(values))
        if abs(med) >= 0.02 and float(np.mean(np.sign(values) == np.sign(med))) >= 0.7:
            return ("whip" if abs(med) >= 0.15 else "slide"), (negative if med < 0 else positive)
    diff = last - first
    denom = float((diff * diff).sum())
    if denom > 0:
        alpha = float(((mid - first) * diff).sum() / denom)
        residual = float(np.abs(mid - (first + alpha * diff)).mean())
        if 0.15 <= alpha <= 0.85 and residual < max(10.0, 0.12 * float(np.abs(diff).mean())):
            return "dissolve", None
    return "other", None


def grid_layout(frame):
    return cv2.resize(frame, (6, 10), interpolation=cv2.INTER_AREA).astype(np.float32)


def similarity(before_gray, after_gray):
    orb = cv2.ORB_create(500)
    ka, da = orb.detectAndCompute(before_gray, None)
    kb, db = orb.detectAndCompute(after_gray, None)
    if da is None or db is None or len(ka) < 25 or len(kb) < 25:
        return None
    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(da, db)
    if len(matches) < 25:
        return None
    pa = np.float32([ka[m.queryIdx].pt for m in matches])
    pb = np.float32([kb[m.trainIdx].pt for m in matches])
    M, inliers = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=3.0)
    if M is None or inliers is None or int(inliers.sum()) < 25 or inliers.mean() < 0.4:
        return None
    return M


def cut_kind(before, after):
    M = similarity(cv2.cvtColor(before, cv2.COLOR_BGR2GRAY), cv2.cvtColor(after, cv2.COLOR_BGR2GRAY))
    if M is not None:
        warped = cv2.warpAffine(before, M, (after.shape[1], after.shape[0]), borderMode=cv2.BORDER_REPLICATE)
        if float(np.abs(grid_layout(warped) - grid_layout(after)).mean()) < 25:
            scale = float(np.hypot(M[0, 0], M[1, 0]))
            if scale >= 1.2:
                return "punch-in", scale
            if scale <= 1 / 1.2:
                return "punch-out", scale
            return "jump", scale
    layout = float(np.abs(grid_layout(before) - grid_layout(after)).mean())
    return ("jump", None) if layout < 18 else ("cut", None)


def displaced_block(before, after):
    """A paired disappearance/appearance is distinct from a one-sided title pop.

    Sparse displacements stay low confidence: a moving sticker can look similar.
    """
    diff = after.astype(np.int16) - before.astype(np.int16)
    positive, negative = diff > 35, diff < -35
    if not (0.01 <= positive.mean() <= 0.18 and 0.01 <= negative.mean() <= 0.18):
        return False
    if not 0.7 <= positive.sum() / negative.sum() <= 1.4:
        return False
    def largest(mask):
        count, _, stats, centers = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
        if count <= 1:
            return None
        i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        return stats[i], centers[i]
    a, b = largest(positive), largest(negative)
    if a is None or b is None or min(a[0][4], b[0][4]) < .01 * before.size:
        return False
    shape = all(.7 <= a[0][k] / max(1, b[0][k]) <= 1.4 for k in (2, 3))
    return shape and np.linalg.norm(a[1] - b[1]) >= .15 * before.shape[1]


def analyse(request):
    path = request["proxy"]
    fps = video_info(path)["fps"]
    feats, scores, changed = [], [0.0], [0.0]
    for _, _, frame in iter_frames(path, width=THUMB):
        f = features(frame,with_color=True)
        if feats:
            s, c = pair_score(feats[-1], f)
            scores.append(s)
            changed.append(c)
        feats.append(f)
    n = len(feats)
    if not n:
        raise ValueError("video has no decodable frames")
    raw = raw_candidates(scores, changed, fps)
    sparse = [i for i in range(1, n) if .025 <= changed[i] < .25 and displaced_block(feats[i - 1][1], feats[i][1])]
    global_candidates=set(raw)
    local_records = local_swaps([f[2] for f in feats],fps)
    sx=feats[0][1].shape[1]/feats[0][2].shape[1];sy=feats[0][1].shape[0]/feats[0][2].shape[0]
    local={i:tuple(round(v*(sx if k%2==0 else sy)) for k,v in enumerate(record['box'])) for i,record in local_records.items()}
    protected=[]
    for a,b in gradual_spans(scores,sorted(global_candidates),fps):
        if pair_score(feats[a],feats[b])[0] <= VISUAL_TUNING['local_cuts']['gradual_endpoint_score']:
            continue
        # The original classifier sees identical luminance/motion here, before
        # proposed local cuts can split a slide or dissolve into hard edges.
        clip=[np.repeat(feats[k][1][:,:,None],3,axis=2) for k in range(a,b+1)]
        if classify_gradual(clip)[0] in VISUAL_TUNING['local_cuts']['protected_gradual_kinds']:
            protected.append((a,b))
    local={i:box for i,box in local.items() if not any(a<=i<=b for a,b in protected)}
    # Sparse displacement needs the same temporal/text evidence as the new
    # local path; a moving sticker or caption is not a whole-frame cut.
    sparse=[i for i in sparse if i in local]
    raw = sorted(set(raw)|set(sparse)|set(local))
    candidates, flashes = split_flashes(raw, lambda i, j: pair_score(feats[i - 1], feats[j])[0] < 0.15, fps)
    cuts = enforce_min_shot(candidates, scores, fps)
    spans = [(a, b) for a, b in gradual_spans(scores, cuts, fps) if pair_score(feats[a], feats[b])[0] > 0.35]
    panel = moving_panel([f[1] for f in feats], fps)
    panel_cuts, panel_spans, panel_feats = [], [], []
    if panel:
        x0,y0,x1,y1 = panel
        ps, pc = [0.0], [0.0]
        for _, _, frame in iter_frames(path, width=THUMB):
            feature = features(frame[y0:y1,x0:x1])
            if panel_feats:
                s,c = pair_score(panel_feats[-1],feature)
                ps.append(s); pc.append(c)
            panel_feats.append(feature)
        panel_cuts = enforce_min_shot(raw_candidates(ps, pc, fps, floor=.25), ps, fps)
        panel_spans = [(a,b) for a,b in gradual_spans(ps,panel_cuts,fps)
                       if pair_score(panel_feats[a],panel_feats[b])[0] > .35]
        # Short dissolves can have a sharp central peak. Test actual intermediate
        # pixels against the two endpoint images, rather than naming every peak a cut.
        hard = []
        for i in panel_cuts:
            radius = max(2,round(.1*fps))
            a,b = max(0,i-radius),min(n-1,i+radius)
            first,last = panel_feats[a][1].astype(float),panel_feats[b][1].astype(float)
            delta = last-first
            denom = float((delta*delta).sum())
            blends = []
            if denom > 0:
                for k in range(a+1,b):
                    frame = panel_feats[k][1].astype(float)
                    alpha = float(((frame-first)*delta).sum()/denom)
                    residual = float(np.abs(frame-first-alpha*delta).mean())
                    if .12 < alpha < .88 and residual < max(7.0,.2*float(np.abs(delta).mean())):
                        blends.append((k,alpha))
            if len(blends) >= 2 and all(y[1] > x[1] for x,y in zip(blends,blends[1:])):
                panel_spans.append((blends[0][0]-1,blends[-1][0]+1))
            else:
                hard.append(i)
        panel_cuts = hard
        # Prefer the region measurement when the same event was diluted globally.
        full_cuts = []
        for i in cuts:
            outside = np.abs(feats[i][1].astype(np.int16)-feats[i-1][1].astype(np.int16)) > 25
            outside[y0:y1,x0:x1] = False
            outside_area = outside.size - (y1-y0)*(x1-x0)
            if outside.sum() / max(1,outside_area) <= .05:
                if not any(abs(i-j)/fps <= .25 for j in panel_cuts) and not any(a<=i<=b for a,b in panel_spans):
                    panel_cuts.append(i)
            else:
                full_cuts.append(i)
        cuts = full_cuts
        panel_cuts = sorted(i for i in panel_cuts if not any(abs(i-j)/fps <= .25 for j in cuts))
        spans = [(a,b) for a,b in spans if not any(a-.25*fps <= i <= b+.25*fps for i in panel_cuts)
                 and not any(a <= d and c <= b for c,d in panel_spans)]
    # A coherent local hard edge must not also be described as a surrounding
    # gradual animation. Its timestamp remains the actual frame boundary.
    spans=[(a,b) for a,b in spans if not any(a<=i<=b for i in local if i in cuts)]
    need_wide = {k for i in cuts for k in (i - 1, i)}
    need_thumb = {k for a, b in spans + panel_spans for k in range(a, b + 1)}
    wide, thumbs = {}, {}
    last = max(need_wide | need_thumb, default=-1)
    if last >= 0:
        for index, _, frame in iter_frames(path):
            if index in need_wide:
                wide[index] = cv2.resize(frame, (WIDE, int(round(frame.shape[0] * WIDE / frame.shape[1]))), interpolation=cv2.INTER_AREA)
            if index in need_thumb:
                thumbs[index] = cv2.resize(frame, (THUMB, int(round(frame.shape[0] * THUMB / frame.shape[1]))), interpolation=cv2.INTER_AREA)
            if index >= last:
                break
    cut_items = []
    for i in cuts:
        kind, scale = cut_kind(wide[i - 1], wide[i]) if (i - 1) in wide and i in wide else ("cut", None)
        item={"t": round(i / fps, 3), "frame": i, "kind": kind, "scale": round(scale, 3) if scale else None,
              "score": round((0.6 if i in sparse else min(1.0, scores[i] / 0.6)), 3)}
        if i in local and i not in global_candidates and i not in sparse:
            x0,y0,x1,y1=local[i];h,w=feats[0][1].shape
            item.update(kind='cut',scale=None,score=local_records[i]['score'],evidence=local_records[i]['evidence'])
            if (x0,y0,x1,y1)!=(0,0,w,h):
                item.update(scope='region',box=[round(x0/w,3),round(y0/h,3),round((x1-x0)/w,3),round((y1-y0)/h,3)])
        cut_items.append(item)
    transitions = [{"start": round(i / fps, 3), "end": round(j / fps, 3), "kind": "flash", "direction": None, "score": 0.8} for i, j in flashes]
    for a, b in spans:
        kind, direction = classify_gradual([thumbs[k] for k in range(a, b + 1)])
        transitions.append({"start": round((a + 1) / fps, 3), "end": round(b / fps, 3), "kind": kind, "direction": direction,
                            "score": 0.4 if kind == "other" else 0.75})
    region = None
    if panel:
        h,w = feats[0][1].shape
        region = [round(panel[0]/w,3),round(panel[1]/h,3),round((panel[2]-panel[0])/w,3),round((panel[3]-panel[1])/h,3)]
        for i in panel_cuts:
            proof=boundary_evidence([f[1] for f in feats],i,panel,fps)
            cut_items.append({'t': round(i/fps,3), 'frame': i, 'kind': 'cut', 'scale': None,
                              'score': proof['score'] if proof else 0.,'evidence':proof, 'scope': 'region', 'box': region})
        for a,b in panel_spans:
            clip = [thumbs[k][panel[1]:panel[3],panel[0]:panel[2]] for k in range(a,b+1)]
            kind,direction = classify_gradual(clip)
            transitions.append({'start':round((a+1)/fps,3),'end':round(b/fps,3),'kind':kind,'direction':direction,
                                'score': .4 if kind == 'other' else .7, 'scope':'region','box':region})
    cut_items.sort(key=lambda x:x['t'])
    transitions.sort(key=lambda x: x["start"])
    duration = round(n / fps, 3)
    for cut in cut_items:cut['shotBoundary']=cut.get('scope')!='region'
    bounds = {0.0, duration, *[c["t"] for c in cut_items if c['shotBoundary']]}
    bounds.update(round((tr["start"] + tr["end"]) / 2, 3) for tr in transitions if tr["kind"] != "flash" and tr.get('scope')!='region')
    ordered = sorted(bounds)
    shot_items = [{"id": f"S{k + 1:02d}", "start": s, "end": e, "len": round(e - s, 3)}
                  for k, (s, e) in enumerate((s, e) for s, e in zip(ordered, ordered[1:]) if e - s > 0.01)]
    return {"fps": fps, "frames": n, "durationSec": duration, "cuts": cut_items, "transitions": transitions, "shots": shot_items,
            'panels': [{'box':region,'score':.6,'start':0.0,'end':round(cuts[0]/fps,3) if cuts else duration}] if region else []}
