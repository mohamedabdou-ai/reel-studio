// Installs the pinned FFmpeg build: the gyan.dev archive is unpacked with the pinned official 7zr, because the tar that
// ships with Windows 10 cannot read 7z. Both programs are checked in a staging folder before they replace Tools/bin.
import {execFile} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {downloadVerified, renameWithRetry} from './studio-download.mjs';

const execFileAsync = promisify(execFile);
export const REQUIRED_FILTERS = Object.freeze(['ebur128', 'loudnorm', 'sidechaincompress']);
const PROGRAMS = Object.freeze(['ffmpeg.exe', 'ffprobe.exe']);
const failure = (message, reason) => Object.assign(new Error(message), {reason});
const firstLine = value => String(value ?? '').split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? '';

export function ffmpegPaths(root, pins) {
  const at = relative => path.join(root, ...relative.split('/'));
  const base = `ffmpeg-${pins.version}-full_build`;
  return {
    base,
    archive: at(`state/cache/downloads/${base}.7z`),
    extractor: at(`state/cache/tools/7zr-${pins.extractor.version}.exe`),
    bin: at('Tools/bin'),
    report: at('Tools/bin/ffmpeg-install.json'),
    tmp: at('state/tmp'),
  };
}

export async function unpackWith7zr({sevenZip, archive, base, destination, exec = execFileAsync}) {
  const entries = PROGRAMS.map(name => path.win32.join(base, 'bin', name));
  try {
    await exec(sevenZip, ['e', archive, `-o${destination}`, '-y', '-bso0', '-bsp0', ...entries], {windowsHide: true, maxBuffer: 16 * 1024 * 1024});
  } catch (error) {
    if (typeof error.code === 'string') throw error; // The program could not start (for example antivirus): keep the system code.
    throw Object.assign(failure(`7zr could not unpack ${path.basename(archive)}: ${firstLine(error.stderr) || error.message}`, 'extract'), {outputTail: String(error.stderr ?? '').slice(-4096)});
  }
}

export async function checkFfmpeg(ffmpeg, version, {exec = execFileAsync} = {}) {
  const run = async args => {
    try { return await exec(ffmpeg, args, {windowsHide: true, maxBuffer: 64 * 1024 * 1024}); }
    catch (error) {
      if (typeof error.code === 'string') throw error;
      throw failure(`The unpacked ffmpeg.exe did not run: ${firstLine(error.stderr) || error.message}`, 'extract');
    }
  };
  const about = await run(['-version']);
  if (!about.stdout.startsWith(`ffmpeg version ${version}`)) throw failure(`Unexpected FFmpeg version: ${firstLine(about.stdout)}`, 'extract');
  const filters = await run(['-hide_banner', '-filters']);
  for (const filter of REQUIRED_FILTERS) if (!`${filters.stdout}${filters.stderr}`.includes(filter)) throw failure(`Missing required filter: ${filter}`, 'extract');
}

export async function installPinnedFfmpeg(pins, {root, log = () => {}, download = downloadVerified, unpack = unpackWith7zr, check = checkFfmpeg, rename = renameWithRetry}) {
  const paths = ffmpegPaths(root, pins);
  await download({url: pins.url, sha256: pins.sha256, bytes: pins.bytes, target: paths.archive, log});
  const {extractor} = pins;
  await download({url: extractor.url, sha256: extractor.sha256, bytes: extractor.bytes, target: paths.extractor, log});
  log(`ffmpeg: archive verified, unpacking with 7zr ${extractor.version}`);
  await fs.mkdir(paths.tmp, {recursive: true});
  const staging = await fs.mkdtemp(path.join(paths.tmp, 'ffmpeg-install-'));
  try {
    await unpack({sevenZip: paths.extractor, archive: paths.archive, base: paths.base, destination: staging});
    for (const name of PROGRAMS) {
      if (!(await fs.stat(path.join(staging, name)).catch(() => null))?.isFile()) throw failure(`${name} is missing from ${path.basename(paths.archive)}`, 'extract');
    }
    await check(path.join(staging, 'ffmpeg.exe'), pins.version);
    await fs.mkdir(paths.bin, {recursive: true});
    // Invalidate the previous success before replacing either program.
    await fs.rm(paths.report, {force: true});
    for (const name of PROGRAMS) await rename(path.join(staging, name), path.join(paths.bin, name)); // Replaces an older copy in place.
  } finally {
    await fs.rm(staging, {recursive: true, force: true, maxRetries: 3}).catch(() => {});
  }
  const report = {
    ok: true, version: pins.version, build: 'full', url: pins.url, archiveSha256: pins.sha256, extractor: `${extractor.name} ${extractor.version}`,
    ffmpeg: path.join(paths.bin, 'ffmpeg.exe'), ffprobe: path.join(paths.bin, 'ffprobe.exe'), filters: [...REQUIRED_FILTERS],
  };
  await fs.writeFile(paths.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.rm(paths.archive, {force: true});
  return report;
}
