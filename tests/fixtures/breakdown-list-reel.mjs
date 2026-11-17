// A hand-built faceless list reel: a static header, a list whose highlight steps, a framed panel that switches.
export const meta = {basis: 'measured', confidence: 'high', status: 'confirmed'};
export function listReel() {
  const region = i => ({id: `C${String(i + 1).padStart(2, '0')}`, t: 1.2 * (i + 1), kind: 'cut', scale: null, scope: 'region', box: [0.45, 0.27, 0.48, 0.48], ...meta});
  const cuts = [...Array.from({length: 10}, (_, i) => region(i)), {id: 'C11', t: 13.1, kind: 'cut', scale: null, ...meta}];
  const shots = [0, ...cuts.map(c => c.t), 16].slice(0, -1).map((start, i, all) => ({id: `S${String(i + 1).padStart(2, '0')}`, start, end: all[i + 1] ?? 16, len: (all[i + 1] ?? 16) - start, camera: {label: 'static', ...meta}}));
  return {schema: 1, referenceId: 'ref-aaaaaaaaaaaa', source: {name: 'list.mp4', sha256: 'a'.repeat(64)}, durationSec: 16, aspect: '720x1280',
    pace: {cutCount: 11, cutsPerMinute: 41.3, shotLen: {min: 1.2, median: 1.2, max: 2.9}}, shots, cuts, transitions: [], events: [],
    text: [
      {id: 'T01', text: 'Header line', start: 0.1, end: 13.2, box: [0.1, 0.08, 0.8, 0.16], zone: 'top', sizePct: 0.05, kind: 'label', style: {fill: '#f6f6f6', stroke: null, box: null, highlight: null}, entrance: 'fade', exit: 'cut', ...meta},
      {id: 'T02', text: '1) One\n2) Two\n3) Three\n4) Four', start: 0.2, end: 13.1, box: [0.05, 0.3, 0.35, 0.4], zone: 'middle', sizePct: 0.03, kind: 'label', style: {fill: '#f6f6f6', stroke: null, box: null, highlight: '#b07c76'}, entrance: 'present-at-start', exit: 'cut',
        events: Array.from({length: 9}, (_, j) => ({id: `T02.H${String(j + 1).padStart(2, '0')}`, t: 1.2 * (j + 1), kind: 'highlight-change', lineIndex: j + 1, ...meta})), ...meta},
      {id: 'T03', text: 'Comment for the prompts', start: 13.3, end: 16, box: [0.1, 0.8, 0.8, 0.1], zone: 'bottom', sizePct: 0.04, kind: 'label', style: {fill: '#ffffff', stroke: null, box: null, highlight: null}, entrance: 'pop', exit: 'present-at-end', ...meta},
    ],
    overlays: [{id: 'O01', start: 0, end: 13.1, box: [0.45, 0.27, 0.48, 0.48], kind: 'pip', score: 0.6, basis: 'measured', confidence: 'medium', status: 'needs-confirmation'}],
    look: {label: 'natural', metrics: {saturation: 0.19, meanLevel: 78}, ...meta},
    presenter: {share: 0, size: 'none', faceHeight: null, spans: [], perShot: [], ...meta},
    sound: {hasAudio: true, bed: {present: true, levelDb: -24, speechToBedDb: null, ...meta}, tempo: {confirmHow: 'Tap along with the music for ten seconds.', bpm: 81, alternatives: [40.5, 162], basis: 'measured', confidence: 'low', status: 'needs-confirmation'},
      cutsOnBeat: {share: 0.36, chance: 0.22, synced: false}, sfx: Array.from({length: 6}, (_, i) => ({id: `X0${i + 1}`, t: 1.2 * (i + 1), type: 'pop', anchor: {kind: 'cut', id: `C0${i + 1}`, dt: 0}, ...meta})), hitsPerMinute: 22.5, speech: null},
    limitations: [], reviewQueue: ['O01', 'sound.tempo']};
}
