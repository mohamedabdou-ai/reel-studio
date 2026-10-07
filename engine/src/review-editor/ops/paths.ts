export type Path = readonly (string | number)[];

export function getIn(root: unknown, path: Path): unknown {
  let cur: any = root;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[key as any];
  }
  return cur;
}


export function setIn<T>(root: T, path: Path, value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  const base: any = root ?? (typeof head === "number" ? [] : {});
  const child = setIn(base[head as any], rest, value);
  if (Array.isArray(base)) {
    const copy = base.slice();
    copy[head as number] = child;
    return copy as unknown as T;
  }
  return { ...base, [head]: child } as T;
}


export function removeIn<T>(root: T, path: Path): T {
  if (!path.length) return root;
  const [head, ...rest] = path;
  const base: any = root;
  if (base === null || typeof base !== "object" || !(head in base)) return root;
  if (rest.length) {
    const child = removeIn(base[head as any], rest);
    if (child === base[head as any]) return root;
    if (Array.isArray(base)) {
      const copy = base.slice();
      copy[head as number] = child;
      return copy as unknown as T;
    }
    return { ...base, [head]: child } as T;
  }
  if (Array.isArray(base)) return base.filter((_, i) => i !== head) as unknown as T;
  const { [head as string]: _gone, ...others } = base;
  return others as T;
}


export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual((a as any)[k], (b as any)[k])) return false;
  return true;
}
