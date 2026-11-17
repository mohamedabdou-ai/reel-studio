// One stored word record is one evaluation unit. Normalize Unicode, punctuation
// and whitespace only; never rewrite Arabic letters, spelling or dialect.
const words = captions => captions.map(c => {
  if (typeof c.text !== 'string' || !Number.isFinite(c.startMs) || !Number.isFinite(c.endMs) || c.startMs < 0 || c.endMs < c.startMs) throw new Error('ASR words require text and finite ordered timing.');
  return {...c, text: c.text.normalize('NFKC').replace(/\p{P}/gu, '').trim().replace(/\s+/gu, ' ')};
}).filter(c => c.text);
const stats = errors => {
  const sorted = [...errors].sort((a, b) => a - b);
  return {boundaries: sorted.length, meanMs: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
    p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null, maxMs: sorted.at(-1) ?? null};
};
export function evaluateAsrWords(reference, hypothesis) {
  const a = words(reference), b = words(hypothesis);
  if (!a.length || a.length * b.length > 10_000_000) throw new Error('ASR evaluation needs a nonempty, bounded reference.');
  const dp = Array.from({length: a.length + 1}, () => new Uint32Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + Number(a[i - 1].text !== b[j - 1].text));
  let i = a.length, j = b.length, substitutions = 0, deletions = 0, insertions = 0;
  const aligned = [];
  // Deterministic minimum-edit alignment, preferring diagonal ties. Timing is
  // measured only on exact word matches, with the coverage reported alongside it.
  while (i || j) {
    if (i && j && dp[i][j] === dp[i - 1][j - 1] + Number(a[i - 1].text !== b[j - 1].text)) {
      if (a[i - 1].text !== b[j - 1].text) substitutions++;
      else aligned.push({referenceIndex: i - 1, startErrorMs: Math.abs(a[i - 1].startMs - b[j - 1].startMs), endErrorMs: Math.abs(a[i - 1].endMs - b[j - 1].endMs)});
      i--; j--;
    } else if (i && dp[i][j] === dp[i - 1][j] + 1) { deletions++; i--; }
    else { insertions++; j--; }
  }
  aligned.reverse();
  return {referenceWords: a.length, hypothesisWords: b.length, substitutions, deletions, insertions,
    wer: (substitutions + deletions + insertions) / a.length, matchedWords: aligned.length,
    timing: stats(aligned.flatMap(x => [x.startErrorMs, x.endErrorMs])), aligned};
}
export function assessAsrChange(reference, baseline, candidate) {
  const before = evaluateAsrWords(reference, baseline), after = evaluateAsrWords(reference, candidate);
  const shared = new Set(before.aligned.map(x => x.referenceIndex).filter(i => after.aligned.some(x => x.referenceIndex === i)));
  const common = result => stats(result.aligned.filter(x => shared.has(x.referenceIndex)).flatMap(x => [x.startErrorMs, x.endErrorMs]));
  const commonBefore = common(before), commonAfter = common(after);
  const noRegression = after.wer <= before.wer && after.timing.meanMs !== null && before.timing.meanMs !== null
    && after.timing.meanMs <= before.timing.meanMs && after.timing.p95Ms <= before.timing.p95Ms
    && commonBefore.meanMs !== null && commonAfter.meanMs <= commonBefore.meanMs && commonAfter.p95Ms <= commonBefore.p95Ms;
  return {before, after, commonReferenceWords: shared.size, commonBefore, commonAfter, noRegression};
}
