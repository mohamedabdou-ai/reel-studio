import React from 'react';
import {AbsoluteFill,interpolate,useCurrentFrame} from 'remotion';
import {curtainGeometry} from '../techniques/curtain';
import {ImageScaleFocus} from '../techniques/ImageScaleFocus';

const full={windowTop:0,windowHeight:640,videoWidth:360,videoLeft:0,videoTop:0};
const split={windowTop:270,windowHeight:370,videoWidth:360,videoLeft:0,videoTop:270};

const Card:React.FC=()=> <div style={{width:'100%',height:'100%',background:'linear-gradient(145deg,#07162f,#153f77)',display:'grid',placeItems:'center'}}>
  <div style={{width:260,height:260,borderRadius:34,background:'#e9f4ff',boxShadow:'0 24px 60px #0008',padding:24,color:'#07162f',boxSizing:'border-box'}}>
    <div style={{fontSize:15,letterSpacing:2,fontWeight:700,color:'#347ee9'}}>PRACTICE / 01</div>
    <div style={{fontSize:36,lineHeight:1.05,fontWeight:800,marginTop:28}}>Focus the idea.</div>
    <div style={{height:9,width:150,background:'#3be0ca',marginTop:30,borderRadius:8}}/>
    <div style={{height:9,width:105,background:'#8db8ff',marginTop:12,borderRadius:8}}/>
  </div>
</div>;

export const Practice:React.FC=()=>{
  const frame=useCurrentFrame();
  const imageProgress=interpolate(frame,[0,34],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const curtain=curtainGeometry(frame,full,split,{fromFrame:30,toFrame:58,frameHeight:640,lowerFadeFrames:10,upperRevealStart:.72});
  return <AbsoluteFill style={{background:'#07162f',fontFamily:'Arial, sans-serif',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0}}><ImageScaleFocus sourceWidth={720} sourceHeight={720} viewportWidth={360} viewportHeight={640} focusX={.5} focusY={.42} startScale={1.35} endScale={.72} progress={imageProgress} fit="cover"><Card/></ImageScaleFocus></div>
    {frame>=30?<><div style={{position:'absolute',left:0,right:0,top:0,height:curtain.geometry.windowTop,overflow:'hidden',opacity:curtain.upperOpacity,background:'#07162f'}}>
      <div style={{padding:'70px 30px',color:'white'}}><div style={{fontSize:13,letterSpacing:2.2,color:'#3be0ca',fontWeight:700}}>REEL STUDIO</div><div style={{fontSize:38,lineHeight:1.08,fontWeight:800,marginTop:14}}>One move.<br/>Clear meaning.</div></div>
    </div>
    <div style={{position:'absolute',left:0,right:0,top:curtain.geometry.windowTop,height:curtain.geometry.windowHeight,overflow:'hidden',background:'linear-gradient(160deg,#153f77,#07162f)'}}>
      <div style={{position:'absolute',left:64,right:64,top:62,height:190,borderRadius:96,background:'#dceaff',opacity:.95}}/>
      <div style={{position:'absolute',left:92,right:92,top:235,height:150,borderRadius:'80px 80px 18px 18px',background:'#347ee9'}}/>
      <div style={{position:'absolute',left:24,right:24,bottom:25,padding:'12px 16px',borderRadius:12,background:'#ffffff',color:'#07162f',fontWeight:800,fontSize:18,textAlign:'center'}}>Synthetic practice clip</div>
    </div></>:null}
  </AbsoluteFill>;
};
