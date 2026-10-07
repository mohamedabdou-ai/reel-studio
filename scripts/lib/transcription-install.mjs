import './project-tmp.mjs';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT } from './media.mjs';
import { sha256File, transcriptionCacheKey, assertTranscriptionOutputPath, writeTranscriptionJson } from './transcription.mjs';

export const DEFAULT_WHISPER_RELEASE = 'b4938';
export const WHISPER_RUNTIME_FILE = path.join(ROOT, 'Tools', 'whisper-runtime.json');
export const VAD_NAME = 'silero-v6.2.0';
const PINNED_SHA256 = 'c2a4b60edb11f7e11a9191ffb50929535527d4d91c9903dbe3e554583bbbc63d';
const MULTILINGUAL_MODELS = new Set(['tiny', 'base', 'small', 'medium', 'large-v1', 'large-v2', 'large-v3', 'large-v3-turbo']);

export function selectWindowsCpuAsset(release) {
  const asset = release.assets?.find(a => a.name === 'whisper-bin-x64.zip' && a.state === 'uploaded');
  if (!asset) throw new Error(`Release ${release.tag_name} has no uploaded Windows x64 CPU archive.`);
  if (!/^sha256:[a-f0-9]{64}$/i.test(asset.digest ?? '')) throw new Error('Official release has no SHA256 digest; refusing an unverified executable.');
  const expected = `https://github.com/ggml-org/whisper.cpp/releases/download/${release.tag_name}/whisper-bin-x64.zip`;
  if (asset.browser_download_url !== expected) throw new Error('Binary URL is not the official whisper.cpp release asset.');
  return asset;
}

export async function downloadVerifiedFile(url, file, expectedSha256) {
  assertTranscriptionOutputPath(file);
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256 ?? '')) throw new Error('Download requires SHA256.');
  if (fs.existsSync(file) && await sha256File(file) === expectedSha256.toLowerCase()) return { cached: true, sha256: expectedSha256.toLowerCase() };
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status} from ${new URL(url).host}.`);
  const partial = assertTranscriptionOutputPath(`${file}.partial`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
  const actual = await sha256File(partial);
  if (actual !== expectedSha256.toLowerCase()) throw new Error(`SHA256 mismatch for ${path.basename(file)}: expected ${expectedSha256}, received ${actual}. Partial file retained for diagnosis.`);
  await fsp.rename(partial, file);
  return { cached: false, sha256: actual };
}

async function hfModel(repo, name, file) {

  const url = `https://huggingface.co/${repo}/resolve/main/${name}`;
  const metadata = await fetch(url, { method: 'HEAD', redirect: 'manual' });
  const digest = metadata.headers.get('x-linked-etag')?.replaceAll('"', '');
  if (!digest || !/^[a-f0-9]{64}$/i.test(digest)) throw new Error(`No LFS SHA256 for ${name} (HTTP ${metadata.status}).`);
  const result = await downloadVerifiedFile(url, file, digest);
  return { path: file, source: url, ...result };
}

export async function resolveWhisperModel(model, { download = false } = {}) {
  if (!MULTILINGUAL_MODELS.has(model)) throw new Error(`Unsupported multilingual model: ${model}. English-only models cannot preserve Arabic.`);
  const legacy = path.join(ROOT, 'Tools', 'whisper', `ggml-${model}.bin`);
  const modern = path.join(ROOT, 'Tools', 'whisper-models', `ggml-${model}.bin`);
  for (const file of [legacy, modern]) if (fs.existsSync(file)) return { path: file, sha256: await sha256File(file), reused: true };
  if (!download) throw new Error(`Model ${model} is not installed. Run node engine/tools/install-whisper.mjs --model ${model}.`);
  return hfModel('ggerganov/whisper.cpp', `ggml-${model}.bin`, modern);
}

const allFiles = async dir => (await Promise.all((await fsp.readdir(dir, { withFileTypes: true })).map(async entry => entry.isDirectory() ? allFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();

async function hashWhisperRuntime(directory) {
  assertTranscriptionOutputPath(directory);
  const files = await allFiles(directory);
  const executable = files.find(file => path.basename(file).toLowerCase() === 'whisper-cli.exe');
  if (!executable) throw new Error('No whisper-cli.exe found in the installed archive.');
  assertTranscriptionOutputPath(executable);
  const binaryFiles = {};
  for (const file of files.filter(file => /\.(dll|exe)$/i.test(file)).sort()) {
    assertTranscriptionOutputPath(file);
    binaryFiles[path.relative(directory, file)] = await sha256File(file);
  }
  return { executable, binaryFiles };
}

function probeWhisperRuntime({ executable, binaryFiles }) {
  const opts = { encoding: 'utf8', windowsHide: true, cwd: path.dirname(executable), stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 };
  const binaryVersion = execFileSync(executable, ['--version'], opts).trim();
  const helpResult = spawnSync(executable, ['--help'], opts);
  if (helpResult.status !== 0) throw new Error(`whisper --help failed: ${helpResult.stderr}`);
  const help = helpResult.stdout + helpResult.stderr;
  if (!help.includes('--output-json-full') || !help.includes('--dtw')) throw new Error('Installed CLI lacks full JSON or DTW timing support.');
  return {
    executable, binaryVersion, binaryFiles,
    capabilities: { cpu: true, dtwFlag: true, vadFlag: help.includes('--vad-model'), openvinoStatus: 'not_verified', note: 'A CLI flag does not prove a compiled backend. CPU is selected explicitly; only runtime transcription is proof.' },
  };
}

function assertRuntimeHashes(actual, expected) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) || transcriptionCacheKey(actual) !== transcriptionCacheKey(expected)) {
    throw new Error('Whisper binary/DLL hashes differ from the installation manifest or saved runtime. Reinstall or inspect before execution.');
  }
}

