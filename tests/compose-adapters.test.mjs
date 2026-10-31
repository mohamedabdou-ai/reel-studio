// tests/compose-adapters.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {composeDataSchema} from '../engine/src/creative-kit/compose/schema.ts';
import * as classic from '../engine/src/creative-kit/compose/adapters/classic.ts';
import {validateComposeTiming,partSpan} from '../engine/src/creative-kit/compose/timing.ts';
import {composePaper} from '../engine/src/creative-kit/compose/schema.ts';
import {finish, frameOf, cardLabel} from '../engine/src/creative-kit/compose/adapters/types.ts';
import {bundleEngine} from './helpers/engine-bundle.mjs';
import {setSsrFrame} from './helpers/engine-bundle.mjs';
import {mediaNatural, estimatePartHeight} from '../engine/src/creative-kit/compose/budget.ts';

const timingValid = (data, layout = 'split') => {
  for (const part of data.parts) assert.ok(Number.isFinite(part.at.frame), `${part.id}: finite frame required`);
  assert.deepEqual(validateComposeTiming({id: 's', family: 'compose', fromFrame: 0, durationInFrames: 180, layout, motion: 'land', data}, 30, null), []);
  assert.equal(data.paper, undefined);
  assert.equal(composePaper(data), 'navy');
};

const at = (data, extra = {}) => ({id: 's', layout: 'split', motion: 'stagger', durationInFrames: 180, data, ...extra});
const valid = (data) => { const r = composeDataSchema.safeParse(data); assert.ok(r.success, JSON.stringify(r.error?.issues)); return r.data; };

test('intro keeps kicker, title and subtitle in order', () => {
  const d = valid(classic.introToCompose(at({kicker: 'فكرة', title: 'عنوان واضح', subtitle: 'تفصيلة قصيرة'})));
  assert.deepEqual(d.parts.map(p => [p.kind, p.text]), [['kicker', 'فكرة'], ['headline', 'عنوان واضح'], ['body', 'تفصيلة قصيرة']]);
});

test('proof is a hero number with its source', () => {
  const d = valid(classic.proofToCompose(at({label: 'عملاء جدد', value: 120, suffix: '+', source: 'تقرير الشهر', valueFit: 'rolling'})));
  assert.equal(d.arrangement, 'hero');
  assert.deepEqual(d.parts.find(p => p.kind === 'number'), {id: 'value', kind: 'number', at: d.parts.find(p => p.kind === 'number').at, value: 120, suffix: '+', emphasis: true});
  assert.equal(d.parts.at(-1).text, 'تقرير الشهر');
});

test('process, comparison, comment, follow and chapter-quote map every authored field', () => {
  valid(classic.processToCompose(at({title: 'الخطوات', steps: [{title: 'أ', detail: 'ب'}, {title: 'ج', detail: 'د'}, {title: 'ه', detail: 'و'}]})));
  assert.equal(valid(classic.comparisonToCompose(at({title: 'قبل وبعد', beforeTitle: 'قبل', beforeDetail: 'أبطأ', afterTitle: 'بعد', afterDetail: 'أسرع'}))).arrangement, 'two-column');
  assert.ok(valid(classic.commentToCompose(at({keyword: 'قالب', promise: 'هبعتلك الملف'}))).parts.some(p => p.kind === 'card' && p.variant === 'input' && p.title === 'قالب'));
  assert.ok(valid(classic.followToCompose(at({handle: '@studio', message: 'أفكار كل يوم'}))).parts.some(p => p.kind === 'card' && p.variant === 'follow' && p.title === '@studio'));
  const q = valid(classic.chapterQuoteToCompose(at({chapter: '٢', title: 'العنوان', quote: 'جملة الضيف', speaker: 'ضيف', role: 'مؤسس', quoteFrame: 40})));
  assert.deepEqual(q.parts.find(p => p.kind === 'quote').at, {frame: 40});
});

test('cues never pass the final hold of a short scene', () => {
  const d = classic.introToCompose(at({kicker: 'أ', title: 'ب', subtitle: 'ج'}, {durationInFrames: 40, motion: 'quiet'}));
  for (const p of d.parts) assert.ok(p.at.frame <= 40 - 30 - 1);
});

