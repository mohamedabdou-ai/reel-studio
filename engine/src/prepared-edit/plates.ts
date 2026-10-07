export function preparedPlateList(edit:{scenes:readonly {family:string;data?:unknown}[]},plateSrc:string):string[]{
  const foregrounds:string[]=[],captures:string[]=[];
  for(const scene of edit.scenes){
    const data=scene.data as {foreground?:{src:string};steps?:{kind?:string;src:string}[]}|undefined;
    if(scene.family==='kinetic-hook' && data?.foreground)foregrounds.push(data.foreground.src);
    if(scene.family==='screen-focus'||scene.family==='screens')for(const step of data?.steps??[])if(step.kind==='video')captures.push(step.src);
  }
  return [plateSrc,...new Set([...foregrounds,...captures])];
}
