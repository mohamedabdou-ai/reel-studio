import React from 'react';
import {Img,staticFile} from 'remotion';
import {clamp01,EASE,useClock,useEnterF} from '../../core/motion';
import {useProbe} from '../../core/safe';
import {FitText,SceneCanvas,SceneHeader,SceneCard,getSceneGeometry,type SceneGeometry,type SceneTheme} from '../primitives';
import {useSceneTheme} from '../chapter-theme';
import type {StyleFamily} from '../schema';
import {semanticSceneSchema,type SemanticScene} from './schema';

type Data<F extends SemanticScene['family']>=Extract<SemanticScene,{family:F}>['data'];
type Common={theme:SceneTheme;g:SceneGeometry;motion:SemanticScene['motion']};
const At:React.FC<{at:number;motion:SemanticScene['motion'];children:React.ReactNode;style?:React.CSSProperties}>=({at,motion,children,style})=>{
  const {frame}=useClock(),probe=useProbe();
  const entrance=useEnterF(at,motion==='quiet'?'tight':'land');
  if(frame<at)return null;
  return <div style={{...style,opacity:probe?1:clamp01(entrance),transform:probe?undefined:`translateY(${Math.round((1-clamp01(entrance))*14)}px)`}}>{children}</div>;
};
const Footer:React.FC<{text:string;theme:SceneTheme;g:SceneGeometry}>=({text,theme,g})=><div style={{position:'absolute',left:4,top:g.bodyTop+g.bodyHeight-48}}>
  <FitText text={text} theme={theme} width={g.width-8} height={44} size={23} min={16} lines={2} color={theme.dim}/>
</div>;

