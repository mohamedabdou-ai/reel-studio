import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import type {FamilyDesignProps} from '../../family-designs';
import {messageBoardState, type MessageBoardData} from '../../../creative-kit/semantic/message-board';
import {Furniture, Ground, MagazineScope, NAVY} from '../system/base';
import {Dressing, language, SwapTitle, TextBox} from './message-board-focus';
import {FocusCard} from './message-board-focus';

export const BOARD_BOX = {x: 65, y: 435, width: 950, height: 715};
export const boardPose = (data: MessageBoardData, frame: number) => messageBoardState(data, frame, BOARD_BOX);
const Board: React.FC<FamilyDesignProps> = ({scene, sectionIndex = 0}) => {
  const data = scene.data as MessageBoardData, frame = useCurrentFrame(), state = boardPose(data, frame);
  const beats = [{at: 0, text: data.initialTitle}, {at: data.gatherFrame, text: data.boardTitle}, {at: data.focusFrame, text: data.focusTitle}];
  if (data.closingFrame !== undefined) beats.push({at: data.closingFrame, text: data.closingTitle});
  return <AbsoluteFill data-message-board-phase={state.phase}>
    <Dressing><Ground th={NAVY}/><Furniture th={NAVY} section="" page={String(sectionIndex + 1).padStart(2, '0')}/></Dressing>
    <SwapTitle beats={beats} top={350} height={80} size={64} floor={48}/>
    {state.items.map((pose, i) => {
      const item = data.items[i], width = Math.max(1, pose.width - 60), innerH = Math.max(1, pose.height - 60);
      const titleH = item.detail ? Math.min(innerH - 47, 48 + pose.focus * 86) : innerH;
      const detailH = Math.max(1, innerH - titleH - 6);
      return <div key={item.id} data-message-id={item.id} data-focus={pose.focus} data-pose={JSON.stringify(pose)} style={{position: 'absolute', left: pose.x, top: pose.y, width: pose.width, height: pose.height,
        boxSizing: 'border-box', overflow: 'hidden', opacity: pose.opacity, zIndex: pose.zIndex, transform: `rotate(${pose.rotation * 0.5}deg)`, background: pose.focus > 0 ? NAVY.faint : NAVY.ground,
        border: `${pose.focus > 0 ? 3 : 2}px solid ${pose.focus > 0 ? NAVY.gold : NAVY.hair}`}}>
        <div style={{position: 'absolute', left: pose.focus > .5 ? 27 : 30, top: pose.focus > .5 ? 27 : 30, width, height: innerH, overflow: 'hidden'}}>
          {pose.focus > .5 ? <FocusCard label={item.label} detail={item.detail} width={width} height={innerH} focus={pose.focus}/> : <>
            <TextBox text={item.label} width={width} height={titleH} size={40 + pose.focus * 16} floor={40} weight={pose.focus > 0 ? 700 : 600}/>
            {item.detail ? <div style={{marginTop: 6}}><TextBox text={item.detail} width={width} height={detailH} size={34 + pose.focus * 10} floor={34} weight={400} color={NAVY.dim}/></div> : null}
          </>}
        </div>
      </div>;
    })}
  </AbsoluteFill>;
};
export const MessageBoard: React.FC<FamilyDesignProps> = (props) => <MagazineScope data={language([(props.scene.data as MessageBoardData).boardTitle])}><Board {...props}/></MagazineScope>;
export default MessageBoard;
