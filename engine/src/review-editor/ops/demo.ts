import { creativeGalleryDefaults } from "../../creative-kit/schema.ts";
import {semanticTemplateData} from '../../creative-kit/semantic/schema.ts';


export const TEMPLATE_DATA: Record<string, unknown> = {
  ...semanticTemplateData,
  intro: creativeGalleryDefaults.intro,
  proof: creativeGalleryDefaults.proof,
  process: creativeGalleryDefaults.process,
  comparison: creativeGalleryDefaults.comparison,
  comment: creativeGalleryDefaults.comment,
  follow: creativeGalleryDefaults.follow,
};





const REAL_VALUES: ReadonlySet<string> = new Set(["follow.handle"]);


export function sceneDemoFields(scene: { family: string; data: unknown }): string[] {
  const demo = TEMPLATE_DATA[scene.family];
  if (!demo) return [];
  const out: string[] = [];
  const walk = (d: unknown, a: unknown, path: (string | number)[]) => {
    if (typeof d === "string") {
      if (a === d && !REAL_VALUES.has(`${scene.family}.${path.join(".")}`)) out.push(path.join("."));
    } else if (Array.isArray(d)) {
      if (Array.isArray(a)) d.forEach((x, i) => walk(x, a[i], [...path, i]));
    } else if (d && typeof d === "object" && a && typeof a === "object") {
      for (const k of Object.keys(d)) walk((d as Record<string, unknown>)[k], (a as Record<string, unknown>)[k], [...path, k]);
    }
  };
  walk(demo, scene.data, []);
  return out;
}

export type DemoScene = { index: number; id: string; family: string; fields: string[] };


export function demoScenes(m: { scenes: readonly { id: string; family: string; data: unknown }[] }): DemoScene[] {
  const out: DemoScene[] = [];
  m.scenes.forEach((scene, index) => {
    const fields = sceneDemoFields(scene);
    if (fields.length) out.push({ index, id: scene.id, family: scene.family, fields });
  });
  return out;
}
