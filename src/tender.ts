import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {closedHullGeometry,hullHalfWidth,hullDeckHeight} from './hull';

type Finish='orange'|'white'|'glass'|'rubber'|'metal';
export const TENDER_MOUNTS=([-1,1] as const).flatMap(side=>Array.from({length:9},(_,i)=>new T.Vector3(side*18.4,11.65,-68+i*16)));
export const TENDER_CABIN_TOP=2.7;
export const TENDER_HOOKS=[new T.Vector3(0,TENDER_CABIN_TOP+0.38,-3.2),new T.Vector3(0,TENDER_CABIN_TOP+0.38,3.2)];

export function buildTenderModel() {
  const parts:{geometry:T.BufferGeometry;finish:Finish;name:string}[]=[],rods:{line:T.Line3;radius:number}[]=[],blocks:T.Box3[]=[];
  const part=(geometry:T.BufferGeometry,finish:Finish,name:string)=>{parts.push({geometry,finish,name});return geometry;};
  const box=(size:number[],position:number[],finish:Finish,name:string)=>{const geometry=new T.BoxGeometry(...size as [number,number,number]).translate(...position as [number,number,number]);geometry.computeBoundingBox();blocks.push(geometry.boundingBox!);return part(geometry,finish,name);};
  const rod=(a:T.Vector3,b:T.Vector3,radius:number,finish:Finish,name:string)=> {
    const geometry=new T.CylinderGeometry(radius,radius,a.distanceTo(b),8),rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());
    geometry.applyMatrix4(new T.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),rotation,new T.Vector3(1,1,1)));part(geometry,finish,name);rods.push({line:new T.Line3(a,b),radius});
  };
  const quad=(points:T.Vector3[],finish:Finish,name:string,outward:T.Vector3)=> {
    const geometry=new T.BufferGeometry().setFromPoints(points),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
    geometry.setIndex(normal.dot(outward)>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]);geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geometry.computeVertexNormals();return part(geometry,finish,name);
  };
  const hull=closedHullGeometry(10.6,3.6,0.6,1.25,true),hp=hull.attributes.position;
  // A rising forefoot replaces the full-depth vertical blade at the bow.
  for(let station=0;station<=128;station++) {
    const lift=1.1*(1-station/128)**5;
    for(const row of [2,3,4,5]){const i=station*6+row;hp.setY(i,hp.getY(i)+lift*(row===2||row===5?0.55:1));}
  }
  for(const [end,center]of [[0,hp.count-2],[128,hp.count-1]]) {let mean=0;for(let row=0;row<6;row++)mean+=hp.getY(end*6+row)/6;hp.setY(center,mean);}
  hull.computeVertexNormals();part(hull,'orange','closed station hull');
  const sections=[{lo:1.05,hi:1.05,z:-4.3,roof:-3.7},{lo:1.6,hi:1.45,z:-3.5,roof:-3.5},{lo:1.6,hi:1.45,z:3.6,roof:3.6},{lo:1.15,hi:1.08,z:4.3,roof:3.95}];
  const cabinHeight=TENDER_CABIN_TOP-0.63,windowTop=TENDER_CABIN_TOP-0.23;
  const vertices=sections.flatMap(s=>[[-s.hi,TENDER_CABIN_TOP,s.roof],[s.hi,TENDER_CABIN_TOP,s.roof],[s.lo,0.63,s.z],[-s.lo,0.63,s.z]]),indices:number[]=[];
  for(let i=0;i<3;i++)for(let j=0;j<4;j++){const a=i*4+j,b=(i+1)*4+j,c=i*4+(j+1)%4,d=(i+1)*4+(j+1)%4;indices.push(a,b,c,c,b,d);}
  indices.push(0,1,2,0,2,3,12,14,13,12,15,14);
  const canopy=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(vertices.flat(),3));canopy.setAttribute('uv',new T.Float32BufferAttribute(vertices.flatMap(p=>[p[0],p[2]]),2));canopy.setIndex(indices);canopy.computeVertexNormals();canopy.computeBoundingBox();
  const coaming=canopy.clone(),cp=coaming.attributes.position;
  for(let i=0;i<cp.count;i++){const s=sections[Math.floor(i/4)],corner=i%4;cp.setXYZ(i,(corner===0||corner===3?-1:1)*(s.lo+0.015),corner<2?0.63:0.58,s.z);}
  coaming.computeVertexNormals();part(coaming,'rubber','closed canopy coaming');
  for(let i=0;i<3;i++)quad([0,1,5,4].map(j=>new T.Vector3(...vertices[i*4+j]).add(new T.Vector3(0,0.018,0))),'orange','roof gelcoat',new T.Vector3(0,1,0));
  const frameStart=parts.length;
  const panel=(points:T.Vector3[],outward:T.Vector3)=> {
    const normal=outward.clone().normalize(),front=points.map(p=>p.clone().addScaledVector(normal,0.004)),back=points.map(p=>p.clone().addScaledVector(normal,-0.045));
    quad(front,'white','canopy frame',normal);quad(back,'white','canopy frame',normal.clone().negate());
    const centre=points.reduce((sum,p)=>sum.add(p),new T.Vector3()).multiplyScalar(0.25);
    for(let i=0;i<4;i++) {const next=(i+1)%4;quad([front[i],front[next],back[next],back[i]],'white','window reveal',points[i].clone().add(points[next]).multiplyScalar(0.5).sub(centre));}
  };
  const framedWall=(at:(u:number,v:number)=>T.Vector3,outward:T.Vector3,holes:number[][])=> {
    const us=[...new Set([0,1,...holes.flatMap(h=>h.slice(0,2))])].sort((a,b)=>a-b),vs=[...new Set([0,1,...holes.flatMap(h=>h.slice(2,4))])].sort((a,b)=>a-b);
    for(let i=1;i<us.length;i++)for(let j=1;j<vs.length;j++) {
      const u=(us[i-1]+us[i])/2,v=(vs[j-1]+vs[j])/2;
      if(holes.some(([lo,hi,bottom,top])=>u>lo&&u<hi&&v>bottom&&v<top))continue;
      panel([at(us[i-1],vs[j-1]),at(us[i],vs[j-1]),at(us[i],vs[j]),at(us[i-1],vs[j])],outward);
    }
  };
  for(const side of [-1,1]) {
    const row=side<0?0:1,bottom=side<0?3:2;
    for(const i of [0,2])panel([i*4+row,(i+1)*4+row,(i+1)*4+bottom,i*4+bottom].map(j=>new T.Vector3(...vertices[j])),new T.Vector3(side,0,0));
    const holes=Array.from({length:6},(_,i)=>{const z=-3.38+i*1.16;return [(z+3.5)/7.1,(z+1.02+3.5)/7.1,(0.86-0.63)/cabinHeight,(windowTop-0.63)/cabinHeight];});
    framedWall((u,v)=>new T.Vector3(side*T.MathUtils.lerp(1.6,1.45,v),T.MathUtils.lerp(0.63,TENDER_CABIN_TOP,v),T.MathUtils.lerp(-3.5,3.6,u)),new T.Vector3(side,0.15/cabinHeight,0),holes);
  }
  for(const [index,side]of [[0,-1],[3,1]]) {
    const s=sections[index];framedWall((u,v)=>new T.Vector3((u*2-1)*T.MathUtils.lerp(s.lo,s.hi,v),T.MathUtils.lerp(0.63,TENDER_CABIN_TOP,v),T.MathUtils.lerp(s.z,s.roof,v)),new T.Vector3(0,side*(s.z-s.roof)/cabinHeight,side),[[0.09,0.47,0.2,0.85],[0.53,0.91,0.2,0.85]]);
  }
  for(let i=0;i<3;i++)quad([0,1,5,4].map(j=>new T.Vector3(...vertices[i*4+j]).add(new T.Vector3(0,-0.045,0))),'white','ceiling underside',new T.Vector3(0,-1,0));
  const frames=parts.splice(frameStart),shell=mergeGeometries(frames.map(p=>p.geometry));if(!shell)throw new Error('Tender frame merge failed');frames.forEach(p=>p.geometry.dispose());part(shell,'white','apertured canopy');
  const pane=(points:T.Vector3[],outward:T.Vector3,name:string)=> {
    const offset=outward.clone().normalize().multiplyScalar(0.025),corners=points.map(p=>p.clone().add(offset));quad(corners,'glass',name,outward);
    for(let i=0;i<4;i++)rod(corners[i],corners[(i+1)%4],0.022,'rubber','window gasket');
  };
  for(const side of [-1,1])for(let i=0;i<6;i++) {
    const z=-3.38+i*1.16,at=(y:number,z:number)=>new T.Vector3(side*(1.6-(y-0.63)/cabinHeight*0.15),y,z);
    pane([at(0.86,z),at(0.86,z+1.02),at(windowTop,z+1.02),at(windowTop,z)],new T.Vector3(side,0.15/cabinHeight,0),'side window');
  }
  for(const [index,side]of [[0,-1],[3,1]])for(const half of [-1,1]) {
    const s=sections[index],at=(u:number,v:number)=>new T.Vector3((u*2-1)*T.MathUtils.lerp(s.lo,s.hi,v),T.MathUtils.lerp(0.63,TENDER_CABIN_TOP,v),T.MathUtils.lerp(s.z,s.roof,v));
    const lo=half<0?0.09:0.53,hi=half<0?0.47:0.91;
    pane([at(lo,0.2),at(hi,0.2),at(hi,0.85),at(lo,0.85)],new T.Vector3(0,side*(s.z-s.roof)/cabinHeight,side),'end windscreen');
  }
  const fender:T.Vector3[]=[];
  for(let i=0;i<=64;i++)fender.push(new T.Vector3(hullHalfWidth(i/64,3.6,true)+0.025,hullDeckHeight(i/64,10.6,0.6)+0.025,(i/64-0.5)*10.6));
  for(let i=64;i>=0;i--)fender.push(new T.Vector3(-hullHalfWidth(i/64,3.6,true)-0.025,hullDeckHeight(i/64,10.6,0.6)+0.025,(i/64-0.5)*10.6));
  for(let i=0;i<fender.length;i++)rod(fender[i],fender[(i+1)%fender.length],0.09,'rubber','perimeter fender');
  const roof=TENDER_CABIN_TOP+0.018;
  for(const z of [-3.2,3.2]) {
    box([0.42,0.09,0.5],[0,roof+0.045-0.002,z],'white','hoist reinforcement');
    rod(new T.Vector3(0,TENDER_CABIN_TOP+0.1,z),new T.Vector3(0,TENDER_CABIN_TOP+0.28,z),0.08,'metal','release hook pedestal');
    const eye=new T.TorusGeometry(0.1,0.022,8,16);eye.translate(0,TENDER_CABIN_TOP+0.28,z);part(eye,'metal','lifting eye');
    rods.push({line:new T.Line3(new T.Vector3(0,TENDER_CABIN_TOP+0.18,z),new T.Vector3(0,TENDER_CABIN_TOP+0.38,z)),radius:0.12});
  }
  for(const z of [-1.7,0.7])box([1.15,0.055,0.72],[0,roof+0.0275-0.002,z],'white','roof access hatch');
  for(const side of [-1,1]) {
    rod(new T.Vector3(side*1.25,TENDER_CABIN_TOP+0.1,-3.1),new T.Vector3(side*1.25,TENDER_CABIN_TOP+0.1,3.3),0.023,'metal','canopy protection rail');
    for(const z of [-3.1,0,3.3])rod(new T.Vector3(side*1.25,roof-0.002,z),new T.Vector3(side*1.25,TENDER_CABIN_TOP+0.1,z),0.025,'metal','rail support');
  }
  const solids=[hull,canopy,coaming],trees=solids.map(geometry=>new MeshBVH(geometry,{indirect:true})),nearest=new T.Vector3(),ray=new T.Ray(new T.Vector3(),new T.Vector3(0.431,0.557,0.709).normalize());
  const bounds=new T.Box3();parts.forEach(({geometry})=>{geometry.computeBoundingBox();bounds.union(geometry.boundingBox!);});
  const contains=(point:T.Vector3,padding=0.2)=> {
    if(point.x<bounds.min.x-padding||point.x>bounds.max.x+padding||point.y<bounds.min.y-padding||point.y>bounds.max.y+padding||point.z<bounds.min.z-padding||point.z>bounds.max.z+padding)return false;
    for(const tree of trees) {
      const closest=tree.closestPointToPoint(point,undefined,0,padding);if(closest&&closest.distance<=padding)return true;
      ray.origin.copy(point);const hit=tree.raycastFirst(ray,T.DoubleSide);if(hit?.face&&hit.face.normal.dot(ray.direction)>0)return true;
    }
    return blocks.some(box=>box.distanceToPoint(point)<=padding)||rods.some(({line,radius})=>{line.closestPointToPoint(point,true,nearest);return nearest.distanceToSquared(point)<(radius+padding)**2;});
  };
  return {parts,hull,canopy,coaming,hooks:TENDER_HOOKS,bounds,contains};
}
