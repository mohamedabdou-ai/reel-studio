// Turns a stopped setup step's error into one word from a fixed list. The word drives the hint in the status line,
// the assistant's troubleshooting and the stop statistic; it never carries a path, a name or free text.
export const SETUP_FAILURE_REASONS = Object.freeze(['network', 'timeout', 'disk-full', 'file-locked', 'path', 'hash', 'unavailable', 'missing-runtime', 'extract', 'unknown']);

export const NETWORK_CODES = Object.freeze(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH',
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CLOSED']);

const CODES = Object.freeze({
  ENOSPC: 'disk-full', EPERM: 'file-locked', EBUSY: 'file-locked', EACCES: 'file-locked', ENAMETOOLONG: 'path',
  ...Object.fromEntries(NETWORK_CODES.map(code => [code, 'network'])),
});

// Checked over the message and the captured child-process output; the first match wins.
const PATTERNS = [
  ['disk-full', /\bENOSPC\b|not enough space on the disk|no space left on device/i],
  ['missing-runtime', /Visual C\+\+ Redistributable|0xC0000135|3221225781/i],
  ['timeout', /did not finish within \d+ s/],
  ['file-locked', /\b(?:EPERM|EBUSY|EACCES)\b|operation not permitted|resource busy or locked|being used by another process/i],
  ['path', /\bENAMETOOLONG\b|path too long|must be a regular project-local directory|package\.json.*فوق/i],
  ['hash', /SHA-256/],
  ['network', /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ERR_SOCKET_TIMEOUT|UND_ERR_[A-Z_]+)\b|socket hang up|fetch failed|getaddrinfo|network request/i],
  ['extract', /\b7zr(?:\.exe)?\b.*(?:failed|exited)|Unexpected FFmpeg version|Missing required filter/i],
  // Installer messages may arrive without their reason through a child process.
  ['extract', /\b7zr could not unpack\b|\bThe unpacked ffmpeg\.exe did not run\b|\bff(?:mpeg|probe)\.exe is missing from ffmpeg-[^\r\n]+-full_build\.7z\b/i],
  ['unavailable', /\bHTTP 4\d\d\b|\bE4\d\d\b/],
];

const codeOf = error => [error?.code, error?.cause?.code, error?.cause?.cause?.code].find(code => typeof code === 'string');

export function classifySetupError(error) {
  if (SETUP_FAILURE_REASONS.includes(error?.reason)) return error.reason;
  const code = codeOf(error);
  if (code && Object.hasOwn(CODES, code)) return CODES[code];
  const text = `${error?.message ?? error ?? ''}\n${error?.outputTail ?? ''}`;
  for (const [reason, pattern] of PATTERNS) if (pattern.test(text)) return reason;
  return 'unknown';
}

export const REASON_HINTS = Object.freeze({
  network: 'النت قطع أو بطيء أثناء التنزيل. اللي اتنزّل محفوظ، شغّل setup تاني وهيكمّل من مكانه.',
  timeout: 'الخطوة أخدت وقت أطول من المسموح. شغّل setup تاني وهيكمّل من مكانه.',
  'disk-full': 'المساحة خلصت على القرص. فضّي مساحة وشغّل setup تاني.',
  'file-locked': 'برنامج الحماية أو OneDrive ماسك ملف من ملفات الاستوديو. استثني فولدر الاستوديو من الفحص أو وقّف مزامنته، وبعدين شغّل setup تاني.',
  path: 'مسار فولدر الاستوديو طويل أو فيه مشكلة. انقله لمكان قصير زي D:\\ReelStudio وشغّل setup تاني.',
  hash: 'الملف اللي نزل مش مطابق للنسخة المعتمدة (ممكن بروكسي أو برنامج حماية غيّره). شغّل setup تاني، ولو اتكرر ابعت رسالة الخطأ.',
  unavailable: 'الملف مش متاح عند مصدره دلوقتي. جرّب بعد شوية، ولو فضل كده ابعت رسالة الخطأ.',
  'missing-runtime': 'ويندوز ناقصه مكتبة Microsoft Visual C++ (x64). نزّلها من https://aka.ms/vs/17/release/vc_redist.x64.exe وبعدين شغّل setup تاني.',
  extract: 'فك الملف فشل. شغّل setup تاني، ولو اتكرر ابعت رسالة الخطأ.',
});

// The text after «التجهيز وقف عند «…»: ». An unknown reason, or a state saved by an older studio, keeps today's line.
export function setupFailureHint(state) {
  if (typeof state?.hint === 'string' && state.hint) return state.hint;
  if (Object.hasOwn(REASON_HINTS, state?.reason)) return REASON_HINTS[state.reason];
  return `${state?.error}. شغّل setup تاني وهيكمّل من مكانه.`;
}
