export interface ArabicMoveProps {
  text:string; font:string; accent:string; frame:number; fps:number; durationInFrames:number;
  width:number; height:number; ink?:string; digits?:"latin"|"arabic-indic"; media?:string; stamp?:string; to?:string;
  /** Minimum fitted font size in the 270-unit logical canvas; omitted means 1. */
  fitFloor?:number;
  /** barTilt is in degrees; barJag is in logical canvas units. nibShadow also controls the nib's decorative rotation.
   * echoFill uses filled echoes at 30% alpha; omitted/false preserves the default stroke drawing.
   * videoFocusY is a source-height fraction (0..1); omitted preserves the native video placement. */
  look?:{pulse?:number; nibShadow?:boolean; barTilt?:number; barJag?:number; echoFill?:boolean; videoFocusY?:number};
}
export interface CanvasEnvironment extends ArabicMoveProps {ink:string; probe:boolean; size:number}
export type DrawMove=(ctx:CanvasRenderingContext2D,t:number,p:CanvasEnvironment)=>void;
