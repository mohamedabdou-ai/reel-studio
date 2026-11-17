import {promises as fsp} from 'node:fs';
import {createHash} from 'node:crypto';

// Only a complete, valid, nonempty 16-bit mono 16 kHz PCM data chunk can
// establish digital silence. One nonzero sample, however quiet, prevents it.
export async function exactPcmSilence(file, expectedSha256) {
  const handle = await fsp.open(file, 'r');
  try {
    const before = await handle.stat(), hash = createHash('sha256');
    const bytes = await handle.readFile();
    hash.update(bytes);
    if (expectedSha256 && hash.digest('hex') !== expectedSha256) throw new Error('Prepared PCM changed before speech analysis.');
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) throw new Error('PCM changed while checking silence.');
    if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
      || bytes.readUInt32LE(4) + 8 !== bytes.length) return false;
    let format = false, data = null;
    for (let at = 12; at < bytes.length;) {
      if (at + 8 > bytes.length) return false;
      const size = bytes.readUInt32LE(at + 4), end = at + 8 + size;
      if (end > bytes.length) return false;
      const kind = bytes.toString('ascii', at, at + 4);
      if (kind === 'fmt ') {
        if (format || size < 16 || bytes.readUInt16LE(at + 8) !== 1 || bytes.readUInt16LE(at + 10) !== 1
          || bytes.readUInt32LE(at + 12) !== 16000 || bytes.readUInt32LE(at + 16) !== 32000
          || bytes.readUInt16LE(at + 20) !== 2 || bytes.readUInt16LE(at + 22) !== 16) return false;
        format = true;
      }
      if (kind === 'data') {
        if (data !== null || size === 0 || size % 2) return false;
        data = bytes.subarray(at + 8, end);
      }
      at = end + size % 2;
    }
    if (!format || data === null) return false;
    return data.every(byte => byte === 0);
  } finally { await handle.close(); }
}
