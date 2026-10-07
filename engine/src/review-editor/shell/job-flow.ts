import { activeJobIdOf, type ApiClient } from "../api-client.ts";
import type { ProjectResponse } from "../types.ts";
import type { JobAction, JobKind } from "./job-state.ts";

export type JobTarget = { jobId: string; kind: JobKind | null };

export type JobFlow = { dispatch: (action: JobAction) => void; follow: (jobId: string) => void; now?: () => number };

const KINDS: readonly string[] = ["prepare", "preview", "deliver"];
export const asJobKind = (value: unknown): JobKind | null => (typeof value === "string" && KINDS.includes(value) ? (value as JobKind) : null);


export function activeJobOf(project: Pick<ProjectResponse, "activeJob"> | null | undefined): JobTarget | null {
  const job = project?.activeJob;
  return job && typeof job.id === "string" && job.id !== "" ? { jobId: job.id, kind: asJobKind(job.kind) } : null;
}

export function attachToJob(flow: JobFlow, target: JobTarget): void {
  flow.dispatch({ type: "attach", jobId: target.jobId, kind: target.kind, at: (flow.now ?? Date.now)() });
  flow.follow(target.jobId);
}


export function reattachFromError(flow: JobFlow, error: unknown): boolean {
  const jobId = activeJobIdOf(error);
  if (!jobId) return false;
  attachToJob(flow, { jobId, kind: null });
  return true;
}





export async function launchJob(client: Pick<ApiClient, "prepare" | "startExport">, flow: JobFlow, kind: JobKind): Promise<"started" | "attached"> {
  try {
    const { jobId } = kind === "prepare" ? await client.prepare() : await client.startExport(kind);
    flow.dispatch({ type: "started", jobId });
    flow.follow(jobId);
    return "started";
  } catch (error) {
    if (reattachFromError(flow, error)) return "attached";
    throw error;
  }
}
