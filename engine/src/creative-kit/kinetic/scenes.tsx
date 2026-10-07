import React from 'react';
import {Img,staticFile,Sequence} from 'remotion';
import {CanvasFill,zone} from '../../core/safe';
import {Footage,type WindowGeo} from '../../core/plate';
import {clamp01,EASE,useClock,useEnterF} from '../../core/motion';
import {FitText,fitTextLayout,type SceneTheme} from '../primitives';
import {useSceneTheme} from '../chapter-theme';
import {finalValueTemplate} from '../value-fit';
import type {StyleFamily} from '../schema';
import type {KineticScene} from './schema';
import {CAPTION_BAND_HALF,INK_EM,LIFT_TRAVEL,PRESENTER_CAPTION_CENTER,STACK_GAP,liftExcursion,placeTitle,type HeadBoxPx} from '../head-clear.ts';

type Data<F extends KineticScene['family']>=Extract<KineticScene,{family:F}>['data'];
type Common={theme:SceneTheme;motion:KineticScene['motion']};
const mono=(theme:SceneTheme):React.CSSProperties=>({fontFamily:theme.mono,fontWeight:600,fontSize:24,letterSpacing:2});
const Lift:React.FC<{at?:number;angle?:number;style?:React.CSSProperties;motion?:KineticScene['motion'];children?:React.ReactNode}>=({at=0,angle=0,style,motion='land',children})=>{
  const e=useEnterF(at,motion==='quiet'?'tight':motion==='stagger'?'snap':'land');
  return <div style={{...style,opacity:clamp01(e),transform:`translateY(${Math.round((1-e)*LIFT_TRAVEL[motion])}px) rotate(${angle}deg)`,transformOrigin:'50% 50%'}}>{children}</div>;
};
const Tag:React.FC<{text:string;theme:SceneTheme;dark?:boolean;width?:number}>=({text,theme,dark=false,width=260})=><div style={{display:'inline-block',border:`2px solid ${dark?theme.background:theme.text}`,borderRadius:40,padding:'10px 20px'}}>
  <FitText text={text} theme={theme} role="label" width={width} height={35} size={24} min={16} lines={1} color={dark?theme.background:theme.text}/>
</div>;
const Title:React.FC<Common&{kicker:string;text:string;dark?:boolean}>=({theme,motion,kicker,text,dark=false})=><Lift motion={motion} style={{position:'absolute',left:90,top:285,width:890}}>
  <FitText text={kicker} theme={theme} role="label" width={890} height={40} size={24} min={18} lines={1} color={dark?theme.accent:theme.text}/>
  <div style={{marginTop:16}}><FitText text={text} theme={theme} role="title" width={890} height={190} size={72} min={36} lines={2} color={dark?theme.background:theme.text} align="right"/></div>
</Lift>;

const Hook:React.FC<Common&{data:Data<'kinetic-hook'>;geometry:WindowGeo;aspect:number}>=({theme,motion,data,geometry,aspect})=>{
  const {frame,fps}=useClock();
  const changed=frame>=data.swapFrame;
  return <>
    <Lift at={1} motion={motion} style={{position:'absolute',left:90,top:263}}><Tag text={data.label} theme={theme} width={360}/></Lift>
    <Lift at={6} angle={-5} motion={motion} style={{position:'absolute',left:80,top:345,width:930}}><FitText text={changed?data.secondTitle:data.firstTitle} theme={theme} role="title" width={930} height={215} size={181} min={65} lines={1} color={theme.text}/></Lift>
    <Lift at={6} motion={motion} style={{position:'absolute',left:90,top:575,width:860,height:15,background:changed?theme.bad:theme.accent}}/>
    {data.foreground?<div style={{position:'absolute',top:geometry.windowTop,left:0,width:1080,height:geometry.windowHeight,overflow:'hidden'}}><div style={{position:'absolute',left:geometry.videoLeft,top:geometry.videoTop,width:geometry.videoWidth,height:Math.round(geometry.videoWidth*aspect)}}><Footage src={data.foreground.src} transparent muted startFromSec={data.foreground.trimBeforeFrame/fps}/></div></div>:null}
    <Lift at={data.stampFrame} angle={-4} motion={motion} style={{position:'absolute',left:95,top:960,width:660,padding:'14px 27px',background:theme.bad,border:`3px solid ${theme.text}`,boxShadow:`7px 7px 0 ${theme.text}`}}><FitText text={data.stamp} theme={theme} width={600} height={95} role="title" size={54} min={32} lines={1} color={theme.text}/></Lift>
  </>;
};

