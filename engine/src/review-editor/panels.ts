import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";
import type { EditManifest } from "../prepared-edit/schema.ts";
import type { ApplyFn } from "./store.ts";
import type { Issue, ProjectResponse, Selection, SelectionTarget } from "./types.ts";

export type PanelProps = {
  manifest: EditManifest;
  apply: ApplyFn;

  playhead: number;

  seek: (frame: number) => void;
  selection: Selection;
  select: (selection: Selection) => void;

  issues: Issue[];

  project: ProjectResponse;
};


export type DeleteContext = { selection: SelectionTarget; manifest: EditManifest; apply: ApplyFn };

export type PanelDef = {

  id: string;

  title: string;

  order: number;
  Component: ComponentType<PanelProps>;






  onDelete?: (ctx: DeleteContext) => boolean;
};

const panels = new Map<string, PanelDef>();
const listeners = new Set<() => void>();
let sorted: PanelDef[] = [];

const changed = () => {
  sorted = [...panels.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const l of [...listeners]) l();
};


export function registerPanel(def: PanelDef): () => void {
  panels.set(def.id, def);
  changed();
  return () => {
    if (panels.get(def.id) === def) {
      panels.delete(def.id);
      changed();
    }
  };
}


export const getPanels = (): readonly PanelDef[] => sorted;


export function runPanelDelete(ctx: DeleteContext): boolean {
  for (const panel of sorted) {
    try {
      if (panel.onDelete?.(ctx)) return true;
    } catch (error) {
      console.error(`panel "${panel.id}" onDelete failed`, error);
    }
  }
  return false;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};


export const usePanels = (): readonly PanelDef[] => useSyncExternalStore(subscribe, getPanels, getPanels);
