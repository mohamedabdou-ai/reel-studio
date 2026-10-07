export const STYLE_IDS=['split-canvas','section-deck','kinetic-paper','calligraphic-receipts','paper-collage','judgment-board','stepped-editorial'] as const;
export type StyleId=(typeof STYLE_IDS)[number];

export const EDITION_STYLE_IDS:readonly StyleId[]=STYLE_IDS;

export const EDITION_DEFAULT_STYLE_IDS:readonly StyleId[]=['split-canvas','section-deck'];
export type StyleUseCase='explainer'|'case-study'|'tutorial'|'comparison'|'opinion'|'story';
export type StyleGrammar={typography:'product-sans'|'heavy-poster'|'naskh-receipt'|'mixed-paper'|'serif-verdict'|'serif-editorial';card:'rounded-ui'|'ink-frame'|'receipt-sheet'|'taped-paper'|'verdict-board'|'offset-plate';annotation:'accent-rule'|'terminal-period'|'signal-strip'|'brush-rule'|'tape-tabs'|'verdict-divider'|'yellow-marker';composition:'split-panel'|'section-stack'|'poster-lockup'|'claim-receipt'|'collage-stack'|'two-column-board'|'editorial-spread';caption:'pill'|'ink-strip'|'boxless'|'paper-label';motion:'land'|'stagger'|'quiet'};
export type StyleProfile={id:StyleId;label:string;description:string;useCases:readonly StyleUseCase[];source:{document:string;confidence:'high'|'medium'|'low';references:readonly {file:string;timecodes:readonly string[];observed:string}[];limitations:readonly string[]};approval:{status:'approved-style'|'approved-edit'|'not-style-approved';scope:string;evidence:string};implementation:'implemented';grammar:StyleGrammar};

const source={document:'instructions/TECHNIQUES.md',confidence:'medium' as const,references:[],limitations:['Adapt every style to the customer source and obtain creative approval from the customer.']};
const approval={status:'not-style-approved' as const,scope:'Executable product style direction; each customer edit still needs explicit creative review.',evidence:'instructions/EDITING.md'};
const define=(id:StyleId,label:string,description:string,useCases:StyleUseCase[],grammar:StyleGrammar):StyleProfile=>({id,label,description,useCases,source,approval,implementation:'implemented',grammar});
const profiles:Record<StyleId,StyleProfile>={
  'split-canvas':define('split-canvas','Split canvas','Product UI above a continuous presenter window.',['explainer','tutorial'],{typography:'product-sans',card:'rounded-ui',annotation:'accent-rule',composition:'split-panel',caption:'pill',motion:'land'}),
  'section-deck':define('section-deck','Section deck','Held sections with semantic cards and compact captions.',['explainer','tutorial','comparison'],{typography:'product-sans',card:'rounded-ui',annotation:'terminal-period',composition:'section-stack',caption:'pill',motion:'stagger'}),
  'kinetic-paper':define('kinetic-paper','Kinetic paper','Heavy poster type, ink frames and deliberate reveals.',['explainer','comparison','tutorial'],{typography:'heavy-poster',card:'ink-frame',annotation:'signal-strip',composition:'poster-lockup',caption:'ink-strip',motion:'stagger'}),
  'calligraphic-receipts':define('calligraphic-receipts','Calligraphic receipts','Naskh claims paired with evidence receipts.',['case-study','story','opinion'],{typography:'naskh-receipt',card:'receipt-sheet',annotation:'brush-rule',composition:'claim-receipt',caption:'boxless',motion:'quiet'}),
  'paper-collage':define('paper-collage','Paper collage','Layered cards, tabs and restrained depth.',['story','comparison','case-study'],{typography:'mixed-paper',card:'taped-paper',annotation:'tape-tabs',composition:'collage-stack',caption:'paper-label',motion:'land'}),
  'judgment-board':define('judgment-board','Judgment board','A clear two-column verdict or comparison.',['comparison','opinion','case-study'],{typography:'serif-verdict',card:'verdict-board',annotation:'verdict-divider',composition:'two-column-board',caption:'boxless',motion:'quiet'}),
  'stepped-editorial':define('stepped-editorial','Stepped editorial','Editorial spreads with offset plates and marked evidence.',['opinion','case-study','story'],{typography:'serif-editorial',card:'offset-plate',annotation:'yellow-marker',composition:'editorial-spread',caption:'boxless',motion:'land'}),
};

export const getStyleProfile=(id:string):StyleProfile=>{
  if(!Object.prototype.hasOwnProperty.call(profiles,id))throw new Error(`Unknown style ${JSON.stringify(id)}. Choose one of: ${STYLE_IDS.join(', ')}.`);
  return profiles[id as StyleId];
};
