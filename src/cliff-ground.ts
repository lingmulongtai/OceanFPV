import * as T from 'three';
import {TERRAIN_SEGMENTS} from './terrain';
import {type Coast} from './bathymetry';

const smooth=(a:number,b:number,x:number)=>{const t=T.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

/** Authored join around the east-facing scan at (-390,-3,-450), in world metres. */
export class CliffGround {
  readonly geometry:T.BufferGeometry;
  readonly affected=new T.Box3(new T.Vector3(-408,-Infinity,-477),new T.Vector3(-350,Infinity,-423));
  constructor(source:T.BufferGeometry,readonly coast:Coast) {
    this.geometry=source.clone();const position=this.geometry.attributes.position,cover=this.geometry.attributes.groundCover;
    for(let i=0;i<position.count;i++) {
      const x=position.getX(i)+coast.x,z=position.getZ(i)+coast.z,y=position.getY(i);
      const weight=(1-smooth(18,27,Math.abs(z+450)))*smooth(-402,-389,x)*(1-smooth(-366,-350,x));
      position.setY(i,y+(Math.min(y,-7)-y)*weight);if(weight>0&&cover)cover.setX(i,0);
    }
    position.needsUpdate=true;this.geometry.computeVertexNormals();this.geometry.computeBoundingBox();this.geometry.computeBoundingSphere();
  }
  excludes(x:number,z:number,radius=0) {
    return x>=this.affected.min.x-radius&&x<=this.affected.max.x+radius&&z>=this.affected.min.z-radius&&z<=this.affected.max.z+radius;
  }
  /** Same triangle diagonal and Float32 heights as the visible island plane. */
  heightAt(x:number,z:number) {
    const extent=this.coast.size*1.2,u=(x-this.coast.x+extent)/(2*extent)*TERRAIN_SEGMENTS,v=(z-this.coast.z+extent)/(2*extent)*TERRAIN_SEGMENTS;
    if(u<0||u>TERRAIN_SEGMENTS||v<0||v>TERRAIN_SEGMENTS)return -9;
    const ix=Math.min(Math.floor(u),TERRAIN_SEGMENTS-1),iz=Math.min(Math.floor(v),TERRAIN_SEGMENTS-1),fx=u-ix,fz=v-iz,width=TERRAIN_SEGMENTS+1,p=this.geometry.attributes.position;
    const a=p.getY(iz*width+ix),b=p.getY((iz+1)*width+ix),d=p.getY(iz*width+ix+1),c=p.getY((iz+1)*width+ix+1);
    return fx+fz<=1?a+(b-a)*fz+(d-a)*fx:c+(b-c)*(1-fx)+(d-c)*(1-fz);
  }
}
