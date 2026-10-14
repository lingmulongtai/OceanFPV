import * as T from 'three';
import {closedHullGeometry,hullDeckHeight,hullHalfWidth,upperHullSidePose} from './hull';

/** Broad aft shoulder, then elliptical corners tangent to the flat transom. */
export function cruiseHullHalfWidth(u:number,beam=34) {
  if(u<=.5)return hullHalfWidth(u,beam);
  const corner=T.MathUtils.clamp((u-.94)/.06,0,1);
  return beam*.5*(1-.035*T.MathUtils.smoothstep(u,.5,.94)-.245*(1-Math.sqrt(Math.max(0,1-corner*corner))));
}

export function cruiseHullGeometry(){return closedHullGeometry(260,34,9,7,true,cruiseHullHalfWidth);}
export function cruiseHullSidePose(y:number,z:number,side:number){return upperHullSidePose(y,z,side,260,34,9,7,true,cruiseHullHalfWidth);}

/** Interpolate the Float32 stations actually uploaded to the renderer. */
export function cruiseHullSection(z:number) {
  const u=T.MathUtils.clamp(z/260+.5,0,1),station=Math.min(127,Math.floor(u*128)),f=u*128-station;
  return {width:T.MathUtils.lerp(Math.fround(cruiseHullHalfWidth(station/128)),Math.fround(cruiseHullHalfWidth((station+1)/128)),f),top:T.MathUtils.lerp(Math.fround(hullDeckHeight(station/128,260,9)),Math.fround(hullDeckHeight((station+1)/128,260,9)),f)};
}
