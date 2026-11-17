import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {run} from '../scripts/lib/media.mjs';

// This fixture fixes the schema, not typography, colours, spacing or layout.
const meta = {basis:'measured',confidence:'high',status:'confirmed'};
const pending = {basis:'inferred',confidence:'low',status:'needs-confirmation',reason:'needs evidence',confirmHow:'Review the named evidence.'};
export function reportFixture() {
  return {schema:1,referenceId:'ref-123456789abc',source:{name:'reference.mp4',sha256:'a'.repeat(64)},analysedAt:'2026-11-15T00:00:00Z',durationSec:1,aspect:'128x224',
    pace:{cutCount:0,cutsPerMinute:0,shotLen:{min:1,median:1,max:1}},shots:[{id:'S01',start:0,end:1,len:1,camera:{label:'static',zoomPerSec:0,panXPerSec:0,panYPerSec:0,kenBurns:false,...meta}}],
    cuts:[],transitions:[],events:[{id:'E01',shotId:'S01',t:.6,kind:'punch-in',scale:1.3,...pending}],
    text:[{id:'T01',text:'كلام محتاج مراجعة',start:.1,end:.8,box:[.1,.7,.8,.1],zone:'bottom',sizePct:.05,kind:'caption',entrance:'pop',exit:'cut',style:{fill:'#ffffff',stroke:null,box:null,highlight:null},...pending}],
    overlays:[{id:'O01',shotId:'S01',start:.2,end:.9,kind:'sticker',box:[.1,.1,.2,.2],...pending}],look:{label:'warm',metrics:{saturation:.3,contrast:20},...meta},
    sound:{hasAudio:true,loudness:null,speech:null,bed:{present:null,levelDb:null,speechToBedDb:null,...pending},tempo:null,beats:[],cutsOnBeat:null,
      sfx:[{id:'X01',t:.5,dur:.1,type:'pop',strength:3,onBeat:false,anchor:null,...pending}],hitsPerMinute:60},
    reviewQueue:['T01','X01','sound.bed','E01','O01'],limitations:['Unverified fixture claims.']};
}
const esc = value => String(value).replace(/[&<>"']/gu, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const available = fs.existsSync(path.join(ROOT,'scripts/lib/breakdown-report.mjs'));
if (!available) {
  test('Arabic report contract awaits the real Claude implementation', {skip:'Claude-owned breakdown-report.mjs has not arrived; no report stub is created.'}, ()=>{});
} else {
  const {renderReport,writeReport,BASIS_LABELS} = await import('../scripts/lib/breakdown-report.mjs');
  const {renderLayers} = await import('../scripts/lib/breakdown-layers.mjs');
  test('no steady beat replaces only the tempo stat text, preserving report markup',()=>{
    const b=reportFixture(),base=renderReport(b,{fonts:false});
    for(const reason of ['too-short','no-pulses','low-confidence','no-audio','no steady beat measured']) {
      b.sound.tempoReason=reason;
      const html=renderReport(b,{fonts:false});
      assert.match(html,/مفيش إيقاع ثابت متقاس/);
      assert.equal(html.replaceAll('مفيش إيقاع ثابت متقاس','مش متقاس'),base);
    }
    b.sound.tempo={bpm:120,alternatives:[],basis:'heard',confidence:'high',status:'confirmed'};
    assert.doesNotMatch(renderReport(b,{fonts:false}),/مفيش إيقاع ثابت متقاس/);
  });
  test('report preserves Arabic RTL, lanes, basis labels and unresolved claims',()=>{
    const b=reportFixture(),html=renderReport(b,{fonts:false});
    assert.match(html,/<html[^>]*lang=["']ar["']/u);assert.match(html,/<html[^>]*dir=["']rtl["']/u);assert.match(html,/class=["'][^"']*\blanes\b/u);
    for(const key of ['measured','seen','heard','inferred'])assert.equal(typeof BASIS_LABELS[key],'string');
    assert.match(html,/تأكيد/u);assert.ok(html.includes('كلام محتاج مراجعة'));assert.match(html,/مش متقاس/u);
    for(const id of b.reviewQueue)assert.ok(html.includes(id),`Unresolved ${id} must remain individually identifiable.`);
  });
  test('unknown sound and a silent reference stay distinct and empty lists render',()=>{
    const b=reportFixture();b.cuts=[];b.transitions=[];b.events=[];b.text=[];b.overlays=[];b.reviewQueue=[];
    b.sound={hasAudio:false,loudness:null,speech:null,bed:null,tempo:null,beats:[],cutsOnBeat:null,sfx:[],hitsPerMinute:null};
    const html=renderReport(b,{fonts:false});assert.match(html,/مش متقاس/u);assert.match(html,/(?:مفيش|مالوش|مفيهوش|بدون|من غير|لا يوجد|لا يحتوي|لا توجد)[^<.]{0,80}صوت/u);
    assert.doesNotMatch(html,/\b(?:NaN|undefined)\b/u);
  });
  test('report escapes supplied words, names and still attributes',()=>{
    const b=reportFixture(),attack='</title><script>alert("INJECTED")</script>';
    b.source.name=attack;b.text[0].text=attack;b.limitations=[attack];
    const html=renderReport(b,{fonts:false,stills:{S01:'x" onerror="alert(1)'}});
    assert.ok(!html.includes(attack));assert.ok(!html.includes('<script>alert("INJECTED")</script>'));assert.ok(!html.includes('onerror="alert(1)"'));
    assert.match(html,/&lt;/u);
  });
  test('writeReport returns absolute HTML with local stills and Cairo fonts', {timeout:120000},async t=>{
    const dir=await fsp.mkdtemp(path.join(PROJECT_TMP,'breakdown-report-'));t.after(()=>fsp.rm(dir,{recursive:true,force:true}));
    const video=path.join(dir,'reference.mp4');await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=blue:s=128x224:r=30:d=1','-c:v','libx264',video]);
    const b=reportFixture(),prepared={schema:1,referenceId:b.referenceId,source:{...b.source,path:video},probe:{durationSec:1,width:128,height:224,fps:30,hasAudio:false},crop:null,hdr:null,outDir:dir,workDir:dir,proxy:{path:video,width:128,height:224,fps:30},wav:null};
    const file=await writeReport({breakdown:b,prepared,dir});assert.equal(file,path.join(dir,'report','report.html'));assert.ok(path.isAbsolute(file));
    assert.ok((await fsp.stat(path.join(dir,'report','stills','S01.jpg'))).size>0);
    const html=await fsp.readFile(file,'utf8');const assets=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/gu)].map(m=>m[1]).filter(x=>!x.startsWith('#'));
    for(const asset of assets){assert.doesNotMatch(asset,/^(?:https?:|file:|data:|[a-z]:|\/)/iu);assert.ok(fs.existsSync(path.resolve(path.dirname(file),asset)),asset);}
    async function filesBelow(current){const out=[];for(const e of await fsp.readdir(current,{withFileTypes:true})){const p=path.join(current,e.name);out.push(...e.isDirectory()?await filesBelow(p):[p]);}return out;}
    assert.ok((await filesBelow(path.dirname(file))).some(f=>/Cairo.*\.woff2$/u.test(f)));
  });
  test('report CLI publishes the real writer from stored data without the Python add-on', {timeout:120000},async t=>{
    const {prepareReference,atomicJson}=await import('../scripts/lib/breakdown-prepare.mjs');
    const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const exec=promisify(execFile);
    const dir=await fsp.mkdtemp(path.join(PROJECT_TMP,'breakdown-report-cli-')),slug='breakdown-test-'+path.basename(dir).slice(-6).toLowerCase();
    t.after(async()=>{await fsp.rm(dir,{recursive:true,force:true});await fsp.rm(path.join(ROOT,'Projects',slug),{recursive:true,force:true});});
    const video=path.join(dir,'reference.mp4');await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=blue:s=128x224:r=30:d=1','-c:v','libx264',video]);
    const prepared=await prepareReference({reference:video,project:slug}),b=reportFixture();b.referenceId=prepared.referenceId;b.source=prepared.source;
    await atomicJson(path.join(prepared.outDir,'breakdown.json'),b);
    const stills=path.join(prepared.outDir,'report','stills');await fsp.mkdir(stills,{recursive:true});await fsp.writeFile(path.join(stills,'S99.jpg'),'stale generated still');
    const {stdout}=await exec(process.execPath,['scripts/breakdown.mjs','report','--project',slug,'--ref',b.referenceId],{cwd:ROOT,windowsHide:true});
    const result=JSON.parse(stdout);assert.ok(result.files.includes(path.join(prepared.outDir,'report','report.html')));assert.ok(result.files.every(f=>fs.existsSync(f)));
    assert.equal(fs.existsSync(path.join(stills,'S99.jpg')),false);assert.equal(fs.existsSync(path.join(stills,'S01.jpg')),true);
  });
  test('a long mixed-script file name stays one isolated left-to-right line with the full name kept',()=>{
    const b=reportFixture(),name='A Long Latin Name ⚽ “QUOTED” with its’ marks !End .mp4';b.source.name=name;
    const html=renderReport(b,{fonts:false}),line=/<p class="file" dir="ltr" title="([^"]*)">([^<]*)<\/p>/u.exec(html);
    assert.ok(line,'The header file name must be its own left-to-right line.');assert.equal(line[1],line[2]);assert.ok(line[1].includes('!End .mp4'));
    assert.match(html,/\.file\{[^}]*white-space:nowrap[^}]*text-overflow:ellipsis/u);assert.match(html,/<bdi class="full" dir="ltr">/u);
  });
  test('panel changes, changes inside text and their sound anchors read in Arabic and link to their rows',()=>{
    const b=reportFixture();
    b.cuts=[{id:'C01',t:.3,kind:'cut',scale:null,scope:'region',box:[.4,.25,.58,.55],...meta},{id:'C02',t:.7,kind:'cut',scale:null,...meta}];
    b.text[0]={...b.text[0],text:'first line\nsecond line',entrance:'present-at-start',exit:'present-at-end',reading:'most-complete-observed',
      events:[{id:'T01.H01',t:.4,kind:'highlight-change',lineIndex:1,score:.7,box:[.1,.7,.3,.03],...meta},{id:'T01.H02',t:.6,kind:'highlight-change',lineIndex:9,score:.7,box:[.1,.7,.3,.03],...pending}]};
    b.overlays=[{id:'O01',start:0,end:.9,kind:'pip',box:[.4,.25,.58,.55],evidence:'rectangular motion within a stationary surround; frame-in-frame interpretation needs confirmation',...pending}];
    b.sound.sfx[0].anchor={kind:'text-change',id:'T01.H01',dt:0};
    const html=renderReport(b,{fonts:false});
    for(const raw of ['present-at-start','present-at-end','most-complete-observed','text-change','highlight-change','rectangular motion'])assert.ok(!html.includes(raw),`${raw} must be worded in Arabic.`);
    assert.match(html,/id="i-T01\.H01"/u);assert.match(html,/<a href="#i-T01\.H01" class="id ref">T01\.H01<\/a>/u);assert.ok(html.includes('second line'));
    assert.equal((html.match(/class="cutbox/gu)??[]).length,1);assert.equal((html.match(/class="cutmark/gu)??[]).length,1);
    assert.equal((html.match(/<span class="scope"/gu)??[]).length,1,'Only the panel change carries the panel tag.');
    assert.equal((html.match(/class="cue-ev/gu)??[]).length,2);assert.match(html,/<a href="#i-T01\.H02" class="id">/u,'A pending change inside text is listed for confirmation.');
    assert.doesNotMatch(html,/\b(?:NaN|undefined)\b/u);
  });
  test('a partial swap is worded as one, shows where it happened, keeps its review chip and does not read as a shot change',()=>{
    const b=reportFixture();
    b.cuts=[{id:'C01',t:.3,kind:'cut',scale:null,scope:'region',shotBoundary:false,box:[.1,.1,.3,.2],evidence:{qualified:true,score:.8},...pending},
      {id:'C02',t:.7,kind:'cut',scale:null,shotBoundary:true,...meta}];
    b.reviewQueue=['C01'];
    const html=renderReport(b,{fonts:false}),row=/<tr id="i-C01">.*?<\/tr>/su.exec(html)[0];
    assert.match(row,/تبديل جزئي/u);assert.match(row,/واللقطة نفسها كمّلت/u);assert.match(row,/class="chip chip-needs-confirmation"/u);
    assert.match(row,/<svg class="map"/u,'The row shows where in the frame.');assert.match(row,/فوق شمال/u);assert.match(row,/كان ثابت قبل التبديل وبعده/u);
    assert.doesNotMatch(row,/قطع عادي|جوه لوحة/u);
    assert.match(html,/التبديل الجزئي ما بيقسمش اللقطة/u);assert.doesNotMatch(html,/بتتحسب لقطة جديدة/u,'A partial swap is not counted as a new shot.');
    assert.match(/<tr id="i-C02">.*?<\/tr>/su.exec(html)[0],/قطع عادي/u,'A whole-frame cut keeps its wording.');
    assert.match(/<section id="confirm">.*?<\/section>/su.exec(html)[0],/تبديل جزئي/u,'A pending partial swap is listed for confirmation.');
    assert.doesNotMatch(html,/(?:NaN|undefined)/u);
    const picture=renderLayers(b)['picture.md'];
    assert.match(picture,/partial swap at 0\.1,0\.1,0\.3,0\.2 \(the shot goes on\)/u);
  });
  test('cuts that coincide with text are a short possible-cut list with their time and reason, and are not counted as cuts',()=>{
    const b=reportFixture();
    b.cuts=[{id:'C01',t:.3,kind:'cut',scale:null,shotBoundary:true,...meta}];
    b.cutCandidates=[{id:'C02',t:.8,kind:'cut',scale:null,scope:'region',box:[.1,.7,.8,.1],shotBoundary:false,status:'needs-confirmation',confidence:'low',
      reason:'The changed region is mostly contained in text at an OCR boundary; it may be a caption change.',captionEvidence:{textId:'T01',containment:.95}}];
    const html=renderReport(b,{fonts:false}),section=/<h3>قطعات ممكنة، راجعها.*?<\/table><\/div>/su.exec(html)[0];
    assert.match(section,/>1<\/bdi>/u);assert.match(section,/00:00\.8|0:00\.8|0:00,8|<bdi class="n">[^<]*8[^<]*<\/bdi>/u);
    assert.match(section,/ظهور كلام أو اختفائه/u);assert.match(section,/<a href="#i-T01" class="id ref">T01<\/a>/u);
    assert.match(html,/مش متحسوبة في عدد القطعات/u);assert.doesNotMatch(section,/The changed region|may be a caption/u,'The English reason is never printed.');
    assert.match(/<h2>القطعات والانتقالات <span class="count"><bdi class="n">1<\/bdi>/u.exec(html)[0],/1/u,'Only the counted cut is in the cut count.');
    assert.equal((html.match(/id="i-C02"/gu)??[]).length,0,'A possible cut gets no row of its own among the counted ones.');
    delete b.cutCandidates;assert.doesNotMatch(renderReport(b,{fonts:false}),/قطعات ممكنة/u,'Nothing is shown without candidates.');
  });
  test('weak sounds are counted and listed as possible effects to listen to, never mixed into the counted ones',()=>{
    const b=reportFixture();
    b.sound.sfxCandidates=Array.from({length:20},(_,i)=>({id:`Q${String(i+1).padStart(2,'0')}`,t:.05+i*.04,strength:i+1,type:i%2?'hit':'pop',status:'needs-confirmation',confidence:'low',detection:'candidate',basis:'measured'}));
    b.sound.candidateSfxCount=20;b.sound.reportedSfxCount=1;
    const html=renderReport(b,{fonts:false}),section=/<h3>مؤثرات ممكنة، اسمعها.*?<\/section>/su.exec(html)[0];
    assert.match(section,/>20<\/bdi>/u);assert.equal((section.match(/<tr><td>/gu)??[]).length,15,'Only the strongest fifteen are listed.');
    assert.match(section,/وفيه <bdi class="n">5<\/bdi> أضعف/u);
    assert.match(html,/و<bdi class="n">20<\/bdi> صوت ضعيف ممكن، اسمعه/u,'The count sits beside the counted effects.');
    assert.match(html,/<bdi class="n">1<\/bdi> مؤثر في الريل كله/u,'The counted effects stay at one.');
    assert.equal((html.match(/id="i-Q\d\d"/gu)??[]).length,0);assert.doesNotMatch(html,/(?:NaN|undefined)/u);
    const sound=renderLayers(b)['sound.md'];
    assert.match(sound,/## Possible effects, listen/u);assert.match(sound,/Weak sounds that are not counted as effects: 20; counted effects: 1\./u);
    delete b.sound.sfxCandidates;delete b.sound.candidateSfxCount;delete b.sound.reportedSfxCount;
    assert.doesNotMatch(renderReport(b,{fonts:false}),/مؤثرات ممكنة/u);
  });
  test('a region transition or a partial swap never makes the page say a new shot was counted',()=>{
    const b=reportFixture();
    b.cuts=[{id:'C01',t:.4,kind:'cut',scale:null,scope:'region',shotBoundary:false,box:[.1,.1,.3,.2],...meta}];
    b.transitions=[{id:'R01',start:.6,end:.8,kind:'fade',direction:null,scope:'region',box:[.1,.1,.3,.2],...meta}];
    const html=renderReport(b,{fonts:false});
    assert.doesNotMatch(html,/بتتحسب لقطة جديدة/u);assert.match(html,/التبديل الجزئي ما بيقسمش اللقطة/u);
    b.cuts[0]={...b.cuts[0],shotBoundary:true};
    assert.match(renderReport(b,{fonts:false}),/بتتحسب لقطة جديدة/u,'A region cut that really starts a shot keeps the old sentence.');
  });
  test('timeline.md words a partial swap as one even where a shot starts',()=>{
    const b=reportFixture();
    b.cuts=[{id:'C01',t:0,kind:'cut',scale:null,scope:'region',shotBoundary:false,box:[.1,.1,.3,.2],...pending}];
    const line=renderLayers(b)['timeline.md'].split(/\r?\n/u).find(l=>l.startsWith('S01'));
    assert.match(line,/~partial swap/u);assert.doesNotMatch(line,/cut cut/u);
  });
  test('an effect that is already reported is never listed or counted again as a possible one',()=>{
    const b=reportFixture();
    b.sound.sfxCandidates=[{id:'X01',t:.5,strength:9,type:'pop',status:'needs-confirmation',confidence:'low',detection:'candidate',basis:'measured'},
      {id:'Q01',t:.7,strength:3,type:'hit',status:'needs-confirmation',confidence:'low',detection:'candidate',basis:'measured'}];
    b.sound.candidateSfxCount=2;b.sound.reportedSfxCount=1;
    const html=renderReport(b,{fonts:false}),section=/<h3>مؤثرات ممكنة، اسمعها.*?<\/section>/su.exec(html)[0];
    assert.match(section,/>1<\/bdi>/u);assert.equal((section.match(/<tr><td>/gu)??[]).length,1);
    assert.match(html,/و<bdi class="n">1<\/bdi> صوت ضعيف ممكن، اسمعه/u);
    const sound=renderLayers(b)['sound.md'];
    assert.equal((sound.match(/\| X01 \|/gu)??[]).length,1,'X01 has one row only.');assert.match(sound,/Weak sounds that are not counted as effects: 1;/u);
    b.sound.sfxCandidates=[b.sound.sfxCandidates[0]];b.sound.candidateSfxCount=1;
    assert.doesNotMatch(renderReport(b,{fonts:false}),/مؤثرات ممكنة/u,'Nothing is left to list.');
    assert.doesNotMatch(renderLayers(b)['sound.md'],/Possible effects/u);
  });
  test('overlapping on-screen text is stacked, and a crowd becomes a counted band that keeps the pending mark',()=>{
    const cue=(i,start,end,extra=meta)=>({...reportFixture().text[0],id:`T${String(i).padStart(2,'0')}`,start,end,...extra});
    const laneYs=html=>new Set([...html.matchAll(/<rect [^>]*y="([\d.]+)"[^>]*class="cue[ "]/gu)].map(m=>m[1]));
    const few=reportFixture();few.text=[cue(1,0,.9),cue(2,.1,.8),cue(3,.2,.5,pending),cue(4,.5,.7)];few.reviewQueue=['T03'];
    const stacked=renderReport(few,{fonts:false});assert.equal(laneYs(stacked).size,3,'Three cues overlap, so three sub-rows; the fourth reuses a free row.');
    assert.match(stacked,/class="cue pend"/u);assert.doesNotMatch(stacked,/class="cue-band"/u);
    const many=reportFixture();many.text=Array.from({length:9},(_,i)=>cue(i+1,i*.05,.5+i*.05,i===4?pending:meta));many.reviewQueue=['T05'];
    const dense=renderReport(many,{fonts:false});assert.match(dense,/class="cue-band"/u);assert.match(dense,/class="cue-n"[^>]*>9</u);assert.match(dense,/class="cue-unsure pend"/u);
    for(const t of many.text)assert.ok(dense.includes(`id="i-${t.id}"`));
  });
  test('known English notes are worded in Arabic and unbroken strings cannot widen the page',()=>{
    const b=reportFixture();b.text[0].reason='text animation not recognised';
    b.limitations=['Audio duration (16.437s) differs from video (16.333s); audio analysis is trimmed or padded to the video timeline.','Speech was not transcribed.','Speech transcription failed: External references cannot be transcribed by the existing project-local Arabic ASR; picture and audio measurement can continue.'];
    const html=renderReport(b,{fonts:false});
    for(const raw of ['Audio duration','External references','not recognised'])assert.ok(!html.includes(raw),raw);
    assert.ok(html.includes('16.437')&&html.includes('16.333'));assert.equal((html.match(/<ul class="limits">(.*?)<\/ul>/su)?.[1].match(/<li>/gu)??[]).length,2,'The plain not-transcribed note is folded into the failure.');
    assert.match(html,/body\{[^}]*overflow-wrap:break-word/u);
  });

  // A literal recipe in the fixed Recipe shape: the report never imports the recipe module.
  const recipeFixture = () => ({schema: 1, referenceId: 'ref-aaaaaaaaaaaa', basis: 'inferred', notice: 'Suggestions.', noticeAr: 'دي اقتراحات للفريق، مش قرارات. الستايل بيتختار لكل فيديو حسب فكرته، واختياراتك الثابتة دايمًا تكسب.',
    features: {presenter: 'none', ground: 'light', pace: 'fast', text: 'high', captions: 'no', framed: 'yes', list: 'yes', look: 'natural', ending: 'yes', punches: 'no', beatSync: 'no',
      measures: {changesPerMinute: 41.3, textCoverage: 0.99, regionChanges: 10, highlightSteps: 9, numberedLines: 4, meanLevel: 78, presenterShare: 0}},
    style: {nearest: {id: 'grid-glide', label: 'Grid glide', labelAr: 'كلمات وكروت', score: 0.71, matched: ['presenter', 'framed', 'list', 'ground', 'text', 'look'], missed: ['pace']},
      alternatives: [{id: 'one-shot', label: 'One shot', labelAr: 'ونشوت', score: 0.43, matched: [], missed: []}, {id: 'section-deck', label: 'Section deck', labelAr: 'خطوات منظمة', score: -0.14, matched: [], missed: []}]},
    families: [{id: 'framed-capture', families: [{id: 'screens'}, {id: 'glide-card', onlyIn: 'grid-glide'}], note: 'n', noteAr: 'مادة حقيقية جوه إطار.'}],
    captions: {present: false, evidence: []},
    sound: {measured: true, hitsPerMinute: 22.5, band: {keys: ['grid-glide'], range: [13, 22], inside: false}, under: {value: 9, reason: 'the reference carries music under the voice'},
      bed: {present: true, levelDb: -24, speechToBedDb: null}, sfxTypes: {pop: 6}, sweeps: 0, cutsOnBeat: false},
    presenter: {share: 0, size: 'none', status: 'confirmed'}});
  const measuredPresenter = {sampleFps: 2, samples: 32, share: 0, multiFaceShare: 0, faceHeight: null, size: 'none', spans: [], perShot: [], basis: 'measured', confidence: 'high', status: 'confirmed'};

  test('the recipe section shows the nearest style, families, captions and sound as suggestions', () => {
    const html = renderReport({...reportFixture(), presenter: measuredPresenter}, {fonts: false, recipe: recipeFixture()});
    assert.match(html, /<h2>تعمله إزاي في ريل ستوديو<\/h2>/);
    assert.match(html, /اقتراحات للفريق، مش قرارات/);
    assert.match(html, /<bdi dir="ltr"><code>grid-glide<\/code><\/bdi>/);
    assert.match(html, /كلمات وكروت/);
    assert.match(html, /<code>--under 9<\/code>/);
    assert.match(html, /مفيش ترجمة كلام/);
    assert.match(html, /chip-inferred/);
    assert.match(html, /إيقاع سريع/, 'A missed trait is worded, not shown as a key.');
    assert.match(html, /برّه المدى/, 'A reference outside the sound band says so.');
    assert.equal((html.match(/<div class="recipe-card">/gu) ?? []).length, 4);
    assert.equal((html.match(/<div class="recipe-card"><h3>[^<]+ <span class="chip chip-inferred"/gu) ?? []).length, 4, 'Every card carries the inferred chip.');
    assert.ok(html.indexOf('id="recipe"') < html.indexOf('id="confirm"'), 'The recipe sits right before the confirmation list.');
    for (const raw of ['Suggestions.', 'the reference carries music', '>n<']) assert.ok(!html.includes(raw), `${raw} is English data, not page copy.`);
    assert.doesNotMatch(html, /\b(?:NaN|undefined|null)\b/u);
    assert.doesNotMatch(renderReport(reportFixture(), {fonts: false}), /تعمله إزاي في ريل ستوديو/);
    assert.doesNotMatch(renderReport(reportFixture(), {fonts: false, recipe: null}), /id="recipe"/);
  });

  test('presenter share is shown in plain words, and an unmeasured share says so', () => {
    const seen = renderReport({...reportFixture(), presenter: {...measuredPresenter, share: 0.62, size: 'close', faceHeight: 0.34, spans: [{start: 0, end: 4}]}}, {fonts: false});
    assert.match(seen, /المتكلم على الشاشة/);
    assert.match(seen, /62/);
    assert.match(seen, /قريب/);
    const unmeasured = renderReport({...reportFixture(), presenter: null}, {fonts: false});
    assert.match(unmeasured, /<h3>المتكلم على الشاشة<\/h3>[\s\S]*ما اتقاستش/);
    assert.doesNotMatch(unmeasured, /id="i-presenter"/);
    const zero = renderReport({...reportFixture(), presenter: measuredPresenter}, {fonts: false});
    assert.match(zero, /id="i-presenter"><b><bdi class="n">0<\/bdi>٪<\/b>/, 'A measured zero is a number, not "not measured".');
    const { presenter, ...stageOne } = {...reportFixture(), presenter: null};
    assert.doesNotMatch(renderReport(stageOne, {fonts: false}), /المتكلم على الشاشة/);
  });

  test('a pending presenter is listed for confirmation and its limitation reads in Arabic', () => {
    const b = {...reportFixture(), presenter: {...measuredPresenter, share: 0.5, size: 'medium', spans: [{start: 0, end: .5}], confidence: 'low', status: 'needs-confirmation', reason: 'face detection is unsure on this footage', confirmHow: 'Look at the frames.'}};
    b.reviewQueue = ['presenter'];
    const html = renderReport(b, {fonts: false});
    assert.match(html, /<a href="#i-presenter" class="id">المتكلم<\/a>/);
    assert.match(html, /id="i-presenter"/);
    assert.match(html, /<span class="eye">بالعين<\/span>/);
    assert.ok(!html.includes('face detection is unsure'));
    const missing = {...reportFixture(), presenter: null};
    missing.limitations = ['Presenter share was not measured: the face models are not installed. Installing them (node scripts/reframe.mjs install) downloads files and needs the creator\'s yes first.'];
    const page = renderReport(missing, {fonts: false});
    assert.ok(!page.includes('Presenter share was not measured'));
    assert.ok(!page.includes('reframe.mjs install'), 'The page never tells the reader to run an installer.');
    assert.match(page, /محتاج موافقتك/);
    missing.limitations = ['Presenter share was not measured: <b>browser failed</b>'];
    const failed = renderReport(missing, {fonts: false});
    assert.match(failed, /ظهور المتكلم على الشاشة ما اتقاسش: <bdi dir="auto">&lt;b&gt;browser failed/);
  });

  test('recipe variants stay honest and supplied recipe words are escaped', () => {
    const attack = '<img src=x onerror=alert(1)>';
    const r = recipeFixture();
    r.noticeAr = attack; r.style.nearest.id = attack; r.style.nearest.labelAr = attack; r.style.alternatives[0].id = attack;
    r.families[0].noteAr = attack; r.families[0].families[0].id = attack;
    r.captions = {present: true, presentation: 'pill', skin: attack, grouping: 'compact', wordsPerCue: 3, zone: 'bottom', sizePct: .05, fill: '#ffffff', pending: 2, evidence: ['T01']};
    const html = renderReport(reportFixture(), {fonts: false, recipe: r});
    assert.ok(!html.includes(attack)); assert.match(html, /&lt;img src=x/);
    assert.match(html, /<code>pill<\/code>/); assert.match(html, /<code>compact<\/code>/); assert.match(html, /بندين محتاجين تأكيد/);
    const silent = recipeFixture(); silent.sound = {measured: false, reason: 'no-audio'};
    assert.match(renderReport(reportFixture(), {fonts: false, recipe: silent}), /الريل ملوش صوت/);
    const unknown = recipeFixture(); unknown.sound = {measured: false, reason: 'not-measured'}; unknown.features.presenter = 'unknown';
    unknown.style.nearest = {...unknown.style.nearest, score: -0.2, matched: [], missed: []}; unknown.families = []; unknown.presenter = null;
    const page = renderReport(reportFixture(), {fonts: false, recipe: unknown});
    assert.match(page, /الصوت مش متقاس/); assert.match(page, /ظهور المتكلم ما اتقاسش/); assert.match(page, /مفيش ستايل جاهز قريب/); assert.match(page, /مفيش شكل معيّن/);
    assert.doesNotMatch(page, /--under/, 'No mix start is suggested without a sound measurement.');
    const quiet = recipeFixture(); quiet.sound = {...quiet.sound, hitsPerMinute: 8, band: {keys: ['calm', 'editorial'], range: [5, 12], inside: true}, under: {value: 7, reason: 'sparse effects'}, bed: null, sweeps: 2};
    const soft = renderReport(reportFixture(), {fonts: false, recipe: quiet});
    assert.match(soft, /<code>calm<\/code><\/bdi> \/ <bdi dir="ltr"><code>editorial<\/code>/); assert.match(soft, /<code>--under 7<\/code>/); assert.match(soft, /المؤثرات قليلة/); assert.match(soft, /whoosh/);
    assert.doesNotMatch(soft, /برّه المدى/);
    // A partial recipe must not lose the whole report.
    for (const partial of [{}, {schema: 1, noticeAr: 'x', style: {}, families: null, captions: null, sound: null}]) {
      const out = renderReport(reportFixture(), {fonts: false, recipe: partial});
      assert.match(out, /id="recipe"/); assert.doesNotMatch(out, /\b(?:NaN|undefined)\b/u);
      // A part that is missing was not measured; it must not read as "the reel has none".
      const section = out.slice(out.indexOf('id="recipe"'));
      assert.doesNotMatch(section, /مفيش ترجمة كلام|مفيش شكل معيّن|الريل ملوش صوت/);
      assert.match(section, /شكل الترجمة مش متقاس/); assert.match(section, /المشاهد المناسبة مش متقاسة/); assert.match(section, /الصوت مش متقاس/);
    }
    const explicit = recipeFixture(); explicit.families = [];
    const none = renderReport(reportFixture(), {fonts: false, recipe: explicit});
    assert.match(none, /مفيش ترجمة كلام/); assert.match(none, /مفيش شكل معيّن/);
  });

  test('writeReport passes the recipe through to the page', {timeout: 120000}, async t => {
    const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-report-recipe-')); t.after(() => fsp.rm(dir, {recursive: true, force: true}));
    const b = reportFixture(), prepared = {schema: 1, referenceId: b.referenceId, source: b.source, proxy: {path: path.join(dir, 'absent.mp4')}};
    const withRecipe = await fsp.readFile(await writeReport({breakdown: b, prepared, dir, recipe: recipeFixture()}), 'utf8');
    assert.match(withRecipe, /id="recipe"/);
    const without = await fsp.readFile(await writeReport({breakdown: b, prepared, dir}), 'utf8');
    assert.doesNotMatch(without, /id="recipe"/);
  });

  // The recipe engine and its fixture belong to the measurement lane; this runs once both lanes are merged.
  const recipeModule = path.join(ROOT, 'scripts/lib/breakdown-recipe.mjs'), reelFixture = path.join(ROOT, 'tests/fixtures/breakdown-list-reel.mjs');
  const merged = fs.existsSync(recipeModule) && fs.existsSync(reelFixture);
  test('the real recipe of the list-reel fixture renders in the report', {skip: merged ? false : 'breakdown-recipe.mjs and its fixture arrive with the measurement lane; this runs after the merge.'}, async () => {
    const {pathToFileURL} = await import('node:url');
    const {buildRecipe} = await import(pathToFileURL(recipeModule).href);
    const {listReel} = await import(pathToFileURL(reelFixture).href);
    const b = listReel(), recipe = buildRecipe(b);
    const html = renderReport(b, {fonts: false, recipe});
    assert.match(html, /<h2>تعمله إزاي في ريل ستوديو<\/h2>/);
    assert.ok(html.includes(esc(recipe.noticeAr)), 'The catalogue notice opens the section.');
    assert.ok(html.includes(`<bdi dir="ltr"><code>${recipe.style.nearest.id}</code></bdi>`));
    assert.ok(html.includes(esc(recipe.style.nearest.labelAr)));
    for (const a of recipe.style.alternatives) assert.ok(html.includes(`<code>${a.id}</code>`), a.id);
    for (const rule of recipe.families) for (const f of rule.families) assert.ok(html.includes(`<code>${f.id}</code>`), f.id);
    if (recipe.sound.measured) assert.ok(html.includes(`<code>--under ${recipe.sound.under.value}</code>`));
    assert.equal((html.match(/<div class="recipe-card">/gu) ?? []).length, 4);
    if (Object.hasOwn(b, 'presenter')) assert.match(html, /<h3>المتكلم على الشاشة<\/h3>/);
    assert.doesNotMatch(html.slice(html.indexOf('id="recipe"')), /\b(?:NaN|undefined)\b/u);
  });

  test('Latin names inside an Arabic note are isolated left to right and the Arabic around them stays put', () => {
    const nm = name => `<bdi dir="ltr" class="nm">${name}</bdi>`;
    const note = (noteAr, patch = {}) => {
      const r = {...recipeFixture(), ...patch}; r.families = [{...r.families[0], noteAr}];
      const html = renderReport(reportFixture(), {fonts: false, recipe: r});
      return /<ul class="recipe-list">.*?<p>(.*?)<\/p><\/li>/su.exec(html)[1];
    };
    // A hyphenated id is one run, so the hyphen cannot be reordered away from its two halves.
    assert.equal(note('مشهد big-word أو small-word-two لجملة'), `مشهد ${nm('big-word')} أو ${nm('small-word-two')} لجملة`);
    // Arabic punctuation after an id stays outside the isolate, on the Arabic side.
    assert.equal(note('ابدأ بـ big-word، وبعدين plain-card.'), `ابدأ بـ ${nm('big-word')}، وبعدين ${nm('plain-card')}.`);
    // A prefix letter glued to an id stays Arabic text right before the isolate.
    assert.equal(note('وbig-word بس، أو بplain-card'), `و${nm('big-word')} بس، أو ب${nm('plain-card')}`);
    // Words split only by spaces are one run: two isolates would swap places in a right-to-left line.
    assert.equal(note('ستايل Big Word هنا و --flag-one 9'), `ستايل ${nm('Big Word')} هنا و ${nm('--flag-one')} 9`);
    // Pure Arabic, digits and Arabic punctuation are left exactly as written.
    const arabic = 'رحلة من 2 لـ4 محطات، واحدة ورا التانية: «كده».';
    assert.equal(note(arabic), arabic);
    // Markup in the note is escaped before any run is wrapped.
    const hostile = note('مشهد <b>big-word</b> & "x"');
    assert.equal(hostile, `مشهد &lt;${nm('b')}&gt;${nm('big-word')}&lt;/${nm('b')}&gt; &amp; &quot;${nm('x')}&quot;`);
    // A very long unbroken run is still isolated, but may wrap so it cannot widen the page.
    const long = 'a'.repeat(40);
    assert.equal(note(`اسم ${long} طويل`), `اسم <bdi dir="ltr">${long}</bdi> طويل`);
    // The same isolation covers the section notice and a style label.
    const r = recipeFixture(); r.noticeAr = 'اقتراح بـ big-word، مش قرار.'; r.style.nearest.labelAr = 'كروت big-word';
    const html = renderReport(reportFixture(), {fonts: false, recipe: r});
    assert.ok(html.includes(`<p class="lead">اقتراح بـ ${nm('big-word')}، مش قرار.</p>`));
    assert.ok(html.includes(`<b>كروت ${nm('big-word')}</b>`));
    assert.match(html, /\.nm\{[^}]*white-space:nowrap/u);
  });

  test('the caption look reads as a fact, a candidate or an absence, never one as another', () => {
    const look = {present: true, presentation: 'pill', skin: null, grouping: 'compact', wordsPerCue: 3, zone: 'bottom', sizePct: .05, pending: 2, evidence: ['T01', 'T02']};
    const cardOf = (captions, state) => {
      const r = recipeFixture(); r.captions = captions; r.features.captions = state;
      const html = renderReport(reportFixture(), {fonts: false, recipe: r});
      return /<div class="recipe-card"><h3>الترجمة .*?<\/div>/su.exec(html)[0];
    };
    const yes = cardOf({...look, pending: 0}, 'yes');
    assert.match(yes, /chip-inferred/); assert.match(yes, /<p>شكل <bdi dir="ltr"><code>pill<\/code><\/bdi>/);
    assert.doesNotMatch(yes, /مرشّح|chip-needs-confirmation|مفيش ترجمة كلام/);
    const unknown = cardOf(look, 'unknown');
    assert.match(unknown, /chip-needs-confirmation/, 'A candidate look is marked as needing confirmation.');
    assert.doesNotMatch(unknown, /chip-inferred/);
    assert.match(unknown, /مرشّح مش مؤكد/); assert.match(unknown, /قارن الكلام المكتوب بصوت الريل/);
    assert.match(unknown, /لو طلع ترجمة كلام فعلًا، شكلها: شكل <bdi dir="ltr"><code>pill<\/code><\/bdi>/, 'The look is conditional, not stated.');
    assert.doesNotMatch(unknown, /<p>شكل /, 'The candidate look never opens a sentence as a fact.');
    assert.doesNotMatch(unknown, /مفيش ترجمة كلام/);
    const no = cardOf({present: false, evidence: []}, 'no');
    assert.match(no, /chip-inferred/); assert.match(no, /مفيش ترجمة كلام في الريل ده، فسيب إعدادات الترجمة بتاعتك زي ما هي\./);
    assert.doesNotMatch(no, /مرشّح|chip-needs-confirmation/);
  });

  test('a caption candidate without matching speech is worded in Arabic and checked by ear', () => {
    const reasons = ['Spoken-word caption role is unverified: no transcript.', 'Text does not match timed speech closely enough to establish spoken-word captions.'];
    const pages = reasons.map(reason => {
      const b = reportFixture();
      b.text = [{id: 'T01', start: 0, end: 1, text: 'كلمة', kind: 'caption', zone: 'bottom', entrance: 'cut', exit: 'cut', basis: 'measured', confidence: 'low', status: 'needs-confirmation', reason, confirmHow: 'Compare the text with the original audio.'}];
      b.reviewQueue = ['T01'];
      const html = renderReport(b, {fonts: false});
      assert.ok(!html.includes(reason), 'The English reason never reaches the page.');
      const item = /<ol class="confirm">.*?<\/ol>/su.exec(html)[0];
      assert.match(item, /<span class="ear">بالسمع<\/span>/); assert.match(item, /ممكن يكون ترجمة كلام: «/); assert.match(item, /اسمع الريل وقارن/);
      const cardHtml = /<article class="cue-card.*?<\/article>/su.exec(html)[0];
      assert.match(cardHtml, /ممكن يكون ترجمة كلام/); assert.doesNotMatch(cardHtml, /· ترجمة كلام/, 'An open role is not shown as a confirmed caption.');
      return item;
    });
    assert.match(pages[0], /ما اتكتبش/); assert.match(pages[1], /مش مطابق كفاية/);
    assert.notEqual(pages[0], pages[1]);
    // A caption pending for another reason (reading confidence) keeps its plain kind.
    const b = reportFixture();
    b.text = [{id: 'T01', start: 0, end: 1, text: 'كلمة', kind: 'caption', zone: 'bottom', entrance: 'cut', exit: 'cut', basis: 'measured', confidence: 'low', status: 'needs-confirmation', reason: 'low reading confidence'}];
    assert.match(renderReport(b, {fonts: false}), /· ترجمة كلام/);
  });

  // Literal data in the Stage 3 contract shape; the report never imports the merge module.
  const HEARD_REASONS = {
    notHeard: 'The listener did not hear a sound effect here.',
    heardOnly: 'Only the listener heard this; its time is approximate.',
    type: 'The measured type and the heard type differ.',
    bed: 'The measured music bed and the listener disagree.',
    tempo: 'The measured tempo and the heard tempo differ.',
    tempoOctave: 'The heard tempo is half or double the measured tempo.',
  };
  const heardPending = (reason, confidence = 'medium') => ({basis: 'heard', confidence, status: 'needs-confirmation', reason, confirmHow: 'Listen at the named time.'});
  const mergedListener = (extra = {}) => ({status: 'merged', provider: 'gemini', model: 'gemini-3.8-flash', at: '2026-11-16T10:00:00Z', referenceSha256: 'a'.repeat(64),
    usage: {promptTokens: 1000, outputTokens: 200, totalTokens: 1200}, estimateUsd: {usdTypical: 0.0378, usdMax: 0.0573, priceChecked: '2026-11-16'}, ignoredIds: [], remoteDeleted: true, ...extra});
  const heardReport = () => {
    const b = reportFixture();
    b.sound.sfx = [
      {id: 'X01', t: .5, dur: .1, type: 'pop', strength: 3, onBeat: false, anchor: null, basis: 'heard', confidence: 'high', status: 'confirmed', heard: {verdict: 'heard', type: 'pop'}},
      {id: 'X02', t: 1.2, dur: .1, type: 'click', strength: 2, onBeat: false, anchor: null, ...heardPending(HEARD_REASONS.notHeard, 'low'), heard: {verdict: 'not-heard', type: null}},
      {id: 'X03', t: 2.4, dur: .1, type: 'click', strength: 2, onBeat: false, anchor: null, ...heardPending(HEARD_REASONS.type), heard: {verdict: 'heard', type: 'ding'}},
      {id: 'H01', t: 3.5, dur: null, type: 'whoosh', score: null, onBeat: false, anchor: null, ...heardPending(HEARD_REASONS.heardOnly), heard: {verdict: 'heard-only', type: 'whoosh'}},
    ];
    b.sound.bed = {present: true, levelDb: null, speechToBedDb: null, ...heardPending(HEARD_REASONS.bed), heard: {present: true, character: 'piano', characterAr: 'بيانو هادي'}};
    b.sound.tempo = {bpm: 120, alternatives: [], ...heardPending(HEARD_REASONS.tempoOctave), heard: {bpm: 60}};
    b.sound.voice = {present: true, character: 'male narrator', characterAr: 'راجل بيحكي', basis: 'heard', confidence: 'medium', status: 'confirmed'};
    b.text[0].font = {family: 'kufi', weight: 'bold', basis: 'heard', confidence: 'medium'};
    b.listener = mergedListener();
    b.reviewQueue = ['X02', 'X03', 'H01', 'sound.bed', 'sound.tempo'];
    return b;
  };
  const rowOf = (html, id) => new RegExp(`<tr id="i-${id}".*?</tr>`, 'su').exec(html)?.[0] ?? '';

  test('a merged listener shows the model, the date, the cost and a heard-only row, never the English reasons', () => {
    const html = renderReport(heardReport(), {fonts: false});
    const block = /<div class="listen[ "].*?<\/div>/su.exec(html)?.[0] ?? '';
    assert.match(block, /اتسمع بـ Gemini/u); assert.match(block, /gemini-3\.8-flash/u); assert.match(block, /2026-11-16/u);
    assert.match(block, /التكلفة التقريبية/u); assert.match(block, /0\.0378/u); assert.match(block, /دولار/u);
    assert.doesNotMatch(block, /48 ساعة/u, 'A deleted copy is the normal case and stays quiet.');
    const row = rowOf(html, 'H01');
    assert.match(row, /وقته تقريبي/u); assert.match(row, /هوا/u);
    for (const reason of Object.values(HEARD_REASONS)) assert.ok(!html.includes(reason), `English reason leaked: ${reason}`);
    assert.doesNotMatch(html, /\b(?:NaN|undefined|null)\b/u);
  });

  test('every heard reason has an Arabic wording on the confirmation list', () => {
    const html = renderReport(heardReport(), {fonts: false}), list = /<ol class="confirm">.*?<\/ol>/su.exec(html)[0];
    for (const why of ['Gemini ماسمعش مؤثر في اللحظة دي', 'Gemini بس اللي سمعه، ووقته تقريبي', 'نوع الصوت اللي اتقاس غير اللي اتسمع', 'وجود المزيكا اللي اتقاس غير اللي اتسمع', 'السرعة اللي اتسمعت نص أو ضعف اللي اتقاست']) assert.ok(list.includes(why), why);
    // The plain tempo reason is not reachable from the fixture above, so it is checked on its own.
    const b = heardReport(); b.sound.tempo.reason = HEARD_REASONS.tempo; b.sound.tempo.heard.bpm = 97;
    assert.ok(renderReport(b, {fonts: false}).includes('سرعة المزيكا اللي اتقاست غير اللي اتسمعت'));
    for (const id of ['X02', 'X03', 'H01', 'sound.bed', 'sound.tempo']) assert.ok(list.includes(id), id);
    assert.equal((list.match(/<span class="ear">بالسمع<\/span>/gu) ?? []).length, 5, 'Every heard doubt is checked by ear.');
  });

  test('a disagreement shows the measured type next to the heard one, and a silence says nobody heard it', () => {
    const html = renderReport(heardReport(), {fonts: false});
    const clash = rowOf(html, 'X03'), quiet = rowOf(html, 'X02'), agree = rowOf(html, 'X01');
    assert.match(clash, /كليك/u); assert.match(clash, /دينج/u); assert.match(clash, /اتقاس/u); assert.match(clash, /اتسمع/u);
    assert.match(quiet, /ماسمعوش/u); assert.match(agree, /Gemini سمعه/u);
    const order = ['X01', 'X02', 'X03', 'H01'].map(id => html.indexOf(`<tr id="i-${id}"`));
    assert.deepEqual([...order].sort((a, z) => a - z), order, 'Rows stay in time order.');
  });

  test('a failed listener shows a plain Arabic reason for each code, keeps every measured row and hides the raw message', () => {
    const codes = {'no-key': 'مفيش مفتاح', auth: 'المفتاح مرفوض', quota: 'الحد المسموح خلص', billing: 'الحساب محتاج دفع', 'too-large': 'الملف كبير', blocked: 'Gemini رفض الطلب',
      truncated: 'الرد اتقطع', 'invalid-response': 'الرد مش مفهوم', network: 'مشكلة نت', timeout: 'استنى كتير ومفيش رد', upload: 'الرفع فشل', http: 'خطأ من الخدمة'};
    for (const [code, arabic] of Object.entries(codes)) {
      const b = reportFixture(), raw = `Gemini API 429: RAW-SERVICE-TEXT <b>${code}</b>`;
      b.listener = {status: 'failed', provider: 'gemini', model: 'gemini-3.8-flash', at: '2026-11-16T10:00:00Z', code, reason: raw, remoteDeleted: true};
      b.limitations = [`Listener failed (${code}): ${raw}`];
      const html = renderReport(b, {fonts: false});
      assert.match(html, /Gemini ماقدرش يسمع/u); assert.ok(html.includes(arabic), code);
      assert.ok(!html.includes('RAW-SERVICE-TEXT') && !html.includes('Listener failed'), `${code}: the raw service text must not reach the page.`);
      assert.ok(html.includes('id="i-X01"'), 'Measured rows stay.');
    }
  });

  test('without a listener the page says it was measured only, and an ear answer changes that wording', () => {
    const none = renderReport(reportFixture(), {fonts: false});
    assert.match(none, /الصوت اتقاس بس، ومحدش سمعه لسه/u);
    assert.doesNotMatch(none, /سمعها صاحب الريل/u);
    const b = reportFixture();
    b.sound.sfx[0] = {...b.sound.sfx[0], basis: 'heard', confidence: 'high', status: 'confirmed', reviewedWith: 'ear', heardBy: 'creator', reviewVerdict: 'confirmed'};
    delete b.sound.sfx[0].reason; b.reviewQueue = ['T01', 'sound.bed', 'E01', 'O01'];
    const ear = renderReport(b, {fonts: false});
    assert.doesNotMatch(ear, /محدش سمعه/u); assert.match(ear, /سمعها صاحب الريل/u);
    assert.match(rowOf(ear, 'X01'), /chip-heard/u);
  });

  test('a font guess is worded as an approximation, labelled heard, and never applied', () => {
    const html = renderReport(heardReport(), {fonts: false}), card = /<article class="cue-card.*?<\/article>/su.exec(html)[0];
    assert.match(card, /خط تقريبي: كوفي عريض/u); assert.match(card, /chip-heard/u);
    const names = {naskh: 'نسخ', kufi: 'كوفي', ruqaa: 'رقعة', thuluth: 'ثلث', diwani: 'ديواني', sans: 'بسيط بدون زوائد', serif: 'بزوائد', display: 'عناوين', handwritten: 'خط يد', unknown: 'مش معروف'};
    const weights = {light: 'خفيف', regular: 'عادي', bold: 'عريض', black: 'عريض جدًا'};
    for (const [family, ar] of Object.entries(names)) for (const [weight, w] of Object.entries(weights)) {
      const b = heardReport(); b.text[0].font = {...b.text[0].font, family, weight};
      assert.ok(renderReport(b, {fonts: false}).includes(`خط تقريبي: ${ar} ${w}`), `${family} ${weight}`);
    }
    const odd = heardReport(); odd.text[0].font = {family: '<img src=x onerror=alert(1)>', weight: 'extra', basis: 'heard', confidence: 'medium'};
    const page = renderReport(odd, {fonts: false}); assert.ok(!page.includes('<img src=x')); assert.match(page, /خط تقريبي: مش معروف/u);
    assert.doesNotMatch(html.replace(/<style>.*?<\/style>/su, ''), /font-family:\s*["']?kufi/iu, 'The guess is not applied to the text.');
  });

  test('voice and music are described with the Arabic character only, escaped', () => {
    const b = heardReport(); b.sound.voice.characterAr = '<script>alert("V")</script>صوت';
    b.sound.bed.heard.characterAr = 'بيانو <b>x</b>';
    const html = renderReport(b, {fonts: false});
    assert.ok(!html.includes('<script>alert("V")</script>') && !html.includes('<b>x</b>'));
    assert.match(html, /&lt;script&gt;/u);
    const clean = renderReport(heardReport(), {fonts: false});
    assert.ok(clean.includes('راجل بيحكي') && clean.includes('بيانو هادي'));
    assert.ok(!clean.includes('male narrator') && !/>piano</u.test(clean), 'The English character never appears.');
    assert.match(clean, /<bdi class="n">60<\/bdi>/u, 'The heard tempo is shown.');
  });

  test('the four listener limitations are worded in Arabic, with the service message never shown', () => {
    const b = heardReport();
    b.listener = mergedListener({ignoredIds: ['Z1', 'Z2'], remoteDeleted: false});
    b.limitations = ['The listener answered 2 unknown or repeated ids; they were ignored.', 'The listener gave no answer for 3 measured sound effects.',
      'The uploaded copy could not be deleted from Gemini; Google deletes uploaded files after 48 hours.', 'Listener failed (quota): Gemini API 429: <i>RAW</i>'];
    const html = renderReport(b, {fonts: false}), limits = /<ul class="limits">.*?<\/ul>/su.exec(html)[0];
    for (const raw of ['The listener answered', 'The listener gave no answer', 'could not be deleted', 'Listener failed', 'Gemini API 429', '<i>RAW</i>']) assert.ok(!html.includes(raw), raw);
    assert.equal((limits.match(/<li>/gu) ?? []).length, 4);
    assert.match(limits, /اتجاهلت/u); assert.match(limits, /<bdi class="n">2<\/bdi>/u); assert.match(limits, /<bdi class="n">3<\/bdi>/u);
    assert.match(limits, /48 ساعة/u); assert.match(limits, /الحد المسموح خلص/u);
    assert.match(/<div class="listen[ "].*?<\/div>/su.exec(html)[0], /48 ساعة/u, 'A copy that could not be deleted is stated in the block too.');
  });

  test('the listener block sits at the top of the sound section and adds no seventh sound card', () => {
    const html = renderReport(heardReport(), {fonts: false});
    const sound = /<h2>الصوت<\/h2>.*?<h3>المؤثرات الصوتية/su.exec(html)[0];
    assert.equal((sound.match(/<div class="stat"/gu) ?? []).length, 6);
    assert.ok(sound.indexOf('class="listen') >= 0 && sound.indexOf('class="listen') < sound.indexOf('class="stats'));
    assert.match(html, /\.listen[^{]*\{/u, 'The block is styled by the page itself.');
  });

  const heardModule = fs.existsSync(path.join(ROOT, 'scripts/lib/breakdown-heard.mjs'));
  if (!heardModule) {
    test('report agrees with the real heard merge', {skip: 'breakdown-heard.mjs has not arrived; this check must run after the merge.'}, () => {});
  } else {
    test('report agrees with the real heard merge: every reason and limitation is Arabic and the merged rows render', async () => {
      const {mergeHeard, recordListenerFailure, HEARD_REASONS: real} = await import('../scripts/lib/breakdown-heard.mjs');
      assert.deepEqual({...real}, HEARD_REASONS, 'The literal contract in this file must equal the real strings.');
      const base = reportFixture(), measured = {basis: 'measured', confidence: 'high', status: 'confirmed', strength: 2, dur: .1, onBeat: false, anchor: null};
      base.sound.sfx = [{id: 'X01', t: .5, type: 'pop', ...measured}, {id: 'X02', t: 1.2, type: 'click', ...measured}, {id: 'X03', t: 2.4, type: 'click', ...measured}, {id: 'X04', t: 5, type: 'hit', ...measured}];
      base.sound.bed = {present: true, levelDb: -30, speechToBedDb: 12, basis: 'measured', confidence: 'high', status: 'confirmed'};
      base.sound.tempo = {bpm: 120, alternatives: [], basis: 'measured', confidence: 'high', status: 'confirmed'};
      base.reviewQueue = [];
      const heard = {sfx: [{id: 'X01', heard: true, type: 'pop'}, {id: 'X02', heard: false, type: null}, {id: 'X03', heard: true, type: 'ding'}],
        extraSfx: [{t: 3.5, type: 'whoosh'}], text: [{id: 'T01', font: 'kufi', weight: 'bold'}],
        music: {present: true, character: 'piano', characterAr: 'بيانو', bpm: 60}, voice: {present: true, character: 'male', characterAr: 'راجل'}, ignoredIds: ['Q9']};
      const meta = {provider: 'gemini', model: 'gemini-3.8-flash', at: '2026-11-16T10:00:00Z', referenceSha256: 'a'.repeat(64), usage: {promptTokens: 1, outputTokens: 1, totalTokens: 2}, estimateUsd: {usdTypical: .03, usdMax: .05}, remoteDeleted: false};
      const merged = mergeHeard(base, heard, meta), html = renderReport(merged, {fonts: false});
      for (const reason of Object.values(real)) assert.ok(!html.includes(reason), reason);
      for (const l of merged.limitations.filter(x => /^(The listener|The uploaded|Listener failed)/u.test(x))) assert.ok(!html.includes(l), l);
      assert.match(html, /id="i-H01"/u); assert.match(html, /خط تقريبي: كوفي عريض/u); assert.match(html, /48 ساعة/u);
      const failed = renderReport(recordListenerFailure(base, {provider: 'gemini', model: 'gemini-3.8-flash', at: 'now', code: 'quota', message: 'Gemini API 429: RAW', remoteDeleted: true}), {fonts: false});
      assert.match(failed, /الحد المسموح خلص/u); assert.ok(!failed.includes('Gemini API 429'));
    });
  }

  test('a failed listener followed by an ear answer never says nobody listened', () => {
    const b = reportFixture();
    b.listener = {status: 'failed', provider: 'gemini', model: 'gemini-3.8-flash', at: '2026-11-16T10:00:00Z', code: 'quota', reason: 'x', remoteDeleted: true};
    b.limitations = ['Listener failed (quota): x'];
    const failedOnly = /<div class="listen[ "].*?<\/div>/su.exec(renderReport(b, {fonts: false}))[0];
    assert.match(failedOnly, /ومحدش سمع الصوت لسه/u);
    b.sound.sfx[0] = {...b.sound.sfx[0], basis: 'heard', confidence: 'high', status: 'confirmed', reviewedWith: 'ear', heardBy: 'creator', reviewVerdict: 'confirmed'};
    delete b.sound.sfx[0].reason;
    const block = /<div class="listen[ "].*?<\/div>/su.exec(renderReport(b, {fonts: false}))[0];
    assert.match(block, /الحد المسموح خلص/u); assert.match(block, /صاحب الريل سمع/u);
    assert.doesNotMatch(block, /محدش سمع/u);
  });

  test('a heard-only effect the creator confirmed by ear no longer reads as heard only by Gemini, and keeps its approximate time', () => {
    const b = heardReport();
    b.sound.sfx[3] = {...b.sound.sfx[3], basis: 'heard', confidence: 'high', status: 'confirmed', reviewedWith: 'ear', heardBy: 'creator', reviewVerdict: 'confirmed'};
    delete b.sound.sfx[3].reason; b.reviewQueue = ['X02', 'X03', 'sound.bed', 'sound.tempo'];
    const row = rowOf(renderReport(b, {fonts: false}), 'H01');
    assert.match(row, /سمعها صاحب الريل/u); assert.match(row, /وقته تقريبي/u);
    assert.doesNotMatch(row, /Gemini بس اللي سمعه/u);
  });
}
