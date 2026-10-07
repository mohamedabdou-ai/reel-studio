export type StaticFile = { name: string; lastModified: number; sizeInBytes: number };

declare global {
  var __REVIEW_STATIC_FILES__: StaticFile[] | undefined;
}

export const getStaticFiles = (): StaticFile[] => globalThis.__REVIEW_STATIC_FILES__ ?? [];
