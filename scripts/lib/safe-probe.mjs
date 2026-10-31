import {zone,zoneTests,profileIds} from './ig.mjs';

export class ProbeContractError extends Error {}

/** The same two-colour alpha measurement used by safe-check; no rendering or I/O. */
export function analyseProbePair(a,b,{width:w,height:h,scale:SCALE=1,minAlpha:MIN_ALPHA=.35,profiles:profilesAll=profileIds(),bandTests=[]}={}){

  const n = w * h;
  if (a.length !== n * 3 || b.length !== n * 3) {
    throw new ProbeContractError(`probe frame is ${a.length / 3} px, expected ${n} (${w}x${h}) — use a scale Chrome can honour exactly (0.5, 0.25, 1)`);
  }
  const alpha = new Float32Array(n);
  const mask = new Uint8Array(n);
  let painted = 0, identical = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const d = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
    if (d < 10) identical++;
    const al = 1 - d / 255;
    alpha[i] = al;
    if (al >= MIN_ALPHA) { mask[i] = 1; painted++; }
  }

  const label = new Int32Array(n);
  const blobs = [];
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s]) continue;
    const id = blobs.length + 1;
    let sp = 0; stack[sp++] = s; label[s] = id;
    const blob = { id, area: 0, alphaSum: 0, minX: w, minY: h, maxX: 0, maxY: 0, zones: {} };
    while (sp) {
      const i = stack[--sp];
      const x = i % w, y = (i - x) / w;
      blob.area++; blob.alphaSum += alpha[i];
      if (x < blob.minX) blob.minX = x; if (x > blob.maxX) blob.maxX = x;
      if (y < blob.minY) blob.minY = y; if (y > blob.maxY) blob.maxY = y;
      const fx = x / SCALE, fy = y / SCALE;
      for (const pid of profilesAll) {
        for (const t of zoneTests(zone(pid))) if (t.test(fx, fy)) blob.zones[`${pid}/${t.id}`] = (blob.zones[`${pid}/${t.id}`] ?? 0) + 1;
      }
      for (const t of bandTests) if (t.test(fx, fy)) blob.zones[`band/${t.id}`] = (blob.zones[`band/${t.id}`] ?? 0) + 1;
      const nb = [i - 1, i + 1, i - w, i + w];
      if (x === 0) nb[0] = -1; if (x === w - 1) nb[1] = -1;
      for (const j of nb) if (j >= 0 && j < n && mask[j] && !label[j]) { label[j] = id; stack[sp++] = j; }
    }
    if (blob.area >= 4) blobs.push(blob);
  }
  const toFull = (v) => Math.round(v / SCALE);
  const px2 = 1 / (SCALE * SCALE);
  const report = blobs.map((bl) => ({
    bbox: { x: toFull(bl.minX), y: toFull(bl.minY), w: toFull(bl.maxX - bl.minX + 1), h: toFull(bl.maxY - bl.minY + 1) },
    areaPx2: Math.round(bl.area * px2),
    alpha: +(bl.alphaSum / bl.area).toFixed(2),
    zones: Object.fromEntries(Object.entries(bl.zones).map(([k, v]) => [k, Math.round(v * px2)])),
  }));
  return { paintedFraction: painted / n, identicalFraction: identical / n, blobs: report };

}

const zoneHits=(blobs,profiles,minArea)=>Object.fromEntries(profiles.map(pid=>[pid,blobs.flatMap(bl=>Object.entries(bl.zones).filter(([key,area])=>key.startsWith(pid+'/')&&area>=minArea).map(([key,areaPx2])=>({zone:key.slice(pid.length+1),areaPx2,bbox:bl.bbox,alpha:bl.alpha})))]));

/** Violations come ONLY from the content probe. Full-minus-content is informational surface coverage, never a content subtraction. */
export function analyseSafeFrame({allA,allB,contentA,contentB},options){
 const content=analyseProbePair(contentA,contentB,options),n=options.width*options.height;
 if(allA.length!==n*3||allB.length!==n*3)throw new ProbeContractError('Full probe dimensions differ from the content probes.');
 const surfaceA=new Uint8Array(n*3),surfaceB=new Uint8Array(n*3);
 for(let i=0;i<n;i++){
  const o=i*3,full=Math.max(Math.abs(allA[o]-allB[o]),Math.abs(allA[o+1]-allB[o+1]),Math.abs(allA[o+2]-allB[o+2]));
  const ink=Math.max(Math.abs(contentA[o]-contentB[o]),Math.abs(contentA[o+1]-contentB[o+1]),Math.abs(contentA[o+2]-contentB[o+2]));
  const difference=255-Math.max(0,ink-full);surfaceB[o]=surfaceB[o+1]=surfaceB[o+2]=difference;
 }
 const surfaces=analyseProbePair(surfaceA,surfaceB,options),profiles=options.profiles??profileIds();
 const contractFailure=content.identicalFraction>.999?'both probe renders are identical':content.paintedFraction>.9?(content.paintedFraction*100).toFixed(0)+' % of the frame counts as painted':null;
 return {...content,contractFailure,violations:zoneHits(content.blobs,profiles,options.minArea??400),surfaces:zoneHits(surfaces.blobs,profiles,1)};
}
