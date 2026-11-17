import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {meta, listReel} from './fixtures/breakdown-list-reel.mjs';
import {buildRecipe, renderRecipeMarkdown} from '../scripts/lib/breakdown-recipe.mjs';
import {tc, deriveTraits, classify, buildDna, renderDnaMarkdown, renderEvidenceMarkdown} from '../scripts/lib/breakdown-dna.mjs';

test('timecodes use the STYLE-LEARNING form', () => {
  assert.equal(tc(0), '00:00.00');
  assert.equal(tc(3.2), '00:03.20');
  assert.equal(tc(75.456), '01:15.46');
});

test('candidate effects cannot contribute type, picture timing or stale density to DNA',()=>{
  const b=listReel();b.sound.sfx=[{id:'X01',t:1,type:'click',...meta}];b.sound.sfxCandidates=[{id:'Q01',t:2,type:'riser',...meta,status:'needs-confirmation'}];
  b.sound.hitsPerMinute=999;
  const recipe=buildRecipe(b);
  assert.deepEqual(recipe.sound.sfxTypes,{click:1});assert.equal(recipe.sound.sweeps,0);
  const traits=deriveTraits(b,recipe);
  assert.equal(traits.find(t=>t.key==='sound.effect-type').value,'click');
  assert.equal(traits.find(t=>t.key==='sound.density').value.hitsPerMinute,+(60/b.durationSec).toFixed(1));
  assert.ok(traits.every(t=>!(t.support??[]).some(x=>x.id==='Q01')));
  const dna=buildDna([{breakdown:b,recipe:buildRecipe(b)}]);
  assert.ok(!dna.observedInvariants.some(t=>t.rule.includes('riser')));
});

test('unmeasured tempo stays report-only even when two references share its absence',()=>{
  for(const reason of ['too-short','no-pulses','low-confidence','no-audio','no steady beat measured']) {
    const b=listReel();b.sound.tempo=null;b.sound.tempoReason=reason;
    const second=structuredClone(b);second.referenceId='ref-another';
    assert.equal(deriveTraits(b,buildRecipe(b)).some(t=>t.key==='sound.tempo'),false);
    for(const refs of [[b],[b,second]]) {
      const dna=buildDna(refs.map(breakdown=>({breakdown,recipe:buildRecipe(breakdown)})));
      assert.equal(dna.observedInvariants.some(t=>t.key==='sound.tempo'),false);
      assert.equal(dna.evidence.some(t=>t.id.endsWith(':sound.tempo')),false);
      const md=renderDnaMarkdown(dna);
      assert.doesNotMatch(md,/The music tempo is about|مفيش إيقاع ثابت متقاس/);
    }
  }
});

test('traits are classified by recurrence, agreement and pending evidence', () => {
  const b = listReel(), byKey = Object.fromEntries(deriveTraits(b, buildRecipe(b)).map(t => [t.key, {...t, ...classify(t)}]));
  assert.equal(byKey['cuts.kind'].trait, 'invariant');
  assert.equal(byKey['picture.panel-switch'].trait, 'invariant');
  assert.equal(byKey['text.highlight-steps'].trait, 'invariant');
  assert.equal(byKey['sound.effects-on-picture'].trait, 'invariant');
  assert.equal(byKey['sound.tempo'].trait, 'uncertain');
  assert.equal(byKey['overlay.frame-in-frame'].trait, 'uncertain');
  assert.equal(byKey['pace'].trait, 'adaptive');
  assert.equal(byKey['text.zone'].trait, 'uncertain');
  assert.equal(byKey['look.colour'].trait, 'invariant');
  assert.equal(classify({kind: 'recurring', support: [meta, meta, meta, meta, meta], agreement: 0.6}).trait, 'adaptive');
});

