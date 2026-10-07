import type { EditManifest } from "../../prepared-edit/schema.ts";
import { footageLayoutAt, LAYOUT_TRANSITION_MIN_FRAMES } from "../../prepared-edit/footage.ts";
import { GRAPHICS_ENTRANCE_KINDS, TRANSITION_DIRS, TRANSITION_KINDS, type TransitionDir, type TransitionKind } from "../../prepared-edit/graphics-transitions.ts";
import { cameraAtFrame } from "../../prepared-edit/timeline.ts";
import { totalFrames } from "../time.ts";
import { isSceneAnchoredKind } from "./anchors.ts";
import { finalize, refuse, unchanged, type OpResult } from "./result.ts";
import { clamp, insertSorted, limitFrame, removeAt, round3, sceneEnd } from "./util.ts";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const noItem = (what: string, index: number) => refuse(`مفيش ${what} رقم ${index + 1}.`);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);



type Sound = EditManifest["sounds"][number];
const SOUND_HINT = "الصوت لازم يبدأ قبل الـ signoff ونهاية الفيديو.";


function soundFrame(m: EditManifest, atFrame: number): number | null {
  const last = limitFrame(m) - 1;
  return last < 0 ? null : clamp(Math.round(atFrame), 0, last);
}

export function addSound(m: EditManifest, o: { atFrame: number; recipe: string; gain?: number; knownRecipes?: readonly string[] }): OpResult<{ index: number }> {
  if (!finite(o.atFrame)) return refuse("الفريم لازم يبقى رقم.");
  if (!SLUG.test(o.recipe)) return refuse("اسم الـ recipe مش مظبوط.");
  if (o.knownRecipes && !o.knownRecipes.includes(o.recipe)) return refuse(`الـ recipe «${o.recipe}» مش موجودة في كاتالوج الصوت.`);
  const at = soundFrame(m, o.atFrame);
  if (at === null) return refuse(SOUND_HINT);
  const sound: Sound = { atFrame: at, recipe: o.recipe, gain: clamp(round3(o.gain ?? 0.5), 0, 2) };
  const [sounds, index] = insertSorted(m.sounds, sound, (s) => s.atFrame);
  return finalize(m, { ...m, sounds }, { index }, at !== Math.round(o.atFrame) ? [SOUND_HINT] : []);
}

export function moveSound(m: EditManifest, index: number, atFrame: number): OpResult<{ index: number }> {
  const s = m.sounds[index];
  if (!s) return noItem("صوت", index);
  if (!finite(atFrame)) return refuse("الفريم لازم يبقى رقم.");
  const at = soundFrame(m, atFrame);
  if (at === null) return refuse(SOUND_HINT);
  if (at === s.atFrame) return unchanged(m, { index });
  const [sounds, at2] = insertSorted(removeAt(m.sounds, index), { ...s, atFrame: at }, (x) => x.atFrame);
  return finalize(m, { ...m, sounds }, { index: at2 }, at !== Math.round(atFrame) ? [SOUND_HINT] : []);
}

export function setSoundGain(m: EditManifest, index: number, gain: number): OpResult {
  const s = m.sounds[index];
  if (!s) return noItem("صوت", index);
  if (!finite(gain)) return refuse("الـ gain لازم يبقى رقم.");
  const g = clamp(round3(gain), 0, 2);
  if (g === s.gain) return unchanged(m);
  return finalize(m, { ...m, sounds: m.sounds.map((x, i) => (i === index ? { ...x, gain: g } : x)) });
}

export function setSoundRecipe(m: EditManifest, index: number, recipe: string, knownRecipes?: readonly string[]): OpResult {
  const s = m.sounds[index];
  if (!s) return noItem("صوت", index);
  if (!SLUG.test(recipe)) return refuse("اسم الـ recipe مش مظبوط.");
  if (knownRecipes && !knownRecipes.includes(recipe)) return refuse(`الـ recipe «${recipe}» مش موجودة في كاتالوج الصوت.`);
  if (recipe === s.recipe) return unchanged(m);
  return finalize(m, { ...m, sounds: m.sounds.map((x, i) => (i === index ? { ...x, recipe } : x)) });
}

