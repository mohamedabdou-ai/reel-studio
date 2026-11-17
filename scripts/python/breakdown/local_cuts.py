"""Persistent local replacements, with text and continuous-motion negatives."""
import cv2
import numpy as np
from scipy.ndimage import median_filter
from .visual_config import VISUAL_TUNING

C=VISUAL_TUNING['local_cuts']


def _regions(mask):
    grouped=cv2.dilate(mask.astype(np.uint8),np.ones((C['group_kernel'],C['group_kernel']),np.uint8))
    count,labels,stats,_=cv2.connectedComponentsWithStats(grouped)
    return [(int(x),int(y),int(x+w),int(y+h)) for x,y,w,h,area in stats[1:] if area>=mask.size*C['min_area']]


def _changed(a,b):
    diff=cv2.absdiff(a,b)
    if diff.ndim==3:diff=diff.max(axis=2)
    return (diff>C['pixel_delta']).astype(np.uint8)


def boundary_evidence(grays,i,box,fps):
    radius=max(1,round(C['hold_sec']*fps))
    if i<radius or i+radius>len(grays):return None
    x0,y0,x1,y1=box
    before=np.stack([g[y0:y1,x0:x1] for g in grays[i-radius:i]]).astype(float)
    after=np.stack([g[y0:y1,x0:x1] for g in grays[i:i+radius]]).astype(float)
    a,b=np.median(before,axis=0),np.median(after,axis=0)
    cross=float(np.abs(a-b).mean())
    if cross<=0:return None
    instant=float(np.abs(before[-1]-after[0]).mean())
    drift=max(float(np.abs(before-a).mean()),float(np.abs(after-b).mean()))
    ratio=instant/cross;hold_error=drift/cross
    ratio_strength=float(np.clip((ratio-C['abrupt_share'])/(1-C['abrupt_share']),0,1))
    hold_strength=float(np.clip(1-hold_error/C['hold_error_share'],0,1))
    return {'boundaryRatio':round(ratio,4),'holdErrorShare':round(hold_error,4),
            'qualified':ratio>=C['abrupt_share'] and hold_error<=C['hold_error_share'],
            'score':round(float(np.sqrt(ratio_strength*hold_strength)),4)}


def _content(before,after,box):
    x0,y0,x1,y1=box;a=before[y0:y1,x0:x1];b=after[y0:y1,x0:x1]
    changed=_changed(a,b)
    if not changed.any():return False
    edge_a=cv2.Canny(a[:,:,0] if a.ndim==3 else a,C['edge_low'],C['edge_high'])>0
    edge_b=cv2.Canny(b[:,:,0] if b.ndim==3 else b,C['edge_low'],C['edge_high'])>0
    border=C['edge_border_px']
    for edge in [edge_a,edge_b]:
        edge[:border]=False;edge[-border:]=False;edge[:,:border]=False;edge[:,-border:]=False
    union=(edge_a|edge_b).sum()
    same=float((edge_a&edge_b).sum()/union) if union else 1.
    values=np.concatenate([(a[:,:,0] if a.ndim==3 else a).ravel(),(b[:,:,0] if b.ndim==3 else b).ravel()])
    hist=np.bincount(values,minlength=256).astype(float);hist/=max(1,hist.sum())
    nonzero=hist[hist>0];entropy=float(-np.sum(nonzero*np.log2(nonzero)))
    short=(y1-y0)/before.shape[0]<C['linework_height']
    if short and entropy<C['texture_entropy_min']:
        if union or (x1-x0)/max(1,y1-y0)>=C['text_line_aspect']:
            return False
    # Same geometry with a changed fill is a highlight when text is present.
    # A blank picture panel may change colour: its dense interior still counts.
    if union and same>=C['same_edges_share'] and short:return False
    interior=cv2.erode(changed,np.ones((C['group_kernel'],C['group_kernel']),np.uint8))
    dense=float(interior.mean())>=C['dense_interior_share']
    height=(y1-y0)/before.shape[0]
    linework=height>=C['linework_height'] and (x1-x0)/max(1,y1-y0)<=C['linework_aspect']
    return dense or linework


def detect_evidence(grays,fps):
    if len(grays)<2:return {}
    h,w=grays[0].shape[:2]
    masks=[np.zeros((h,w),np.uint8)]+[_changed(a,b) for a,b in zip(grays,grays[1:])]
    proposals={}
    temporal=max(3,2*round(C['context_sec']*fps/2)+1)
    for columns in C['tile_widths']:
        rows=max(1,round(columns*h/w))
        maps=np.stack([cv2.resize(m.astype(np.float32),(columns,rows),interpolation=cv2.INTER_AREA) for m in masks])
        background=median_filter(maps,size=(temporal,1,1),mode='nearest')
        novel=(maps>=C['cell_change_min']) & (maps>C['novelty_ratio']*background)
        for i in np.flatnonzero(novel.any(axis=(1,2))):
            if not i:continue
            cells=cv2.resize(novel[i].astype(np.uint8),(w,h),interpolation=cv2.INTER_NEAREST)
            selected=masks[i]&cells
            for box in _regions(selected):
                evidence=boundary_evidence(grays,int(i),box,fps)
                if _content(grays[i-1],grays[i],box) and evidence and evidence['qualified']:
                    previous=proposals.get(int(i))
                    old_box=previous['box'] if previous else None
                    if previous is None or (box[2]-box[0])*(box[3]-box[1])>(old_box[2]-old_box[0])*(old_box[3]-old_box[1]):
                        proposals[int(i)]={'box':box,'score':evidence['score'],'evidence':evidence}
    return proposals


def detect(grays,fps):
    return {i:record['box'] for i,record in detect_evidence(grays,fps).items()}
