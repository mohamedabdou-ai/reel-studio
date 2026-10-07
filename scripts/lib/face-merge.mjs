export const FACE_MERGE_IOU = 0.5;

export function boxIoU(a, b) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width), y1 = Math.min(a.y + a.height, b.y + b.height);
  const overlap = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.width * a.height + b.width * b.height - overlap;
  return union > 0 ? overlap / union : 0;
}

export function mergeFaceDetections(faces, {iou = FACE_MERGE_IOU} = {}) {
  const ranked = [...faces].sort((a, b) => b.score - a.score || a.x - b.x || a.y - b.y);
  const kept = [];
  for (const face of ranked) if (kept.every((other) => boxIoU(face, other) < iou)) kept.push(face);
  return kept;
}
