import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {usePreparedPlate} from '../../engine/src/screen-recording/ScreenRecordingScene';

export const FamilyProbe:React.FC<any> = props => <output data-probe={JSON.stringify({scene:props.scene,frame:useCurrentFrame(),duration:useVideoConfig().durationInFrames,plate:usePreparedPlate(),seam:props.seam,headBox:props.headBox,words:props.words})}/>;
export const ConceptProbe:React.FC<any> = props => <output data-frame={useCurrentFrame()} data-duration={useVideoConfig().durationInFrames} data-section={props.sectionIndex}/>;
export const FreshProbe=ConceptProbe;
export const ThrowProbe:React.FC<any> = () => {throw new Error('probe error');};
