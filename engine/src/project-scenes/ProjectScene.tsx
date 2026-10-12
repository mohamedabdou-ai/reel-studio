import React from 'react';
import {PROJECT_SCENES} from './registry.ts';
import type {ProjectSceneProps} from './registry.ts';
import {valuesSchema} from './schema.ts';
export const ProjectScene:React.FC<ProjectSceneProps&{component:string}>=({component,...props})=>{
  const registered=PROJECT_SCENES[component];
  if(!registered)throw new Error(`Project scene ${component} is not in this project bundle. Reopen the editor after changing scene code.`);
  return <registered.Component {...props} values={valuesSchema(registered.contract.fields).parse(props.values)}/>;
};
