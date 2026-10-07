import type { EditManifest } from "../../prepared-edit/schema.ts";
import type { SelectionTarget } from "../types.ts";

export type DeleteOutcome = { manifest: EditManifest; label: string } | { error: string };

const OVERLAY = ["whiteout", "leak", "bloom", "burn"];

export function deleteSelection(m: EditManifest, sel: SelectionTarget): DeleteOutcome {
  switch (sel.kind) {
    case "sound":
      if (!m.sounds[sel.index]) return { error: "الصوت ده مش موجود." };
      return { manifest: { ...m, sounds: m.sounds.filter((_, i) => i !== sel.index) }, label: "مسح صوت" };
    case "camera":
      if (!m.camera[sel.index]) return { error: "مفتاح الكاميرا ده مش موجود." };
      return { manifest: { ...m, camera: m.camera.filter((_, i) => i !== sel.index) }, label: "مسح مفتاح كاميرا" };
    case "transition":
      if (!m.transitions?.[sel.index]) return { error: "الـ transition ده مش موجود." };
      return { manifest: { ...m, transitions: m.transitions.filter((_, i) => i !== sel.index) }, label: "مسح transition" };
    case "layoutTransition":
      if (!m.layoutTransitions?.[sel.index]) return { error: "الـ layout transition ده مش موجود." };
      return { manifest: { ...m, layoutTransitions: m.layoutTransitions.filter((_, i) => i !== sel.index) }, label: "مسح layout transition" };
    case "scene": {
      const scene = m.scenes.find((s) => s.id === sel.id);
      if (!scene) return { error: "المشهد ده مش موجود." };
      const next: EditManifest = { ...m, scenes: m.scenes.filter((s) => s.id !== sel.id) };
      if (m.transitions) next.transitions = m.transitions.filter((t) => !(t.atFrame === scene.fromFrame && !OVERLAY.includes(t.kind)));
      if (m.footage?.pip?.sceneIds.includes(sel.id)) {
        const left = m.footage.pip.sceneIds.filter((id) => id !== sel.id);
        if (left.length) next.footage = { ...m.footage, pip: { ...m.footage.pip, sceneIds: left } };
        else { const { pip: _dropped, ...rest } = m.footage; next.footage = rest as NonNullable<EditManifest["footage"]>; }
      }
      return { manifest: next, label: `مسح مشهد «${sel.id}»` };
    }
    case "word":
      return { error: "الكلمات بتتعدّل من بانل الكابشن (كلامك مبيتغيّرش من التايم لاين)." };
    case "segment":
      return { error: "القص بيتعدّل من بانل القص: مسحه بيغيّر توقيت كل حاجة بعده." };
  }
}