const classicFixtures = [
  ['introToCompose', {kicker: 'فكرة', title: 'عنوان واضح', subtitle: 'تفصيلة قصيرة'}],
  ['proofToCompose', {label: 'عملاء جدد', value: 120, suffix: '+', source: 'تقرير الشهر', valueFit: 'rolling'}],
  ['processToCompose', {title: 'الخطوات', steps: [{title: 'أ', detail: 'ب'}, {title: 'ج', detail: 'د'}, {title: 'ه', detail: 'و'}]}],
  ['comparisonToCompose', {title: 'قبل وبعد', beforeTitle: 'قبل', beforeDetail: 'أبطأ', afterTitle: 'بعد', afterDetail: 'أسرع'}],
  ['commentToCompose', {keyword: 'قالب', promise: 'هبعتلك الملف'}],
  ['followToCompose', {handle: '@studio', message: 'أفكار كل يوم'}],
  ['chapterQuoteToCompose', {chapter: '٢', title: 'العنوان', quote: 'جملة الضيف', speaker: 'ضيف', role: 'مؤسس', quoteFrame: 40}],
];
for (const [name, data] of classicFixtures) test(`${name} leaves a still reading hold on the plan fixture`, () => timingValid(classic[name](at(data))));

test('finish preserves field order when a quote cue precedes the heading cue', () => {
  const data = classic.chapterQuoteToCompose(at({chapter: '2', title: 'Title', quote: 'Quote', speaker: 'Guest', role: 'Role', quoteFrame: 0}));
  assert.deepEqual(data.parts.map(part => part.id), ['kicker', 'title', 'quote']);
  assert.deepEqual(data.parts.map(part => frameOf(part.at)), [0, 0, 0]);
  timingValid(data);
});

test('finish shifts a scene-frame press cue together with the card', () => {
  const data = finish(at({}), {arrangement: 'hero', parts: [{id: 'card', kind: 'card', variant: 'follow', at: {frame: 140}, pressFrame: 160, title: '@studio', value: 'Follow', emphasis: true}]});
  const card = data.parts[0];
  assert.equal(card.at.frame, 116);
  assert.equal(card.pressFrame, 136);
  timingValid(data);
});

test('Node-safe adapter labels match the existing card labels and language policy', async () => {
  const api = await bundleEngine("export {cardLabel} from './engine/src/creative-kit/labels';", {ssr: true});
  for (const key of ['proof', 'how', 'beforeAfter', 'comment', 'template', 'templateLine', 'follow', 'followButton', 'followLine', 'chapter']) {
    for (const data of [{title: 'English'}, {title: 'عنوان'}, {title: 'English', lang: 'ar'}, {title: 'عنوان', lang: 'en'}, {title: 'English', src: 'عربي.png'}, {title: '\u200fEnglish'}, {title: 'فارسی'}, {title: 'English', items: [{text: 'عنوان'}]}]) {
      assert.equal(cardLabel(key, data), api.cardLabel(key, data));
    }
  }
});

import * as semantic from '../engine/src/creative-kit/compose/adapters/semantic.ts';
const heading = {kicker: 'لوحة', title: 'العنوان'};

test('token-lens marks the lens token on its group card', () => {
  const d = valid(semantic.tokenLensToCompose(at({...heading, groups: [{label: 'أ', tokens: ['س', 'ص'], atFrame: 10}, {label: 'ب', tokens: ['ع'], atFrame: 30}], lens: {groupIndex: 0, tokenIndex: 1, atFrame: 60}, footer: 'ملاحظة'})));
  const lens = d.parts.find(p => p.emphasis);
  assert.equal(lens.value, 'ص');
  assert.equal(lens.body, 'س');
  assert.equal(d.arrangement, 'grid');
});

test('ticket uses the shorter visible label as its stub', () => {
  for (const [label,value,stub,title] of [['الخصم','٢٠٪','٢٠٪','الخصم'],['جلسة 1','جلسة واحدة 30 دقيقة','جلسة 1','جلسة واحدة 30 دقيقة'],['SESSION','One session','SESSION','One session']]) {
    const card=semantic.ticketOfferToCompose(at({...heading,ticket:{label,value,detail:'Detail',atFrame:20},footer:'Foot'})).parts.find(p=>p.kind==='card');
    assert.equal(card.value,stub);assert.equal(card.title,title);assert.equal(card.body,'Detail');
  }
});