const ImageCompare:React.FC<Common&{data:Data<'image-compare'>}>=({theme,motion,data})=><>
  <CanvasFill background={theme.text}/><Title theme={theme} motion={motion} kicker={data.kicker} text={data.title} dark/>
  {data.images.map((item,i)=><Lift key={i} at={i*4} angle={i?5:-5} motion={motion} style={{position:'absolute',left:i?548:90,top:575,width:425,padding:14,background:theme.background,border:`3px solid ${theme.background}`}}>
    <Img src={staticFile(item.src)} style={{width:391,height:420,objectFit:'cover'}}/>
    <div style={{padding:'15px 0'}}><FitText text={item.label} theme={theme} role="label" width={391} height={32} size={24} min={17} lines={1} align="center"/></div>
  </Lift>)}
  <Lift at={16} angle={-10} motion={motion} style={{position:'absolute',left:330,top:1030,width:440,padding:'12px 25px',background:theme.bad}}><FitText text={data.stamp} theme={theme} role="title" width={390} height={80} size={56} min={25} lines={1}/></Lift>
</>;

const Checklist:React.FC<Common&{data:Data<'checklist'>}>=({theme,motion,data})=>{
  const {frame}=useClock();const dark=data.variant==='blueprint';
  const top=dark?510:650;
  const gap=dark?157:Math.min(185,570/data.items.length);
  const height=Math.min(dark?135:153,gap-18);
  const width=dark?620:735;
  return <><CanvasFill background={dark?theme.text:theme.background}/><Title theme={theme} motion={motion} kicker={data.kicker} text={data.title} dark={dark}/>
    {!dark && data.label?<div style={{position:'absolute',left:95,top:525,width:865,padding:'20px 28px',background:theme.text}}><FitText text={data.label} theme={theme} role="label" width={805} height={36} size={24} min={18} lines={1} color={theme.accent}/></div>:null}
    {data.image?<div style={{position:'absolute',left:580,top:500,width:380,height:630,overflow:'hidden',opacity:.54,border:`2px solid ${theme.dim}`,transform:'rotate(3deg)'}}><Img src={staticFile(data.image)} style={{width:380}}/></div>:null}
    {data.items.map((item,i)=>{
      const active=frame>=item.atFrame;
      return <Lift key={i} at={dark?15+i*5:Math.min(50,Math.max(0,item.atFrame-42))} motion={motion} style={{position:'absolute',left:95,top:top+i*gap,width,height,padding:'16px 25px',background:active?theme.accent:dark?theme.text:'transparent',border:`${dark?2:3}px ${!active&&!dark?'dashed':'solid'} ${dark&&!active?theme.dim:theme.text}`,color:active||!dark?theme.text:theme.background,display:'flex',alignItems:'center',gap:24,boxShadow:dark?`8px 8px 0 ${theme.text}`:undefined}}>
        <span style={{...mono(theme),fontSize:32,opacity:.6,width:50,flexShrink:0}}>{String(i+1).padStart(2,'0')}</span>
        <div style={{flex:1,minWidth:0}}>
          {dark?<div style={{opacity:.7,marginBottom:5}}><FitText text={item.detail} theme={theme} role="label" width={380} height={26} size={18} min={14} lines={1} color={active?theme.text:theme.background}/></div>:null}
          <FitText text={item.label} theme={theme} role="title" width={dark?380:330} height={height-(dark?65:35)} size={dark?42:59} min={25} lines={2} color={active||!dark?theme.text:theme.background}/>
        </div>
        {dark?<span style={{fontFamily:theme.display,fontSize:35,opacity:active?1:.12}}>✓</span>:<div style={{width:170,flexShrink:0,opacity:active?1:.35}}><FitText text={active?item.detail:'MISSING'} theme={theme} role="label" width={170} height={55} size={19} min={14} lines={2} align="right"/></div>}
      </Lift>;
    })}
  </>;
};

