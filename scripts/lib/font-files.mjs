const CONTROL_FILES=new Set(['manifest.json','manifest.template.json']);

export const shouldPruneFontFile=(file,declaredFiles,ownedPrefixes)=>{
  if(CONTROL_FILES.has(file) || declaredFiles.has(file))return false;
  if(ownedPrefixes && !ownedPrefixes.some(prefix=>file.startsWith(prefix)))return false;
  return true;
};
