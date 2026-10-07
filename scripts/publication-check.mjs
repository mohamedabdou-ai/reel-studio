import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {scanPublicationFiles, scanPublicationFile} from './lib/publication-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, options = {}) => {
  const result = spawnSync('git', ['-c', 'core.excludesFile=', '-C', root, ...args], {windowsHide: true, maxBuffer: 128 * 1024 * 1024, ...options});
  if (result.status !== 0) throw new Error('Git read failed: ' + args[0]);
  return result.stdout;
};
const extraIssues = [];
let files;
if (process.argv.includes('--history')) {
  const commits = git(['rev-list', '--all'], {encoding: 'utf8'}).trim().split('\n').filter(Boolean);
  const entries = new Map();
  for (const commit of commits) {
    for (const record of git(['ls-tree', '-rz', commit]).toString('utf8').split('\0')) {
      const match = /^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(record);
      if (match) entries.set(match[1] + ':' + match[2], {sha: match[1], path: match[2]});
    }
    const raw = git(['cat-file', 'commit', commit], {encoding: 'utf8'});
    const split = raw.indexOf('\n\n'), header = raw.slice(0, split), message = raw.slice(split + 2);
    extraIssues.push(...scanPublicationFile('history/commit-' + commit + '.md', Buffer.from(message)));
    for (const field of ['author', 'committer']) {
      const email = new RegExp('^' + field + ' .* <([^>]+)>', 'm').exec(header)?.[1];
      if (!email || !/^(?:[^@]+@users\.noreply\.github\.com|noreply@github\.com)$/.test(email)) extraIssues.push({file: 'history/' + commit, line: 1, rule: 'personal ' + field + ' email'});
    }
  }
  const unique = [...new Set([...entries.values()].map((item) => item.sha))];
  const bytes = unique.length ? git(['cat-file', '--batch'], {input: unique.join('\n') + '\n'}) : Buffer.alloc(0);
  const blobs = new Map();let offset = 0;
  for (const sha of unique) {
    const end = bytes.indexOf(10, offset), header = bytes.subarray(offset, end).toString('utf8').split(' '), size = Number(header[2]);
    offset = end + 1;blobs.set(sha, bytes.subarray(offset, offset + size));offset += size + 1;
  }
  files = [...entries.values()].map((item) => ({path: item.path, data: blobs.get(item.sha)}));
  for (const line of git(['for-each-ref', 'refs/tags', '--format=%(objecttype) %(objectname)'], {encoding: 'utf8'}).trim().split('\n').filter(Boolean)) {
    const [type, sha] = line.split(' ');if (type !== 'tag') continue;
    const raw = git(['cat-file', 'tag', sha], {encoding: 'utf8'}), split = raw.indexOf('\n\n'), header = raw.slice(0, split), message = raw.slice(split + 2);
    extraIssues.push(...scanPublicationFile('history/tag-' + sha + '.md', Buffer.from(message)));
    const email = /^tagger .* <([^>]+)>/m.exec(header)?.[1];
    if (!email || !/^(?:[^@]+@users\.noreply\.github\.com|noreply@github\.com)$/.test(email)) extraIssues.push({file: 'history/tag-' + sha, line: 1, rule: 'personal tagger email'});
  }
} else {
  const paths = git(['ls-files', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
  files = paths.map((relative) => ({path: relative, data: fs.readFileSync(path.join(root, relative))}));
}
const issues = [...scanPublicationFiles(files), ...extraIssues];
process.stdout.write(JSON.stringify({ok: issues.length === 0, files: files.length, issues}, null, 2) + '\n');
process.exitCode = issues.length ? 1 : 0;