const Count:React.FC<Common&{data:Data<'count'>;seam:number}>=({theme,motion,data,seam})=>{
  const {frame}=useClock();const value=Math.round(data.value*EASE.land(clamp01((frame-data.rollFrame)/data.rollDuration)));
  return <><CanvasFill background={theme.text} style={{height:seam,bottom:'auto'}}/><Title theme={theme} motion={motion} kicker={data.kicker} text={data.title} dark/>
    <Lift at={Math.max(0,data.rollFrame-20)} motion={motion} style={{position:'absolute',left:92,top:530}}><FitText text={`${value.toLocaleString('en-US')}${data.suffix}`} theme={theme} role="title" width={855} height={225} size={184} min={85} lines={1} color={theme.accent} fitTo={data.valueFit==='final'?finalValueTemplate(data.value,data.suffix):undefined}/></Lift>
    <Lift at={data.unitFrame} motion={motion} style={{position:'absolute',left:100,top:785}}><Tag text={data.unit} theme={theme} width={290} dark/></Lift>
    {data.badge?<Lift at={data.badgeFrame??data.unitFrame} angle={-4} motion={motion} style={{position:'absolute',left:620,top:790,width:340,padding:'14px 20px',background:theme.accent}}><FitText text={data.badge} theme={theme} role="label" width={300} height={34} size={24} min={15} lines={1}/></Lift>:null}
  </>;
};

const Screens:React.FC<Common&{data:Data<'screens'>}>=({theme,motion,data})=>{
  const {frame,fps}=useClock();let phase=0;for(let i=1;i<data.steps.length;i++)if(frame>=data.steps[i].atFrame)phase=i;
  const step=data.steps[phase];const scale=1+clamp01((frame-step.atFrame)/(fps*2))*.025;
  return <><CanvasFill background={theme.background}/><Sequence from={step.atFrame} layout="none"><Title key={phase} theme={theme} motion={motion} kicker={`${data.kicker} / ${String(phase+1).padStart(2,'0')}`} text={step.title}/></Sequence>
    <div style={{position:'absolute',left:95,top:500,width:735,height:775,background:theme.background,border:`3px solid ${theme.text}`,boxShadow:`12px 12px 0 ${theme.text}`,overflow:'hidden'}}>
      <div style={{height:45,background:theme.accent,borderBottom:`3px solid ${theme.text}`,padding:'6px 16px',...mono(theme)}}>● ● ● <span style={{float:'right',fontSize:18}}>SOURCE CAPTURE</span></div>
      {step.kind==='image'?<Img src={staticFile(step.src)} style={{width:'100%',height:724,objectFit:step.fit,objectPosition:'top',transform:`scale(${scale})`,transformOrigin:'50% 30%'}}/>:<div style={{position:'relative',height:724}}><Sequence from={step.atFrame} layout="none"><Footage src={step.src} muted startFromSec={step.trimBeforeFrame/fps} style={{objectFit:step.fit}}/></Sequence></div>}
    </div>
    <div style={{position:'absolute',left:100,top:1310,display:'flex',gap:18}}>{data.steps.map((_,i)=><div key={i} style={{width:i===phase?90:24,height:10,background:i===phase?theme.text:theme.dim}}/>)}</div>
  </>;
};



const STATEMENT={left:95,top:280,width:870,angle:-3,padY:16,padX:26,border:3,
  kicker:{width:810,height:34,size:24,min:17,lines:1},title:{width:810,height:115,size:64,min:30,lines:2}} as const;







