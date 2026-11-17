import {renderRecipeMarkdown} from './breakdown-recipe.mjs';
// scripts/lib/breakdown-layers.mjs
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {hms} from './media.mjs';
import {guardedFile} from './breakdown-prepare.mjs';

export const estimateTokens = text => Math.ceil(Buffer.byteLength(String(text), 'utf8') / 4);
const mark = x => (x?.status === 'needs-confirmation' || x?.basis === 'inferred' ? '~' : '');
const within = (t, s) => t >= s.start && t < s.end;
const partial = c => c?.scope === 'region' && c.shotBoundary === false;
const subhead = text => text.replace(/^# /u, '## ');

function timeline(b) {
  const out = ['# Timeline', '', 'One line per shot. `~` = needs confirmation.', ''];
  for (const s of b.shots) {
    const parts = [`${s.id} ${hms(s.start)}–${hms(s.end)} ${s.len}s`];
    const cut = b.cuts.find(c => Math.abs(c.t - s.start) < 1e-3);
    if (cut) parts.push(`${mark(cut)}${partial(cut) ? 'partial swap' : `${cut.kind} cut`}`);
    const tr = b.transitions.find(r => Math.abs((r.start + r.end) / 2 - s.start) < 1e-3);
    if (tr) parts.push(`${mark(tr)}${tr.kind}${tr.direction ? `-${tr.direction}` : ''} transition`);
    parts.push(`camera ${mark(s.camera)}${s.camera.label}`);
    for (const t of b.text.filter(x => within(x.start, s))) parts.push(`${mark(t)}${t.id} «${t.text.replace(/\n/gu, ' / ')}» ${t.entrance}`);
    for (const x of (b.sound?.sfx ?? []).filter(x => within(x.t, s))) parts.push(`${mark(x)}${x.id} ${x.type}@${hms(x.t)}`);
    for (const e of b.events.filter(x => within(x.t, s))) parts.push(`${mark(e)}${e.kind}@${hms(e.t)}`);
    out.push(parts.join(' | '));
  }
  return `${out.join('\n')}\n`;
}

function table(title, head, rows) {
  return `# ${title}\n\n| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map(r => `| ${r.map(cell => String(cell ?? 'unknown').replaceAll('|', '\\|').replaceAll('\n', ' / ')).join(' | ')} |`).join('\n')}\n`;
}

export function renderLayers(b, {recipe = null} = {}) {
  // A reported effect is never also listed as a possible one.
  const reported = new Set((b.sound?.sfx ?? []).map(x => x.id).filter(id => id != null));
  const allWeak = b.sound?.sfxCandidates ?? [], weak = allWeak.filter(x => !reported.has(x.id));
  const weakCount = Number.isFinite(b.sound?.candidateSfxCount) ? Math.max(0, b.sound.candidateSfxCount - (allWeak.length - weak.length)) : weak.length;
  const files = {
    'timeline.md': timeline(b),
    'picture.md': table('Picture', ['Id', 'Time', 'What', 'Status'], [
      ...b.cuts.map(c => [c.id, hms(c.t), partial(c) ? `partial swap at ${(c.box ?? []).join(',')} (the shot goes on)` : `${c.kind} cut${c.scale ? ` ×${c.scale}` : ''}`, c.status]),
      ...b.transitions.map(r => [r.id, `${hms(r.start)}–${hms(r.end)}`, `${r.kind}${r.direction ? ` ${r.direction}` : ''}`, r.status]),
      ...b.shots.map(s => [s.id, `${hms(s.start)}–${hms(s.end)}`, `camera ${s.camera.label}`, s.camera.status]),
      ...b.events.map(e => [e.id, hms(e.t), `${e.kind}${e.scale ? ` x${e.scale}` : ''}`, e.status]),
      ...(b.presenter ? [['presenter', b.presenter.spans.length ? b.presenter.spans.map(s => `${hms(s.start)}–${hms(s.end)}`).join(', ') : `${hms(0)}–${hms(b.durationSec)}`, `face in ${Math.round(b.presenter.share * 100)}% of samples, ${b.presenter.size}`, b.presenter.status]] : []),
      ...b.overlays.map(o => [o.id, `${hms(o.start)}–${hms(o.end)}`, `${o.kind} at ${o.box.join(',')}`, o.status]),
    ]) + ((b.cutCandidates ?? []).length
      ? `\n${subhead(table('Possible cuts, check', ['Time', 'Where', 'Why'], b.cutCandidates.map(c => [hms(c.t), (c.box ?? []).join(','), `the region changed as text ${c.captionEvidence?.textId ?? ''} appeared or disappeared; not counted as a cut`])))}` : ''),
    'text.md': table('On-screen text', ['Id', 'Time', 'Words', 'Zone', 'Fill', 'Stroke', 'Box', 'In', 'Out', 'Status'],
      b.text.map(t => [t.id, `${hms(t.start)}–${hms(t.end)}`, t.text.replace(/\n/gu, ' / '), t.zone, t.style?.fill ?? '', t.style?.stroke ?? '', t.style?.box ?? '', t.entrance, t.exit, t.status])),
    'sound.md': `${table('Sound', ['Id', 'Time', 'Type', 'Anchor', 'Status'],
      (b.sound?.sfx ?? []).map(x => [x.id, hms(x.t), x.type, x.anchor ? `${x.anchor.kind} ${x.anchor.id} ${x.anchor.dt}s` : '', x.status]))}\nBed: ${b.sound?.bed?.present ?? 'unknown'}; BPM: ${b.sound?.tempo?.bpm ?? 'unknown'}; effects per minute: ${b.sound?.hitsPerMinute ?? 'n/a'}; cuts on beat: ${b.sound?.cutsOnBeat?.synced ?? 'n/a'}.\n`
      + (weakCount > 0
        ? `\n${subhead(table('Possible effects, listen', ['Id', 'Time', 'Type guess'], weak.slice().sort((p, q) => p.t - q.t).map(x => [x.id, hms(x.t), x.type])))}\nWeak sounds that are not counted as effects: ${weakCount}; counted effects: ${b.sound.reportedSfxCount ?? (b.sound.sfx ?? []).length}.\n` : ''),
    'look.md': `# Look\n\nLabel: ${b.look?.label ?? 'unknown'}\n\n\`\`\`json\n${JSON.stringify(b.look?.metrics ?? {}, null, 2)}\n\`\`\`\n`,
  };
  files['sound.md'] += b.sound?.hasAudio === false ? '\nThe reference has no audio.\n' : '';
  files['look.md'] += '\nStatus: ' + (b.look?.status ?? 'unknown') + '\n';
  const pending = (b.reviewQueue ?? []).map(id => '- ~' + id).join('\n');
  if (recipe) files['studio-recipe.md'] = renderRecipeMarkdown(recipe);
  const card = [
    '---', `referenceId: ${b.referenceId}`, `durationSec: ${b.durationSec}`, `aspect: ${b.aspect}`, `shots: ${b.shots.length}`,
    `cutsPerMinute: ${b.pace.cutsPerMinute}`, `medianShotSec: ${b.pace.shotLen.median}`, `textCues: ${b.text.length}`,
    `bed: ${b.sound?.bed?.present ?? 'unknown'}`, `bpm: ${b.sound?.tempo?.bpm ?? 'unknown'}`, `sfx: ${(b.sound?.sfx ?? []).length}`,
    `hitsPerMinute: ${b.sound?.hitsPerMinute ?? 'n/a'}`, `look: ${b.look?.label ?? 'unknown'}`, `presenterShare: ${b.presenter?.share ?? 'unknown'}`, `needsConfirmation: ${b.reviewQueue.length}`, '---',
  ].join('\n');
  const map = [
    ['timeline.md', 'the order of shots, text and effects'], ['picture.md', 'cuts, transitions, camera, overlays'],
    ['text.md', 'exact words, colours and entrances'], ['sound.md', 'effects, bed and tempo'], ['look.md', 'colour numbers'],
    ...(files['studio-recipe.md'] ? [['studio-recipe.md', 'how to make it in Reel Studio (suggestions)']] : []),
  ].map(([file, when]) => `| ${file} | ~${estimateTokens(files[file])} | ${when} |`);
  files['BREAKDOWN.md'] = `${card}\n\n# Breakdown ${b.referenceId}\n\nRead this card first; open a file below only when the question needs it. \`~\` marks items that need confirmation. Full data: \`breakdown.json\` (do not read it whole).\n\n| File | ~Tokens | Read when |\n|---|---|---|\n${map.join('\n')}\n${pending ? `\nNeeds confirmation:\n${pending}\n` : ''}${b.limitations.length ? `\nLimitations: ${b.limitations.join(' ')}\n` : ''}`;
  return files;
}

export async function writeLayers(breakdown, dir, options = {}) {
  const files = renderLayers(breakdown, options);
  await fsp.mkdir(path.dirname(guardedFile(dir, 'BREAKDOWN.md')), {recursive: true});
  for (const [name, content] of Object.entries(files)) await fsp.writeFile(guardedFile(dir, name), content, 'utf8');
  return Object.keys(files).map(name => path.join(dir, name));
}
