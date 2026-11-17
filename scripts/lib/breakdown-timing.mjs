import {performance} from 'node:perf_hooks';
const CACHEABLE = new Set(['prepare', 'speech', 'asr', 'presenter', 'shots', 'camera', 'overlays', 'look', 'text', 'sound', 'analysis-cache']);
export function isColdTiming(timing) {
  return timing?.cacheState === 'cold' && Array.isArray(timing.stages) && timing.stages.length > 0
    && timing.stages.every(s => s.state !== 'failed' && s.cacheHit !== true && (s.skipped || !CACHEABLE.has(s.stage) || s.cacheHit === false));
}

export function createRunTiming({clock = () => performance.now()} = {}) {
  const started = clock(), stages = [];
  const record = entry => stages.push({...entry, wallSec: Math.max(0, Math.round(entry.wallSec * 1000) / 1000)});
  return {
    record,
    async stage(stage, operation, metadata = () => ({})) {
      const start = clock();
      try {
        const value = await operation();
        const meta = metadata(value);
        record({stage, wallSec: (clock() - start) / 1000, cacheHit: null, ...meta,
          state: meta.skipped ? 'skipped' : meta.cacheHit === true ? 'warm' : meta.cacheHit === false ? 'cold' : 'uncached'});
        return value;
      } catch (error) {
        record({stage, wallSec: (clock() - start) / 1000, cacheHit: null, state: 'failed'});
        throw error;
      }
    },
    snapshot() {
      const relevant = stages.filter(s => (CACHEABLE.has(s.stage) || typeof s.cacheHit === 'boolean') && !s.skipped);
      const cacheState = !relevant.length || relevant.some(s => typeof s.cacheHit !== 'boolean' || s.state === 'failed') ? 'unknown'
        : relevant.every(s => s.cacheHit) ? 'warm' : relevant.every(s => !s.cacheHit) ? 'cold' : 'mixed';
      return {schema: 1, wallSec: Math.max(0, Math.round(clock() - started) / 1000), cacheState, stages: structuredClone(stages)};
    },
  };
}