test('comment-stack is one authored chat thread and follow never retains a plus', () => {
  const d=semantic.commentStackToCompose(at({...heading,comments:[{author:'First',text:'Words',atFrame:20},{author:'Second',text:'Reply',atFrame:60}],keyword:'Key',prompt:'Prompt'}));
  const chat=d.parts.find(p=>p.kind==='chat');
  assert.ok(chat);assert.deepEqual(chat.messages,[{from:'them',author:'First',text:'Words',offsetFrames:0},{from:'them',author:'Second',text:'Reply',offsetFrames:40}]);
  for(const message of ['Every day','كل يوم'])assert.doesNotMatch(classic.followToCompose(at({handle:'@studio',message})).parts.find(p=>p.kind==='card').value,/^\+/);
});

test('meter-receipt, ticket-offer, comment-stack, route-stops and evidence-wipe produce valid pages', () => {
  valid(semantic.meterReceiptToCompose(at({...heading, rows: [{label: 'قبل', value: 40, atFrame: 20}, {label: 'بعد', value: 80, atFrame: 40}], maximum: 100, unit: 'دقيقة', source: 'قياس توضيحي'})));
  valid(semantic.ticketOfferToCompose(at({...heading, ticket: {label: 'الخصم', value: '٢٠٪', detail: 'لأول شهر', atFrame: 30}, footer: 'بشروط'})));
  valid(semantic.commentStackToCompose(at({...heading, comments: [{author: 'منى', text: 'مفيد', atFrame: 20}], keyword: 'قالب', prompt: 'اكتب الكلمة'})));
  valid(semantic.routeStopsToCompose(at({...heading, stops: [{label: 'بداية', detail: 'فكرة', atFrame: 20}, {label: 'نهاية', detail: 'نتيجة', atFrame: 50}], footer: 'الطريق'})));
  const wipe = semantic.evidenceWipeToCompose(at({...heading, before: {src: 'projects/demo/a.png', width: 800, height: 600, label: 'قبل'}, after: {src: 'projects/demo/b.png', width: 800, height: 600, label: 'بعد'}, revealFrame: 30, revealDurationFrames: 40, dir: 'rtl', footer: 'لقطة'}));
  assert.equal(wipe.parts.find(p => p.kind === 'media').source.kind, 'compare');
});

const semanticFixtures = [
  ['tokenLensToCompose', {...heading, groups: [{label: 'أ', tokens: ['س', 'ص'], atFrame: 10}, {label: 'ب', tokens: ['ع'], atFrame: 30}], lens: {groupIndex: 0, tokenIndex: 1, atFrame: 60}, footer: 'ملاحظة'}],
  ['meterReceiptToCompose', {...heading, rows: [{label: 'قبل', value: 40, atFrame: 20}, {label: 'بعد', value: 80, atFrame: 40}], maximum: 100, unit: 'دقيقة', source: 'قياس توضيحي'}],
  ['ticketOfferToCompose', {...heading, ticket: {label: 'الخصم', value: '٢٠٪', detail: 'لأول شهر', atFrame: 30}, footer: 'بشروط'}],
  ['commentStackToCompose', {...heading, comments: [{author: 'منى', text: 'مفيد', atFrame: 20}], keyword: 'قالب', prompt: 'اكتب الكلمة'}],
  ['routeStopsToCompose', {...heading, stops: [{label: 'بداية', detail: 'فكرة', atFrame: 20}, {label: 'نهاية', detail: 'نتيجة', atFrame: 50}], footer: 'الطريق'}],
  ['evidenceWipeToCompose', {...heading, before: {src: 'projects/demo/a.png', width: 800, height: 600, label: 'قبل'}, after: {src: 'projects/demo/b.png', width: 800, height: 600, label: 'بعد'}, revealFrame: 30, revealDurationFrames: 40, dir: 'rtl', footer: 'لقطة'}],
];
for (const [name, data] of semanticFixtures) test(`${name} leaves a still reading hold on the plan fixture`, () => timingValid(semantic[name](at(data))));

