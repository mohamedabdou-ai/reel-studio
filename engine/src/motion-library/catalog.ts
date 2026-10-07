import {getStyleProfile,EDITION_STYLE_IDS as STYLE_IDS,type StyleId} from '../creative-kit/styles.ts';
import {LIBRARY_FAMILIES} from './schema.ts';

const provenance='Motion-Kits/github-curated/manifest.json';
const recipes=[
  {id:'source-focus',family:'screen-focus',label:'Source focus',description:'Reveal the real capture (still or screen recording), move the camera to authored regions, and mark them with a source-aligned cursor, click ripple and pinned callouts.',
    tags:['screen','cursor','zoom','tutorial','video','recording','click','callout','شاشة','شرح','تكبير','تسجيل'],input:'Single-frame PNG/JPEG, or a local MP4/WebM screen recording, + actual dimensions + normalized focus rectangles + authored timing (video: focus keys, cursor waypoints, pinned callouts).',
    layout:'takeover',cost:'2D SVG + one local image or muted capture video per active step; no AI at render time.',preferred:['split-canvas','section-deck','kinetic-paper'],provenance},
  {id:'metric-count',family:'data-story',label:'Metric reveal',description:'One supplied metric with a whole-block reveal, rolling value and source note.',
    tags:['counter','metric','number','count','أرقام','عدد'],display:'metric',input:'One authored non-negative value (up to two decimal places), label, unit, source note and reveal frame.',
    layout:'split or takeover',cost:'2D text + SVG; no image/model decode.',preferred:['kinetic-paper','section-deck','calligraphic-receipts'],provenance},
  {id:'data-bars',family:'data-story',label:'Sourced bar comparison',description:'Two to five authored values on one zero-based scale with timed labels and a source note.',
    tags:['chart','bars','comparison','data','مقارنة','بيانات'],display:'bars',input:'Authored labels, non-negative values (up to two decimal places), unit, source note and reveal frames.',
    layout:'takeover',cost:'2D SVG/text; no image/model decode.',preferred:['section-deck','stepped-editorial','judgment-board'],provenance},
] as const;


export function listMotionRecipes({style,family,query=''}:{style?:StyleId;family?:string;query?:string}={}){
  if(style!==undefined && !STYLE_IDS.includes(style))throw new Error(`style must be one of ${STYLE_IDS.join(', ')}.`);
  const profile=style===undefined?null:getStyleProfile(style);
  if(family!==undefined && !(LIBRARY_FAMILIES as readonly string[]).includes(family))throw new Error(`Unknown motion family: ${family}`);
  if(typeof query!=='string' || query.length>200)throw new Error('Motion query must be text of at most 200 characters.');
  const terms=query.toLocaleLowerCase('en').trim().split(/\s+/u).filter(Boolean);
  const selected=recipes.filter(recipe=>(family===undefined||recipe.family===family)&&terms.every(term=>
    `${recipe.id} ${recipe.label} ${recipe.description} ${recipe.tags.join(' ')}`.toLocaleLowerCase('en').includes(term)))
    .map(recipe=>({...recipe,compatibleStyles:[...STYLE_IDS],styleFit:style && (recipe.preferred as readonly string[]).includes(style)?'preferred':'supported'}))
    .sort((a,b)=>Number(b.styleFit==='preferred')-Number(a.styleFit==='preferred'));
  return {ok:true,version:1,selection:'Authored data; one existing Style DNA per edit. No generated claims.',style:profile,recipes:selected};
}
