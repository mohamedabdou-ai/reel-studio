import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promises as fs} from 'node:fs';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {normalizeProfile, ProfileError} from './branding.mjs';
import {defaultPreferences, PREFERENCE_VALUES, STYLE_LABELS, WRITING_GUIDES} from '../../engine/src/core/preference-options.ts';
import {readSetupState, describeSetup, workerAlive, STEP_LABELS} from './studio-state.mjs';
import {browserHomeProblem} from './studio-setup.mjs';
import {acquireProfileSaveLock} from './profile-save-lock.mjs';

const UI_ROOT = fileURLToPath(new URL('../settings-ui/', import.meta.url));
const MAX_BODY = 64 * 1024;
const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
class HttpError extends Error {constructor(status, message) {super(message); this.status = status;}}
const inside = (root, file) => {const rel = path.relative(root, file); return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);};

export const emptyProfile = () => ({schemaVersion: 3, name: '', handle: null, language: 'ar-EG',
  ending: {followCard: false, ctaDefault: null, signOff: null},
  brand: {primary: '#4D8DFF', accent: '#FFB020', background: null, text: null},
  platforms: ['instagram', 'tiktok'], preferences: defaultPreferences()});

async function bodyJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'ابعت الإعدادات بصيغة JSON.');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'حجم الإعدادات أكبر من المسموح.');
    chunks.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw new HttpError(400, 'الإعدادات المرسلة مش سليمة.');}
}