test('semantic field order survives an early first card cue', () => {
  const data = semantic.tokenLensToCompose(at({...heading, groups: [{label: 'A', tokens: ['One'], atFrame: 0}, {label: 'B', tokens: ['Two'], atFrame: 30}], lens: {groupIndex: 0, tokenIndex: 0, atFrame: 60}, footer: 'Foot'}));
  assert.deepEqual(data.parts.map(part => part.id), ['kicker', 'title', 'group-0', 'group-1', 'foot']);
  assert.equal(data.parts[1].at.frame, 0);
  timingValid(data);
});

import * as kinetic from '../engine/src/creative-kit/compose/adapters/kinetic.ts';

test('outcome, data-story and image-compare map their fields', () => {
  valid(kinetic.outcomeToCompose(at({kicker: 'النتيجة', title: 'اللي اتغير', items: ['أسرع', 'أوضح'], footer: 'خلاصة'})));
  const metric = valid(kinetic.dataStoryToCompose(at({kicker: 'رقم', title: 'النمو', sourceNote: 'مصدر', display: 'metric', suffix: '%', unit: 'نسبة', animateFrames: 40, items: [{label: 'الشهر', value: 25, atFrame: 20}]})));
  assert.equal(metric.parts.find(p => p.emphasis).kind, 'number');
  const bars = valid(kinetic.dataStoryToCompose(at({kicker: 'رقم', title: 'مقارنة', sourceNote: 'مصدر', display: 'bars', suffix: '', unit: 'ساعة', animateFrames: 40, items: [{label: 'أ', value: 2, atFrame: 20}, {label: 'ب', value: 5, atFrame: 40}]}, {layout: 'takeover'})));
  assert.equal(bars.parts.find(p => p.emphasis).kind, 'bars');
  const pair = kinetic.imageCompareToCompose(at({kicker: 'قبل وبعد', title: 'الفرق', images: [{src: 'projects/demo/a.png', label: 'قبل'}, {src: 'projects/demo/b.png', label: 'بعد'}], stamp: 'الفرق واضح'}, {layout: 'takeover'}));
  assert.equal(pair.parts.find(p => p.kind === 'media').source.kind, 'pair');
});

test('screens keeps every step and clip as a timed sequence', () => {
  const clip = {src: 'projects/demo/c.mp4', sha256: 'b'.repeat(64), width: 1920, height: 1080, trimBeforeFrame: 0, fit: 'cover'};
  const broll = kinetic.screensToCompose(at({look: 'broll', steps: [{atFrame: 0, ...clip, label: 'لقطة'}, {atFrame: 60, ...clip}]}));
  const seq = broll.parts.find(p => p.kind === 'media').source;
  assert.equal(seq.kind, 'sequence');
  assert.deepEqual(seq.steps.map(s => s.offsetFrames), [0, 60]);
  const win = kinetic.screensToCompose(at({kicker: 'الشاشة', steps: [{atFrame: 0, title: 'الصفحة', src: 'projects/demo/s.png', kind: 'image', fit: 'contain', trimBeforeFrame: 0}]}, {layout: 'takeover'}));
  assert.equal(win.parts.find(p => p.kind === 'media').source.steps[0].still, 'projects/demo/s.png');
});

const demoClip = {src: 'projects/demo/c.mp4', sha256: 'b'.repeat(64), width: 1920, height: 1080, trimBeforeFrame: 0, fit: 'cover'};
const kineticFixtures = [
  ['outcomeToCompose', {kicker: 'النتيجة', title: 'اللي اتغير', items: ['أسرع', 'أوضح'], footer: 'خلاصة'}],
  ['dataStoryToCompose', {kicker: 'رقم', title: 'النمو', sourceNote: 'مصدر', display: 'metric', suffix: '%', unit: 'نسبة', animateFrames: 40, items: [{label: 'الشهر', value: 25, atFrame: 20}]}],
  ['dataStoryToCompose', {kicker: 'رقم', title: 'مقارنة', sourceNote: 'مصدر', display: 'bars', suffix: '', unit: 'ساعة', animateFrames: 40, items: [{label: 'أ', value: 2, atFrame: 20}, {label: 'ب', value: 5, atFrame: 40}]}],
  ['imageCompareToCompose', {kicker: 'قبل وبعد', title: 'الفرق', images: [{src: 'projects/demo/a.png', label: 'قبل'}, {src: 'projects/demo/b.png', label: 'بعد'}], stamp: 'الفرق واضح'}],
  ['screensToCompose', {look: 'broll', steps: [{atFrame: 0, ...demoClip, label: 'لقطة'}, {atFrame: 60, ...demoClip}]}],
  ['screensToCompose', {kicker: 'الشاشة', steps: [{atFrame: 0, title: 'الصفحة', src: 'projects/demo/s.png', kind: 'image', fit: 'contain', trimBeforeFrame: 0}]}],
];
for (const [i, [name, data]] of kineticFixtures.entries()) test(`${name}/${i} leaves a still reading hold on the plan fixture`, () => {
  const layout = [2, 3, 5].includes(i) ? 'takeover' : 'split';
  timingValid(kinetic[name](at(data, {layout})), layout);
});