test('a single reference yields a provisional draft with complete evidence rows', () => {
  const b = listReel(), dna = buildDna([{breakdown: b, recipe: buildRecipe(b)}], {now: '2026-11-15T00:00:00.000Z'});
  assert.equal(dna.status, 'draft');
  assert.equal(dna.generatedBy, 'breakdown');
  assert.equal(dna.baseStyle, null);
  assert.equal(dna.suggestedBaseStyle.id, 'grid-glide');
  assert.ok(dna.observedInvariants.every(x => x.provisional === true));
  assert.ok(dna.observedInvariants.some(x => x.key === 'picture.panel-switch' && x.evidence[0] === 'ref-aaaaaaaaaaaa:picture.panel-switch'));
  assert.ok(dna.uncertainTraits.some(x => x.key === 'sound.tempo' && /Tap along|Listen/.test(x.resolveBy)));
  assert.deepEqual(dna.applicationLogic, []);
  assert.equal(dna.sampleReview, null);
  for (const row of dna.evidence) {
    for (const slot of ['id', 'referenceId', 'timecodes', 'claim', 'basis', 'confidence', 'reason', 'artifacts', 'trait', 'exceptions']) assert.ok(slot in row, `${row.id} ${slot}`);
    assert.match(row.timecodes[0], /^\d{2}:\d{2}\.\d{2}/);
    assert.ok(['observed', 'measured', 'inferred'].includes(row.basis));
    assert.ok(row.artifacts.every(a => a.startsWith('style-analysis/ref-aaaaaaaaaaaa/')));
  }
  const ids = new Set(dna.evidence.map(r => r.id));
  for (const list of [dna.observedInvariants, dna.adaptiveVariables, dna.uncertainTraits]) for (const x of list) assert.ok(x.evidence.every(id => ids.has(id)));
});

test('two references keep only shared, agreeing invariants', () => {
  const a = listReel(), b = {...listReel(), referenceId: 'ref-cccccccccccc', source: {name: 'b.mp4', sha256: 'c'.repeat(64)}, cuts: listReel().cuts.map(c => ({...c, kind: 'jump'}))};
  const dna = buildDna([{breakdown: a, recipe: buildRecipe(a)}, {breakdown: b, recipe: buildRecipe(b)}]);
  assert.ok(dna.observedInvariants.every(x => x.provisional === false));
  assert.ok(dna.adaptiveVariables.some(x => x.key === 'cuts.kind'));
  assert.ok(dna.observedInvariants.some(x => x.key === 'picture.panel-switch'));
  assert.equal(dna.references.length, 2);
});

test('the Markdown follows the STYLE-LEARNING sections and keeps reference words out', () => {
  const b = listReel(), dna = buildDna([{breakdown: b, recipe: buildRecipe(b)}]);
  const md = renderDnaMarkdown(dna);
  for (const heading of ['## References', '## Observed invariants', '## Adaptive variables', '## Uncertain traits', '## Application logic', '## Anti-patterns', '## Limitations', '## Sample review']) assert.ok(md.includes(heading), heading);
  assert.match(md, /Status: draft/);
  assert.doesNotMatch(md, /Header line/);
  const ev = renderEvidenceMarkdown(b, dna.evidence);
  assert.match(ev, /\| id \| referenceId \| timecodes \| claim \| basis \| confidence \| reason \| artifacts \| trait \| exceptions \|/);
});