const TokenLens:React.FC<Common&{data:Data<'token-lens'>}>=({data,theme,g,motion})=>{
  const {frame}=useClock();
  const contentW=Math.floor(g.width*.69),lensW=Math.min(210,g.width-contentW-20),groupH=Math.floor((g.bodyHeight-62)/data.groups.length);
  const gap=8,columns=3,chipW=Math.floor((contentW-32-gap*(columns-1))/columns);
  const token=data.groups[data.lens.groupIndex].tokens[data.lens.tokenIndex];
  return <>
    {data.groups.map((group,index)=><At key={index} at={group.atFrame} motion={motion}>
      <SceneCard theme={theme} motion={motion} order={index+2} top={g.bodyTop+index*groupH} width={contentW} height={groupH-12}>
        <div style={{position:'absolute',left:16,top:10}}><FitText text={group.label} theme={theme} width={contentW-32} height={28} size={23} min={16} lines={1} color={index%2?theme.bad:theme.accent} role="label"/></div>
        {group.tokens.map((piece,i)=>{
          const selected=index===data.lens.groupIndex&&i===data.lens.tokenIndex&&frame>=data.lens.atFrame;
          return <div key={i} style={{position:'absolute',left:16+(i%columns)*(chipW+gap),top:45+Math.floor(i/columns)*38,width:chipW,height:32,borderRadius:9,border:`1px solid ${selected?theme.accent:theme.border}`,background:selected?theme.accent:theme.background,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <FitText text={piece} theme={theme} width={chipW-10} height={28} size={22} min={12} lines={1} color={selected?(theme.onAccent??theme.background):theme.text} align="center"/>
          </div>;
        })}
      </SceneCard>
    </At>)}
    <At at={data.lens.atFrame} motion={motion} style={{position:'absolute',left:contentW+16,top:g.bodyTop+Math.max(35,(g.bodyHeight-65-lensW)/2),width:lensW,height:lensW}}>
      <div style={{width:lensW,height:lensW,borderRadius:'50%',border:`4px solid ${theme.accent}`,background:theme.card,boxShadow:`inset 3px 3px 0 #FFFFFF66, inset -5px -5px 0 ${theme.border}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <FitText text={token} theme={theme} width={lensW-32} height={86} size={58} min={24} lines={1} align="center" color={theme.accent}/>
      </div>
      <div aria-hidden="true" style={{position:'absolute',right:5,bottom:-31,width:12,height:44,borderRadius:9,background:theme.accent,transform:'rotate(-36deg)',transformOrigin:'50% 0'}}/>
    </At>
    <Footer text={data.footer} theme={theme} g={g}/>
  </>;
};

const MeterReceipt:React.FC<Common&{data:Data<'meter-receipt'>}>=({data,theme,g,motion})=>{
  const {frame}=useClock();
  const rowH=Math.floor((g.bodyHeight-74)/2);
  return <>
    {data.rows.map((row,index)=>{
      const progress=EASE.land(clamp01((frame-row.atFrame)/18));
      const ink=index?theme.good:theme.accent;
      return <At key={index} at={row.atFrame} motion={motion}>
        <SceneCard theme={theme} motion={motion} order={index+2} top={g.bodyTop+index*rowH} width={g.width} height={rowH-18}>
          <div style={{position:'absolute',left:24,top:20}}><FitText text={row.label} theme={theme} width={g.width*.52} height={48} size={32} min={18} lines={1}/></div>
          <div style={{position:'absolute',right:24,top:18}}><FitText text={`${row.value} ${data.unit}`} theme={theme} width={g.width*.38} height={50} size={38} min={20} lines={1} color={ink} align="right"/></div>
          <div style={{position:'absolute',left:24,right:24,top:Math.round((rowH-18)*.61),height:22,borderRadius:20,background:theme.background,border:`1px solid ${theme.border}`,overflow:'hidden'}}>
            <div style={{width:`${row.value/data.maximum*100*progress}%`,height:'100%',background:ink}}/>
          </div>
        </SceneCard>
      </At>;
    })}
    <Footer text={data.source} theme={theme} g={g}/>
  </>;
};

const TicketOffer:React.FC<Common&{data:Data<'ticket-offer'>}>=({data,theme,g,motion})=>{
  const ticketH=Math.min(340,g.bodyHeight-75),stubW=Math.round(g.width*.22),mainW=g.width-stubW;
  return <>
    <At at={data.ticket.atFrame} motion={motion}>
      <div style={{position:'absolute',left:0,top:g.bodyTop,width:g.width,height:ticketH,borderRadius:18,background:`linear-gradient(115deg,${theme.accent},#FFE4A3)`,color:theme.onAccent??theme.background,boxShadow:'0 13px 28px #00000030',overflow:'hidden'}}>
        <div style={{position:'absolute',left:mainW,top:0,width:stubW,height:ticketH,background:theme.bad,borderLeft:`3px dashed ${theme.onAccent??theme.background}`}}>
          <div style={{position:'absolute',left:20,top:ticketH*.4,width:stubW-40,borderTop:`2px solid ${theme.background}`,borderBottom:`2px solid ${theme.background}`,padding:'10px 0'}}><FitText text={data.ticket.label} theme={theme} width={stubW-40} height={80} size={26} min={16} lines={2} role="label" align="center" color={theme.background}/></div>
        </div>
        <div style={{position:'absolute',left:32,top:26}}><FitText text={data.ticket.label} theme={theme} width={mainW-64} height={36} size={25} min={16} lines={1} role="label" color={theme.onAccent??theme.background}/></div>
        <div style={{position:'absolute',left:32,top:Math.round(ticketH*.29)}}><FitText text={data.ticket.value} theme={theme} width={mainW-64} height={Math.round(ticketH*.32)} size={74} min={30} lines={2} role="title" color={theme.onAccent??theme.background}/></div>
        <div style={{position:'absolute',left:32,top:Math.round(ticketH*.68)}}><FitText text={data.ticket.detail} theme={theme} width={mainW-64} height={Math.round(ticketH*.23)} size={30} min={18} lines={2} color={theme.onAccent??theme.background}/></div>
      </div>
    </At>
    <Footer text={data.footer} theme={theme} g={g}/>
  </>;
};

const CommentStack:React.FC<Common&{data:Data<'comment-stack'>}>=({data,theme,g,motion})=>{
  const cardH=Math.floor((g.bodyHeight-92)/data.comments.length);
  return <>
    {data.comments.map((comment,index)=><At key={index} at={comment.atFrame} motion={motion}>
      <SceneCard theme={theme} motion={motion} order={index+2} top={g.bodyTop+index*cardH} width={g.width} height={cardH-12}>
        <div style={{position:'absolute',left:18,top:12,width:42,height:42,borderRadius:'50%',background:theme.accent,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:theme.mono,fontSize:22,color:theme.onAccent??theme.background}}>{index+1}</div>
        <div style={{position:'absolute',left:78,top:12}}><FitText text={comment.author} theme={theme} width={g.width-102} height={28} size={22} min={16} lines={1} role="label" color={theme.accent}/></div>
        <div style={{position:'absolute',left:78,top:46}}><FitText text={comment.text} theme={theme} width={g.width-102} height={cardH-64} size={36} min={17} lines={2}/></div>
      </SceneCard>
    </At>)}
    <div style={{position:'absolute',top:g.bodyTop+g.bodyHeight-76,left:0,width:g.width,height:64,borderTop:`2px solid ${theme.accent}`,paddingTop:10}}>
      <FitText text={`${data.keyword} · ${data.prompt}`} theme={theme} width={g.width} height={54} size={32} min={20} lines={2} color={theme.accent}/>
    </div>
  </>;
};

const ChapterQuote:React.FC<Common&{data:Data<'chapter-quote'>}>=({data,theme,g,motion})=>{
  const {frame}=useClock();
  const cover=frame<data.quoteFrame?data.cover:undefined;
  return <>
  {/* SceneHeader is already below this layer: the supplied subject naturally occludes its title. */}
  {cover?<Img src={staticFile(cover.foreground.src)} style={{position:'absolute',left:g.width*cover.box.x,top:g.height*cover.box.y,
    width:g.width*cover.box.width,height:g.height*cover.box.height,objectFit:'contain',objectPosition:'center bottom'}}/>:null}
  <At at={data.quoteFrame} motion={motion}>
    <div style={{position:'absolute',left:0,top:g.bodyTop,width:g.width,height:g.bodyHeight-115,borderInlineStart:`5px solid ${theme.accent}`,padding:'22px 30px',boxSizing:'border-box'}}>
      <div aria-hidden="true" style={{fontFamily:theme.display,fontSize:72,color:theme.good,lineHeight:.7}}>“</div>
      <FitText text={data.quote} theme={theme} width={g.width-70} height={g.bodyHeight-192} size={64} min={26} lines={4} role="title" color={theme.accent}/>
    </div>
  </At>
  <div style={{position:'absolute',left:30,top:g.bodyTop+g.bodyHeight-101,width:g.width-30,borderTop:`1px solid ${theme.border}`,paddingTop:14}}>
    <FitText text={data.speaker} theme={theme} width={g.width-40} height={40} size={34} min={20} lines={1} role="title"/>
    <FitText text={data.role} theme={theme} width={g.width-40} height={36} size={23} min={16} lines={1} color={theme.dim}/>
  </div>
</>;
};

const RouteStops:React.FC<Common&{data:Data<'route-stops'>}>=({data,theme,g,motion})=>{
  const {frame}=useClock();
  const rowH=Math.floor((g.bodyHeight-65)/data.stops.length),markerX=34;
  const completed=data.stops.filter(stop=>frame>=stop.atFrame).length;
  return <>
    <svg width={g.width} height={g.bodyHeight-65} style={{position:'absolute',left:0,top:g.bodyTop}}>
      <path d={`M ${markerX} 24 L ${markerX} ${(data.stops.length-1)*rowH+24}`} stroke={theme.border} strokeWidth={3} strokeDasharray="8 8" fill="none"/>
      {completed>1?<path d={`M ${markerX} 24 L ${markerX} ${(completed-1)*rowH+24}`} stroke={theme.accent} strokeWidth={6} fill="none"/>:null}
    </svg>
    {data.stops.map((stop,index)=><At key={index} at={stop.atFrame} motion={motion}>
      <div style={{position:'absolute',left:12,top:g.bodyTop+index*rowH,width:44,height:44,borderRadius:'50%',background:theme.accent,border:`3px solid ${theme.card}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:theme.mono,fontWeight:700,fontSize:24,color:theme.onAccent??'#FFFFFF'}}>{index+1}</div>
      <SceneCard theme={theme} motion={motion} order={index+2} left={82} top={g.bodyTop+index*rowH-1} width={g.width-86} height={rowH-12}>
        {stop.image?<div style={{position:'absolute',right:14,top:10,width:Math.min(100,rowH-35),height:rowH-34,padding:4,background:'#FFFFFF',border:`1px solid ${theme.border}`,transform:`rotate(${index%2?3:-3}deg)`}}><Img src={staticFile(stop.image)} style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>:null}
        <div style={{position:'absolute',left:20,top:10}}>
          <FitText text={stop.label} theme={theme} width={g.width-130-(stop.image?118:0)} height={Math.min(38,rowH*.35)} size={32} min={18} lines={1} role="title"/>
          <FitText text={stop.detail} theme={theme} width={g.width-130-(stop.image?118:0)} height={Math.max(36,rowH-60)} size={25} min={14} lines={2} color={theme.dim}/>
        </div>
      </SceneCard>
    </At>)}
    <Footer text={data.footer} theme={theme} g={g}/>
  </>;
};

export const SemanticSceneRenderer:React.FC<{scene:SemanticScene;style:StyleFamily}>=({scene:input,style})=>{
  const scene=semanticSceneSchema.parse(input),theme=useSceneTheme(style),g=getSceneGeometry(style,scene.layout),motion=scene.motion;
  const common={theme,g,motion};
  const heading=scene.family==='chapter-quote'?{kicker:`CHAPTER ${scene.data.chapter}`,title:scene.data.title}:scene.data;
  let body:React.ReactNode;
  switch(scene.family){
    case 'token-lens':body=<TokenLens {...common} data={scene.data}/>;break;
    case 'meter-receipt':body=<MeterReceipt {...common} data={scene.data}/>;break;
    case 'ticket-offer':body=<TicketOffer {...common} data={scene.data}/>;break;
    case 'comment-stack':body=<CommentStack {...common} data={scene.data}/>;break;
    case 'chapter-quote':body=<ChapterQuote {...common} data={scene.data}/>;break;
    case 'route-stops':body=<RouteStops {...common} data={scene.data}/>;break;
  }
  return <SceneCanvas theme={theme} geometry={g}><SceneHeader kicker={heading.kicker} title={heading.title} theme={theme} geometry={g} motion={motion}/>{body}</SceneCanvas>;
};
