import type { JobEvent, JobResult } from "../types.ts";

export type JobKind = "prepare" | "preview" | "deliver";
export type JobStatus = "idle" | "starting" | "running" | "cancelling" | "done" | "failed" | "cancelled";

export type JobState = {
  status: JobStatus;
  kind: JobKind | null;
  jobId: string | null;

  log: string[];

  logDropped: number;
  pct: number | null;
  stage: string;
  result: JobResult | null;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;

  lostConnection: boolean;
};

export const LOG_CAP = 3000;

export const initialJob: JobState = {
  status: "idle", kind: null, jobId: null, log: [], logDropped: 0, pct: null, stage: "", result: null, error: null, startedAt: null, endedAt: null, lostConnection: false,
};

export type JobAction =
  | { type: "start"; kind: JobKind; at: number }
  | { type: "started"; jobId: string }


  | { type: "attach"; jobId: string; kind: JobKind | null; at: number }
  | { type: "start-failed"; message: string; at: number }
  | { type: "event"; event: JobEvent }
  | { type: "cancel-requested" }
  | { type: "stream-lost" }
  | { type: "stream-restored" }
  | { type: "reset" };

export const isActive = (s: Pick<JobState, "status">): boolean => s.status === "starting" || s.status === "running" || s.status === "cancelling";
export const isFinished = (s: Pick<JobState, "status">): boolean => s.status === "done" || s.status === "failed" || s.status === "cancelled";



const RENDER_MODE = /\bmode (preview|review|deliver):/i;
const kindFromLog = (line: string): JobKind | null => {
  const hit = RENDER_MODE.exec(line);
  return hit ? (hit[1].toLowerCase() === "deliver" ? "deliver" : "preview") : null;
};

const TRIM = 250;
const pushLine = (state: JobState, line: string): Pick<JobState, "log" | "logDropped"> => {
  const full = state.log.length >= LOG_CAP;
  const log = full ? state.log.slice(TRIM) : state.log.slice();
  log.push(line);
  return { log, logDropped: state.logDropped + (full ? TRIM : 0) };
};

export function jobReducer(state: JobState, action: JobAction): JobState {
  switch (action.type) {
    case "start":
      return isActive(state) ? state : { ...initialJob, status: "starting", kind: action.kind, startedAt: action.at };
    case "started":
      return state.status === "starting" ? { ...state, status: "running", jobId: action.jobId } : state;
    case "attach":
      if ((state.status === "running" || state.status === "cancelling") && state.jobId === action.jobId) return state;
      return { ...initialJob, status: "running", kind: action.kind, jobId: action.jobId, startedAt: action.at };
    case "start-failed":
      return { ...state, status: "failed", error: action.message, endedAt: action.at };
    case "cancel-requested":
      return state.status === "running" ? { ...state, status: "cancelling" } : state;
    case "stream-lost":
      return isActive(state) ? { ...state, lostConnection: true } : state;
    case "stream-restored":
      return state.lostConnection ? { ...state, lostConnection: false } : state;
    case "reset":
      return isActive(state) ? state : initialJob;
    case "event": {
      if (isFinished(state) || state.status === "idle") return state;
      const e = action.event;


      const startedAt = state.startedAt === null || e.at < state.startedAt ? e.at : state.startedAt;
      const base: JobState = state.status === "starting" ? { ...state, status: "running", startedAt } : startedAt !== state.startedAt ? { ...state, startedAt } : state;
      switch (e.type) {
        case "log": return { ...base, ...pushLine(base, e.line), kind: base.kind ?? kindFromLog(e.line), lostConnection: false };
        case "progress": return { ...base, pct: Math.min(100, Math.max(0, e.pct)), stage: e.stage, lostConnection: false };
        case "result":
          return e.result.ok
            ? { ...base, status: "done", kind: base.kind ?? e.result.kind, result: e.result, pct: 100, endedAt: e.at, lostConnection: false }
            : { ...base, status: "failed", kind: base.kind ?? e.result.kind, result: e.result, error: "الـ pipeline رفض الشغل. راجع اللوج والنتيجة.", endedAt: e.at, lostConnection: false };
        case "error": return { ...base, ...pushLine(base, e.message), status: "failed", error: e.message, endedAt: e.at, lostConnection: false };
        case "cancelled": return { ...base, status: "cancelled", endedAt: e.at, lostConnection: false };
      }
    }
  }
}
