import type React from 'react';
import type {ProjectSceneContract} from './schema.ts';
export type ProjectSceneProps={values:Record<string,unknown>;style:string;layout:'split'|'takeover';motion:'land'|'stagger'|'quiet';durationInFrames:number;seam:number;headBox:unknown};
export const PROJECT_SCENES:Record<string,{Component:React.ComponentType<ProjectSceneProps>;contract:ProjectSceneContract}>={};