test('caption look owns its confirmation status across recipe, Markdown and DNA', () => {
  const b = listReel();
  b.text = Array.from({length: 4}, (_, i) => ({id: `T0${i + 1}`, text: 'Synthetic speech', start: i, end: i + .8,
    kind: 'caption', zone: 'bottom', sizePct: .04, style: {fill: '#ffffff'}, ...meta,
    status: i === 3 ? 'needs-confirmation' : 'confirmed'}));
  let recipe = buildRecipe(b);
  assert.equal(recipe.features.captions, 'yes', 'the existing presence feature stays compatible');
  assert.equal(recipe.captions.status, 'needs-confirmation');
  assert.match(renderRecipeMarkdown(recipe), /Candidate caption look \(needs-confirmation\)/);
  let dna = buildDna([{breakdown: b, recipe}]);
  assert.ok(dna.uncertainTraits.some(t => t.key === 'captions.look'), 'even one pending cue keeps the aggregate look uncertain');
  assert.ok(!dna.observedInvariants.some(t => t.key === 'captions.look'));
  b.text.forEach(t => { t.status = 'confirmed'; }); recipe = buildRecipe(b);
  assert.equal(recipe.captions.status, 'confirmed');
  assert.doesNotMatch(renderRecipeMarkdown(recipe), /Candidate caption look/);
  dna = buildDna([{breakdown: b, recipe}]);
  assert.ok(dna.observedInvariants.some(t => t.key === 'captions.look'));
  b.text.forEach(t => { t.status = 'needs-confirmation'; }); recipe = buildRecipe(b);
  assert.equal(recipe.features.captions, 'unknown');
  assert.equal(recipe.captions.status, 'needs-confirmation');
});

import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {writeDnaFiles} from '../scripts/lib/breakdown-dna.mjs';

test('our own unchanged draft is revised; a human edit or a reviewed DNA gets a proposal', async t => {
  const dir = path.join(ROOT, 'Projects', `breakdown-test-dna-${Date.now()}`);
  t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  const draft = s => ({'STYLE_DNA.json': JSON.stringify({status: 'draft', generatedBy: 'breakdown', s}), 'STYLE_DNA.md': `# DNA ${s}\n`, 'style-analysis/ref-aaaaaaaaaaaa.md': `# Evidence ${s}\n`});
  const first = await writeDnaFiles(dir, draft(1));
  assert.deepEqual(first.written.sort(), ['STYLE_DNA.json', 'STYLE_DNA.md', 'style-analysis/ref-aaaaaaaaaaaa.md']);
  const second = await writeDnaFiles(dir, draft(2), {now: new Date('2026-11-15T10:00:00Z')});
  assert.equal(second.revisions.length, 4);
  assert.match(await fsp.readFile(path.join(dir, 'STYLE_DNA.md'), 'utf8'), /DNA 2/);
  await fsp.writeFile(path.join(dir, 'STYLE_DNA.md'), '# edited by the manager\n');
  const third = await writeDnaFiles(dir, draft(3));
  assert.deepEqual(third.proposals.sort(), ['STYLE_DNA.proposal.json', 'STYLE_DNA.proposal.md']);
  assert.deepEqual(third.written, ['style-analysis/ref-aaaaaaaaaaaa.md']);
  assert.match(await fsp.readFile(path.join(dir, 'STYLE_DNA.md'), 'utf8'), /edited by the manager/);
  await fsp.rm(path.join(dir, 'style-analysis', 'dna-ledger.json'));
  await fsp.writeFile(path.join(dir, 'STYLE_DNA.json'), JSON.stringify({status: 'awaiting-review'}));
  await assert.rejects(() => writeDnaFiles(dir, draft(4)), /proposal conflict/);
  assert.equal(JSON.parse(await fsp.readFile(path.join(dir, 'STYLE_DNA.json'), 'utf8')).status, 'awaiting-review');
});

const writerFixture = async t => {
  const dir = path.join(ROOT, 'Projects', `breakdown-test-dna-${crypto.randomUUID().slice(0, 8)}`);
  t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  const read = rel => fsp.readFile(path.join(dir, rel), 'utf8');
  const put = async (rel, text) => { await fsp.mkdir(path.dirname(path.join(dir, rel)), {recursive: true}); await fsp.writeFile(path.join(dir, rel), text); };
  const draft = n => ({'STYLE_DNA.json': JSON.stringify({status: 'draft', generatedBy: 'breakdown', n}), 'STYLE_DNA.md': `# DNA ${n}\n`, 'style-analysis/ref-aaaaaaaaaaaa.md': `# Evidence ${n}\n`});
  return {dir, read, put, draft};
};