export async function createSettingsServer({root, port = 0} = {}) {
  root = await fs.realpath(root);
  const token = randomBytes(32).toString('hex');
  const profileFile = path.join(root, 'PROFILE.json');
  const lock = await fs.readFile(path.join(root, 'versions.lock.json'), 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return {edition: null, fonts: []}; throw error;
  });
  let origin;
  let saving = false;
  let starting = false;

  async function writable(file) {

    let cursor = file;
    while (inside(root, cursor) && cursor !== root) {
      const stat = await fs.lstat(cursor).catch(error => {if (error.code === 'ENOENT') return null; throw error;});
      if (stat?.isSymbolicLink() || (stat?.isFile() && stat.nlink > 1)) throw new HttpError(400, 'مكان الإعدادات مربوط بفولدر أو ملف تاني. افتح نسخة الاستوديو الأصلية.');
      cursor = path.dirname(cursor);
    }
    if (!inside(root, file)) throw new HttpError(400, 'مكان الإعدادات خارج فولدر الاستوديو.');
  }
  async function snapshot() {
    await writable(profileFile);
    const bytes = await fs.readFile(profileFile).catch(error => {if (error.code === 'ENOENT') return null; throw error;});
    if (bytes === null) return {ok: true, profile: null, etag: null};
    let value;
    try {value = JSON.parse(bytes.toString('utf8').replace(/^\ufeff/, ''));}
    catch {throw new HttpError(400, 'ملف PROFILE.json فيه مشكلة. خلي المساعد يراجعه؛ إعداداتك لسه محفوظة.');}
    return {ok: true, profile: normalizeProfile(value), etag: hash(bytes), bytes};
  }
  async function save(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !['profile', 'etag'].includes(key)) || !Object.hasOwn(payload, 'etag')) {
      throw new HttpError(400, 'الإعدادات المرسلة ناقصة. افتح الشاشة من جديد.');
    }
    const profile = normalizeProfile(payload.profile);
    if (saving) throw new HttpError(409, 'فيه حفظ شغال. جرّب تاني بعد لحظة.');
    saving = true;
    const temporary = path.join(root, `PROFILE.json.${randomUUID()}.tmp`);
    let release;
    try {
      release = await acquireProfileSaveLock(root);
      const current = await snapshot();
      if (current.etag !== payload.etag) throw new HttpError(409, 'إعداداتك اتغيّرت في شاشة تانية. اعمل إعادة تحميل قبل الحفظ.');
      if (current.bytes) {
        const directory = path.join(root, 'state', 'profile-backups');
        await writable(directory);
        await fs.mkdir(directory, {recursive: true});
        await fs.writeFile(path.join(directory, `${Date.now()}-${randomUUID()}.json`), current.bytes, {flag: 'wx'});
      }
      const bytes = `${JSON.stringify(profile, null, 2)}\n`;
      await fs.writeFile(temporary, bytes, {encoding: 'utf8', flag: 'wx'});
      await writable(profileFile);
      if ((await snapshot()).etag !== current.etag) throw new HttpError(409, 'إعداداتك اتغيّرت أثناء الحفظ. اعمل إعادة تحميل قبل الحفظ.');
      await fs.rename(temporary, profileFile);
      return {ok: true, profile, etag: hash(bytes)};
    } finally {
      await fs.unlink(temporary).catch(() => {});
      if (release) await release();
      saving = false;
    }
  }
  async function status() {
    const state = await readSetupState(root);
    const setup = describeSetup(state, {alive: workerAlive(state)}).json;
    return {ok: true, setup, labels: STEP_LABELS};
  }
  async function startSetup() {
    if (!(await snapshot()).profile) throw new HttpError(400, 'احفظ إعداداتك الأول عشان نبدأ التجهيز.');
    const current = await readSetupState(root);
    if (workerAlive(current) || current.status === 'done') return status();
    const locationProblem = browserHomeProblem(root);
    if (locationProblem) throw new HttpError(400, locationProblem);
    if (starting) throw new HttpError(409, 'التجهيز بيبدأ. استنى لحظة.');
    starting = true;
    try {
      await exec(process.execPath, [path.join(root, 'scripts', 'studio.mjs'), 'setup'], {cwd: root, windowsHide: true, timeout: 60_000, maxBuffer: 128 * 1024});
      return status();
    } catch {throw new HttpError(500, 'التجهيز ما بدأش. قول للمساعد «كمّل تجهيز الاستوديو» عشان يراجع السبب.');}
    finally {starting = false;}
  }
  const fontSpecs = (lock.fonts ?? []).filter(face => {
    if (!['arabic', 'latin', 'latin-ext'].includes(face.subset)) return false;
    return face.family === 'Cairo' ? face.weight === 400 : face.family === 'IBM Plex Sans Arabic' ? face.weight === 700
      : ['Tajawal', 'Noto Naskh Arabic'].includes(face.family) && [400, 700].includes(face.weight);
  });
  async function fontBytes(face) {
    const file = path.join(root, 'engine', 'public', 'fonts', face.file);
    const real = await fs.realpath(file);
    if (!inside(root, real)) throw new Error('Font path leaves the edition.');
    const bytes = await fs.readFile(real);
    if (hash(bytes) !== face.sha256) throw new Error('Font hash differs from the setup lock.');
    return bytes;
  }
  async function fontCss() {
    const faces = [];
    for (const face of fontSpecs) {
      if (!await fontBytes(face).catch(() => null)) continue;
      const family = face.family === 'IBM Plex Sans Arabic' ? 'Plex Display' : face.family;
      faces.push(`@font-face{font-family:"${family}";src:url("/fonts/${encodeURIComponent(face.file)}?token=${token}") format("woff2");font-weight:${face.family === 'Cairo' ? '200 1000' : family === 'Plex Display' ? '1 1000' : face.weight};font-style:normal;font-display:swap;unicode-range:${face.unicodeRange};}`);
    }
    return faces.join('\n');
  }

  const sendJson = (res, value, code = 200) => {res.writeHead(code, {'content-type': 'application/json; charset=utf-8'}); res.end(JSON.stringify(value));};
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) throw new HttpError(403, 'الرابط ده مخصص لإعدادات الاستوديو على جهازك.');
      const url = new URL(req.url, origin);
      const supplied = req.headers['x-reel-studio-token'] ?? (req.method === 'GET' ? url.searchParams.get('token') : null);
      if (supplied !== token) throw new HttpError(403, 'افتح رابط الإعدادات اللي المساعد فتحهولك.');
      if (url.pathname === '/api/profile' && req.method === 'GET') {
        const {bytes: _, ...value} = await snapshot(); return sendJson(res, value);
      }
      if (url.pathname === '/api/profile' && req.method === 'PUT') return sendJson(res, await save(await bodyJson(req)));
      if (url.pathname === '/api/catalog' && req.method === 'GET') {
        const available = await Promise.all(fontSpecs.map(async face => ({face, ready: !!await fontBytes(face).catch(() => null)})));
        const readyFonts = [...new Set(fontSpecs.map(face => face.family))].filter(family => available.filter(item => item.face.family === family).every(item => item.ready))
          .map(family => family === 'IBM Plex Sans Arabic' ? 'Plex Display' : family);
        return sendJson(res, {ok: true, edition: lock.edition, defaults: emptyProfile(), choices: PREFERENCE_VALUES, styles: STYLE_LABELS, writingGuides: WRITING_GUIDES, readyFonts});
      }
      if (url.pathname === '/api/status' && req.method === 'GET') return sendJson(res, await status());
      if (url.pathname === '/api/setup' && req.method === 'POST') {await bodyJson(req); return sendJson(res, await startSetup());}
      if (req.method !== 'GET') throw new HttpError(405, 'الطلب ده مش متاح.');
      if (url.pathname === '/fonts.css') {res.writeHead(200, {'content-type': 'text/css; charset=utf-8'}); return res.end(await fontCss());}
      if (url.pathname.startsWith('/fonts/')) {
        const face = fontSpecs.find(item => url.pathname === `/fonts/${item.file}`);
        if (!face) throw new HttpError(404, 'الخط مش موجود.');
        const bytes = await fontBytes(face).catch(() => null);
        if (!bytes) throw new HttpError(404, 'الخط لسه ما نزلش.');
        res.writeHead(200, {'content-type': 'font/woff2'}); return res.end(bytes);
      }
      const staticFiles = {'/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/app.css': ['app.css', 'text/css']};
      const file = staticFiles[url.pathname];
      if (!file) throw new HttpError(404, 'الصفحة مش موجودة.');
      const body = (await fs.readFile(path.join(UI_ROOT, file[0]), 'utf8')).replaceAll('__TOKEN__', token);
      res.writeHead(200, {'content-type': `${file[1]}; charset=utf-8`}); res.end(body);
    } catch (error) {
      sendJson(res, {ok: false, error: error instanceof ProfileError ? error.ar : error.status ? error.message : 'حصلت مشكلة. خلي المساعد يراجع الإعدادات.'}, error.status ?? (error instanceof ProfileError ? 400 : 500));
    }
  });
  server.requestTimeout = 15_000;
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', resolve);});
  origin = `http://127.0.0.1:${server.address().port}`;
  return {origin, token, url: `${origin}/?token=${token}`, close: () => new Promise((resolve, reject) => {server.closeIdleConnections(); server.close(error => error ? reject(error) : resolve());})};
}
