import React from 'react';
import {Sequence} from 'remotion';
import {z} from 'zod';
import {SafeRoot,type SafeProps} from '../core/safe';
import {CreativeFonts} from '../creative-kit/primitives';
import {styleSchema} from '../creative-kit/schema';
import {librarySceneSchema,type LibraryScene} from './schema';
import {LibrarySceneRenderer} from './scenes';

export const motionGallerySchema=z.object({style:styleSchema});
type Props=SafeProps&z.infer<typeof motionGallerySchema>;
export const motionGalleryDefaults:Props={style:'kinetic-paper',guides:false};
const common={motion:'land',durationInFrames:150,layout:'takeover'} as const;
const scenes:LibraryScene[]=[
  librarySceneSchema.parse({...common,id:'source-example',fromFrame:0,family:'screen-focus',data:{kicker:'SOURCE FOCUS',steps:[
    {atFrame:0,focusFrame:20,settleFrames:25,title:'ركّز على اللي بتشرحه.',label:'التفاصيل تظهر في مكانها',src:'sd/cap01-tags.png',sourceWidth:2240,sourceHeight:676,
      focus:{x:.68,y:.01,width:.31,height:.46},zoom:2.5},
  ]}}),
  librarySceneSchema.parse({...common,id:'metric-example',fromFrame:150,family:'data-story',data:{kicker:'METRIC REVEAL',title:'الرقم جزء من الحكاية.',sourceNote:'قيم توضيحية لا تمثل قياس أداء',display:'metric',
    suffix:'',unit:'مثال على عرض رقم',animateFrames:45,items:[{label:'بيانات قابلة للتعديل',value:1500,atFrame:15}]}}),
  librarySceneSchema.parse({...common,id:'bars-example',fromFrame:300,family:'data-story',data:{kicker:'DATA STORY',title:'مقارنة تتفهم بسرعة.',sourceNote:'قيم توضيحية لا تمثل قياس أداء',display:'bars',suffix:'',unit:'قيمة',
    animateFrames:30,items:[{label:'الخيار الأول',value:30,atFrame:12},{label:'الخيار الثاني',value:70,atFrame:35},{label:'الخيار الثالث',value:50,atFrame:58}]}}),
];

export const MotionLibraryGallery:React.FC<Props>=props=>{
  const {style}=motionGallerySchema.parse(props);
  return <SafeRoot guides={props.guides} probe={props.probe} plates={props.plates}><CreativeFonts>{scenes.map(scene=><Sequence key={scene.id} from={scene.fromFrame} durationInFrames={scene.durationInFrames}>
    <LibrarySceneRenderer scene={scene} style={style} seam={1080}/>
  </Sequence>)}</CreativeFonts></SafeRoot>;
};
