// Curated source observations, not keyword-derived claims or a capability registry.
// Reassess an observation when its inventoried source fingerprint changes.
const PATHS = {
  automation: 'engine/src/motion-concepts/automation-flow/schema.ts',
  semantic: 'engine/src/creative-kit/semantic/schema.ts',
  creative: 'engine/src/creative-kit/schema.ts',
  library: 'engine/src/motion-library/schema.ts',
  draw: 'engine/src/core/draw.tsx',
  concepts: 'engine/src/motion-concepts/catalog.ts',
  manifest: 'engine/src/prepared-edit/schema.ts',
  branching: 'engine/src/motion-concepts/conditional-branching/schema.ts',
  filtering: 'engine/src/motion-concepts/identity-filtering/schema.ts',
};
const OBSERVATIONS = {
  automation: ['3d3ccb0b3b0a8954fab70770ca496cd300a6abcb4c66aeefec299a975f0b671d',
    'automationFlowSchema accepts input, exactly four step labels and output. It has no condition, route choice, queue, service rate or return-edge data.'],
  semantic: ['5886a10b0ecc16df6726e2efb45e6f4fa1687d45959abb7c8fd23d4c1718c8ac',
    'route-stops accepts 2-4 ordered stops; message-board preserves unique IDs while gathering/focusing; token-lens groups supplied tokens. These families do not evaluate predicates. The takeover motion-concept wrapper selects its exact registered config schema, including the new branch/filter concepts.'],
  // Re-reviewed after the optional Gallery probeSurfaces flag; process/comparison contracts are unchanged.
  creative: ['0b60920c4810e90770c122cbff8f717c81a22d9dfbc99bf3f66b5a7653be2c37',
    'processSchema supplies exactly three title/detail steps; comparisonSchema supplies before/after titles and details. These already cover linear steps and contrast.'],
  library: ['2ea24013fd590c3755d0f0281b97260ba743e0f2ca98e5659e43d1e9b4f8baaf',
    'data-story exposes authored metric or bars with ordered atFrame reveals and a source note; screen-focus requires supplied local screen assets. Neither tracks queue arrivals/departures.'],
  draw: ['6251fde73a37ce8cbbea65746f805fd69e802edd5768b56fca82ef688b4f17eb',
    'morphPath(a,b,p) interpolates authored SVG paths with command compatibility validation; pathAt and DrawPath are authoring helpers. A helper is not an editable normal-workflow scene.'],
  concepts: ['d725987052cde4dad8f170fcb148089b7429b7c339a46c7d6851c160daa3ccbd',
    'The catalog now declares conditional-branching and identity-filtering with public typed configuration and readable time floors. Existing flow/fan-out entries remain distinct. No queue or semantic result-to-input return edge is declared.'],
  branching: ['bb9b8b7c6c5d2016289e8ed55c40d94e9017a03a623e9e01694e76612667aa56',
    'conditionalBranchingSchema supplies one stable input, boolean equality or numeric-at-least condition, and exactly two outcomes. Input type must match the condition; there is no selected-route override.'],
  filtering: ['f05aac0a5289cd3a51403c13681432b150994919700c2157068e31dcbf2e79a2',
    'identityFilteringSchema supplies 3-6 unique cards with typed attributes and 1-3 labelled eq/gte/lte criteria. Missing fields, duplicate IDs and mismatched types are rejected. The same IDs are retained across stages.'],
  manifest: ['7d446fbf3fae3b7e6775eaf15b371da682ea4fc0dbd5da1a02a40cbc0bc2b792',
    'The prepared-edit manifest enumerates normal scene families and intersects their public contracts with common scene data. Declaration does not establish rendered quality or creator acceptance.'],
};
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const uniqueSorted = (values) => [...new Set(values)].sort(compare);
const candidate = (key, limitation) => ({key, limitation});
const FLOW = candidate('concept:automation-flow', 'Fixed input -> four steps -> output; no conditional choice, queue state or semantic return edge. Playback looping is not feedback.');
const PROCESS = candidate('scene:process', 'Exactly three ordered title/detail steps; no branch, queue or persistent moving item state.');
const BOARD = candidate('scene:message-board', 'Stable item IDs survive gathering and focus, but there is no predicate, accepted/rejected stream or stage-by-stage filtering.');
const ROUTE = candidate('scene:route-stops', 'Already supports 2-4 authored chronological stops; it does not encode a proportional date axis or concurrent lanes.');
const MORPH = candidate(`primitive:${PATHS.draw}#morphPath`, 'Internal SVG path interpolation with command compatibility checks; no dedicated editable scene binding.');

