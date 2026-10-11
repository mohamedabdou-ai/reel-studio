import React from 'react';
import {useClock} from '../../core/motion';
import {FitText,SceneCanvas,type SceneGeometry,type SceneTheme} from '../primitives';
import {messageBoardState,type MessageBoardData} from './message-board.ts';

export const MessageBoard:React.FC<{id:string;data:MessageBoardData;theme:SceneTheme;geometry:SceneGeometry}>=({data,theme,geometry:g})=>{
  const {frame}=useClock();
  const state=messageBoardState(data,frame,{x:g.left,y:g.top+g.bodyTop,width:g.width,height:g.bodyHeight});
  const square=['ink-frame','verdict-board','offset-plate','magazine-rule'].includes(theme.grammar?.card??'');
  return <>
    <SceneCanvas theme={theme} geometry={g}>
      <div style={{position:'absolute',left:0,top:g.titleTop??34}}>
        <FitText text={state.title} theme={theme} role="title" width={g.width} height={g.titleHeight} size={62} min={24} lines={2}/>
      </div>
    </SceneCanvas>
    {state.items.map((pose,index)=>{
      const item=data.items[index],padding=20;
      const height=Math.round(pose.height),width=Math.round(pose.width),labelHeight=Math.round(item.detail?Math.min(height*.4,240):height-padding*2);
      const highlight=pose.focus>.5,bg=highlight?theme.accent:theme.card,ink=highlight?(theme.onAccent??theme.text):theme.text;
      const detailHeight=height-labelHeight-padding*2-12;
      return <div key={item.id} data-message-id={item.id} style={{position:'absolute',left:Math.round(pose.x),top:Math.round(pose.y),width,height,
        opacity:pose.opacity,zIndex:pose.zIndex,transform:`rotate(${pose.rotation.toFixed(3)}deg)`,transformOrigin:'50% 50%',boxSizing:'border-box',
        background:bg,border:`2px solid ${highlight?theme.accent:theme.border}`,borderRadius:square?3:18,boxShadow:`5px 7px 0 ${theme.border}35`}}>
        <div style={{position:'absolute',left:padding,top:padding}}>
          <FitText text={item.label} theme={theme} role="title" width={width-padding*2} height={labelHeight}
            size={Math.round(34+pose.focus*40)} min={18} lines={item.detail?2:3} color={ink}/>
        </div>
        {item.detail?<div style={{position:'absolute',left:padding,top:padding+labelHeight+12}}>
          <FitText text={item.detail} theme={theme} width={width-padding*2} height={detailHeight} size={Math.round(22+pose.focus*14)} min={14} lines={3} color={highlight?ink:theme.dim}/>
        </div>:null}
      </div>;
    })}
  </>;
};
