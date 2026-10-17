import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {closedHullGeometry,hullDeckHeight,hullHalfWidth} from './hull';

/** Broad aft shoulder, then elliptical corners tangent to the flat transom. */
export function cruiseHullHalfWidth(u:number,beam=34) {
  if(u<=.5)return hullHalfWidth(u,beam);
  const corner=T.MathUtils.clamp((u-.94)/.06,0,1);
  return beam*.5*(1-.035*T.MathUtils.smoothstep(u,.5,.94)-.245*(1-Math.sqrt(Math.max(0,1-corner*corner))));
}

export function cruiseHullGeometry(){return closedHullGeometry(260,34,9,7,true,cruiseHullHalfWidth);}
export function cruiseHullSidePose(y:number,z:number,side:number){
  const surface=cruiseHullSurface(y,z,side);if(!surface)throw new RangeError(`No cruise hull surface at ${y}, ${z}`);
  return {point:new T.Vector3(side*surface.width,y,z),normal:surface.normal};
}

/** Interpolate the Float32 stations actually uploaded to the renderer. */
export function cruiseHullSection(z:number) {
  const u=T.MathUtils.clamp(z/260+.5,0,1),station=Math.min(127,Math.floor(u*128)),f=u*128-station;
  return {width:T.MathUtils.lerp(Math.fround(cruiseHullHalfWidth(station/128)),Math.fround(cruiseHullHalfWidth((station+1)/128)),f),top:T.MathUtils.lerp(Math.fround(hullDeckHeight(station/128,260,9)),Math.fround(hullDeckHeight((station+1)/128,260,9)),f)};
}

const cruiseSurfaceGeometry=cruiseHullGeometry(),cruiseVertices=cruiseSurfaceGeometry.attributes.position;
cruiseSurfaceGeometry.computeBoundingBox();
const cruiseContactTree=new MeshBVH(cruiseSurfaceGeometry,{indirect:true});
/** Exact side-triangle intersection in the local Y/Z plane, without contact padding. */
export function cruiseHullSurface(y:number,z:number,side:number) {
  if(z < -130||z > 130||y < -7||y > 11.12)return null;
  if(y>cruiseHullSection(z).top)return null;
  const lower=y<Math.fround(-3.36),row=side<0?(lower?4:5):(lower?2:1),next=(row+1)%6,base=Math.min(127,Math.floor((z+130)/2.03125));
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  for(let station=base;station>=base-3;station--) {
    if(station<0||station>127)continue;
    const a0=station*6+row,b0=(station+1)*6+row,c0=station*6+next,d0=(station+1)*6+next;
    for(const indices of [[a0,b0,c0],[c0,b0,d0]]) {
      a.fromBufferAttribute(cruiseVertices,indices[0]);b.fromBufferAttribute(cruiseVertices,indices[1]);c.fromBufferAttribute(cruiseVertices,indices[2]);
      const by=b.y-a.y,bz=b.z-a.z,cy=c.y-a.y,cz=c.z-a.z,dy=y-a.y,dz=z-a.z,det=by*cz-bz*cy;
      const v=(dy*cz-dz*cy)/det,w=(by*dz-bz*dy)/det,u=1-v-w;
      if(u < -1e-9||v < -1e-9||w < -1e-9)continue;
      return {width:Math.abs(a.x*u+b.x*v+c.x*w),normal:b.sub(a).cross(c.sub(a)).normalize()};
    }
  }
  return null;
}

/** The rendered closed volume, expanded by a physical distance for drone contact. */
export function cruiseHullContains(p:T.Vector3,padding=.2) {
  const {min,max}=cruiseSurfaceGeometry.boundingBox!;
  if(p.x<min.x-padding||p.x>max.x+padding||p.y<min.y-padding||p.y>max.y+padding||p.z<min.z-padding||p.z>max.z+padding)return false;
  const surface=cruiseHullSurface(p.y,p.z,p.x<0?-1:1);
  if(surface&&Math.abs(p.x)<=surface.width)return true;
  if(padding<=0)return false;
  const nearest=cruiseContactTree.closestPointToPoint(p,undefined,0,padding);
  return nearest!==null&&nearest.distance<=padding;
}

// Evaluate the same side-triangle bands at the displaced fragment's local height.
export const cruiseHullCode=`
float cruiseHullShape(float u) {
  if(u<=0.5)return pow(max(sin(u*3.141592653589793),0.001),0.42);
  float corner=clamp((u-0.94)/0.06,0.0,1.0);
  return 1.0-0.035*smoothstep(0.5,0.94,u)-0.245*(1.0-sqrt(max(0.0,1.0-corner*corner)));
}
float cruiseHullDeck(float u) {
  float bow=1.0-u;return 9.0+260.0/92.0*0.75*bow*bow*bow*bow;
}
vec3 cruiseHullVertex(float station,float row) {
  float u=station/128.0;bool top=row<1.5,chine=row==2.0||row==5.0;
  float side=row==0.0||row>=4.0?-1.0:1.0;
  return vec3(side*cruiseHullShape(u)*17.0*(top?1.0:chine?0.94:0.48),top?cruiseHullDeck(u):chine?-3.36:-7.0,(u-0.5)*260.0);
}
float cruiseTriangleWidth(vec3 p,vec3 a,vec3 b,vec3 c) {
  vec2 ab=b.yz-a.yz,ac=c.yz-a.yz,d=p.yz-a.yz;
  float det=ab.x*ac.y-ab.y*ac.x,v=(d.x*ac.y-d.y*ac.x)/det,w=(ab.x*d.y-ab.y*d.x)/det,u=1.0-v-w;
  if(min(u,min(v,w)) < -0.00001)return -1.0;
  return abs(a.x*u+b.x*v+c.x*w);
}
float cruiseHullWidthAt(vec3 p) {
  if(abs(p.x)>17.0||p.z < -130.0||p.z > 130.0||p.y < -7.0||p.y > 11.12)return -1.0;
  float u=clamp(p.z/260.0+0.5,0.0,1.0),topStation=min(127.0,floor(u*128.0)),f=u*128.0-topStation;
  if(p.y>mix(cruiseHullDeck(topStation/128.0),cruiseHullDeck((topStation+1.0)/128.0),f))return -1.0;
  bool lower=p.y < -3.36;float row=p.x<0.0?(lower?4.0:5.0):(lower?2.0:1.0),next=mod(row+1.0,6.0),base=min(127.0,floor((p.z+130.0)/2.03125));
  for(int offset=0;offset<4;offset++) {
    float station=base-float(offset);if(station<0.0)continue;
    vec3 a=cruiseHullVertex(station,row),b=cruiseHullVertex(station+1.0,row),c=cruiseHullVertex(station,next),d=cruiseHullVertex(station+1.0,next);
    float width=cruiseTriangleWidth(p,a,b,c);if(width>=0.0)return width;
    width=cruiseTriangleWidth(p,c,b,d);if(width>=0.0)return width;
  }
  return -1.0;
}`;
