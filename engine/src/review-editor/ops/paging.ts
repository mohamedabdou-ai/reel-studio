export function growLimit(limit: number, page: number, ...needed: number[]): number {
  const furthest = Math.max(-1, ...needed);
  return furthest >= limit ? furthest + page : limit;
}
