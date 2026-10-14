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

/** Closed hull volume at the same triangle diagonal as the six-row mesh. */
export function cruiseHullContains(p:T.Vector3,padding=.2) {
  if(p.z < -130-padding||p.z > 130+padding||p.y < -7-padding)return false;
  const u=T.MathUtils.clamp(p.z/260+.5,0,1),station=Math.min(127,Math.floor(u*128)),f=u*128-station;
  let top0=Math.fround(hullDeckHeight(station/128,260,9)),top1=Math.fround(hullDeckHeight((station+1)/128,260,9));
  if(p.y>T.MathUtils.lerp(top0,top1,f)+padding)return false;
  const lower=p.y<Math.fround(-3.36),low=lower?-7:Math.fround(-3.36),upperScale=lower?.94:1,lowerScale=lower?.48:.94;
  if(lower)top0=top1=Math.fround(-3.36);
  const y=T.MathUtils.clamp(p.y,low,T.MathUtils.lerp(top0,top1,f)),w0=cruiseHullHalfWidth(station/128),w1=cruiseHullHalfWidth((station+1)/128),a=Math.fround(w0*upperScale),b=Math.fround(w1*upperScale),c=Math.fround(w0*lowerScale),d=Math.fround(w1*lowerScale);
  let width:number;
  if(p.x<0&&y<=top0-(top0-low)*f){const t=(y-low)/(top0-low);width=c*(1-t-f)+d*f+a*t;}
  else if(p.x<0){const t=((1-f)*top0+f*top1-y)/(top1-low);width=a*(1-f)+d*t+b*(f-t);}
  else if(y>=low+(top1-low)*f){const t=(y-low-f*(top1-low))/(top0-low);width=a*t+b*f+c*(1-t-f);}
  else {const t=(y-low)/(top1-low);width=c*(1-f)+b*t+d*(f-t);}
  return Math.abs(p.x)<=width+padding;
}

// The waterline mask retains its existing 0.98 inset; interpolate hull stations.
export const cruiseHullCode=`
float cruiseHullShape(float u) {
  if(u<=0.5)return pow(max(sin(u*3.141592653589793),0.001),0.42);
  float corner=clamp((u-0.94)/0.06,0.0,1.0);
  return 1.0-0.035*smoothstep(0.5,0.94,u)-0.245*(1.0-sqrt(max(0.0,1.0-corner*corner)));
}
float cruiseHullWidth(float u,float halfBeam) {
  float station=min(127.0,floor(clamp(u,0.0,1.0)*128.0)),f=clamp(u,0.0,1.0)*128.0-station;
  return mix(cruiseHullShape(station/128.0)*halfBeam,cruiseHullShape((station+1.0)/128.0)*halfBeam,f);
}`;
