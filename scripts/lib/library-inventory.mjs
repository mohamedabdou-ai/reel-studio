import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../engine/package.json', import.meta.url));
export const LIBRARY_KINDS = Object.freeze(['style', 'scene', 'concept', 'effect', 'sound', 'primitive']);
/** A source fingerprint that ignores line endings: a checkout with Windows (CRLF) endings is the same source, not drift. */
export const textSha256 = (text) => createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex');
const SCHEMA = 'engine/src/prepared-edit/schema.ts';
const STYLE_REGISTRY = 'engine/src/styles/registry.ts';
const CONCEPT_CATALOG = 'engine/src/motion-concepts/catalog.ts';
const RECIPE_CATALOG = 'engine/src/motion-library/catalog.ts';
const SOUND_CATALOG = 'Sound-Kits/catalog.json';
const TRANSITIONS = 'engine/src/prepared-edit/graphics-transitions.ts';
// Scope adapters identify source modules, never duplicate their exported item lists.
const SCENE_GROUPS = [
  ['engine/src/creative-kit/schema.ts', 'sceneFamilies'],
  ['engine/src/creative-kit/kinetic/schema.ts', 'kineticSceneVariants'],
  ['engine/src/motion-library/schema.ts', 'librarySceneVariants'],
  ['engine/src/screen-recording/schema.ts', 'screenRecordingVariants'],
  ['engine/src/creative-kit/semantic/schema.ts', 'semanticSceneVariants'],
  ['engine/src/arabic-type/schema.ts', 'arabicTypeSceneVariants'],
  ['engine/src/creative-kit/figures/schema.ts', 'figuresSceneVariants'],
  ['engine/src/creative-kit/chat-thread/schema.ts', 'chatThreadSceneVariants'],
  ['engine/src/styles/scenes.ts', 'styleSceneVariants'],
  ['engine/src/creative-kit/proof-screen/schema.ts', 'proofScreenSceneVariants'],
  ['engine/src/creative-kit/compose/schema.ts', 'composeSceneVariants'],
  ['engine/src/project-scenes/schema.ts', 'projectSceneVariant'],
];
const PRIMITIVE_FILES = [
  'core/accents.tsx', 'core/curtain.tsx', 'core/device.tsx', 'core/draw.tsx', 'core/finish.tsx',
  'core/mask.tsx', 'core/mblur.tsx', 'core/speed.tsx', 'core/transitions.tsx', 'core/transitions-dir.tsx',
  'creative-kit/primitives.tsx', 'creative-kit/kinetic-words.tsx', 'creative-kit/emphasis.tsx',
  'creative-kit/compare.tsx', 'creative-kit/ui-code.tsx', 'creative-kit/ui-keys.tsx',
  'motion-library/upstream.tsx', 'motion-library/vendor/remotion-ui.tsx', 'motion-library/vendor/remotion-bits.tsx',
].map((file) => `engine/src/${file}`);
const sorted = (values) => [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
const choices = (schema) => schema?.options ?? (schema?.value === undefined ? [] : [schema.value]);
const primitiveKey = (file, name) => `primitive:${file}#${name}`;

/** A read-only source inventory. Registration is evidence of a contract, never of creative approval. */
export async function collectLibraryInventory({root = DEFAULT_ROOT} = {}) {
  root = path.resolve(root);
  const actualRoot = await fs.realpath(root).catch(() => null);
  const installedRoot = await fs.realpath(DEFAULT_ROOT);
  const trustedMetadata = actualRoot !== null && path.relative(installedRoot, actualRoot) === '';
  const items = [], sources = new Map(), unresolved = [], textByPath = new Map();
  function issue(code, source, detail) { unresolved.push({code, source, detail}); }
  async function read(file) {
    if (textByPath.has(file)) return textByPath.get(file);
    if (!/^(engine\/src\/|Sound-Kits\/catalog\.json$)/.test(file) || file.split('/').includes('..')) {
      throw new Error('Inventory sources must be scoped engine files or the sound catalog.');
    }
    try {
      const absolute = path.join(root, ...file.split('/'));
      const relative = path.relative(await fs.realpath(root), await fs.realpath(absolute));
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('source-outside-root');
      const text = await fs.readFile(absolute, 'utf8');
      sources.set(file, {path: file, sha256: textSha256(text)});
      textByPath.set(file, text);
      return text;
    } catch (error) {
      textByPath.set(file, null);
      issue('source-unavailable', file, `Source was not read (${error.code ?? 'outside-root-or-unreadable'}).`);
      return null;
    }
  }
  async function load(file) {
    if (await read(file) === null) return null;
    if (!trustedMetadata) {
      issue('metadata-import-skipped', file, 'Foreign-root metadata was read as text only; its top-level or transitive code was not executed.');
      return null;
    }
    try { return await import(pathToFileURL(path.join(root, ...file.split('/'))).href); }
    catch (error) { issue('module-unavailable', file, `Source exports could not be loaded (${error.code ?? error.name}).`); return null; }
  }
  function add(layer, kind, nativeId, sourcePaths, details = {}) {
    items.push({key: layer === 'primitive' ? primitiveKey(sourcePaths[0], nativeId) : `${layer}:${nativeId}`,
      nativeId, kind, layer, sourcePaths: sorted(new Set(sourcePaths)), lifecycle: 'unassessed',
      reachability: {manifest: 'not-direct', editor: 'unverified', renderer: 'unverified'}, variantOf: null, ...details});
  }

  const styles = await load(STYLE_REGISTRY);
  for (const meta of styles?.STYLE_METAS ?? []) {
    const metaPath = `engine/src/styles/${meta.id}/meta.ts`;
    if (/^[a-z0-9-]+$/.test(meta.id)) await read(metaPath);
    add('style', 'style', meta.id, [STYLE_REGISTRY, metaPath], {label: meta.label, summary: meta.description,
      tags: [...meta.useCases, ...Object.keys(meta.fit.tone)], brand: meta.brand, defaults: meta.defaults,
      familiesOff: [...(meta.familiesOff ?? [])], ownScenes: [...meta.ownScenes], reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  }
  const concepts = await load(CONCEPT_CATALOG);
  const conceptTypesPath = 'engine/src/motion-concepts/types.ts', conceptTimingPath = 'engine/src/motion-concepts/timeline.ts';
  const conceptTypes = await load(conceptTypesPath), conceptTiming = await load(conceptTimingPath);
  for (const entry of concepts?.CATALOG ?? []) {
    const schemaPath = `engine/src/motion-concepts/${entry.id}/schema.ts`;
    if (/^[a-z0-9-]+$/.test(entry.id)) await read(schemaPath);
    const baseFps = conceptTypes?.CONCEPT_FPS;
    const timing = typeof baseFps === 'number' && typeof conceptTiming?.minFramesAtFps === 'function' ? {
      baseFps, minDurationSec: entry.minFrames / baseFps, defaultDurationSec: entry.defaultFrames / baseFps,
      minFramesByFps: Object.fromEntries([30, 50, 60].map((fps) => [fps, conceptTiming.minFramesAtFps(entry.minFrames, fps)])),
    } : {};
    if (!timing.baseFps) issue('concept-timing', CONCEPT_CATALOG, `${entry.id} has no verified authored frame rate or scaling helper.`);
    add('concept', 'concept', entry.id, [CONCEPT_CATALOG, schemaPath, conceptTypesPath, conceptTimingPath], {
      label: entry.title, summary: entry.message, tags: [...entry.tags], family: entry.family,
      minFrames: entry.minFrames, defaultFrames: entry.defaultFrames, loopable: entry.loopable,
      ...timing, dataFields: entry.dataFields, parentKey: 'scene:motion-concept',
      reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  }
  const sceneSources = new Map();
  for (const [file, name] of SCENE_GROUPS) {
    const module = await load(file), exported = module?.[name];
    for (const value of Array.isArray(exported) ? exported : exported ? [exported] : []) {
      const family = typeof value === 'string' ? value : value.shape?.family?.value;
      if (family) sceneSources.set(family, file);
    }
  }
  const schemas = await load(SCHEMA);
  const sceneSchema = schemas?.editSceneSchema;
  // Zod 4 exposes the intersection's discriminated union here; fail visibly if that contract changes.
  const sceneOptions = sceneSchema?.def?.type === 'intersection' ? sceneSchema.def.left?.options : undefined;
  if (schemas && !Array.isArray(sceneOptions)) issue('schema-shape', SCHEMA, 'The scene union could not be enumerated; no guessed scene list was substituted.');
  for (const schema of sceneOptions ?? []) {
    const family = schema.shape?.family?.value;
    if (typeof family !== 'string') { issue('schema-shape', SCHEMA, 'A scene has no literal family.'); continue; }
    add('scene', 'scene', family, [SCHEMA, ...(sceneSources.has(family) ? [sceneSources.get(family)] : [])], {
      layouts: choices(schema.shape.layout), role: family === 'project-scene' ? 'extension-point' : 'scene-family',
      ownerStyle: styles?.STYLE_METAS.find((meta) => meta.ownScenes.includes(family))?.id ?? null,
      reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
    if (!sceneSources.has(family)) issue('scene-source', SCHEMA, `${family} has no source-group adapter.`);
  }
  const motions = new Set((sceneOptions ?? []).flatMap((schema) => choices(schema.shape?.motion)));
  for (const id of motions) add('scene-entrance', 'effect', id, [SCHEMA], {reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  for (const id of choices(schemas?.layoutTransitionSchema?.shape?.kind)) {
    add('layout-transition', 'effect', id, [SCHEMA], {reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  }
  const transitions = await load(TRANSITIONS);
  for (const id of transitions?.TRANSITION_KINDS ?? []) {
    const overlay = transitions.OVERLAY_KINDS.includes(id);
    add(overlay ? 'overlay' : 'graphics-transition', 'effect', id, [TRANSITIONS], {
      role: transitions.GRAPHICS_ENTRANCE_KINDS.includes(id) ? 'graphics-entrance' : overlay ? 'overlay' : 'palette-transition',
      reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  }
  const wordPath = 'engine/src/creative-kit/kinetic-words-logic.ts';
  const words = await load(wordPath);
  for (const id of words?.TOKEN_ENTERS ?? []) add('word-entrance', 'effect', id, [wordPath], {
    parentKey: 'scene:kinetic-text', reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  for (const id of words?.EMPHASIS_KINDS ?? []) add('kinetic-emphasis', 'effect', id, [wordPath, 'engine/src/creative-kit/semantic/schema.ts'], {
    parentKey: 'scene:kinetic-text', reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  const captionPath = 'engine/src/prepared-edit/caption-emphasis.ts', captions = await load(captionPath);
  for (const id of captions?.CAPTION_EMPHASIS_KINDS ?? []) add('caption-emphasis', 'effect', id, [captionPath, SCHEMA], {
    reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  const looksPath = 'engine/src/looks/index.ts', looks = await load(looksPath);
  for (const id of looks?.LOOK_KINDS ?? []) add('look', 'effect', id, [looksPath, SCHEMA], {role: 'whole-picture-look', reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  for (const id of looks?.BACKDROP_KINDS ?? []) add('backdrop', 'effect', id, [looksPath], {role: 'backdrop'});
  const preferencePath = 'engine/src/core/preference-options.ts', preferences = await load(preferencePath);
  for (const id of preferences?.CAPTION_PRESENTATION ?? []) add('caption-presentation', 'effect', id, [preferencePath, SCHEMA], {
    reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  for (const id of preferences?.CAPTION_SKINS ?? []) add('caption-skin', 'effect', id, [preferencePath, SCHEMA], {
    reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  const cameraPath = 'engine/src/core/camera.ts', camera = await load(cameraPath);
  for (const id of camera?.PUNCH_KINDS ?? []) add('camera', 'effect', id, [cameraPath], {role: 'track-authoring-helper'});
  const sceneCameraPath = 'engine/src/core/scene-camera.tsx';
  await read(sceneCameraPath);
  for (const id of camera?.SCENE_CAMERA_MOVES ?? []) add('camera', 'effect', id, [cameraPath, sceneCameraPath, SCHEMA], {role: 'scene-camera', layouts: ['split', 'takeover'],
    reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
  const recipes = await load(RECIPE_CATALOG);
  for (const recipe of recipes?.listMotionRecipes().recipes ?? []) {
    const layouts=typeof recipe.layout==='string'?recipe.layout.split(' or '):[];
    const validLayouts=layouts.length>0&&layouts.every(layout=>['presenter','split','takeover'].includes(layout))&&new Set(layouts).size===layouts.length;
    if(!validLayouts)issue('recipe-layout',RECIPE_CATALOG,`${recipe.id} has no recognised recipe layout contract.`);
    add('recipe-variant', 'scene', recipe.id, [RECIPE_CATALOG], {variantOf: `scene:${recipe.family}`,
      label: recipe.label, summary: recipe.description, tags: [...recipe.tags], layouts:validLayouts?layouts:[],
      reachability: {manifest: 'via-parent', editor: 'unverified', renderer: 'unverified'}});
  }
  const recipeText = textByPath.get(RECIPE_CATALOG);
  if (recipeText?.includes('Motion-Kits/github-curated/manifest.json')) {
    issue('legacy-provenance-path', RECIPE_CATALOG, 'Recipes reference Motion-Kits/github-curated/manifest.json; attribution must be verified before intake or promotion.');
  }
  const soundText = await read(SOUND_CATALOG);
  if (soundText !== null) {
    try {
      const sound = JSON.parse(soundText);
      for (const entry of sound.sounds) add('sound-generator', 'sound', entry.id, [SOUND_CATALOG], {summary: entry.use, duration: entry.defaultDuration});
      for (const entry of sound.recipes) add('sound-recipe', 'sound', entry.id, [SOUND_CATALOG], {
        label: entry.name, summary: entry.use, duration: entry.duration,
        uses: sorted(new Set(entry.hits.map((hit) => `sound-generator:${hit.sound}`))),
        reachability: {manifest: 'declared', editor: 'unverified', renderer: 'unverified'}});
    } catch { issue('sound-catalog', SOUND_CATALOG, 'Sound catalog could not be enumerated.'); }
  }

  const primitiveExports = new Map();
  let parse;
  try { ({parse} = require('@babel/parser')); }
  catch { issue('parser-unavailable', 'engine/package.json', 'The installed @babel/parser is required for source-only primitive enumeration.'); }
  for (const file of PRIMITIVE_FILES) {
    const text = await read(file);
    if (text === null || !parse) continue;
    try {
      const ast = parse(text, {sourceType: 'module', plugins: ['typescript', 'jsx']});
      const imports = new Map(), declarations = new Map(), exported = [];
      for (const node of ast.program.body) {
        if (node.type === 'ImportDeclaration' && node.importKind !== 'type') {
          for (const specifier of node.specifiers) if (specifier.importKind !== 'type' && specifier.imported) {
            imports.set(specifier.local.name, {from: node.source.value, name: specifier.imported.name ?? specifier.imported.value});
          }
        }
        const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
        if (declaration?.type === 'VariableDeclaration') for (const binding of declaration.declarations) {
          if (binding.id.type === 'Identifier') declarations.set(binding.id.name, binding.init);
        }
        if (['FunctionDeclaration', 'ClassDeclaration'].includes(declaration?.type) && declaration.id) declarations.set(declaration.id.name, declaration);
        if (node.type !== 'ExportNamedDeclaration' || node.exportKind === 'type') continue;
        if (declaration?.type === 'VariableDeclaration') for (const binding of declaration.declarations) {
          if (binding.id.type === 'Identifier') exported.push({name: binding.id.name, local: binding.id.name});
        }
        if (['FunctionDeclaration', 'ClassDeclaration'].includes(declaration?.type) && declaration.id) exported.push({name: declaration.id.name, local: declaration.id.name});
        for (const specifier of node.specifiers ?? []) if (specifier.exportKind !== 'type' && specifier.exported && specifier.local) {
          exported.push({name: specifier.exported.name ?? specifier.exported.value, local: specifier.local.name});
        }
      }
      for (const entry of exported) {
        const value = declarations.get(entry.local), body = value?.body;
        // Only an expression-bodied, one-element JSX wrapper that forwards its entire sole parameter is an alias.
        // Added attributes, children, destructuring and function bodies may recompose or change behavior.
        const forward = value?.type === 'ArrowFunctionExpression' && !value.async && value.params.length === 1 && value.params[0].type === 'Identifier' &&
          body?.type === 'JSXElement' && body.openingElement.selfClosing && body.openingElement.name.type === 'JSXIdentifier' &&
          body.openingElement.attributes.length === 1 && body.openingElement.attributes[0].type === 'JSXSpreadAttribute' &&
          body.openingElement.attributes[0].argument.type === 'Identifier' && body.openingElement.attributes[0].argument.name === value.params[0].name;
        const alias = value?.type === 'Identifier' ? imports.get(value.name) : imports.get(entry.local) ?? (forward ? imports.get(body.openingElement.name.name) : undefined);
        const functional = /Function|Method/.test(value?.type ?? '');
        add('primitive', 'primitive', entry.name, [file], {role: functional ? /^[A-Z]/.test(entry.name) ? 'component-or-function' : 'helper' : 'value',
          ...(alias ? {importAlias: alias} : {})});
        primitiveExports.set(primitiveKey(file, entry.name), {file, alias});
      }
    } catch { issue('primitive-parse', file, 'Primitive exports could not be parsed; the TSX was not executed.'); }
  }
  for (const item of items.filter((entry) => entry.layer === 'primitive' && entry.importAlias)) {
    const {file, alias} = primitiveExports.get(item.key);
    if (alias.from.startsWith('.')) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), alias.from));
      const source = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => primitiveExports.has(primitiveKey(candidate, alias.name)));
      if (source) item.variantOf = primitiveKey(source, alias.name);
    }
    delete item.importAlias;
  }
  issue('primitive-scope', 'engine/src/', 'Only named value exports from the listed reusable visual modules are inventoried. Helpers, aliases and components are not equivalent to selectable scenes; further primitive coverage and wrapper deduplication remain to review.');
  const byKey = new Map();
  for (const item of items) {
    if (byKey.has(item.key)) issue('duplicate-key', item.sourcePaths[0], item.key);
    else byKey.set(item.key, item);
  }
  for (const item of items) if (item.variantOf && !byKey.has(item.variantOf)) issue('unresolved-variant', item.sourcePaths[0], `${item.key} -> ${item.variantOf}`);
  const counts = (field) => {
    const result = {};
    for (const item of byKey.values()) {
      if (item.variantOf && byKey.get(item.variantOf)?.[field] === item[field]) continue;
      result[item[field]] = (result[item[field]] ?? 0) + 1;
    }
    return Object.fromEntries(sorted(Object.keys(result)).map((key) => [key, result[key]]));
  };
  return {version: 1, evidence: 'Source contracts only. Lifecycle, editor access and rendered playback have not been assessed.',
    countsByLayer: counts('layer'), countsByKind: counts('kind'),
    items: [...byKey.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    sources: [...sources.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    unresolved: unresolved.sort((a, b) => `${a.source}:${a.code}:${a.detail}` < `${b.source}:${b.code}:${b.detail}` ? -1 : 1)};
}

const normalize = (value) => value.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/gu, '').replace(/[أإآٱ]/gu, 'ا').replace(/ى/gu, 'ي').replace(/ة/gu, 'ه');
export function filterLibraryInventory(inventory, {kind, query = '', limit} = {}) {
  if (kind !== undefined && !LIBRARY_KINDS.includes(kind)) throw new Error(`Unknown kind. Choose ${LIBRARY_KINDS.join(', ')}.`);
  if (typeof query !== 'string' || query.length > 200) throw new Error('Query must be text of at most 200 characters.');
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 1000)) throw new Error('Limit must be an integer from 1 to 1000.');
  const terms = normalize(query).trim().split(/\s+/u).filter(Boolean);
  return inventory.items.filter((item) => {
    const text = normalize(JSON.stringify([item.key, item.nativeId, item.label, item.summary, item.tags, item.family,
      item.editorial?.assessment==='current'?{explains:item.editorial.explains,action:item.editorial.action,useWhen:item.editorial.useWhen,intents:item.editorial.intents,display:item.editorial.display}:null]));
    return (kind === undefined || item.kind === kind) && terms.every((term) => text.includes(term));
  }).slice(0, limit);
}

export function inventoryMarkdown(inventory) {
  const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  const lines = ['# Reel Studio library inventory', '', inventory.evidence, '',
    'All lifecycle values are `unassessed`. Counts stay separate by layer; same-layer aliases do not add a capability.', '',
    '| Layer | Count |', '| --- | ---: |', ...Object.entries(inventory.countsByLayer).map(([layer, count]) => `| ${layer} | ${count} |`), '',
    '| Key | Kind | Variant of | Source |', '| --- | --- | --- | --- |',
    ...inventory.items.map((item) => `| ${cell(item.key)} | ${item.kind} | ${cell(item.variantOf)} | ${cell(item.sourcePaths.join(', '))} |`), '',
    '## Unresolved', '', ...inventory.unresolved.map((issue) => `- **${cell(issue.code)}** (${cell(issue.source)}): ${cell(issue.detail)}`)];
  return `${lines.join('\n')}\n`;
}