const mediaApi = async () => bundleEngine(`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {MediaPart} from './engine/src/styles/magazine-interview/system/parts/media';
  import {MagazineScope,NAVY} from './engine/src/styles/magazine-interview/system/base';
  export const render=(part,dir='ltr',box={x:0,y:0,width:950,height:700})=>renderToStaticMarkup(<MagazineScope data={{text:dir==='rtl'?'عنوان':'Title'}}><MediaPart part={part} box={box} at={part.at.frame} emphasis={false} th={NAVY} dir={dir} fps={30} scale={1}/></MagazineScope>);
`, {ssr: true, media: true, timeline: true, plateStub: true});
let mediaBundle;
const renderMedia = async (part, frame, dir = 'ltr') => {
  mediaBundle ??= await mediaApi();
  setSsrFrame(frame);
  return mediaBundle.render(part, dir);
};
const pairPart = {id: 'pair', kind: 'media', at: {frame: 0}, source: {kind: 'pair', images: [{src: 'projects/demo/a.png', label: 'Before'}, {src: 'projects/demo/b.png', label: 'After'}]}};

test('pair estimates use two half-width image plates', () => {
  assert.equal(mediaNatural(pairPart, 950), Math.round(((950 - 28) / 2) * 9 / 16) + 24);
  assert.equal(estimatePartHeight(pairPart, 950), mediaNatural(pairPart, 950));
});