const JOBS = [
  {id: 'question', labelEn: 'Pose a question', labelAr: 'طرح سؤال', keys: ['scene:intro', 'scene:kinetic-hook'], evidence: ['creative'],
    limitation: 'A question can be authored as visible copy. A question title does not constitute a conditional decision mechanism.'},
  {id: 'comparison', labelEn: 'Compare the same subject', labelAr: 'مقارنة نفس الموضوع', keys: ['scene:comparison', 'scene:image-compare', 'scene:evidence-wipe', 'scene:meter-receipt', 'scene:verdict'], evidence: ['creative', 'semantic'],
    limitation: 'Evidence comparisons require real supplied material; differences must not be invented.'},
  {id: 'process', labelEn: 'Explain ordered steps', labelAr: 'توضيح خطوات متتابعة', keys: ['scene:process', 'concept:automation-flow'], evidence: ['creative', 'automation'],
    limitation: 'Three process steps or four automation steps already exist; flexible counts alone would be a variant, not a new visual job.'},
  {id: 'evidence', labelEn: 'Show supporting evidence', labelAr: 'عرض دليل', keys: ['scene:proof', 'scene:data-story', 'scene:screen-focus', 'scene:evidence-wipe', 'scene:claim-proof'], evidence: ['creative', 'semantic', 'library'],
    limitation: 'Authored numbers need a real source; screen and evidence scenes require their supplied asset roles.'},
  {id: 'grouping', labelEn: 'Group and focus objects', labelAr: 'تجميع عناصر والتركيز عليها', keys: ['scene:message-board', 'scene:token-lens', 'scene:comment-stack', 'concept:system-layers', 'concept:department-tabs'], evidence: ['semantic', 'concepts'],
    limitation: 'Gathering, grouping and focusing are covered. Predicate-based filtering remains a different action.'},
  {id: 'scale', labelEn: 'Explain scale or focus a value', labelAr: 'توضيح حجم أو قيمة', keys: ['scene:data-story', 'scene:meter-receipt', 'scene:verdict', 'concept:kpi-zoom', 'concept:data-morph'], evidence: ['library', 'semantic', 'concepts'],
    limitation: 'A metric or bars communicates values; it does not itself show why work accumulates at a constrained server.'},
  {id: 'reveal', labelEn: 'Reveal a result', labelAr: 'كشف نتيجة', keys: ['scene:ticket-offer', 'scene:comment-stack', 'concept:panel-reveal', 'concept:keyword-reveal', 'concept:button-to-window'], evidence: ['concepts'],
    limitation: 'Reveals and card/window transformations are already packaged; a custom SVG path morph is a separate authoring contract.'},
  {id: 'chronology', labelEn: 'Explain chronology', labelAr: 'توضيح التسلسل الزمني', keys: ['scene:route-stops', 'scene:chapter-quote'], evidence: ['semantic'],
    limitation: 'Use route-stops for an ordered timeline of 2-4 events. A proportional time scale or concurrent lanes would need a separate, demonstrated use case.'},
  {id: 'branching', labelEn: 'Choose a conditional route', labelAr: 'اختيار مسار حسب شرط', keys: ['concept:conditional-branching'], evidence: ['branching','concepts'],
    limitation: 'One supplied typed condition chooses exactly one of two outcomes on a takeover canvas. A larger decision tree or live product execution is outside this contract.'},
  {id: 'filtering', labelEn: 'Filter persistent objects', labelAr: 'فلترة عناصر مع الحفاظ على هويتها', keys: ['concept:identity-filtering'], evidence: ['filtering','concepts'],
    limitation: '3-6 stable authored cards pass 1-3 boolean/numeric criteria. This is a bounded illustrative shortlist, not arbitrary code execution, a measured dataset or a replacement for supplied evidence.'},
  {id: 'bottleneck', labelEn: 'Explain a bottleneck or queue', labelAr: 'توضيح اختناق أو طابور', keys: [], evidence: ['automation', 'library', 'concepts'],
    limitation: 'Current process reveals and metrics have no arrivals, service capacity, waiting state or queue release.'},
  {id: 'feedback', labelEn: 'Return a result to the input', labelAr: 'إرجاع النتيجة لتحسين المدخل', keys: [], evidence: ['automation', 'concepts'],
    limitation: 'Loopable playback resets a demonstration; feedback must visibly carry the result back and change the next iteration.'},
];

