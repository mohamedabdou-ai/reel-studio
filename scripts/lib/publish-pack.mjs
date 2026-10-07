export const PLATFORM_LABELS = Object.freeze({tiktok: 'TikTok', instagram: 'Instagram'});
export const CAPTION_MAX_CHARS = Object.freeze({tiktok: 2200, instagram: 2200});
export const MAX_HASHTAGS = 5;
const HASHTAG = /^#[\p{L}\p{N}_]{2,40}$/u;
const MENTION = /@[A-Za-z0-9_.]{1,30}/g;
const INLINE_HASHTAG = /(^|\s)#[\p{L}\p{N}_]/u;

const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} must be nonblank text of at most ${max} characters.`);
  return value.trim();
};


export function validatePublishCopy(copy, {profile, cta, writingStyle}) {
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) throw new Error('Publish copy must be a JSON object.');
  const allowed = ['title', 'notes', ...profile.platforms];
  const unknown = Object.keys(copy).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Unknown publish copy field: ${unknown}. This profile posts to ${profile.platforms.join(' and ')}.`);
  const out = {title: text(copy.title, 80, 'title'), notes: []};
  if (copy.notes !== undefined) {
    if (!Array.isArray(copy.notes) || copy.notes.length > 8) throw new Error('notes must be a list of at most 8 lines.');
    out.notes = copy.notes.map((note, i) => text(note, 240, `notes[${i}]`));
  }
  for (const platform of profile.platforms) {
    const label = PLATFORM_LABELS[platform];
    const entry = copy[platform];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Publish copy needs a ${platform} entry with caption and hashtags.`);
    const caption = text(entry.caption, CAPTION_MAX_CHARS[platform], `${platform}.caption`);
    if (writingStyle === 'short' && caption.length > 450) throw new Error(`The ${label} caption exceeds the saved short writing style (450 characters maximum).`);
    if (INLINE_HASHTAG.test(caption)) throw new Error(`Put the ${label} hashtags in ${platform}.hashtags, not inside the caption.`);
    if (cta && !caption.includes(cta)) throw new Error(`The ${label} caption must include the video's comment keyword «${cta}».`);
    for (const mention of caption.match(MENTION) ?? []) {
      if (mention !== profile.handle) throw new Error(`The ${label} caption mentions ${mention}; only the profile handle ${profile.handle ?? '(none set)'} may appear.`);
    }
    const tags = entry.hashtags;
    if (!Array.isArray(tags) || tags.length < 1 || tags.length > MAX_HASHTAGS) throw new Error(`${platform}.hashtags needs 1 to ${MAX_HASHTAGS} hashtags.`);
    const seen = new Set();
    for (const tag of tags) {
      if (typeof tag !== 'string' || !HASHTAG.test(tag)) throw new Error(`${platform}.hashtags: ${JSON.stringify(tag)} is not a hashtag like #تعديل_فيديو.`);
      const key = tag.toLowerCase();
      if (seen.has(key)) throw new Error(`${platform}.hashtags repeats ${tag}.`);
      seen.add(key);
    }
    out[platform] = {caption, hashtags: [...tags]};
  }
  return out;
}


export function renderPublishPack({profile, copy, cta, video, source, writingStyle}) {
  const lines = [`# ${copy.title} — publishing copy`, '', `Nothing has been posted. Language: ${profile.language}.`, '',
    `Source: ${source ? `\`${source}\`` : 'not recorded'}.`, `Final export: \`${video.path}\` (sha256 \`${video.sha256}\`).`,
    `Comment keyword: ${cta ? `«${cta}»` : 'none'}.`, ''];
  if (writingStyle) lines.push(`Description style: ${writingStyle}.`, '');
  for (const platform of profile.platforms) {
    lines.push(`## ${PLATFORM_LABELS[platform]}`, '', copy[platform].caption, '', copy[platform].hashtags.join(' '), '');
  }
  if (copy.notes.length) lines.push('## Notes', '', ...copy.notes.map((note) => `- ${note}`), '');
  return `${lines.join('\n')}`;
}