test('pair draws both labelled double frames 28px apart in both directions', async () => {
  for (const dir of ['ltr', 'rtl']) {
    const html = await renderMedia(pairPart, 60, dir);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    assert.match(html, /projects\/demo\/a.png/);
    assert.match(html, /projects\/demo\/b.png/);
    assert.match(html, /Before/);
    assert.match(html, /After/);
    assert.equal((html.match(/<rect /g) ?? []).length, 4);
    const plates = [...html.matchAll(/data-adapter-plate="\d+" style="[^"]*left:([\d.]+)(?:px)?;[^"]*width:([\d.]+)px/g)].map(match => ({x: Number(match[1]), width: Number(match[2])})).sort((a, b) => a.x - b.x);
    assert.equal(plates.length, 2);
    assert.equal(plates[1].x - plates[0].x - plates[0].width, 28);
  }
  const entering = await renderMedia(pairPart, 4);
  assert.match(entering, /data-adapter-plate="1"[^>]*translateY\(24px\)/);
  assert.equal(await renderMedia(pairPart, 38), await renderMedia(pairPart, 58));
});

test('sequence keeps a fixed image frame and hard-switches verified media and labels', async () => {
  const part = {id: 'sequence', kind: 'media', at: {frame: 0}, source: {kind: 'sequence', steps: [
    {offsetFrames: 0, still: 'projects/demo/s.png', title: 'First'},
    {offsetFrames: 40, clip: demoClip, label: 'Second'},
    {offsetFrames: 80, video: {src: 'projects/demo/video.mp4', trimBeforeFrame: 15, fit: 'contain'}, title: 'Third'},
  ]}};
  const first = await renderMedia(part, 39), second = await renderMedia(part, 40), third = await renderMedia(part, 80);
  assert.match(first, /projects\/demo\/s.png/);
  assert.doesNotMatch(first, /projects\/demo\/c.mp4/);
  assert.match(second, /projects\/demo\/c.mp4/);
  assert.doesNotMatch(second, /projects\/demo\/s.png/);
  assert.match(second, /Second/);
  assert.match(third, /projects\/demo\/video.mp4/);
  assert.match(third, /data-start-from-sec="0.5"/);
  assert.match(third, /data-object-fit="contain"/);
  assert.match(third, /Third/);
  for (const html of [first, second, third]) {
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    assert.equal((html.match(/<rect /g) ?? []).length, 2);
  }
  assert.equal(mediaNatural(part, 950), Math.round(950 * 9 / 16) + 24);
  assert.equal(estimatePartHeight(part, 950, 1, 0.5), Math.round(Math.round(950 * 9 / 16) * 0.5) + 24);
  assert.equal(await renderMedia(part, 150), await renderMedia(part, 179));
});

test('finish accounts for the pair stagger and final sequence switch', async () => {
  const pair = finish(at({}), {arrangement: 'stack', parts: [{...pairPart, at: {frame: 149}}]}).parts[0];
  assert.equal(pair.at.frame, 112);
  const sequence = finish(at({}), {arrangement: 'stack', parts: [{id: 'sequence', kind: 'media', at: {frame: 149}, source: {kind: 'sequence', steps: [{offsetFrames: 0, still: 'projects/demo/a.png'}, {offsetFrames: 60, still: 'projects/demo/b.png', title: 'Last'}]}}]}).parts[0];
  assert.equal(sequence.at.frame, 90);
  for (const part of [pair, sequence]) assert.equal(await renderMedia(part, 150), await renderMedia(part, 179));
});

test('pair labels keep the exact settled compare label styling', async () => {
  const compare = {id: 'compare', kind: 'media', at: {frame: 0}, source: {kind: 'compare', before: {src: 'projects/demo/a.png', width: 960, height: 540, label: 'Before'}, after: {src: 'projects/demo/b.png', width: 960, height: 540, label: 'After'}, revealFrames: 30}};
  const reference = await renderMedia(compare, 80);
  const pair = await renderMedia(pairPart, 80);
  for (const label of ['Before', 'After']) {
    const pattern = new RegExp('<div style="([^"]*)">' + label + '</div>');
    assert.equal(pair.match(pattern)?.[1], reference.match(pattern)?.[1]);
  }
});

for (const [name, data] of classicFixtures) test(`${name} preserves a 60fps hold`, () => {
  const input = at(data, {durationInFrames: 360});
  const result = classic[name](input, 60);
  assert.deepEqual(validateComposeTiming({id:'s',family:'compose',fromFrame:0,durationInFrames:360,layout:input.layout,motion:'land',data:result},60,null),[]);
});
for (const [name, data] of semanticFixtures) test(`${name} preserves a 60fps hold`, () => {
  const input = at(data, {durationInFrames: 360});
  const result = semantic[name](input, 60);
  assert.deepEqual(validateComposeTiming({id:'s',family:'compose',fromFrame:0,durationInFrames:360,layout:input.layout,motion:'land',data:result},60,null),[]);
});
for (const [i, [name, data]] of kineticFixtures.entries()) test(`${name}/${i} preserves a 60fps hold`, () => {
  const layout = [2,3,5].includes(i)?'takeover':'split';
  const result = kinetic[name](at(data,{layout,durationInFrames:360}),60);
  assert.deepEqual(validateComposeTiming({id:'s',family:'compose',fromFrame:0,durationInFrames:360,layout,motion:'land',data:result},60,null),[]);
});

test('all adapter cues use the supplied frame rate on a short readable scene', () => {
  const data = classic.introToCompose(at({kicker:'Idea',title:'Clear title',subtitle:'Detail'},{durationInFrames:100}),60);
  assert.deepEqual(validateComposeTiming({id:'s',family:'compose',fromFrame:0,durationInFrames:100,layout:'split',motion:'land',data},60,null),[]);
});

test('partSpan is the sole timing contract for adapter media', () => {
  assert.equal(partSpan(pairPart,30),38);
  const part={id:'sequence',kind:'media',at:{frame:0},source:{kind:'sequence',steps:[{offsetFrames:0,still:'projects/demo/a.png'},{offsetFrames:60,still:'projects/demo/b.png',title:'Last'}]}};
  assert.equal(partSpan(part,30),60);
  const scene={id:'s',family:'compose',fromFrame:0,durationInFrames:180,layout:'takeover',motion:'land',data:{arrangement:'stack',parts:[{...part,at:{frame:100}}]}};
  assert.match(validateComposeTiming(scene,30,null).join('\n'),/must finish 30 frames/);
});