// Values are editorial judgements on a 1-5 scale. They are not usage analytics,
// implementation estimates, measured render costs, or a creator's approval.
const FACTORS = [
  ['unmetMeaning', 35, 'How much additional viewer understanding this work can unlock.'],
  ['crossVideoReuse', 25, 'Estimated applicability to distinct explanation types, without asserting observed demand.'],
  ['firstPartyReuse', 20, 'How much existing local schema, geometry and primitive work can be reused.'],
  ['implementationEase', 10, 'Subjective contract/editor effort; higher means less expected work, not a measured cost.'],
  ['adaptationSafety', 10, 'Subjective readability and identity risk; higher means less expected adaptation risk.'],
];
const CONSTRAINTS = [
  'Preserve selected style ownership, profile-fixed choices and the style brand policy; profile colours are not guaranteed.',
  'Arabic RTL, mixed Latin/digits and long labels require actual motion review, with a readable resolved hold at 30/50/60 fps.',
  'Keep normal editor forms, manual drafts and PreparedEdit rendering; no fabricated words, assets, records or numerical claims.',
  'Prefer existing first-party primitives and current pinned dependencies; no new dependency, engine upgrade or external render service is implied.',
];

const PROPOSALS = [
  {id: 'existing-motion-review', labelEn: 'Review the existing mechanisms before expansion', labelAr: 'مراجعة الحركات الموجودة قبل التوسّع',
    visualJob: 'existing-coverage', reason: 'not-reviewed', scope: 'review', evidence: ['manifest', 'concepts', 'semantic'],
    candidates: null, values: [5, 5, 5, 5, 5], decision: 'prepare-and-review-existing-previews',
    proposedBehavior: 'Prepare existing normal-workflow previews, then review actual motion, Arabic readability and the intended visual job before recording any readiness evidence.',
    useCase: 'Check whether the current process, comparison, chronology and grouping scenes already explain a planned Reel without adding code.',
    rationale: 'Review comes first because declared coverage may already solve the explanation. This prioritises reducing uncertainty and duplication; it is not a demand measurement.'},
  {id: 'conditional-branching', labelEn: 'Conditional branching', labelAr: 'تفرّع حسب شرط',
    visualJob: 'branching', reason: 'missing', scope: 'new', evidence: ['automation', 'creative', 'semantic', 'concepts'],
    candidates: [FLOW, PROCESS, candidate('concept:prompt-to-results', 'One prompt produces three output cards; fan-out does not visibly test a condition and choose a route.')], values: [5, 5, 4, 3, 4], decision: 'prototype-after-existing-review',
    proposedBehavior: 'Carry the same input token to an authored condition, expose alternatives, select one route and hold its outcome; keep the unchosen route visibly distinct.',
    useCase: 'Explain a generic support request going to self-service or human review according to a supplied condition, without invented customer data.',
    rationale: 'A visible decision adds meaning that the linear flow cannot express. Existing flow geometry and cards offer reuse; route labels and RTL crossings add review risk.'},
  {id: 'identity-filtering', labelEn: 'Filtering the same set through stages', labelAr: 'فلترة نفس العناصر عبر مراحل',
    visualJob: 'filtering', reason: 'missing', scope: 'new', evidence: ['semantic', 'automation', 'concepts'],
    candidates: [BOARD, candidate('scene:token-lens', 'Groups supplied tokens and magnifies one; it does not apply predicates or retain/reject objects through stages.')],
    values: [5, 4, 5, 3, 4], decision: 'prototype-after-existing-review',
    proposedBehavior: 'Give each authored object a stable ID and visible identity; pass the same objects through labelled criteria and keep retained/rejected destinations traceable.',
    useCase: 'Show a generic shortlist narrowing by supplied requirements while viewers can follow which candidates survived each stage.',
    rationale: 'Identity continuity makes selection understandable, beyond a funnel silhouette or a card focus. message-board already supplies stable IDs; extra stages increase density and reading cost.'},
  {id: 'queue-bottleneck', labelEn: 'Bottleneck, waiting and release', labelAr: 'اختناق وانتظار وفك الطابور',
    visualJob: 'bottleneck', reason: 'missing', scope: 'new', evidence: ['automation', 'library', 'concepts'], candidates: [FLOW,
      candidate('scene:data-story', 'Reveals authored values or bars; no persistent arrivals, waiting queue, constrained service or departures.')],
    values: [5, 4, 3, 2, 3], decision: 'prototype-after-first-small-batch',
    proposedBehavior: 'Move persistent authored work items into a visibly capacity-limited station, show accumulation, then demonstrate the supplied intervention and release.',
    useCase: 'Explain why one manual approval stage delays the rest of a generic workflow; use schematic items rather than unsupported production metrics.',
    rationale: 'This can explain causality rather than merely a slow-looking process. Queue timing and identity add more state, editor fields and validation work than branching/filtering.'},
  {id: 'semantic-feedback', labelEn: 'Result-to-input feedback', labelAr: 'رجوع النتيجة لتحسين المدخل',
    visualJob: 'feedback', reason: 'missing', scope: 'new', evidence: ['automation', 'concepts'], candidates: [FLOW,
      candidate('concept:prompt-to-results', 'Output fan-out and loopable playback do not expose a return-edge payload or an updated next input.')],
    values: [4, 4, 3, 2, 3], decision: 'prototype-after-first-small-batch',
    proposedBehavior: 'Hold an output, carry a labelled result back to the same input, show what changes and resolve a second iteration with clear direction.',
    useCase: 'Explain a draft -> review -> revision cycle using reviewed generic copy, without claiming that any performance metric improved.',
    rationale: 'Feedback is distinct from replay and circular decoration, but its return path and second iteration demand longer readable beats and careful state continuity.'},
  {id: 'editable-path-morph', labelEn: 'Expose authored vector morphing in an editable scene', labelAr: 'توصيل تحوّل مسارات مرسومة بالمحرر',
    visualJob: 'shape-transformation', reason: 'internal-only', scope: 'wire', evidence: ['draw', 'manifest'], candidates: [MORPH,
      candidate('concept:button-to-window', 'Packages a specific button/window transformation; it does not accept arbitrary authored SVG path pairs.')],
    values: [2, 3, 5, 3, 2], decision: 'defer-until-concrete-project-use',
    proposedBehavior: 'If a project needs it, wrap existing morphPath in validated project-local fields for supplied compatible paths, timing and style-owned ink; no new interpolation engine.',
    useCase: 'Transform one reviewed schematic outline into another while retaining object identity; arbitrary logos or supplied artwork require their own provenance.',
    rationale: 'The interpolation already exists internally, so this is wiring. A generic morph need is less established than explanatory decisions; path compatibility, provenance and editor input remain risks.'},
  {id: 'concept-split-layout', labelEn: 'Respect concept layout limits', labelAr: 'احترام حدود تخطيط المشاهد المفاهيمية',
    visualJob: 'process', reason: 'unsupported-in-context', scope: 'wire', evidence: ['semantic', 'creative'], candidates: [FLOW, PROCESS],
    values: [2, 3, 4, 2, 2], decision: 'use-existing-alternative-or-project-scene',
    requestedLayout: 'split', contentModes: ['recording'],
    proposedBehavior: 'For a split presenter passage choose the existing split-capable process family. Use a project-scene only when the exact concept action is necessary and safe; do not relabel a takeover concept as split-ready.',
    useCase: 'Keep a presenter visible while explaining three steps using process; a four-step takeover concept requires a different authored layout decision.',
    rationale: 'This is a contextual contract limit, not a missing visual mechanism. Existing split-capable alternatives make global layout expansion a lower priority.'},
];

