export const FACE_MARGIN_PX = 24;
const FIXABLE = new Set(['graphic-in-head', 'head-cut-by-window']);
const LAYOUT_KEY = Object.freeze({presenter: 'full', split: 'split'});


export function requiredShift(row, geo, aspect) {
  if (row.status !== 'FAIL' || !FIXABLE.has(row.reason) || !row.sourceBox || !geo) return null;
  const videoHeight = geo.videoWidth * aspect;
  const headTop = geo.windowTop + geo.videoTop + row.sourceBox.y * videoHeight;
  const headBottom = headTop + row.sourceBox.height * videoHeight;
  if (row.reason === 'head-cut-by-window') {
    if (row.windowCut === 'top') return Math.ceil(geo.windowTop + FACE_MARGIN_PX - headTop);
    if (row.windowCut === 'bottom') return -Math.ceil(headBottom + FACE_MARGIN_PX - (geo.windowTop + geo.windowHeight));
    return null;
  }
  const hit = row.hitBBox;
  if (!hit) return null;
  return hit.y + hit.height / 2 < (headTop + headBottom) / 2
    ? Math.max(1, Math.ceil(hit.y + hit.height + FACE_MARGIN_PX - headTop))
    : -Math.max(1, Math.ceil(headBottom + FACE_MARGIN_PX - hit.y));
}





export function repositionFootage({footage, failures, aspect}) {
  const shifts = {presenter: [], split: []};
  for (const {row, layout, geo} of failures) {
    const shift = LAYOUT_KEY[layout] ? requiredShift(row, geo, aspect) : null;
    if (shift === null) return {footage: null, notes: [`Frame ${row.frame} (${row.reason}) cannot be fixed by moving the video; change that scene's layout or text.`]};
    shifts[layout].push(shift);
  }
  const next = {...footage};
  const notes = [];
  for (const layout of ['presenter', 'split']) {
    const list = shifts[layout];
    if (!list.length) continue;
    const down = Math.max(0, ...list), up = Math.min(0, ...list);
    if (down > 0 && up < 0) return {footage: null, notes: [`The ${layout} layout would need the video moved both up and down; change the graphics instead.`]};
    const shift = down || up;
    if (!shift) continue;
    const key = LAYOUT_KEY[layout], geo = footage[key];
    const videoTop = geo.videoTop + shift;
    if (videoTop > 0 || videoTop + geo.videoWidth * aspect < geo.windowHeight) {
      return {footage: null, notes: [`Moving the ${layout} video ${shift > 0 ? 'down' : 'up'} by ${Math.abs(shift)}px would uncover its edge; change the graphics instead.`]};
    }
    next[key] = {...geo, videoTop};
    notes.push(`Moved the ${layout} video ${shift > 0 ? 'down' : 'up'} by ${Math.abs(shift)}px so graphics clear the face.`);
  }
  return {footage: next, notes};
}