export async function inspectWhisperRuntime(directory, options = {}) {
  assertTranscriptionOutputPath(directory);
  let saved;
  try { saved = JSON.parse(await fsp.readFile(path.join(directory, 'install.json'), 'utf8')); }
  catch { throw new Error('Whisper installation manifest is missing or invalid; refusing to execute an unverified installed runtime.'); }
  const actual = await hashWhisperRuntime(directory);
  assertRuntimeHashes(actual.binaryFiles, saved.binaryFiles);
  if (Object.hasOwn(options, 'expectedBinaryFiles')) assertRuntimeHashes(actual.binaryFiles, options.expectedBinaryFiles);
  return probeWhisperRuntime(actual);
}

export async function installWhisper({ releaseTag = DEFAULT_WHISPER_RELEASE, model = 'medium', withVad = false } = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This installer is scoped to the project Windows x64 host.');
  if (!/^(?:b\d+|v\d+\.\d+\.\d+)$/.test(releaseTag)) throw new Error('Use an explicit official release tag, for example b4938.');
  const response = await fetch(`https://api.github.com/repos/ggml-org/whisper.cpp/releases/tags/${releaseTag}`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`Release lookup failed: HTTP ${response.status}. No silent version fallback.`);
  const release = await response.json();
  const asset = selectWindowsCpuAsset(release);
  const digest = asset.digest.slice(7);
  if (releaseTag === DEFAULT_WHISPER_RELEASE && digest !== PINNED_SHA256) throw new Error('Pinned b4938 archive digest changed; inspect the official release before updating.');
  const archive = path.join(ROOT, 'state', 'cache', 'downloads', `whisper-${releaseTag}-x64.zip`);
  await downloadVerifiedFile(asset.browser_download_url, archive, digest);
  const directory = assertTranscriptionOutputPath(path.join(ROOT, 'Tools', `whisper-${releaseTag}`));
  if (!fs.existsSync(path.join(directory, 'install.json'))) {
    await fsp.mkdir(path.join(ROOT, 'Tools'), { recursive: true });
    const staging = await fsp.mkdtemp(path.join(ROOT, 'Tools', `whisper-${releaseTag}.install-`));
    const extraction = `$ErrorActionPreference = 'Stop'\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\n$transcriptZip = [System.IO.Compression.ZipFile]::OpenRead($env:WHISPER_ARCHIVE)\ntry { foreach ($entry in $transcriptZip.Entries) { if ([System.IO.Path]::IsPathRooted($entry.FullName) -or $entry.FullName -match '(^|[\\\\/])\\.\\.([\\\\/]|$)') { throw 'Unsafe archive entry' } } } finally { $transcriptZip.Dispose() }\n[System.IO.Compression.ZipFile]::ExtractToDirectory($env:WHISPER_ARCHIVE, $env:WHISPER_DESTINATION)`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', extraction], { windowsHide: true, stdio: 'pipe', env: { ...process.env, WHISPER_ARCHIVE: archive, WHISPER_DESTINATION: staging }, timeout: 120000 });


    const inspected = probeWhisperRuntime(await hashWhisperRuntime(staging));
    if (fs.existsSync(directory)) throw new Error(`Incomplete install already exists at ${directory}; preserve it for inspection before retrying.`);
    await fsp.rename(staging, directory);
    const record = { schema: 1, releaseTag, releaseUrl: release.html_url, releaseCommit: release.target_commitish, archiveSha256: digest, archiveUrl: asset.browser_download_url, installedAt: new Date().toISOString(), ...inspected, executable: path.join(directory, path.relative(staging, inspected.executable)) };
    await writeTranscriptionJson(path.join(directory, 'install.json'), record);
  }
  const installed = await inspectWhisperRuntime(directory);
  const saved = JSON.parse(await fsp.readFile(path.join(directory, 'install.json'), 'utf8'));
  const modelInfo = await resolveWhisperModel(model, { download: true });
  let previousRuntime = null;
  try { previousRuntime = JSON.parse(await fsp.readFile(WHISPER_RUNTIME_FILE, 'utf8')); } catch {                     }
  let vad = previousRuntime?.vad ?? null;
  if (vad && (!fs.existsSync(vad.path) || await sha256File(vad.path) !== vad.sha256)) vad = null;
  if (withVad) {
    if (!installed.capabilities.vadFlag) throw new Error('Installed binary has no VAD flag.');
    vad = await hfModel('ggml-org/whisper-vad', `ggml-${VAD_NAME}.bin`, path.join(ROOT, 'Tools', 'whisper-models', `ggml-${VAD_NAME}.bin`));
  }
  const previousEvidence = previousRuntime && JSON.stringify(previousRuntime.binaryFiles) === JSON.stringify(installed.binaryFiles) ? previousRuntime.capabilities : {};
  const runtime = { ...saved, ...installed, capabilities: { ...installed.capabilities, ...previousEvidence }, directory, model: { name: model, ...modelInfo }, vad, legacyDirectory: path.join(ROOT, 'Tools', 'whisper') };
  await writeTranscriptionJson(WHISPER_RUNTIME_FILE, runtime);
  return runtime;
}