const FACTOR_REASONS = {
  'existing-motion-review': [
    'Resolves whether existing scenes already explain the idea.',
    'Review can inform every later library choice.',
    'Uses existing scene contracts and preview tools.',
    'Gathers evidence before any new mechanism implementation.',
    'Avoids duplicate actions; actual readability still requires review.',
  ],
  'conditional-branching': [
    'A visible condition and selected path convey a decision that linear steps cannot.',
    'Could explain routing, eligibility or choice in different videos; this is an estimate.',
    'Reuses flow nodes, connectors, cards and style-aware text fitting.',
    'Adds condition and route state plus editor and timing contracts.',
    'A small authored branch can remain legible; RTL crossings require review.',
  ],
  'identity-filtering': [
    'Shows why particular members survive instead of merely shrinking a group.',
    'Could serve shortlists and selection criteria; no usage evidence is claimed.',
    'message-board already provides unique IDs and object continuity.',
    'Requires stage membership, rejected destinations and readable transition timing.',
    'Stable IDs help traceability, while card density limits the useful set size.',
  ],
  'queue-bottleneck': [
    'Explains accumulation and a constrained stage rather than just reporting delay.',
    'Could apply to service, review and production explanations; this is an estimate.',
    'Can reuse flow geometry and cards, but not a complete queue state model.',
    'Arrivals, waiting, service and departures need new state and validation.',
    'Item overlap and apparent quantitative rates risk misleading or unreadable motion.',
  ],
  'semantic-feedback': [
    'Shows how one result changes the next input, beyond a repeated animation.',
    'Could explain review and refinement cycles; this is estimated applicability.',
    'Can reuse cards and connectors, but the returned payload and iteration state are new.',
    'A labelled return path and second iteration need additional editor and timing work.',
    'Direction and changed state need longer holds and careful RTL continuity.',
  ],
  'editable-path-morph': [
    'A specific project need for arbitrary path pairs has not yet been established.',
    'Potential reuse depends on supplied compatible artwork, not generic demand.',
    'The interpolation and path compatibility helper already exist locally.',
    'Needs validated fields and an editor binding rather than new interpolation code.',
    'Invalid paths, provenance and an arbitrary shape change may obscure meaning.',
  ],
  'concept-split-layout': [
    'The visual job already exists; only the requested layout is constrained.',
    'May matter when the presenter must stay visible; no observed demand is asserted.',
    'Existing process already supports split, avoiding a new global mechanism.',
    'Reflowing a complete takeover concept would require geometry and safe-zone work.',
    'A smaller canvas can compromise Arabic labels, footage and presenter clearance.',
  ],
};

