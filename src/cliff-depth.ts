import {Vector4} from 'three';
import {type CliffSurface} from './cliff';

export const CLIFF_DEPTH_SIZE=512;
/** A small detailed water grid covers the scan instead of enlarging island cells. */
export class CliffDepth {
  readonly bounds:Vector4;
  readonly data=new Float32Array(CLIFF_DEPTH_SIZE*CLIFF_DEPTH_SIZE);
  constructor(scan:CliffSurface,ground:(x:number,z:number)=>number) {
    const b=scan.bounds;this.bounds=new Vector4(Math.fround(b.min.x-.25),Math.fround(b.min.z-.25),Math.fround(b.max.x-b.min.x+.5),Math.fround(b.max.z-b.min.z+.5));
    for(let z=0;z<CLIFF_DEPTH_SIZE;z++)for(let x=0;x<CLIFF_DEPTH_SIZE;x++) {
      const px=this.bounds.x+x/(CLIFF_DEPTH_SIZE-1)*this.bounds.z,pz=this.bounds.y+z/(CLIFF_DEPTH_SIZE-1)*this.bounds.w;
      this.data[z*CLIFF_DEPTH_SIZE+x]=Math.max(ground(px,pz),scan.topHeight(px,pz)??-60);
    }
  }
  sample(x:number,z:number) {
    const u=(x-this.bounds.x)/this.bounds.z*(CLIFF_DEPTH_SIZE-1),v=(z-this.bounds.y)/this.bounds.w*(CLIFF_DEPTH_SIZE-1);
    if(u<0||u>CLIFF_DEPTH_SIZE-1||v<0||v>CLIFF_DEPTH_SIZE-1)return null;
    const ix=Math.min(Math.floor(u),CLIFF_DEPTH_SIZE-2),iz=Math.min(Math.floor(v),CLIFF_DEPTH_SIZE-2),fx=u-ix,fz=v-iz;
    const a=this.data[iz*CLIFF_DEPTH_SIZE+ix],b=this.data[(iz+1)*CLIFF_DEPTH_SIZE+ix],d=this.data[iz*CLIFF_DEPTH_SIZE+ix+1],c=this.data[(iz+1)*CLIFF_DEPTH_SIZE+ix+1];
    const lower=fx+fz<=1;
    return {height:lower?a+(b-a)*fz+(d-a)*fx:c+(b-c)*(1-fx)+(d-c)*(1-fz),dx:(lower?d-a:c-b)*(CLIFF_DEPTH_SIZE-1)/this.bounds.z,dz:(lower?b-a:c-d)*(CLIFF_DEPTH_SIZE-1)/this.bounds.w};
  }
}
