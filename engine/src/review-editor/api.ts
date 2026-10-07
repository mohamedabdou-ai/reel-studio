import { TOKEN_HEADER, type ApiError as ApiErrorBody, type Issue } from "./types.ts";

export const token = new URLSearchParams(globalThis.location?.search ?? "").get("token") ?? "";

export class ApiError extends Error {
  status: number;
  issues: Issue[];
  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.error ?? `HTTP ${status}`);
    this.status = status;
    this.issues = body.issues ?? [];
  }
}


export async function api<T>(path: string, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const post = options.body !== undefined;
  const res = await fetch(path, {
    method: post ? "POST" : "GET",
    headers: { [TOKEN_HEADER]: token, ...(post ? { "content-type": "application/json" } : {}) },
    body: post ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch {                           }
  if (!res.ok) throw new ApiError(res.status, (data as Partial<ApiErrorBody>) ?? { error: text.slice(0, 200) });
  return data as T;
}


export const jobEventsUrl = (jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}/events?token=${encodeURIComponent(token)}`;


export const remember = {
  get(key: string): string | null {
    try { return globalThis.localStorage?.getItem(`review-editor:${key}`) ?? null; } catch { return null; }
  },
  set(key: string, value: string) {
    try { globalThis.localStorage?.setItem(`review-editor:${key}`, value); } catch {              }
  },
};
