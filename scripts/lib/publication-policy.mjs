const textFile = /\.(?:mjs|cjs|js|ts|tsx|json|md|css|html|ps1|cmd|txt|svg|yml|yaml)$|(?:^|\/)(?:LICENSE|\.gitignore|\.prettierrc|\.env\.(?:example|template))$|^\.githooks\//i;
const privatePath = /^(?:Raw|Reference|Projects|Outputs|Tools|state|\.cache|\.superpowers)\/|(?:^|\/)(?:node_modules|\.git)\/|(?:^|\/)PROFILE\.json$|^docs\/superpowers\/.+/i;
const rules = [
  ['personal machine path', /[A-Z]:[\\/](?:Users|Documents and Settings)[\\/][A-Za-z0-9_-]+|\b[A-Z]:[\\/][^\r\n"']*(?:Raw|Outputs|Projects)[\\/]/i],
  ['personal hardware record', /\bi[3579]-\d{4,5}[A-Z]{0,3}\b|\bIris\s+Xe\b|\b(?:this|my|our)\s+(?:machine|rig|laptop)\b/i],
  ['private production reference', /\b(?:raw|vox|final|preview)[-_ ]?\d{1,2}\b|\bRaw[\\/]\d{1,3}\.(?:mp4|mov)\b|\bOutputs[\\/](?!<|(?:example|demo|test|sample|my-video)(?:[\\/.]))[^\s`"'|]+\.(?:mp4|mov|wav)\b/i],
  ['private plan reference', /docs[\\/]superpowers[\\/]plans[\\/][^\s`"')]+|docs[\\/]APPROVED_CREATIVE_DIRECTION|\bStyles[\\/][^\s`"')]+STYLE_DNA\.md/i],
  ['internal production record', /creator\s+specifically\s+selected|creator's\s+requested\s+review|requested\s+review\s+of\s*`?Outputs|Source\s+SHA-256|source\s+MP4\s+was\s+read|accepted\s+private\s+edit|whole-branch\s+review|\b(?:audit|measured|verified|checked|QA|review|migration|amendment|rejections?)\b[^\r\n]{0,90}20\d\d-\d\d-\d\d|\bT\d+\s*\/\s*T\d+\b/i],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['credential token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{35}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|xox[abprs]-[A-Za-z0-9-]{10,})\b/],
];

export function scanPublicationFile(file, data) {
  const issues = [];
  if (privatePath.test(file)) issues.push({file, line: 1, rule: 'private tracked path'});
  if (/(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx)$/i.test(file) && !/\.env\.(?:example|template)$/i.test(file)) issues.push({file, line: 1, rule: 'credential file'});
  if (!textFile.test(file)) return issues;
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(data); }
  catch { return [...issues, {file, line: 1, rule: 'invalid UTF-8'}]; }
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) issues.push({file, line: 1, rule: 'UTF-8 BOM'});
  for (const [rule, pattern] of rules) {
    if (/^(?:third-party\/|engine\/src\/motion-library\/vendor\/)/.test(file) && !['private key', 'credential token'].includes(rule)) continue;
    const match = pattern.exec(text);
    if (match) issues.push({file, line: text.slice(0, match.index).split('\n').length, rule});
  }
  if (file === 'PROFILE.example.json') {
    try {
      const value = JSON.parse(text);
      if (value.handle !== null || value.ending?.signOff !== null || value.ending?.ctaDefault !== null) issues.push({file, line: 1, rule: 'personal profile defaults'});
    } catch { issues.push({file, line: 1, rule: 'invalid profile example'}); }
  }
  return issues;
}

export function scanPublicationFiles(files) {
  return files.flatMap(({path, data}) => scanPublicationFile(path, data));
}