const CTA_TITLE={left:95,top:280,width:810,height:100,size:66,min:35,lines:1,padY:12,padX:24,border:3} as const;
const CTA_TITLE_BACKING_WIDTH=CTA_TITLE.width+2*CTA_TITLE.padX+2*CTA_TITLE.border;
const CTA_TITLE_CHROME=2*CTA_TITLE.padY+2*CTA_TITLE.border;
const CTA_PROMPT_TOP=1000;

const Statement:React.FC<Common&{data:Data<'statement'>;head:HeadBoxPx|null}>=({theme,motion,data,head})=>{
  const placed=React.useMemo(()=>{
    if(!head)return null;
    const kicker=fitTextLayout({text:data.kicker,theme,role:'label',...STATEMENT.kicker});
    const full=fitTextLayout({text:data.title,theme,role:'title',...STATEMENT.title});
    const min=fitTextLayout({text:data.title,theme,role:'title',...STATEMENT.title,size:STATEMENT.title.min});
    return placeTitle({head,fixedTop:STATEMENT.top,ceiling:zone().top,floor:PRESENTER_CAPTION_CENTER-CAPTION_BAND_HALF-STACK_GAP,
      rail:zone().rail,left:STATEMENT.left,
      block:{width:STATEMENT.width,angleDeg:STATEMENT.angle,chrome:2*STATEMENT.padY+2*STATEMENT.border+kicker.height,
        titleFull:full.height,titleMin:min.height,lineHeight:full.lineHeight,inkEm:0,shadow:0,...liftExcursion(motion)}});
  },[head,data.kicker,data.title,theme,motion]);
  return <Lift angle={STATEMENT.angle} motion={motion} style={{position:'absolute',left:STATEMENT.left,top:placed?.top??STATEMENT.top,width:STATEMENT.width,
    background:theme.accent,border:`${STATEMENT.border}px solid ${theme.text}`,padding:`${STATEMENT.padY}px ${STATEMENT.padX}px`}}>
    <FitText text={data.kicker} theme={theme} role="label" {...STATEMENT.kicker}/><FitText text={data.title} theme={theme} role="title" {...STATEMENT.title} height={placed?.titleBox??STATEMENT.title.height}/>
  </Lift>;
};

const Outcome:React.FC<Common&{data:Data<'outcome'>;seam:number}>=({theme,motion,data,seam})=><>
  <CanvasFill background={theme.accent} style={{height:seam,bottom:'auto'}}/><Title theme={theme} motion={motion} kicker={data.kicker} text={data.title}/>
  <Lift at={25} motion={motion} style={{position:'absolute',left:100,top:635,width:860,display:'flex',gap:14,flexWrap:'wrap'}}>{data.items.map(item=><Tag key={item} text={item} theme={theme} width={Math.min(230,Math.max(95,item.length*17))}/>)}</Lift>
  <Lift at={50} motion={motion} style={{position:'absolute',left:100,top:820}}><FitText text={data.footer} theme={theme} role="label" width={800} height={40} size={24} min={18} lines={1}/></Lift>
</>;

