import type { EditManifest } from "../../prepared-edit/schema.ts";
import { editSceneSchema } from "../../prepared-edit/schema.ts";
import { creativeGalleryDefaults, sceneFamilies } from "../../creative-kit/schema.ts";
import {semanticFamilies} from '../../creative-kit/semantic/schema.ts';
import { totalFrames } from "../time.ts";
import { carryEntrances, dropForegrounds, repairForegrounds } from "./anchors.ts";
import { deepEqual, removeIn, setIn, type Path } from "./paths.ts";
import { TEMPLATE_DATA } from "./demo.ts";
import { finalize, refuse, unchanged, type OpResult } from "./result.ts";
import { clamp, insertSorted, limitFrame, removeAt, replaceAt, sceneEnd, sceneIndex, uniqueSlug, type Scene } from "./util.ts";

export { sceneDemoFields, demoScenes, type DemoScene } from "./demo.ts";

export const LAYOUTS = ["presenter", "split", "takeover"] as const;
export const MOTIONS = ["land", "stagger", "quiet"] as const;
export type SceneLayout = (typeof LAYOUTS)[number];
export type SceneMotion = (typeof MOTIONS)[number];


export const TEMPLATE_FAMILIES = [...sceneFamilies,...semanticFamilies];
const MIN_SCENE_FRAMES = 30;
const DEFAULT_SCENE_FRAMES = creativeGalleryDefaults.framesPerScene;

const noScene = (id: string) => refuse(`مفيش مشهد اسمه "${id}".`);


export function allowedLayouts(scene: Scene): SceneLayout[] {
  return LAYOUTS.filter((layout) => layout === scene.layout || editSceneSchema.safeParse({ ...scene, layout }).success);
}


export function freeRoomAt(m: EditManifest, atFrame: number, limit: number, minRoom: number): { from: number; room: number } | null {
  let cursor = Math.max(0, Math.round(atFrame));
  for (const s of m.scenes) {
    if (cursor >= sceneEnd(s)) continue;
    if (cursor >= s.fromFrame) {
      cursor = sceneEnd(s);
      continue;
    }
    const room = Math.min(s.fromFrame, limit) - cursor;
    if (room >= minRoom) return { from: cursor, room };
    cursor = sceneEnd(s);
  }
  const room = limit - cursor;
  return room >= minRoom ? { from: cursor, room } : null;
}








export function moveScene(m: EditManifest, id: string, toFrame: number): OpResult {
  const i = sceneIndex(m, id);
  if (i < 0) return noScene(id);
  if (!Number.isFinite(toFrame)) return refuse("الفريم لازم يبقى رقم.");
  const s = m.scenes[i];
  const lo = i > 0 ? sceneEnd(m.scenes[i - 1]) : 0;
  const hi = (i < m.scenes.length - 1 ? m.scenes[i + 1].fromFrame : totalFrames(m)) - s.durationInFrames;
  if (lo > hi) return refuse("مفيش مساحة تتحرك فيها المشهد ده.");
  const from = clamp(Math.round(toFrame), lo, hi);
  if (from === s.fromFrame) return unchanged(m);
  const notes = from !== Math.round(toFrame) ? ["المشهد اتحرك لحد ما لمس المشهد اللي جنبه (أو حدّ الفيديو)."] : [];
  return finishMove(m, replaceAt(m.scenes, i, { ...s, fromFrame: from }), s.fromFrame, from, notes);
}





