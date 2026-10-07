export const BALANCE_SLACK = 8;










export const narrowestWidth = (holds: (width: number) => boolean, lo: number, hi: number, slack: number = BALANCE_SLACK): number => {
  let below = Math.max(1, Math.floor(lo));
  let above = Math.floor(hi);
  if (below >= above) return hi;
  if (holds(below)) return Math.min(hi, below + slack);
  while (above - below > 2) {
    const mid = Math.floor((below + above) / 2);
    if (holds(mid)) above = mid;
    else below = mid;
  }
  return Math.min(hi, above + slack);
};