for (const rel of ['STYLE_DNA.json', 'STYLE_DNA.md', 'style-analysis/ref-aaaaaaaaaaaa.md']) {
  test(`manual ${rel} is preserved and proposals have tracked hashes`, async t => {
    const f = await writerFixture(t);
    await writeDnaFiles(f.dir, f.draft(1));
    const manual = rel.endsWith('.json') ? JSON.stringify({status: 'reviewed'}) : '# Hand edited\n';
    await f.put(rel, manual);
    const result = await writeDnaFiles(f.dir, f.draft(2));
    assert.equal(await f.read(rel), manual);
    const expected = rel.includes('ref-') ? ['style-analysis/ref-aaaaaaaaaaaa.proposal.md'] : ['STYLE_DNA.proposal.json', 'STYLE_DNA.proposal.md'];
    assert.deepEqual(result.proposals, expected);
    const ledger = JSON.parse(await f.read('style-analysis/dna-ledger.json'));
    for (const target of expected) assert.match(ledger.files[target], /^[0-9a-f]{64}$/);
    await writeDnaFiles(f.dir, f.draft(3));
    assert.equal(await f.read(rel), manual);
  });
}

for (const target of ['STYLE_DNA.proposal.json', 'STYLE_DNA.proposal.md', 'style-analysis/ref-aaaaaaaaaaaa.proposal.md']) {
  test(`edited ${target} stops the entire batch before replacement`, async t => {
    const f = await writerFixture(t);
    await writeDnaFiles(f.dir, f.draft(1));
    const original = target.includes('ref-') ? 'style-analysis/ref-aaaaaaaaaaaa.md' : 'STYLE_DNA.md';
    await f.put(original, '# Hand edit\n');
    await writeDnaFiles(f.dir, f.draft(2));
    await f.put(target, '# Hand edited proposal\n');
    const tracked = ['STYLE_DNA.json', 'STYLE_DNA.md', 'style-analysis/ref-aaaaaaaaaaaa.md', 'style-analysis/dna-ledger.json', target];
    const before = await Promise.all(tracked.map(f.read));
    await assert.rejects(() => writeDnaFiles(f.dir, f.draft(3)), /Protected DNA proposal conflict/);
    assert.deepEqual(await Promise.all(tracked.map(f.read)), before);
  });
}

test('missing ledger protects existing files; an untracked proposal and a corrupt ledger fail closed', async t => {
  const f = await writerFixture(t);
  await f.put('STYLE_DNA.json', JSON.stringify({status: 'reviewed'}));
  await f.put('STYLE_DNA.md', '# Reviewed\n');
  const result = await writeDnaFiles(f.dir, f.draft(1));
  assert.equal(result.proposals.length, 2);
  await fsp.rm(path.join(f.dir, 'style-analysis/dna-ledger.json'));
  const before = await f.read('STYLE_DNA.proposal.md');
  await assert.rejects(() => writeDnaFiles(f.dir, f.draft(2)), /proposal conflict/);
  assert.equal(await f.read('STYLE_DNA.proposal.md'), before);
  for (const value of ['{bad', '{"schema":1,"files":[]}', '{"schema":2,"files":{}}', '{"schema":1,"files":{"a":true}}']) {
    await f.put('style-analysis/dna-ledger.json', value);
    await assert.rejects(() => writeDnaFiles(f.dir, f.draft(2)), /ledger is corrupt/);
    assert.equal(await f.read('STYLE_DNA.md'), '# Reviewed\n');
  }
});