export function resizeScene(m: EditManifest, id: string, edge: "start" | "end", toFrame: number): OpResult {
  const i = sceneIndex(m, id);
  if (i < 0) return noScene(id);
  if (!Number.isFinite(toFrame)) return refuse("الفريم لازم يبقى رقم.");
  const s = m.scenes[i];
  const end = sceneEnd(s);
  const target = Math.round(toFrame);
  let scene: Scene;
  if (edge === "start") {
    const lo = i > 0 ? sceneEnd(m.scenes[i - 1]) : 0;
    const from = clamp(target, lo, end - 1);
    if (from === s.fromFrame) return unchanged(m);
    scene = { ...s, fromFrame: from, durationInFrames: end - from };
  } else {
    const hi = i < m.scenes.length - 1 ? m.scenes[i + 1].fromFrame : totalFrames(m);
    const to = clamp(target, s.fromFrame + 1, hi);
    if (to === end) return unchanged(m);
    scene = { ...s, durationInFrames: to - s.fromFrame };
  }
  const requested = edge === "start" ? scene.fromFrame === target : sceneEnd(scene) === target;
  return finishMove(m, replaceAt(m.scenes, i, scene), s.fromFrame, scene.fromFrame, requested ? [] : ["الحدّ اتقصّ عشان ميتداخلش مع اللي جنبه."]);
}


export function setSceneDuration(m: EditManifest, id: string, durationInFrames: number): OpResult {
  const s = m.scenes.find((x) => x.id === id);
  if (!s) return noScene(id);
  return resizeScene(m, id, "end", s.fromFrame + Math.round(durationInFrames));
}

function finishMove(m: EditManifest, scenes: Scene[], oldFrom: number, newFrom: number, notes: string[]): OpResult {
  let next: EditManifest = carryEntrances({ ...m, scenes }, oldFrom, newFrom);
  const repaired = repairForegrounds(next);
  if (repaired.failed.length) return refuse(`الـ foreground بتاع المشهد "${repaired.failed[0]}" مش هيغطي المكان الجديد. اختار مكان تاني أو شيل الـ foreground.`);
  next = repaired.manifest;
  return finalize(m, next, undefined, notes);
}







export function deleteScene(m: EditManifest, id: string): OpResult {
  const i = sceneIndex(m, id);
  if (i < 0) return noScene(id);
  const s = m.scenes[i];
  const notes: string[] = [];
  let next: EditManifest = { ...m, scenes: removeAt(m.scenes, i) };
  const gone = m.transitions?.filter((t) => t.atFrame === s.fromFrame).length ?? 0;
  if (gone) {
    next = { ...next, transitions: m.transitions!.filter((t) => t.atFrame !== s.fromFrame) };
    notes.push(`اتشال ${gone} transition كان على أول المشهد.`);
  }
  const goneLayout = m.layoutTransitions?.filter((t) => t.atFrame === s.fromFrame).length ?? 0;
  if (goneLayout) {
    next = { ...next, layoutTransitions: m.layoutTransitions!.filter((t) => t.atFrame !== s.fromFrame) };
    notes.push(`اتشال ${goneLayout} layout transition كان على أول المشهد.`);
  }
  const pip = m.footage?.pip;
  if (pip?.sceneIds.includes(id)) {
    const ids = pip.sceneIds.filter((x) => x !== id);
    if (ids.length) next = { ...next, footage: { ...m.footage!, pip: { ...pip, sceneIds: ids } } };
    else {
      const { pip: _pip, ...footage } = m.footage!;
      next = { ...next, footage };
      notes.push("اتشال الـ PiP لأنه كان على المشهد ده بس.");
    }
  }
  return finalize(m, next, undefined, notes);
}






export function duplicateScene(m: EditManifest, id: string, atFrame?: number): OpResult<{ id: string; index: number }> {
  const i = sceneIndex(m, id);
  if (i < 0) return noScene(id);
  const s = m.scenes[i];
  const limit = limitFrame(m);
  const slot = freeRoomAt(m, atFrame ?? sceneEnd(s), limit, s.durationInFrames) ?? freeRoomAt(m, 0, limit, s.durationInFrames);
  if (!slot) return refuse(`مفيش مساحة فاضية بطول ${s.durationInFrames} فريم عشان النسخة.`);
  const newId = uniqueSlug(`${s.id}-copy`, new Set(m.scenes.map((x) => x.id)));
  const copy = { ...structuredClone(s), id: newId, fromFrame: slot.from } as Scene;
  const [scenes, index] = insertSorted(m.scenes, copy, (x) => x.fromFrame);
  let next: EditManifest = { ...m, scenes };
  const notes: string[] = [];
  const repaired = repairForegrounds(next);
  next = repaired.manifest;
  if (repaired.failed.includes(newId)) {
    next = dropForegrounds(next, [newId]);
    notes.push("النسخة اتعملت من غير الـ foreground لأنه مش هيغطي المكان الجديد.");
  }
  return finalize(m, next, { id: newId, index }, notes);
}