function validateInventory(inventory) {
  if (!inventory || !Array.isArray(inventory.items) || !Array.isArray(inventory.sources)) throw new TypeError('Gap analysis requires an inventory with items and sources arrays.');
  const seen = new Set();
  for (const item of inventory.items) {
    if (!item || typeof item.key !== 'string' || !item.key.includes(':') || typeof item.layer !== 'string') throw new TypeError('Each inventory item needs a qualified key and layer.');
    if (seen.has(item.key)) throw new TypeError(`Duplicate inventory key: ${item.key}`);
    seen.add(item.key);
  }
  for (const source of inventory.sources) if (!source || typeof source.path !== 'string' || typeof source.sha256 !== 'string') throw new TypeError('Each inventory source needs a path and sha256.');
}

/** Pure analysis of an inventory snapshot; no reads, writes, imports, renders or readiness promotion. */
export function analyzeLibraryGaps(inventory) {
  validateInventory(inventory);
  const items = [...inventory.items].sort((a, b) => compare(a.key, b.key));
  const byKey = new Map(items.map((item) => [item.key, item]));
  const sources = new Map(inventory.sources.map((source) => [source.path, source]));
  const sourceEvidence = (ids) => ids.map((id) => {
    const [expectedSha256, observation] = OBSERVATIONS[id];
    const current = sources.get(PATHS[id]);
    return {path: PATHS[id], observation, expectedSha256, sha256: current?.sha256 ?? null,
      verification: !current ? 'unavailable' : current.sha256.toLowerCase() === expectedSha256 ? 'matched' : 'changed'};
  });
  const candidateView = ({key, limitation}) => {
    const item = byKey.get(key);
    if (!item) return null;
    return {key, limitation, layer: item.layer, lifecycle: item.lifecycle ?? 'unassessed',
      sourcePaths: uniqueSorted(item.sourcePaths ?? []), layouts: [...(item.layouts ?? [])], ownerStyle: item.ownerStyle ?? null,
      reachability: {...(item.reachability ?? {})},
      minimumDuration: item.minDurationSec === undefined ? {status: 'unassessed'} : {
        status: 'declared', seconds: item.minDurationSec, baseFps: item.baseFps, framesByFps: {...item.minFramesByFps}},
      styleBrandMood: {status: 'unassessed', reason: 'The inventory does not prove item-level mood, energy, brand compatibility or visual review across styles.'}};
  };
  const coverage = JOBS.map((job) => {
    const explicit = items.filter((item) => !item.variantOf && item.lifecycle !== 'retired' && ['scene', 'concept'].includes(item.kind) && item.visualJobs?.includes(job.id));
    const keys = uniqueSorted([...job.keys, ...explicit.map((item) => item.key)]).filter(key=>{
      const item=byKey.get(key);return item&&!item.variantOf&&item.lifecycle!=='retired';
    });
    const existingCandidates = keys.map((key) => candidateView(candidate(key, job.limitation))).filter(Boolean);
    const evidence = sourceEvidence(job.evidence);
    return {id: job.id, visualJob: job.id, labelEn: job.labelEn, labelAr: job.labelAr,
      status: existingCandidates.length ? 'declared' : evidence.every((entry) => entry.verification === 'matched') ? 'gap-candidate' : 'unresolved',
      existingCandidates, sourceEvidence: evidence, limitations: [job.limitation,
        'Declared coverage is not a ready recommendation or proof of actual motion quality.'],
      context: {mood: 'unassessed', energy: 'unassessed', styleBrand: 'unassessed', constraints: [...CONSTRAINTS]}};
  });
  const reviewedCandidates = items.filter((item) => ['scene', 'concept'].includes(item.layer) && item.role !== 'extension-point');
  const gaps = PROPOSALS.filter((proposal) => proposal.reason !== 'missing' ||
    !coverage.find((job) => job.id === proposal.visualJob)?.existingCandidates.length).map((proposal) => {
    const evidence = sourceEvidence(proposal.evidence);
    const existingCandidates = (proposal.candidates ?? reviewedCandidates.map((item) => candidate(item.key,
      'Declared source coverage has no actual-motion review evidence in this inventory; a lifecycle label alone does not establish creator acceptance.')))
      .map(candidateView).filter(Boolean);
    const current = existingCandidates.length > 0 && evidence.every((entry) => entry.verification === 'matched');
    const factors = FACTORS.map(([id, weight, description], index) => ({id, weight, value: proposal.values[index],
      description, rationale: FACTOR_REASONS[proposal.id][index]}));
    const priority = Math.round(factors.reduce((score, factor) => score + factor.weight * factor.value / 5, 0));
    return {id: proposal.id, key: `gap:${proposal.id}`, labelAr: proposal.labelAr, labelEn: proposal.labelEn,
      visualJob: proposal.visualJob, reason: proposal.reason, scope: proposal.scope, status: 'proposed',
      assessment: current ? 'source-backed' : 'needs-reassessment', evidenceConfidence: current ? 'high' : 'low',
      confidenceMeaning: 'Confidence concerns the bounded source observation, never creator approval, project fit or absence of all possible custom code.',
      context: {requestedLayout: proposal.requestedLayout ?? 'project-dependent', contentModes: proposal.contentModes ?? ['recording', 'graphics'],
        mood: 'unassessed', energy: 'unassessed', styleBrand: 'preserve-existing-policy', duration: 'prototype-and-measure-readable-hold', constraints: [...CONSTRAINTS]},
      existingCandidates, sourceEvidence: evidence, proposedBehavior: proposal.proposedBehavior, useCase: proposal.useCase,
      rationale: proposal.rationale, factors, priority, priorityBand: priority >= 80 ? 'high' : priority >= 60 ? 'medium' : 'low',
      decision: current ? proposal.decision : 'reinspect-changed-or-incomplete-sources',
      preferredImplementation: 'first-party project-scene prototype; retain current pinned dependencies and normal editor/render contracts'};
  }).sort((a, b) => b.priority - a.priority || compare(a.id, b.id)).map((gap, index) => ({...gap, rank: index + 1}));
  const canonicalKeysByLayer = {};
  for (const item of items) if (!item.variantOf) (canonicalKeysByLayer[item.layer] ??= []).push(item.key);
  const limitations = [
    'This is a bounded source-based assessment with curated observations; it does not prove the absence of mechanisms in unindexed or project-local code.',
    'Priorities are subjective editorial and engineering judgements, not measured demand, frequency, render cost or a market comparison.',
    'No preview playback or actual motion was reviewed by this analysis. No item receives creator approval or readiness promotion.',
    'Mood, energy, style/brand fit and readable duration remain unassessed where the inventory has no evidence; apply the actual schema and selected style guide.',
    'Counts remain separate by inventory layer; recipes, aliases, styles, sounds and primitives are not added into one motion count.',
    'The current inventory does not carry a validated review-evidence contract, so the review backlog is conservative and cannot close from lifecycle labels alone.',
  ];
  if (gaps.some((gap) => gap.assessment === 'needs-reassessment')) limitations.push('Changed or unavailable source anchors make some conclusions incomplete; reinspect them before choosing an expansion.');
  return {version: 1, methodology: {
    rankingBasis: 'Explicit subjective editorial and engineering judgement on a 1-5 scale; no measured demand or frequency is inferred.',
    weights: Object.fromEntries(FACTORS.map(([id, weight]) => [id, weight])), scoreMeaning: 'Weighted 1-5 factors scaled to 0-100; higher means earlier investigation, not approval to implement.',
    approvalPolicy: 'Inventory declaration, preview generation and technical checks never establish actual-motion review or creator acceptance.',
    sourceFreshness: 'Curated source observations are checked against inventoried SHA-256 anchors; changes or unavailable anchors require reassessment.'},
    inventory: {countsByLayer: Object.fromEntries(Object.entries(inventory.countsByLayer ?? {}).sort(([a], [b]) => compare(a, b))),
      canonicalKeysByLayer: Object.fromEntries(Object.entries(canonicalKeysByLayer).sort(([a], [b]) => compare(a, b))),
      variants: items.filter((item) => item.variantOf).map((item) => ({key: item.key, canonicalKey: item.variantOf, layer: item.layer})),
      unresolved: [...(inventory.unresolved ?? [])].sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)))},
    coverage, gaps,
    summary: {coveredJobs: coverage.filter((job) => job.status === 'declared').map((job) => job.id),
      gapCandidateJobs: coverage.filter((job) => job.status === 'gap-candidate').map((job) => job.id),
      firstExpansionCandidates: gaps.filter((gap) => gap.reason === 'missing' && gap.assessment === 'source-backed').slice(0, 2).map((gap) => gap.id),
      nextAction: 'Prepare and review existing previews, then choose a small first-party project-local prototype batch.'}, limitations};
}

