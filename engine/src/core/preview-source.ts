export type AssetIdentity = { sizeInBytes: number; lastModified: number };
export type ProxyRegistry = Record<string, {
  proxy: string; verified: boolean;
  sourceIdentity?: AssetIdentity; proxyIdentity?: AssetIdentity;
}>;

export function resolvePreviewSource({ source, transparent, isPreview, registry, assets = {} }: {
  source: string; transparent: boolean; isPreview: boolean; registry: ProxyRegistry;
  assets?: Record<string, AssetIdentity>;
}): string {
  const key = source.replace(/\\/g, "/").replace(/^\.\//, "");
  const entry = registry[key];
  const matches = (actual?: AssetIdentity, expected?: AssetIdentity) => Boolean(actual && expected && actual.sizeInBytes === expected.sizeInBytes && actual.lastModified === expected.lastModified);
  return isPreview && !transparent && entry?.verified === true && matches(assets[key], entry.sourceIdentity) && matches(assets[entry.proxy], entry.proxyIdentity) ? entry.proxy : source;
}