test('project lease prevents concurrent ledger loss and retry retains both reference entries', async t => {
  const f = await writerFixture(t);
  const a = {'style-analysis/ref-aaaaaaaaaaaa.md': '# A\n'}, b = {'style-analysis/ref-bbbbbbbbbbbb.md': '# B\n'};
  const results = await Promise.allSettled([writeDnaFiles(f.dir, a), writeDnaFiles(f.dir, b)]);
  assert.ok(results.some(r => r.status === 'fulfilled'));
  for (let i = 0; i < results.length; i++) if (results[i].status === 'rejected') {
    assert.match(results[i].reason.message, /Project DNA is locked/);
    await writeDnaFiles(f.dir, i === 0 ? a : b);
  }
  const ledger = JSON.parse(await f.read('style-analysis/dna-ledger.json'));
  assert.deepEqual(Object.keys(ledger.files).sort(), [...Object.keys(a), ...Object.keys(b)]);
  assert.equal(await f.read(Object.keys(a)[0]), '# A\n');
  assert.equal(await f.read(Object.keys(b)[0]), '# B\n');
});

test('revisions are unique for the same timestamp and retain preceding drafts and ledgers', async t => {
  const f = await writerFixture(t), now = new Date('2026-11-15T10:00:00Z');
  await writeDnaFiles(f.dir, f.draft(1));
  const a = await writeDnaFiles(f.dir, f.draft(2), {now});
  const b = await writeDnaFiles(f.dir, f.draft(3), {now});
  const revisions = [...a.revisions, ...b.revisions];
  assert.equal(new Set(revisions).size, revisions.length);
  const texts = await Promise.all(revisions.map(f.read));
  assert.ok(texts.includes('# DNA 1\n'));
  assert.ok(texts.includes('# DNA 2\n'));
  assert.ok(texts.some(text => JSON.parse(text.startsWith('{') ? text : '{}').schema === 1));
});

test('rename failure reports an error, keeps recovery revisions and never advances the ledger', async t => {
  const f = await writerFixture(t);
  await writeDnaFiles(f.dir, f.draft(1));
  const before = await f.read('style-analysis/dna-ledger.json');
  const rename = fsp.rename;
  let promotions = 0;
  fsp.rename = async (...args) => {
    if (args[1].endsWith('STYLE_DNA.md')) throw Object.assign(new Error('Injected rename failure'), {code: 'EIO'});
    promotions++;
    return rename(...args);
  };
  try { await assert.rejects(() => writeDnaFiles(f.dir, f.draft(2)), /Injected rename failure/); }
  finally { fsp.rename = rename; }
  assert.ok(promotions > 0);
  assert.equal(await f.read('style-analysis/dna-ledger.json'), before);
  const names = await fsp.readdir(path.join(f.dir, 'style-analysis/dna-revisions'));
  const recover = await Promise.all(names.map(name => f.read(`style-analysis/dna-revisions/${name}`)));
  assert.ok(recover.includes(f.draft(1)['STYLE_DNA.json']));
  assert.ok(recover.includes('# DNA 1\n'));
  assert.equal((await fsp.readdir(f.dir)).some(name => name.endsWith('.tmp')), false);
  await assert.rejects(() => fsp.stat(path.join(f.dir, 'style-analysis/dna.lock')), {code: 'ENOENT'});
});

test('a manual save during staging is detected before any destination is replaced', async t => {
  const f = await writerFixture(t);
  await writeDnaFiles(f.dir, f.draft(1));
  const original = await f.read('STYLE_DNA.json'), ledger = await f.read('style-analysis/dna-ledger.json');
  const writeFile = fsp.writeFile;
  let injected = false;
  fsp.writeFile = async (file, ...args) => {
    const result = await writeFile(file, ...args);
    if (!injected && String(file).endsWith('.tmp')) {
      injected = true;
      await writeFile(path.join(f.dir, 'STYLE_DNA.md'), '# New manual save\n');
    }
    return result;
  };
  try { await assert.rejects(() => writeDnaFiles(f.dir, f.draft(2)), /refusing a stale save/); }
  finally { fsp.writeFile = writeFile; }
  assert.equal(await f.read('STYLE_DNA.md'), '# New manual save\n');
  assert.equal(await f.read('STYLE_DNA.json'), original);
  assert.equal(await f.read('style-analysis/dna-ledger.json'), ledger);
});