export function deleteSound(m: EditManifest, index: number): OpResult {
  if (!m.sounds[index]) return noItem("صوت", index);
  return finalize(m, { ...m, sounds: removeAt(m.sounds, index) });
}



type CameraKey = EditManifest["camera"][number];
export type CameraEase = "smooth" | "bezierCam";
export type CameraPatch = { atFrame?: number; scale?: number; focusX?: number; focusY?: number; ease?: CameraEase | null };





export function addCameraKey(m: EditManifest, o: { atFrame: number } & Omit<CameraPatch, "atFrame">): OpResult<{ index: number }> {
  if (!finite(o.atFrame)) return refuse("الفريم لازم يبقى رقم.");
  const at = Math.round(o.atFrame);
  const total = totalFrames(m);
  if (at < 0 || at >= total) return refuse("مفتاح الكاميرا لازم يقع جوّه مدة الفيديو.");
  if (m.camera.some((k) => k.atFrame === at)) return refuse("في مفتاح كاميرا عند الفريم ده بالفعل. عدّله من القايمة.");
  const now = cameraAtFrame(m.camera, at);
  const key: CameraKey = {
    atFrame: at,
    scale: clamp(round3(o.scale ?? now.scale), 1, 1.3),
    focusX: clamp(round3(o.focusX ?? now.focusX), 0, 1),
    focusY: clamp(round3(o.focusY ?? now.focusY), 0, 1),
  };
  if (o.ease) key.ease = o.ease;
  const [camera, index] = insertSorted(m.camera, key, (k) => k.atFrame);
  return finalize(m, { ...m, camera }, { index });
}


export function updateCameraKey(m: EditManifest, index: number, patch: CameraPatch): OpResult {
  const k = m.camera[index];
  if (!k) return noItem("مفتاح كاميرا", index);
  const next: CameraKey = { ...k };
  const notes: string[] = [];
  if (patch.atFrame !== undefined) {
    if (!finite(patch.atFrame)) return refuse("الفريم لازم يبقى رقم.");
    const lo = index > 0 ? m.camera[index - 1].atFrame + 1 : 0;
    const hi = (index < m.camera.length - 1 ? m.camera[index + 1].atFrame : totalFrames(m)) - 1;
    if (lo > hi) return refuse("مفيش مكان يتحرك فيه المفتاح ده بين اللي جنبه.");
    next.atFrame = clamp(Math.round(patch.atFrame), lo, hi);
    if (next.atFrame !== Math.round(patch.atFrame)) notes.push("المفتاح اتحرك لحد ما لمس المفتاح اللي جنبه.");
  }
  if (patch.scale !== undefined) next.scale = finite(patch.scale) ? clamp(round3(patch.scale), 1, 1.3) : k.scale;
  if (patch.focusX !== undefined) next.focusX = finite(patch.focusX) ? clamp(round3(patch.focusX), 0, 1) : k.focusX;
  if (patch.focusY !== undefined) next.focusY = finite(patch.focusY) ? clamp(round3(patch.focusY), 0, 1) : k.focusY;
  if (patch.ease === null) delete next.ease;
  else if (patch.ease) next.ease = patch.ease;
  if (next.atFrame === k.atFrame && next.scale === k.scale && next.focusX === k.focusX && next.focusY === k.focusY && next.ease === k.ease) return unchanged(m, undefined, notes);
  return finalize(m, { ...m, camera: m.camera.map((x, i) => (i === index ? next : x)) }, undefined, notes);
}

export function deleteCameraKey(m: EditManifest, index: number): OpResult {
  if (!m.camera[index]) return noItem("مفتاح كاميرا", index);
  return finalize(m, { ...m, camera: removeAt(m.camera, index) });
}



