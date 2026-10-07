import type {EditManifest} from "../../prepared-edit/schema.ts";
import type {EditorStore} from "../store.ts";
import type {ProjectResponse} from "../types.ts";
import {parseManifest} from "../validate.ts";
import {fingerprint} from "./draft.ts";

export type ChangeKind = "cuts" | "captions" | "scenes" | "motion" | "sound" | "style" | "preview";
export type LiveProjectStatus = {enabled: boolean; pending: boolean; changes: ChangeKind[]; updatedAt: number | null};

function changesBetween(before: ProjectResponse, next: ProjectResponse): ChangeKind[] {
  const a = before.manifest, b = next.manifest;
  const changed = (x: unknown, y: unknown) => fingerprint(x) !== fingerprint(y);
  const changes: ChangeKind[] = [];
  if (changed(a.segments, b.segments)) changes.push("cuts");
  if (changed(a.captions, b.captions)) changes.push("captions");
  if (changed(a.scenes, b.scenes)) changes.push("scenes");
  if (changed([a.camera, a.transitions], [b.camera, b.transitions])) changes.push("motion");
  if (changed(a.sounds, b.sounds)) changes.push("sound");
  if (changed([a.style, a.brand, a.fontFamily, a.footage], [b.style, b.brand, b.fontFamily, b.footage])) changes.push("style");
  if (!next.needsPrepare && changed(before.plate, next.plate)) changes.push("preview");
  return changes;
}

export function createProjectFollower(options: {
  store: EditorStore; initial: ProjectResponse; blocked: () => boolean;
  onProject: (project: ProjectResponse) => void; onStatus: (status: LiveProjectStatus) => void; now?: () => number;
}) {
  let baseline = options.initial;
  let latest: ProjectResponse | null = null;
  let status: LiveProjectStatus = {enabled: true, pending: false, changes: [], updatedAt: null};
  const notify = (patch: Partial<LiveProjectStatus>) => {
    const next = {...status, ...patch};
    if (fingerprint(next) === fingerprint(status)) return;
    status = next; options.onStatus(status);
  };
  function accept(next: ProjectResponse, force = false) {
    const sameManifest = fingerprint(baseline.manifest) === fingerprint(next.manifest);
    if (!sameManifest && !force && (!status.enabled || options.blocked() || options.store.getSnapshot().dirty)) {
      latest = next; notify({pending: true}); return;
    }
    const changed = changesBetween(baseline, next);
    if (fingerprint(baseline) !== fingerprint(next)) {
      if (!sameManifest) {
        options.store.replace(next.manifest);
        options.store.select(null);
      }
      baseline = next;
      options.onProject(next);
    }
    latest = null;
    notify({pending: false, ...(changed.length ? {changes: changed, updatedAt: (options.now ?? Date.now)()} : {})});
  }
  return {
    receive(next: ProjectResponse) {
      if (next.manifestPath !== baseline.manifestPath || next.slug !== baseline.slug || !parseManifest(next.manifest)) return;
      accept(next);
    },
    setEnabled(enabled: boolean) {notify({enabled}); if (enabled && latest) accept(latest);},

    acceptLatest() {if (latest) {notify({enabled: true}); accept(latest, true);}},
    getLatest: () => latest,
    getProject: () => baseline,
    getStatus: () => status,
    saved(manifest: EditManifest, revision?: string) {

      baseline = {...baseline, manifest: parseManifest(manifest) ?? manifest, ...(revision ? {manifestRevision: revision} : {})};
      latest = null; options.onProject(baseline); notify({pending: false});
    },
  };
}
