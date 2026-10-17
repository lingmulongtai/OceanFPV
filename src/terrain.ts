import {drainageCuts} from './drainage';
import {measuredIsletHeight} from './measured-islet';
import {hornoyaHeight,HORNOYA_SEGMENTS} from './hornoya';
import {trenykenHeight,TRENYKEN_SEGMENTS} from './trenyken';

function hash(x:number,z:number) {let h=Math.imul(x,374761393)+Math.imul(z,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
function noise(x:number,z:number) {
  const ix=Math.floor(x),iz=Math.floor(z),u=x-ix,v=z-iz,fx=u*u*(3-2*u),fz=v*v*(3-2*v);
  return (hash(ix,iz)*(1-fx)+hash(ix+1,iz)*fx)*(1-fz)+(hash(ix,iz+1)*(1-fx)+hash(ix+1,iz+1)*fx)*fz;
}
export const TERRAIN_SEGMENTS=192;
export type TerrainProfile='radial'|'headland'|'measured-islet'|'hornoya'|'trenyken';
export function terrainSegments(profile:TerrainProfile='radial'){return profile==='hornoya'?HORNOYA_SEGMENTS:profile==='trenyken'?TRENYKEN_SEGMENTS:TERRAIN_SEGMENTS;}
function baseTerrainHeight(x:number,z:number,size:number,height:number,profile:TerrainProfile) {
  const coast=1+(noise(x*0.013+3,z*0.013-7)-0.5)*0.35;
  const r=Math.hypot(x,z*1.06)/size*coast;
  let mask=Math.pow(Math.max(0,1-r*r),1.65);
  if(profile==='headland') {
    const u=x/size,v=z/size;
    const ridge=(ax:number,az:number,bx:number,bz:number,width:number,amplitude:number)=> {
      const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((u-ax)*dx+(v-az)*dz)/(dx*dx+dz*dz)));
      const distance=Math.hypot(u-ax-t*dx,v-az-t*dz)*coast/width;
      return Math.max(amplitude*Math.pow(Math.max(0,1-distance*distance),1.2),0.105*(1-fade(0.85,1.2,distance)));
    };
    const north=ridge(-0.52,-0.48,-0.08,-0.03,0.44,1),south=ridge(-0.63,0.25,-0.2,0.51,0.36,0.72);
    const cape=Math.pow(Math.max(0,1-((u-0.4)*coast/0.53)**2-((v+0.11)*coast/0.22)**2),1.2)*0.24;
    const bay=1-fade(0.45,1.15,Math.hypot((u-0.38)/0.42,(v-0.4)/0.46));
    mask=Math.max(north,south,cape)*(1-bay);
  }
  let ridges=0,weight=0.56,frequency=0.009;
  for(let octave=0;octave<5;octave++){ridges+=(1-Math.abs(noise(x*frequency+12,z*frequency-5)*2-1))*weight;frequency*=2.13;weight*=0.48;}
  const cliffs= Math.pow(Math.max(0,noise(x*0.021-8,z*0.018+4)-0.25),1.3)*height*0.25;
  return Math.max(-9,mask*(height*(0.3+ridges*0.85)+cliffs)-9);
}
const headlandCuts=new Map<string,Float64Array>();
function headlandDrainage(size:number,height:number) {
  const key=`${size}:${height}`,cached=headlandCuts.get(key);if(cached)return cached;
  const width=TERRAIN_SEGMENTS+1,extent=size*1.2,step=extent*2/TERRAIN_SEGMENTS,heights=new Float64Array(width*width),weights=new Float64Array(width*width);
  for(let z=0;z<width;z++)for(let x=0;x<width;x++) {
    const px=-extent+x*step,pz=-extent+z*step,i=z*width+x,u=px/size,v=pz/size,y=baseTerrainHeight(px,pz,size,height,'headland');heights[i]=y;
    weights[i]=fade(30,55,y)*(1-fade(height*0.82,height,y))*fade(-0.95,-0.8,u)*(1-fade(0,0.2,u))*fade(-1,-0.85,v)*(1-fade(-0.12,0.02,v));
  }
  const {cuts}=drainageCuts(heights,width,weights,8,3.25);headlandCuts.set(key,cuts);return cuts;
}
export function terrainHeight(x:number,z:number,size:number,height:number,profile:TerrainProfile='radial') {
  if(profile==='measured-islet')return measuredIsletHeight(x,z);
  if(profile==='hornoya')return hornoyaHeight(x,z);
  if(profile==='trenyken')return trenykenHeight(x,z);
  const base=baseTerrainHeight(x,z,size,height,profile),extent=size*1.2;
  if(profile!=='headland'||base<=30||Math.abs(x)>extent||Math.abs(z)>extent)return base;
  const cuts=headlandDrainage(size,height),width=TERRAIN_SEGMENTS+1,step=extent*2/TERRAIN_SEGMENTS,gx=(x+extent)/step,gz=(z+extent)/step;
  const ix=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gx)),iz=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gz)),u=gx-ix,v=gz-iz,i=iz*width+ix;
  const cut=(cuts[i]*(1-u)+cuts[i+1]*u)*(1-v)+(cuts[i+width]*(1-u)+cuts[i+width+1]*u)*v;
  // Preserve coastal shelves exactly, including between grid vertices.
  return base-cut*fade(30,31,base);
}
/** The same diagonal interpolation and resolution as each rendered terrain grid. */
export function terrainSurfaceHeight(x:number,z:number,size:number,height:number,profile:TerrainProfile='radial') {
  const segments=terrainSegments(profile),extent=size*1.2,step=extent*2/segments;if(Math.abs(x)>extent||Math.abs(z)>extent)return -9;
  const gx=(x+extent)/step,gz=(z+extent)/step,ix=Math.min(segments-1,Math.floor(gx)),iz=Math.min(segments-1,Math.floor(gz)),u=gx-ix,v=gz-iz;
  const px=-extent+ix*step,pz=-extent+iz*step,a=terrainHeight(px,pz,size,height,profile),b=terrainHeight(px,pz+step,size,height,profile),d=terrainHeight(px+step,pz,size,height,profile);
  if(u+v<=1)return a+(b-a)*v+(d-a)*u;
  const c=terrainHeight(px+step,pz+step,size,height,profile);return c+(b-c)*(1-u)+(d-c)*(1-v);
}