type Transition = NonNullable<EditManifest["transitions"]>[number];
export const TRANSITION_DEFAULTS: Record<TransitionKind, { durationInFrames: number; dir?: TransitionDir }> = {
  whiteout: { durationInFrames: 8 },
  leak: { durationInFrames: 16 },
  bloom: { durationInFrames: 16 },
  burn: { durationInFrames: 16 },
  "whip-pan": { durationInFrames: 14, dir: "rtl" },
  "clip-wipe": { durationInFrames: 14, dir: "rtl" },
  "light-scan": { durationInFrames: 16, dir: "rtl" },
  "hue-crossfade": { durationInFrames: 12 },
};
const isEntrance = (kind: string) => (GRAPHICS_ENTRANCE_KINDS as readonly string[]).includes(kind);


function sceneStartFor(m: EditManifest, frame: number) {
  return m.scenes.find((s) => frame >= s.fromFrame && frame < sceneEnd(s)) ?? m.scenes.find((s) => s.fromFrame >= frame) ?? m.scenes.at(-1);
}

export type TransitionPatch = { atFrame?: number; durationInFrames?: number; kind?: TransitionKind; dir?: TransitionDir | null };


function shapeTransition(m: EditManifest, base: { atFrame: number; durationInFrames: number; kind: TransitionKind; dir?: TransitionDir }): { t: Transition; notes: string[] } | { error: string } {
  const notes: string[] = [];
  const total = totalFrames(m);
  let at = Math.round(base.atFrame);
  let duration = clamp(Math.round(base.durationInFrames), 1, 120);
  if (isSceneAnchoredKind(base.kind)) {
    const scene = sceneStartFor(m, at);
    if (!scene) return { error: `الـ ${base.kind} بيتحط على أول فريم في مشهد، ومفيش مشاهد.` };
    if (scene.fromFrame !== at) notes.push(`الـ ${base.kind} اتحط على أول فريم في المشهد "${scene.id}".`);
    at = scene.fromFrame;
    if (duration > scene.durationInFrames) {
      duration = scene.durationInFrames;
      notes.push("المدة اتقصّت عشان تناسب المشهد.");
    }
  } else {
    at = clamp(at, 0, Math.max(0, total - 1));
  }
  const t: Transition = { atFrame: at, durationInFrames: duration, kind: base.kind };
  if (base.dir && isEntrance(base.kind)) t.dir = base.dir;
  return { t, notes };
}

export function addTransition(m: EditManifest, o: { atFrame: number; kind?: TransitionKind; durationInFrames?: number; dir?: TransitionDir }): OpResult<{ index: number }> {
  const kind = o.kind ?? "whiteout";
  if (!(TRANSITION_KINDS as readonly string[]).includes(kind)) return refuse(`نوع الـ transition لازم يكون واحد من: ${TRANSITION_KINDS.join(" / ")}.`);
  if (!finite(o.atFrame)) return refuse("الفريم لازم يبقى رقم.");
  if (o.dir !== undefined && !(TRANSITION_DIRS as readonly string[]).includes(o.dir)) return refuse(`الاتجاه لازم يكون واحد من: ${TRANSITION_DIRS.join(" / ")}.`);
  const d = TRANSITION_DEFAULTS[kind];
  const shaped = shapeTransition(m, { atFrame: o.atFrame, kind, durationInFrames: o.durationInFrames ?? d.durationInFrames, dir: o.dir ?? d.dir });
  if ("error" in shaped) return refuse(shaped.error);
  const [transitions, index] = insertSorted(m.transitions ?? [], shaped.t, (t) => t.atFrame);
  return finalize(m, { ...m, transitions }, { index }, shaped.notes);
}