const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');

/** Human-readable projection of the same evidence and ranking; never a readiness report. */
export function gapsMarkdown(report) {
  if (!report || !Array.isArray(report.coverage) || !Array.isArray(report.gaps)) throw new TypeError('gapsMarkdown requires a gap report.');
  const lines = ['# Reel Studio motion coverage and gaps', '', report.methodology.rankingBasis, '',
    'Declared coverage, technical checks and generated previews do not establish creator approval or actual-motion acceptance.', '',
    '## Existing visual coverage', '', '| Visual job | Source status | Existing qualified keys | Current limit |', '| --- | --- | --- | --- |'];
  for (const job of report.coverage) lines.push(`| ${cell(job.labelEn)} | ${cell(job.status)} | ${cell(job.existingCandidates.map((item) => item.key).join(', ')) || '-'} | ${cell(job.limitations[0])} |`);
  lines.push('', '## Prioritised investigation backlog', '', 'Scores are subjective priorities for investigation, not measured demand or permission to implement.', '',
    '| Rank | Proposal | Reason | Scope | Priority | Confidence |', '| --- | --- | --- | --- | --- | --- |');
  for (const gap of report.gaps) lines.push(`| ${gap.rank} | ${cell(gap.labelEn)} | ${gap.reason} | ${gap.scope} | ${gap.priority} (${gap.priorityBand}) | ${gap.evidenceConfidence}: ${gap.assessment} |`);
  for (const gap of report.gaps) {
    lines.push('', `### ${gap.rank}. ${gap.labelEn}`, '', `- Key: \`${gap.key}\`; visual job: ${gap.visualJob}; decision: ${gap.decision}.`,
      `- Visual action: ${gap.proposedBehavior}`, `- Practical use: ${gap.useCase}`, `- Subjective rationale: ${gap.rationale}`,
      `- Confidence: ${gap.evidenceConfidence} (${gap.assessment}). ${gap.confidenceMeaning}`, '', 'Existing candidate limits:', '');
    for (const item of gap.existingCandidates) lines.push(`- \`${item.key}\`: ${item.limitation}`);
    lines.push('', 'Source evidence:', '');
    for (const evidence of gap.sourceEvidence) lines.push(`- \`${evidence.path}\` (${evidence.verification}): ${evidence.observation}`);
    lines.push('', 'Priority factors (1-5, subjective):', '');
    for (const factor of gap.factors) lines.push(`- ${factor.id}: ${factor.value}/5, weight ${factor.weight}%. ${factor.rationale}`);
    lines.push('', 'Context constraints:', '');
    for (const constraint of gap.context.constraints) lines.push(`- ${constraint}`);
  }
  lines.push('', '## Limits of this report', '');
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  return `${lines.join('\n')}\n`;
}
