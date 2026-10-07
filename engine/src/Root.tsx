import React from 'react';
import {Composition} from 'remotion';
import {CreativeKitGallery,calculateCreativeGalleryMetadata} from './creative-kit/Gallery';
import {creativeGalleryDefaults,creativeGallerySchema} from './creative-kit/schema';
import {PreparedEdit,preparedEditDefaults,calculatePreparedMetadata} from './prepared-edit/PreparedEdit';
import {Practice} from './practice/Practice';
import {Doctor,calculateDoctorMetadata,doctorDefaults} from './doctor/Doctor';

export const RemotionRoot:React.FC=()=> <>
  <Composition id="Doctor" component={Doctor} width={1080} height={1920} fps={30} durationInFrames={120} defaultProps={doctorDefaults} calculateMetadata={calculateDoctorMetadata}/>
  <Composition id="Practice" component={Practice} width={360} height={640} fps={30} durationInFrames={90}/>
  <Composition id="PreparedEdit" component={PreparedEdit} width={1080} height={1920} fps={30} durationInFrames={90} defaultProps={preparedEditDefaults} calculateMetadata={calculatePreparedMetadata}/>
  <Composition id="CreativeKitGallery" component={CreativeKitGallery} width={1080} height={1920} fps={30} durationInFrames={720} defaultProps={creativeGalleryDefaults} schema={creativeGallerySchema} calculateMetadata={calculateCreativeGalleryMetadata}/>
</>;
