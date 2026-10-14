import { terrainHeight, TERRAIN_SEGMENTS, type TerrainProfile } from './terrain';
import {LighthouseReef,LIGHTHOUSE_COAST} from './lighthouse-reef';

export type Coast={x:number;z:number;size:number;sizeZ?:number;height:number;profile?:TerrainProfile};
export const COASTS=[{x:-580,z:-420,size:260,height:130,profile:'headland'},{x:610,z:-800,size:320,height:190,profile:'radial'},{x:-850,z:420,size:190,height:85,profile:'radial'}] as const;
export const BATHY_COASTS:readonly Coast[]=[...COASTS,LIGHTHOUSE_COAST];
export const BATHY_SIZE=TERRAIN_SEGMENTS+1;
/** RGB holds exact island vertices; alpha resamples reef top faces and a submerged skirt. */
export function bathymetryData(reef=new LighthouseReef()) {
  const data=new Float32Array(BATHY_SIZE*BATHY_SIZE*4);
  for(let z=0;z<BATHY_SIZE;z++)for(let x=0;x<BATHY_SIZE;x++)for(let i=0;i<COASTS.length;i++) {
    const coast=COASTS[i],extent=coast.size*1.2;
    data[(z*BATHY_SIZE+x)*4+i]=terrainHeight((x/TERRAIN_SEGMENTS*2-1)*extent,(z/TERRAIN_SEGMENTS*2-1)*extent,coast.size,coast.height,coast.profile);
  }
  for(let z=0;z<BATHY_SIZE;z++)for(let x=0;x<BATHY_SIZE;x++) {
    data[(z*BATHY_SIZE+x)*4+3]=reef.bottomHeight(reef.x+(x/TERRAIN_SEGMENTS*2-1)*LIGHTHOUSE_COAST.size*1.2,reef.z+(z/TERRAIN_SEGMENTS*2-1)*LIGHTHOUSE_COAST.sizeZ*1.2);
  }
  return data;
}

/** Height and world-space gradient of the same Float32 triangles uploaded to WebGL. */
export function sampleBathymetry(data:Float32Array,x:number,z:number) {
  let height=-60,dx=0,dz=0;
  for(const [channel,coast]of BATHY_COASTS.entries()) {
    const u=(x-coast.x)/(coast.size*2.4)+0.5,v=(z-coast.z)/((coast.sizeZ??coast.size)*2.4)+0.5;
    if(u<0||u>1||v<0||v>1)continue;
    const px=u*TERRAIN_SEGMENTS,pz=v*TERRAIN_SEGMENTS,ix=Math.min(Math.floor(px),TERRAIN_SEGMENTS-1),iz=Math.min(Math.floor(pz),TERRAIN_SEGMENTS-1),fx=px-ix,fz=pz-iz;
    const at=(i:number,j:number)=>data[(j*BATHY_SIZE+i)*4+channel],a=at(ix,iz),b=at(ix,iz+1),d=at(ix+1,iz),c=at(ix+1,iz+1),step=coast.size*2.4/TERRAIN_SEGMENTS,stepZ=(coast.sizeZ??coast.size)*2.4/TERRAIN_SEGMENTS;
    const lower=fx+fz<=1,h=lower?a+(b-a)*fz+(d-a)*fx:c+(b-c)*(1-fx)+(d-c)*(1-fz);
    if(h>height){height=h;dx=(lower?d-a:c-b)/step;dz=(lower?b-a:c-d)/stepZ;}
  }
  return {height,dx,dz};
}
