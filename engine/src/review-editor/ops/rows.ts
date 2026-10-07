import type { EditManifest } from "../../prepared-edit/schema.ts";
import type { OpFail, OpResult } from "./result.ts";

export const STALE_ROW: OpFail = { ok: false, reason: "الصف ده اتغيّر وانت بتكتب. راجع القيمة وجرّب تاني." };


export function findRow<T>(list: readonly T[] | undefined, row: T, hint: number): number {
  if (!list) return -1;
  return list[hint] === row ? hint : list.indexOf(row);
}


export function onRow<T, R extends object>(
  pick: (m: EditManifest) => readonly T[] | undefined,
  row: T,
  hint: number,
  fn: (m: EditManifest, index: number) => OpResult<R>,
): (m: EditManifest) => OpResult<R> {
  return (m) => {
    const i = findRow(pick(m), row, hint);
    return i < 0 ? STALE_ROW : fn(m, i);
  };
}