export function setSceneData(m: EditManifest, id: string, data: unknown): OpResult {
  const i = sceneIndex(m, id);
  if (i < 0) return noScene(id);
  const s = m.scenes[i];
  if (data === s.data || deepEqual(data, s.data)) return unchanged(m);
  return finalize(m, { ...m, scenes: replaceAt(m.scenes, i, { ...s, data } as Scene) });
}


export function setSceneField(m: EditManifest, id: string, path: Path, value: unknown): OpResult {
  const s = m.scenes.find((x) => x.id === id);
  if (!s) return noScene(id);
  if (!path.length) return setSceneData(m, id, value);
  return setSceneData(m, id, value === undefined ? removeIn(s.data, path) : setIn(s.data, path, value));
}

export function setLayout(m: EditManifest, id: string, layout: SceneLayout): OpResult {
  const i = sceneIndex(m, id);
  if (i < 0) return noScene(id);
  const s = m.scenes[i];
  if (s.layout === layout) return unchanged(m);
  if (!allowedLayouts(s).includes(layout)) {
    return refuse(`الـ family «${s.family}» بتشتغل بـ layout ${allowedLayouts(s).join(" / ")} بس.`);
  }
  return finalize(m, { ...m, scenes: replaceAt(m.scenes, i, { ...s, layout } as Scene) });
}

export function setMotion(m: EditManifest, id: string, motion: SceneMotion): OpResult {
  const i = sceneIndex(m, id);
  if (i < 0) return noScene(id);
  const s = m.scenes[i];
  if (s.motion === motion) return unchanged(m);
  if (!(MOTIONS as readonly string[]).includes(motion)) return refuse(`الـ motion لازم يكون واحد من: ${MOTIONS.join(" / ")}.`);
  return finalize(m, { ...m, scenes: replaceAt(m.scenes, i, { ...s, motion } as Scene) });
}









export function addSceneFromTemplate(m: EditManifest, family: string, options: { atFrame?: number; durationInFrames?: number } = {}): OpResult<{ id: string; index: number }> {
  const data = TEMPLATE_DATA[family];
  if (!data) return refuse(`مفيش قالب آمن للـ family «${family}». انسخ مشهد موجود منها (نسخ) وعدّل عليه.`);
  const wanted = Math.round(options.durationInFrames ?? DEFAULT_SCENE_FRAMES);
  if (!(wanted >= 1)) return refuse("مدة المشهد لازم تبقى فريم واحد على الأقل.");
  const slot = freeRoomAt(m, options.atFrame ?? 0, limitFrame(m), Math.min(MIN_SCENE_FRAMES, wanted));
  if (!slot) return refuse("مفيش مساحة فاضية كفاية لمشهد جديد. قصّر مشهد أو حرّك الـ playhead لمكان فاضي.");
  const id = uniqueSlug(family, new Set(m.scenes.map((x) => x.id)));
  const scene = {
    id,
    fromFrame: slot.from,
    durationInFrames: Math.min(wanted, slot.room),
    family,
    layout: creativeGalleryDefaults.layout,
    motion: creativeGalleryDefaults.motion,
    data: structuredClone(data),
  } as Scene;
  const [scenes, index] = insertSorted(m.scenes, scene, (x) => x.fromFrame);
  return finalize(m, { ...m, scenes }, { id, index }, ["ده نص تجريبي من الـ kit. لازم تبدّله بكلامك قبل التصدير."]);
}
