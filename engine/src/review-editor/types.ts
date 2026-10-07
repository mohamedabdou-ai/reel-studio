import type { EditManifest } from "../prepared-edit/schema.ts";
import type { HeadGuide } from "../prepared-edit/head-guide.ts";

export type { EditManifest };

export const TOKEN_HEADER = "x-review-token";

export const EDIT_HISTORY_KEEP = 30;

export const UNDO_CAP = 200;

export const COALESCE_MS = 400;



export type IssueSeverity = "error" | "warning";

export type IssueStage = "schema" | "timeline" | "delivery";

export type Issue = {

  path: string;

  where: string;

  message: string;
  severity: IssueSeverity;
  stage: IssueStage;

  code: string;

  detail?: string;
};

export type ValidationResult = {

  ok: boolean;

  deliveryReady: boolean;
  issues: Issue[];
};




export type SelectionTarget =
  | { kind: "scene"; id: string }
  | { kind: "segment"; index: number }
  | { kind: "word"; index: number }
  | { kind: "sound"; index: number }
  | { kind: "camera"; index: number }
  | { kind: "transition"; index: number }
  | { kind: "layoutTransition"; index: number };
export type Selection = SelectionTarget | null;




export type EditorSnapshot = {
  manifest: EditManifest;

  savedManifest: EditManifest;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;

  undoLabel: string | null;
  redoLabel: string | null;

  revision: number;
  selection: Selection;

  playhead: number;

  seekNonce: number;

  durationInFrames: number;
};



export type PlateInfo = {

  src: string;
  width: number;
  height: number;


  segments: { fromFrame: number; toFrame: number }[];
  sourceSha256: string;

  proxySrc?: string;
};

export type ExportModeId = "preview" | "deliver";
export type ExportModeInfo = { id: ExportModeId; label: string; available: boolean; reason?: string };
export type RecipeInfo = { id: string; name: string; use: string; duration: number };

export type ProjectResponse = {
  slug: string;

  manifestPath: string;
  manifest: EditManifest;

  manifestRevision?: string;

  plate: PlateInfo | null;
  needsPrepare: boolean;
  needsPrepareReason?: "never-prepared" | "stale-plate";

  staticFiles: string[];
  hasMotionPlan: boolean;
  motionPlanPath: string | null;
  exportModes: ExportModeInfo[];

  recipes: string[];
  recipeInfo: RecipeInfo[];

  headGuide?: HeadGuide;

  warnings: string[];



  activeJob?: { id: string; kind?: "prepare" | "preview" | "deliver" } | null;
};


export type SaveResponse = { ok: true; path: string; backup: string | null; savedAt: string; manifestRevision?: string };


export type HistoryEntry = { file: string; savedAt: string; label?: string };
export type JobStarted = { jobId: string };

export type JobResult = {
  ok: boolean;
  kind: "prepare" | "preview" | "deliver";

  output?: string;
  qc?: string;
  safeReport?: string | null;


  gates?: {
    encode: boolean | null;
    safe: boolean | null;
    motion: unknown;
    head?: { status: string; ran?: boolean; reason?: string | null; counts?: unknown } | null;
    plates?: { level: string; action?: string; messages: string[] } | null;
  };

  seconds?: number;

  sizeBytes?: number;

  durationSec?: number | null;

  warnings?: string[];

  needsReview?: boolean;

  plate?: string;
  plateCached?: boolean;
};









export type JobEvent =
  | { type: "log"; line: string; at: number }
  | { type: "progress"; pct: number; stage: string; at: number }
  | { type: "result"; result: JobResult; at: number }
  | { type: "error"; message: string; at: number }
  | { type: "cancelled"; at: number };

export type DiskResponse = {
  freeDiskBytes: number;
  freeRamBytes: number;

  neededDiskBytes?: number;
  ok: boolean;

  message: string;
};

export type ApiError = { error: string; issues?: Issue[] };
