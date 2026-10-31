import React from 'react';
import type {FamilyDesignProps} from '../../family-designs';
import type {ConceptId} from '../../../motion-concepts/types';
import type {ConceptDesignProps} from './concepts/types';
import {designWarning} from '../../../style-kit/design-safety';
import {toLatinDigits} from '../../../core/digits';
import type {ChaosToBrandData} from '../../../motion-concepts/chaos-to-brand/schema';
import {NAVY} from '../system/base';
import {PromptToResults} from './concepts/prompt-to-results';
import {DepartmentTabs} from './concepts/department-tabs';
import {ToolStackSpread} from './concepts/tool-stack-spread';
import {GlassLens} from './concepts/glass-lens';
import {KpiZoom} from './concepts/kpi-zoom';
import {AutomationFlow} from './concepts/automation-flow';
import {PanelReveal} from './concepts/panel-reveal';
import {SystemLayers} from './concepts/system-layers';
import {HeadlineToSystem} from './concepts/headline-to-system';
import {ConditionalBranching} from './concepts/conditional-branching';
import {IdentityFiltering} from './concepts/identity-filtering';
import {DataMorph} from './concepts/data-morph';
import {ButtonToWindow} from './concepts/button-to-window';
import {BriefToWorkspace} from './concepts/brief-to-workspace';
import {MagneticDock} from './concepts/magnetic-dock';
import {KeywordReveal} from './concepts/keyword-reveal';
import {ChaosToBrand} from './concepts/chaos-to-brand';

const designs={
  'prompt-to-results':PromptToResults,'department-tabs':DepartmentTabs,'tool-stack-spread':ToolStackSpread,
  'glass-lens':GlassLens,'kpi-zoom':KpiZoom,'automation-flow':AutomationFlow,'panel-reveal':PanelReveal,
  'system-layers':SystemLayers,'headline-to-system':HeadlineToSystem,'conditional-branching':ConditionalBranching,
  'identity-filtering':IdentityFiltering,'data-morph':DataMorph,'button-to-window':ButtonToWindow,
  'brief-to-workspace':BriefToWorkspace,'magnetic-dock':MagneticDock,'keyword-reveal':KeywordReveal,'chaos-to-brand':ChaosToBrand,
} satisfies Record<ConceptId,React.FC<ConceptDesignProps<any>>>;

export const MotionConcept:React.FC<FamilyDesignProps>=props=>{
  // Scene data is already prepared and may contain display-mapped digit glyphs.
  const {concept,config}=props.scene.data as {concept:string;config:unknown};
  if(!Object.hasOwn(designs,concept)){
    designWarning('magazine-interview',{concept,reason:'Unknown motion concept'});
    return null;
  }
  const Design:React.FC<ConceptDesignProps<any>>=designs[concept as ConceptId];
  // SVG coordinates are machine data, even though designSet maps string digits.
  // Restore only that grammar; visible brand text keeps the chosen digit glyphs.
  const chaos=config as ChaosToBrandData;
  const prepared=concept==='chaos-to-brand'&&chaos.mark?.kind==='path'
    ?{...chaos,mark:{...chaos.mark,d:toLatinDigits(chaos.mark.d),viewBox:toLatinDigits(chaos.mark.viewBox)}}:config;
  return <Design config={prepared} durationInFrames={props.scene.durationInFrames} seam={props.seam} th={NAVY} sectionIndex={props.sectionIndex??0} mode="once" backdrop="canvas"/>;
};
