import type { EditManifest } from "../prepared-edit/schema.ts";
import { ApiError, token as pageToken } from "./api.ts";
import {
  TOKEN_HEADER,
  type DiskResponse, type ExportModeId, type HistoryEntry, type JobEvent, type JobStarted, type ProjectResponse, type SaveResponse, type ValidationResult,
} from "./types.ts";

export { ApiError };






export class ApiCallError extends ApiError {
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(status, body as { error?: string });
    this.body = body;
  }
}


export function activeJobIdOf(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const id = (error as Partial<ApiCallError>).body?.activeJobId;
  return typeof id === "string" && id !== "" ? id : null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "text">>;
export type EventSourceLike = {
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  readyState: number;
  close(): void;
};
export type EventSourceFactory = (url: string) => EventSourceLike;

export class ConnectionError extends Error {
  timedOut: boolean;
  constructor(message: string, timedOut = false) {
    super(message);
    this.name = "ConnectionError";
    this.timedOut = timedOut;
  }
}

export type ConnectionState = { online: boolean; reason: null | "offline" | "unauthorized"; since: number | null; error: string | null };

export type WatchHandlers = {
  onEvent: (event: JobEvent) => void;

  onLost: (info: { closed: boolean }) => void;
  onOpen?: () => void;
};

export type ClientOptions = {
  fetch?: FetchLike;
  token?: string;
  eventSource?: EventSourceFactory;
  now?: () => number;

  timeoutMs?: number;
};

const TERMINAL = new Set(["result", "error", "cancelled"]);
const EVENT_TYPES = new Set(["log", "progress", "result", "error", "cancelled"]);
const EVENT_SOURCE_CLOSED = 2;

export function createApiClient(options: ClientOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const token = options.token ?? "";
  const timeoutMs = options.timeoutMs ?? 30_000;
  const doFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const makeSource: EventSourceFactory = options.eventSource ?? ((url) => new globalThis.EventSource(url) as unknown as EventSourceLike);

  let state: ConnectionState = { online: true, reason: null, since: null, error: null };
  const listeners = new Set<() => void>();
  const setState = (next: ConnectionState) => {
    if (next.online === state.online && next.reason === state.reason) return;
    state = next;
    for (const l of [...listeners]) l();
  };
  const setOnline = () => setState({ online: true, reason: null, since: null, error: null });
  const setOffline = (error: string) => setState({ online: false, reason: "offline", since: state.online ? now() : state.since, error });
  const setUnauthorized = () => setState({ online: false, reason: "unauthorized", since: state.online ? now() : state.since, error: "401" });

  async function call<T>(path: string, opts: { body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
    const post = opts.body !== undefined;
    const controller = new AbortController();
    const forward = () => controller.abort();
    opts.signal?.addEventListener("abort", forward);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, opts.timeoutMs ?? timeoutMs);
    let status: number;
    let ok: boolean;
    let text: string;
    try {
      const res = await doFetch(path, {
        method: post ? "POST" : "GET",
        headers: { [TOKEN_HEADER]: token, ...(post ? { "content-type": "application/json" } : {}) },
        body: post ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
      status = res.status;
      ok = res.ok;
      text = await res.text();
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      const message = timedOut ? "timeout" : error instanceof Error ? error.message : String(error);
      setOffline(message);
      throw new ConnectionError(message, timedOut);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", forward);
    }
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch {                             }
    if (status === 401) setUnauthorized();
    else setOnline();
    if (!ok) throw new ApiCallError(status, data !== null && typeof data === "object" ? (data as Record<string, unknown>) : { error: text.slice(0, 200) });
    return data as T;
  }

  return {
    connection: {
      get: (): ConnectionState => state,
      subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    },

    async ping(): Promise<ConnectionState> {
      try { await call("/api/validate", { body: { manifest: null }, timeoutMs: 4000 }); } catch {                                            }
      return state;
    },
    project: () => call<ProjectResponse>("/api/project"),
    validate: (manifest: EditManifest | unknown) => call<ValidationResult>("/api/validate", { body: { manifest } }),
    save: (manifest: EditManifest, label?: string, baseRevision?: string) => call<SaveResponse>("/api/save", { body: { manifest, ...(label ? { label } : {}), ...(baseRevision ? {baseRevision} : {}) } }),
    history: () => call<HistoryEntry[]>("/api/history"),
    restore: (file: string) => call<{ manifest: EditManifest }>("/api/restore", { body: { file } }),
    prepare: () => call<JobStarted>("/api/prepare", { body: {} }),
    startExport: (mode: ExportModeId) => call<JobStarted>("/api/export", { body: { mode } }),
    cancel: (jobId: string) => call<{ ok: true }>(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { body: {} }),

    disk: (mode: "deliver" | "preview" | "prepare" = "deliver") => call<DiskResponse>(`/api/disk?mode=${mode}`),

    watchJob(jobId: string, handlers: WatchHandlers): { close: () => void } {
      const source = makeSource(`/api/jobs/${encodeURIComponent(jobId)}/events?token=${encodeURIComponent(token)}`);
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        source.onopen = source.onmessage = source.onerror = null;
        source.close();
      };
      source.onopen = () => { if (!closed) handlers.onOpen?.(); };
      source.onmessage = (message) => {
        if (closed) return;
        let event: JobEvent;
        try { event = JSON.parse(message.data) as JobEvent; } catch { return; }
        if (!event || typeof event !== "object" || !EVENT_TYPES.has((event as { type?: string }).type ?? "")) return;
        handlers.onEvent(event);
        if (TERMINAL.has(event.type)) close();
      };
      source.onerror = () => {
        if (closed) return;
        const fatal = source.readyState === EVENT_SOURCE_CLOSED;
        if (fatal) close();
        handlers.onLost({ closed: fatal });
      };
      return { close };
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

let shared: ApiClient | null = null;

export const getClient = (): ApiClient => (shared ??= createApiClient({ token: pageToken }));


export function describeError(error: unknown): string {
  if (error instanceof ConnectionError) return error.timedOut ? "السيرفر مبيردش (عدّى الوقت المسموح)." : "السيرفر مش بيرد. اتأكد إنه لسه شغّال.";
  if (error instanceof ApiError) {
    if (error.status === 401) return "الجلسة انتهت: افتح اللينك الجديد اللي طلع في الـ terminal.";
    if (error.status === 501) return "الخاصية دي لسه مش متوصّلة بالسيرفر.";
    if (error.status === 413) return "الـ manifest كبير أوي على السيرفر.";
    if (error.status === 409) return `فيه تعارض: ${error.message}`;
    if (error.issues.length) return `${error.message} (${error.issues.length} ملاحظة)`;
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
