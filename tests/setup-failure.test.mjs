import test from 'node:test';
import assert from 'node:assert/strict';
import {SETUP_FAILURE_REASONS, classifySetupError, setupFailureHint, REASON_HINTS} from '../scripts/lib/setup-failure.mjs';

const withCode = (code, message = `${code}: something`) => Object.assign(new Error(message), {code});
const fetchFailed = code => Object.assign(new TypeError('fetch failed'), {cause: Object.assign(new Error('socket'), {code})});
const child = (message, outputTail) => Object.assign(new Error(message), {outputTail});

test('the reason list is fixed and every reason except unknown has a hint', () => {
  assert.deepEqual(SETUP_FAILURE_REASONS, ['network', 'timeout', 'disk-full', 'file-locked', 'path', 'hash', 'unavailable', 'missing-runtime', 'extract', 'unknown']);
  for (const reason of SETUP_FAILURE_REASONS.filter(reason => reason !== 'unknown')) assert.ok(REASON_HINTS[reason], reason);
});

test('real setup errors map to their reason', () => {
  const cases = [
    [Object.assign(new Error('x'), {reason: 'hash'}), 'hash'],
    [Object.assign(new Error('x'), {reason: 'not-a-reason', code: 'ENOSPC'}), 'disk-full'],
    [withCode('ENOSPC'), 'disk-full'],
    [withCode('EPERM'), 'file-locked'],
    [withCode('EBUSY'), 'file-locked'],
    [withCode('ENAMETOOLONG'), 'path'],
    [fetchFailed('ECONNRESET'), 'network'],
    [fetchFailed('UND_ERR_SOCKET'), 'network'],
    [child('npm-cli.js exited with code 1', 'npm error code EPERM\nnpm error syscall rename\nnpm error errno -4048'), 'file-locked'],
    [child('npm-cli.js exited with code 1', 'npm error code ENOSPC\nnpm error syscall write'), 'disk-full'],
    [child('npm-cli.js exited with code 1', 'npm error code ETIMEDOUT\nnpm error network request to https://registry.npmjs.org/x failed'), 'network'],
    [child('npm-cli.js exited with code 1', 'npm error code E404\nnpm error 404 Not Found'), 'unavailable'],
    [child('node exited with code 1', 'Error: getaddrinfo ENOTFOUND storage.googleapis.com'), 'network'],
    [new Error('whisper-cli.exe could not start because a required DLL is missing, most likely the Microsoft Visual C++ Redistributable (x64).'), 'missing-runtime'],
    [new Error('npm-cli.js did not finish within 3600 s and was stopped'), 'timeout'],
    [new Error('engine/node_modules must be a regular project-local directory, without junctions or symlinks.'), 'path'],
    [new Error('The render browser does not match its pinned SHA-256 (149.0.7790.0); it was removed.'), 'hash'],
    [new Error('There is not enough space on the disk.'), 'disk-full'],
    [new Error('فيه package.json في D:\\ فوق فولدر الاستوديو، فالرندر هيدوّر على المتصفح برّه الفولدر.'), 'path'],
    [new Error('Download failed (HTTP 422)'), 'unavailable'],
    [new Error('7zr could not unpack ffmpeg-8.1.2-full_build.7z: ERROR: Data Error : ffmpeg.exe'), 'extract'],
    [new Error('The unpacked ffmpeg.exe did not run: Command failed'), 'extract'],
    [new Error('ffmpeg.exe is missing from ffmpeg-8.1.2-full_build.7z'), 'extract'],
    [new Error('ffprobe.exe is missing from ffmpeg-8.1.2-full_build.7z'), 'extract'],
    [child('install-ffmpeg.mjs exited with code 1', 'The unpacked ffmpeg.exe did not run: Command failed'), 'extract'],
    [new Error('worker did not run'), 'unknown'],
    [new Error('model.bin is missing from models.zip'), 'unknown'],
    [new Error('ffprobe.exe is missing from runtime.zip'), 'unknown'],
    [new Error('Missing required file: config.json'), 'unknown'],
    [new Error('7zr.exe exited with code 2'), 'extract'],
    [new Error('Unexpected FFmpeg version'), 'extract'],
    [new Error('Missing required filter: loudnorm'), 'extract'],
    [withCode('EEXIST', "EEXIST: file already exists, mkdir 'D:\\x\\Raw'"), 'unknown'],
    [withCode('constructor'), 'unknown'],
    [withCode('toString'), 'unknown'],
    [null, 'unknown'],
  ];
  for (const [error, reason] of cases) assert.equal(classifySetupError(error), reason, String(error?.message ?? error));
});

test('the status hint prefers a ready line, then the reason hint, then the old line', () => {
  assert.equal(setupFailureHint({reason: 'disk-full', hint: 'سطر جاهز', error: 'x'}), 'سطر جاهز');
  assert.equal(setupFailureHint({reason: 'network', error: 'x'}), REASON_HINTS.network);
  assert.equal(setupFailureHint({reason: 'constructor', error: 'x'}), 'x. شغّل setup تاني وهيكمّل من مكانه.');
  const old = 'install-ffmpeg.mjs exited with code 1. شغّل setup تاني وهيكمّل من مكانه.';
  assert.equal(setupFailureHint({reason: 'unknown', error: 'install-ffmpeg.mjs exited with code 1'}), old);
  assert.equal(setupFailureHint({error: 'install-ffmpeg.mjs exited with code 1'}), old, 'a state saved by an older studio keeps its line');
});
