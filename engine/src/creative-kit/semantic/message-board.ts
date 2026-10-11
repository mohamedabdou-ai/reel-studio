import {clamp01,EASE,mix} from '../../core/motion.ts';

export type MessageBoardData={initialTitle:string;boardTitle:string;focusTitle:string;closingTitle:string;
  items:readonly {id:string;label:string;detail?:string}[];focusIndex:number;gatherFrame:number;gatherDurationFrames:number;
  focusFrame:number;focusDurationFrames:number;closingFrame?:number};
export type MessageBoardBox={x:number;y:number;width:number;height:number};
export type MessageCardPose=MessageBoardBox&{id:string;rotation:number;opacity:number;focus:number;zIndex:number};
const SCATTER=[[.02,.12,-6],[.94,.02,5],[.14,.86,4],[.84,.66,-5],[.06,.47,-3],[.90,.94,3]] as const;

// Every pose is a pure evaluation of one authored frame. Card keys never change.
export function messageBoardState(data:MessageBoardData,frame:number,box:MessageBoardBox){
  const padding=32,gap=18,count=data.items.length,rows=Math.ceil(count/2);
  const area={x:box.x+padding,y:box.y+padding,width:box.width-padding*2,height:box.height-padding*2};
  const scatterW=Math.round(area.width*.44),scatterH=Math.round(Math.min(160,area.height*.26));
  const boardW=Math.round((area.width-gap)/2),boardH=Math.round(Math.min(190,(area.height-gap*(rows-1))/rows));
  const gather=EASE.inOut(clamp01((frame-data.gatherFrame)/data.gatherDurationFrames));
  const focus=EASE.inOut(clamp01((frame-data.focusFrame)/data.focusDurationFrames));
  const phase=data.closingFrame!==undefined&&frame>=data.closingFrame?'closing':frame>=data.focusFrame+data.focusDurationFrames?'focus'
    :frame>=data.focusFrame?'focusing':frame>=data.gatherFrame+data.gatherDurationFrames?'board':frame>=data.gatherFrame?'gathering':'messages';
  const title=phase==='closing'?data.closingTitle:phase==='focus'||phase==='focusing'?data.focusTitle:phase==='board'||phase==='gathering'?data.boardTitle:data.initialTitle;
  const items=data.items.map((item,index):MessageCardPose=>{
    const [sx,sy,rotation]=SCATTER[index],lastCentred=count%2===1&&index===count-1;
    const scatter={x:area.x+(area.width-scatterW)*sx,y:area.y+(area.height-scatterH)*sy,width:scatterW,height:scatterH};
    const board={x:lastCentred?area.x+(area.width-boardW)/2:area.x+(index%2)*(boardW+gap),
      y:area.y+(area.height-(rows*boardH+(rows-1)*gap))/2+Math.floor(index/2)*(boardH+gap),width:boardW,height:boardH};
    const selected=index===data.focusIndex,expand=selected?focus:0;
    return {id:item.id,x:mix(mix(scatter.x,board.x,gather),area.x,expand),y:mix(mix(scatter.y,board.y,gather),area.y,expand),
      width:mix(mix(scatter.width,board.width,gather),area.width,expand),height:mix(mix(scatter.height,board.height,gather),area.height,expand),
      rotation:rotation*(1-gather),opacity:selected?1:1-focus,focus:expand,zIndex:selected&&focus>0?100:count-index};
  });
  return {phase,title,items};
}