const CreatorCTA:React.FC<Common&{data:Data<'creator-cta'>;head:HeadBoxPx|null}>=({theme,motion,data,head})=>{
  const {frame}=useClock();
  const placed=React.useMemo(()=>{
    if(!head)return null;
    const measure=(size:number)=>fitTextLayout({text:data.title,theme,role:'title',width:CTA_TITLE.width,height:CTA_TITLE.height,size,min:CTA_TITLE.min,lines:CTA_TITLE.lines});
    const full=measure(CTA_TITLE.size);
    const base={angleDeg:0,titleFull:full.height,titleMin:measure(CTA_TITLE.min).height,lineHeight:full.lineHeight,inkEm:INK_EM,shadow:0,...liftExcursion(motion)};
    const at=(block:typeof base&{width:number;chrome:number})=>placeTitle({head,fixedTop:CTA_TITLE.top,ceiling:zone().top,floor:CTA_PROMPT_TOP-STACK_GAP,rail:zone().rail,left:CTA_TITLE.left,block});
    const bare=at({...base,width:CTA_TITLE.width,chrome:0});








    if(bare.mode!=='below')return {...bare,backed:false};
    const backed=at({...base,width:CTA_TITLE_BACKING_WIDTH,chrome:CTA_TITLE_CHROME});
    return backed.mode==='below'?{...backed,backed:true}:{...bare,backed:false};
  },[head,data.title,theme,motion]);
  return <>
    {
                                                                }
    {placed?.backed
      ?<Lift motion={motion} style={{position:'absolute',left:CTA_TITLE.left,top:placed.top,width:CTA_TITLE_BACKING_WIDTH,
          background:theme.accent,border:`${CTA_TITLE.border}px solid ${theme.text}`,padding:`${CTA_TITLE.padY}px ${CTA_TITLE.padX}px`}}>
          <FitText text={data.title} theme={theme} role="title" width={CTA_TITLE.width} height={placed.titleBox??CTA_TITLE.height} size={CTA_TITLE.size} min={CTA_TITLE.min} lines={CTA_TITLE.lines}/>
        </Lift>
      :<Lift motion={motion} style={{position:'absolute',left:CTA_TITLE.left,top:placed?.top??CTA_TITLE.top}}><FitText text={data.title} theme={theme} role="title" width={CTA_TITLE.width} height={placed?.titleBox??CTA_TITLE.height} size={CTA_TITLE.size} min={CTA_TITLE.min} lines={CTA_TITLE.lines}/></Lift>}
    <Lift at={12} motion={motion} style={{position:'absolute',left:95,top:CTA_PROMPT_TOP,width:720,padding:'17px 26px',background:theme.accent,border:`3px solid ${theme.text}`,boxShadow:`8px 8px 0 ${theme.text}`}}><FitText text={data.prompt.replace('{keyword}',data.keyword)} theme={theme} role="title" width={662} height={96} size={49} min={29} lines={2}/></Lift>
    <Lift at={data.followFrame} motion={motion} style={{position:'absolute',left:95,top:1215,width:720,height:155,background:theme.background,border:`3px solid ${theme.text}`,padding:'20px 24px'}}>
      <div style={{...mono(theme),fontSize:16,marginBottom:10,color:theme.text}}>FOLLOW FOR MORE</div>
      <FitText text={data.handle} theme={theme} role="title" width={475} height={55} size={29} min={19} lines={1}/>
      <div style={{position:'absolute',right:20,top:43,padding:'13px 15px',background:theme.text,color:theme.accent,fontFamily:theme.display,fontSize:21}}>{frame<data.clickedFrame?'+ Follow':'Following'}</div>
    </Lift>
  </>;
};

export const KineticSceneRenderer:React.FC<{scene:KineticScene;style:StyleFamily;geometry:WindowGeo;aspect:number;seam:number;headBox?:HeadBoxPx|null}>=({scene,style,geometry,aspect,seam,headBox=null})=>{
  const common={theme:useSceneTheme(style,{inkOnAccent:true}),motion:scene.motion};
  switch(scene.family){
    case 'kinetic-hook':return <Hook {...common} data={scene.data} geometry={geometry} aspect={aspect}/>;
    case 'image-compare':return <ImageCompare {...common} data={scene.data}/>;
    case 'checklist':return <Checklist {...common} data={scene.data}/>;
    case 'count':return <Count {...common} data={scene.data} seam={seam}/>;
    case 'screens':return <Screens {...common} data={scene.data}/>;
    case 'statement':return <Statement {...common} data={scene.data} head={headBox}/>;
    case 'outcome':return <Outcome {...common} data={scene.data} seam={seam}/>;
    case 'creator-cta':return <CreatorCTA {...common} data={scene.data} head={headBox}/>;
  }
};