/** Slope of the rendered triangle, used for ground cover and rooted vegetation. */
export function terrainSlope(x:number,z:number,size:number,height:number,profile:TerrainProfile='radial') {
  const segments=terrainSegments(profile),extent=size*1.2,step=extent*2/segments;if(Math.abs(x)>extent||Math.abs(z)>extent)return Math.PI/2;
  const gx=(x+extent)/step,gz=(z+extent)/step,ix=Math.min(segments-1,Math.floor(gx)),iz=Math.min(segments-1,Math.floor(gz)),u=gx-ix,v=gz-iz;
  const px=-extent+ix*step,pz=-extent+iz*step,a=terrainHeight(px,pz,size,height,profile),b=terrainHeight(px,pz+step,size,height,profile),d=terrainHeight(px+step,pz,size,height,profile);
  if(u+v<=1)return Math.atan(Math.hypot(d-a,b-a)/step);
  const c=terrainHeight(px+step,pz+step,size,height,profile);return Math.atan(Math.hypot(c-b,c-d)/step);
}
function fade(a:number,b:number,x:number) {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
export function terrainCover(x:number,z:number,size:number,height:number,profile:TerrainProfile='radial') {
  const y=terrainSurfaceHeight(x,z,size,height,profile),slope=terrainSlope(x,z,size,height,profile);
  return fade(5,15,y)*(1-fade(0.35,0.75,slope))*(1-fade(height*0.65,height*0.95,y));
}
export function coastalTreeSites(x:number,z:number,size:number,height:number,profile:TerrainProfile='radial') {
  const sites:{x:number;z:number;y:number;scale:number;yaw:number}[]=[];
  const candidates=profile==='headland'||profile==='trenyken'?2040:1020;
  for(let i=0;i<candidates&&sites.length<170;i++) {
    const angle=i*2.399963,r=Math.sqrt((i+0.5)/candidates)*size*0.91,tx=Math.cos(angle)*r,tz=Math.sin(angle)*r;
    const cover=terrainCover(tx,tz,size,height,profile),density=0.35+0.65*noise((x+tx)*0.018+7,(z+tz)*0.018-3);
    if(cover<0.3||hash(i+Math.floor(x),Math.floor(z))>cover*density)continue;
    sites.push({x:x+tx,z:z+tz,y:terrainSurfaceHeight(tx,tz,size,height,profile),scale:0.65+hash(i,Math.floor(x+z))*0.7,yaw:angle});
  }
  return sites;
}