export function updateTransition(m: EditManifest, index: number, patch: TransitionPatch): OpResult<{ index: number }> {
  const list = m.transitions ?? [];
  const t = list[index];
  if (!t) return noItem("transition", index);
  const kind = patch.kind ?? t.kind ?? "whiteout";
  if (!(TRANSITION_KINDS as readonly string[]).includes(kind)) return refuse(`نوع الـ transition لازم يكون واحد من: ${TRANSITION_KINDS.join(" / ")}.`);
  const atFrame = patch.atFrame ?? t.atFrame;
  const durationInFrames = patch.durationInFrames ?? t.durationInFrames;
  if (!finite(atFrame) || !finite(durationInFrames)) return refuse("القيمة لازم تبقى رقم.");
  let dir: TransitionDir | undefined = patch.dir === null ? undefined : (patch.dir ?? t.dir);
  if (dir === undefined && isEntrance(kind) && patch.kind && patch.kind !== t.kind) dir = TRANSITION_DEFAULTS[kind].dir;
  const shaped = shapeTransition(m, { atFrame, durationInFrames, kind, dir });
  if ("error" in shaped) return refuse(shaped.error);
  const rest = removeAt(list, index);
  const [transitions, at] = insertSorted(rest, shaped.t, (x) => x.atFrame);
  return finalize(m, { ...m, transitions }, { index: at }, shaped.notes);
}

export function deleteTransition(m: EditManifest, index: number): OpResult {
  const list = m.transitions ?? [];
  if (!list[index]) return noItem("transition", index);
  return finalize(m, { ...m, transitions: removeAt(list, index) });
}



type LayoutTransition = NonNullable<EditManifest["layoutTransitions"]>[number];
export type LayoutTransitionKind = LayoutTransition["kind"];
const DEFAULT_LAYOUT_TRANSITION_FRAMES = 20;


function layoutSides(m: EditManifest, atFrame: number): { from: "presenter" | "split"; to: "presenter" | "split" } | { error: string } {
  if (atFrame < 1) return { error: "الـ layout transition محتاج فريم واحد على الأقل قبله." };
  const from = footageLayoutAt(m, atFrame - 1);
  const to = footageLayoutAt(m, atFrame);
  if (from === "takeover" || to === "takeover" || from === to) return { error: "لازم تقف على حدّ بين مشهد presenter ومشهد split (أو بالعكس). مفيش تغيير layout عند الفريم ده." };
  return { from, to };
}

export function addLayoutTransition(m: EditManifest, o: { atFrame: number; kind?: LayoutTransitionKind; durationInFrames?: number }): OpResult<{ index: number }> {
  if (!finite(o.atFrame)) return refuse("الفريم لازم يبقى رقم.");
  const at = Math.round(o.atFrame);
  const sides = layoutSides(m, at);
  if ("error" in sides) return refuse(sides.error);
  const kind = o.kind ?? (sides.from === "presenter" && sides.to === "split" ? "curtain" : "window-morph");
  const durationInFrames = clamp(Math.round(o.durationInFrames ?? DEFAULT_LAYOUT_TRANSITION_FRAMES), LAYOUT_TRANSITION_MIN_FRAMES, 120);
  const [layoutTransitions, index] = insertSorted(m.layoutTransitions ?? [], { atFrame: at, durationInFrames, kind, ...sides }, (t) => t.atFrame);
  return finalize(m, { ...m, layoutTransitions }, { index });
}

export function updateLayoutTransition(m: EditManifest, index: number, patch: { atFrame?: number; durationInFrames?: number; kind?: LayoutTransitionKind }): OpResult<{ index: number }> {
  const list = m.layoutTransitions ?? [];
  const t = list[index];
  if (!t) return noItem("layout transition", index);
  const atFrame = Math.round(patch.atFrame ?? t.atFrame);
  const duration = patch.durationInFrames ?? t.durationInFrames;
  if (!finite(atFrame) || !finite(duration)) return refuse("القيمة لازم تبقى رقم.");
  const sides = layoutSides(m, atFrame);
  if ("error" in sides) return refuse(sides.error);
  const next: LayoutTransition = { atFrame, durationInFrames: clamp(Math.round(duration), LAYOUT_TRANSITION_MIN_FRAMES, 120), kind: patch.kind ?? t.kind, ...sides };
  const [layoutTransitions, at] = insertSorted(removeAt(list, index), next, (x) => x.atFrame);
  return finalize(m, { ...m, layoutTransitions }, { index: at });
}

export function deleteLayoutTransition(m: EditManifest, index: number): OpResult {
  const list = m.layoutTransitions ?? [];
  if (!list[index]) return noItem("layout transition", index);
  return finalize(m, { ...m, layoutTransitions: removeAt(list, index) });
}