test('write failure preserves the draft and releases the project lease', async t => {
  const f = await writerFixture(t);
  await writeDnaFiles(f.dir, f.draft(1));
  const before = await f.read('STYLE_DNA.md');
  const writeFile = fsp.writeFile;
  fsp.writeFile = async (file, ...args) => {
    if (String(file).endsWith('.tmp')) throw new Error('Injected disk full');
    return writeFile(file, ...args);
  };
  try { await assert.rejects(() => writeDnaFiles(f.dir, f.draft(2)), /disk full/); }
  finally { fsp.writeFile = writeFile; }
  assert.equal(await f.read('STYLE_DNA.md'), before);
  await writeDnaFiles(f.dir, f.draft(3));
  assert.equal(await f.read('STYLE_DNA.md'), '# DNA 3\n');
});

test('DNA writes reject foreign, traversal and unpaired output paths', async t => {
  const f = await writerFixture(t);
  for (const files of [{'../edit.json': '{}'}, {'style-analysis/ref-aaaaaaaaaaaa.md:evil': 'x'}, {'STYLE_DNA.md': '# Unpaired'}]) {
    await assert.rejects(() => writeDnaFiles(f.dir, files), /Invalid DNA|together/);
  }
  await assert.rejects(() => writeDnaFiles(path.join(ROOT, 'Raw'), f.draft(1)), /owned project/);
});

test('trait classification keeps the strict pending threshold and missing-reference uncertainty', () => {
  assert.equal(classify({kind: 'global', support: [meta, {...meta, status: 'needs-confirmation'}]}).trait, 'invariant');
  assert.equal(classify({kind: 'measure', support: [{...meta, status: 'needs-confirmation'}]}).trait, 'uncertain');
  const a = listReel(), b = listReel();
  b.referenceId = 'ref-bbbbbbbbbbbb';
  b.sound.tempo = null;
  b.presenter = null;
  b.look = null;
  const dna = buildDna([{breakdown: a, recipe: buildRecipe(a)}, {breakdown: b, recipe: buildRecipe(b)}]);
  for (const key of ['sound.tempo', 'presenter.share', 'look.colour']) {
    assert.ok(dna.uncertainTraits.some(t => t.key === key && /1 of 2 references/.test(t.resolveBy)), key);
    assert.ok(!dna.observedInvariants.some(t => t.key === key), key);
  }
});

test('image-reviewed support becomes observed evidence and pending measurements never become invariants', () => {
  const b = listReel();
  b.cuts = b.cuts.map(c => ({...c, basis: 'seen'}));
  b.look = {...b.look, status: 'needs-confirmation', confidence: 'low', confirmHow: 'Check the sampled frames.'};
  const dna = buildDna([{breakdown: b, recipe: buildRecipe(b)}]);
  assert.equal(dna.evidence.find(row => row.id.endsWith(':cuts.kind')).basis, 'observed');
  const look = dna.evidence.find(row => row.id.endsWith(':look.colour'));
  assert.equal(look.trait, 'uncertain');
  assert.equal(look.confidence, 'low');
  assert.ok(dna.uncertainTraits.some(t => t.key === 'look.colour' && /Check the sampled frames/.test(t.resolveBy)));
});

test('hardlinked destinations are rejected before either linked file can change', async t => {
  const f = await writerFixture(t);
  await writeDnaFiles(f.dir, f.draft(1));
  const original = path.join(f.dir, 'STYLE_DNA.md'), alias = path.join(f.dir, 'alias.md');
  await fsp.link(original, alias);
  await assert.rejects(() => writeDnaFiles(f.dir, f.draft(2)), /hardlinked/);
  assert.equal(await f.read('STYLE_DNA.md'), '# DNA 1\n');
  assert.equal(await f.read('alias.md'), '# DNA 1\n');
});
