import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { closedHullGeometry,hullDeckHeight,hullHalfWidth,upperHullSidePose } from './hull';
import { metricPaintGeometry } from './paint';
import { vesselBoxContains,type VesselBox } from './cruise';

export const YACHT_LENGTH=28,YACHT_BEAM=6.6,YACHT_DECK=2.05,YACHT_DRAFT=2.1;
export function yachtDeckGeometry(first=2,last=126,inset=0.13,offset=0.035) {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],columns=8;
  for(let station=first;station<=last;station++)for(let col=0;col<=columns;col++) {
    const u=station/128,x=(col/columns*2-1)*Math.max(0,hullHalfWidth(u,YACHT_BEAM,true)-inset),z=(u-0.5)*YACHT_LENGTH;
    positions.push(x,hullDeckHeight(u,YACHT_LENGTH,YACHT_DECK)+offset,z);uvs.push(x/1.8,z/1.8);
  }
  for(let row=0;row<last-first;row++)for(let col=0;col<columns;col++){const i=row*(columns+1)+col,j=i+columns+1;indices.push(i,j,i+1,i+1,j,j+1);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function yachtHullContains(p:T.Vector3,padding=0.2) {
  if(Math.abs(p.z)>YACHT_LENGTH/2+padding)return false;
  const u=T.MathUtils.clamp(p.z/YACHT_LENGTH+0.5,0,1),a=Math.min(127,Math.floor(u*128))/128,b=a+1/128,f=(u-a)*128;
  const width=T.MathUtils.lerp(hullHalfWidth(a,YACHT_BEAM,true),hullHalfWidth(b,YACHT_BEAM,true),f),top=T.MathUtils.lerp(hullDeckHeight(a,YACHT_LENGTH,YACHT_DECK),hullDeckHeight(b,YACHT_LENGTH,YACHT_DECK),f);
  return p.y<=top+padding&&p.y>=-YACHT_DRAFT-padding&&Math.abs(p.x)<=width+padding;
}

export function buildMotorYacht() {
  const root=new T.Group();root.name='Pelagic · 28 m';
  const paint=new T.MeshStandardMaterial({color:0xeeeae0,roughness:0.45}),hullPaint=paint.clone();hullPaint.side=T.DoubleSide;
  const teak=new T.MeshStandardMaterial({color:0xb79a78,roughness:0.8}),glass=new T.MeshPhysicalMaterial({color:0x18313d,roughness:0.08,metalness:0.25,clearcoat:1});
  const chrome=new T.MeshStandardMaterial({color:0xbec8cc,metalness:0.9,roughness:0.22});
  const cushions=new T.MeshPhysicalMaterial({color:0xd9d3be,roughness:0.94,sheen:0.5,sheenColor:0xf2ead7});
  paint.name=hullPaint.name='Yacht paint';teak.name='Yacht teak';
  const buckets=new Map<T.Material,T.BufferGeometry[]>(),boxes:VesselBox[]=[];
  const rods:{line:T.Line3;radius:number}[]=[],panes:T.Triangle[]=[],nearest=new T.Vector3();
  const add=(geometry:T.BufferGeometry,material:T.Material)=>{const g=material===paint||material===hullPaint||material===teak?metricPaintGeometry(geometry,material===teak?1.8:2.5):geometry.index?geometry.toNonIndexed():geometry.clone();geometry.dispose();if(!buckets.has(material))buckets.set(material,[]);buckets.get(material)!.push(g);};
  const box=(size:number[],position:number[],material:T.Material=paint,solid=true,radius=0.08)=> {
    const geometry=new RoundedBoxGeometry(size[0],size[1],size[2],3,radius);geometry.translate(...position as [number,number,number]);add(geometry,material);
    if(solid)boxes.push({min:new T.Vector3(...position).sub(new T.Vector3(...size).multiplyScalar(0.5)),max:new T.Vector3(...position).add(new T.Vector3(...size).multiplyScalar(0.5)),radius});
  };
  const rod=(a:number[],b:number[],radius=0.035,material:T.Material=chrome)=> {
    const start=new T.Vector3(...a),end=new T.Vector3(...b),geometry=new T.CylinderGeometry(radius,radius,start.distanceTo(end),12),rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize());
    geometry.applyMatrix4(new T.Matrix4().compose(start.clone().add(end).multiplyScalar(0.5),rotation,new T.Vector3(1,1,1)));add(geometry,material);
    rods.push({line:new T.Line3(start,end),radius});
  };
  const panel=(points:number[][])=> {
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geometry.setIndex([0,2,1,0,3,2]);geometry.computeVertexNormals();
    const p=points.map(v=>new T.Vector3(...v));panes.push(new T.Triangle(p[0],p[1],p[2]),new T.Triangle(p[0],p[2],p[3]));add(geometry,glass);
  };
  add(closedHullGeometry(YACHT_LENGTH,YACHT_BEAM,YACHT_DECK,YACHT_DRAFT,true),hullPaint);add(yachtDeckGeometry(),teak);
  box([5.5,0.14,13.1],[0,2.14,0.1]);box([5.32,0.85,12.6],[0,2.635,0.1]);
  for(const side of [-1,1]) {
    const points=[[side*2.675,3.05,-6.2],[side*2.675,3.05,6.4],[side*2.675,4.28,6.4],[side*2.675,4.28,-4.9]];
    panel(side>0?points:[...points].reverse());
    box([0.14,0.12,11.5],[side*2.675,4.28,0.7]);
    for(const z of [-4.4,-1.7,1.5,4.4])box([0.14,1.22,0.09],[side*2.69,3.66,z]);
  }
  panel([[-2.675,3.05,-6.2],[2.675,3.05,-6.2],[2.675,4.28,-4.9],[-2.675,4.28,-4.9]]);
  panel([[2.675,3.05,6.41],[-2.675,3.05,6.41],[-2.675,4.28,6.41],[2.675,4.28,6.41]]);
  for(const z of [-4.9,6.41])box([5.35,0.12,0.1],[0,4.28,z]);
  box([5.75,0.18,12.9],[0,4.43,0.2]);
  box([5.15,0.14,8.6],[0,4.59,0.8]);box([4.95,0.035,8.4],[0,4.6775,0.8],teak,false,0.01);
  box([4,0.62,2.4],[0,5.005,-2.15]);box([4.05,0.66,2.4],[0,5.645,-2.15],glass);box([4.5,0.12,2.8],[0,6.035,-2.15]);
  for(const side of [-1,1]) {
    rod([side*2.13,4.695,3.65],[side*2.13,6.8,2.4],0.075,paint);
    rod([side*2.13,6.095,-3.15],[side*2.13,6.8,-2.85],0.06,paint);
  }
  box([4.75,0.16,6.4],[0,6.88,-0.1]);
  for(const side of [-1,1]) {
    for(const stations of [[3,8,14,20,26,32,36],[98,106,114,122,126]]) {
      let previous:number[]|null=null;
      for(const station of stations) {
        const u=station/128,z=(u-0.5)*YACHT_LENGTH,x=side*(hullHalfWidth(u,YACHT_BEAM,true)-0.2),floor=hullDeckHeight(u,YACHT_LENGTH,YACHT_DECK)+0.035,top=[x,floor+0.92,z];
        rod([x,floor,z],top,0.027);if(previous)rod(previous,top,0.027);previous=top;
      }
    }
    for(const z of [-3.2,-1,1.2,3.4,4.7])rod([side*2.4,4.695,z],[side*2.4,5.615,z],0.025);
    rod([side*2.4,5.615,-3.2],[side*2.4,5.615,4.7],0.025);
  }
  rod([-2.4,5.615,4.7],[2.4,5.615,4.7],0.025);
  box([2.5,0.18,2.9],[0,2.285,-10.5]);box([2.47,0.08,2.87],[0,2.415,-10.5],cushions,true,0.035);
  box([4.2,0.55,0.85],[0,2.36,10.7]);box([4.17,0.16,0.83],[0,2.71,10.7],cushions,true,0.06);box([4.2,0.85,0.18],[0,2.95,11.08],cushions,true,0.06);
  box([1.3,0.08,0.8],[0,2.8,8.5],teak);rod([0,2.085,8.5],[0,2.76,8.5],0.07);
  for(const side of [-1,1]) {box([1.7,0.55,0.75],[side*1.48,4.97,3.5]);box([1.66,0.13,0.73],[side*1.48,5.31,3.5],cushions,true,0.05);}
  for(const side of [-1,1])for(const centre of [-4.5,0.5,5.5]) {
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    for(let row=0;row<2;row++)for(let col=0;col<=8;col++) {
      const pose=upperHullSidePose(0.65+row*0.68,centre-1.85+col/8*3.7,side,YACHT_LENGTH,YACHT_BEAM,YACHT_DECK,YACHT_DRAFT,true),point=pose.point.addScaledVector(pose.normal,0.018);positions.push(point.x,point.y,point.z);uvs.push(col/8,row);
    }
    for(let col=0;col<8;col++){const a=col,b=col+9,c=col+1,d=b+1;indices.push(...(side>0?[a,b,c,c,b,d]:[a,c,b,c,d,b]));}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();add(geometry,glass);
  }
  box([0.9,0.12,0.9],[0,7.02,1.5]);
  const dome=new T.SphereGeometry(0.42,24,12,0,Math.PI*2,0,Math.PI/2);dome.translate(0,7.08,1.5);add(dome,paint);boxes.push({min:new T.Vector3(-0.42,7.08,1.08),max:new T.Vector3(0.42,7.5,1.92),radius:0.42});
  rod([0,6.96,-1.1],[0,7.85,-1.1],0.035);rod([-0.45,6.96,0.7],[-0.45,7.58,0.7],0.018);rod([0.45,6.96,0.7],[0.45,7.58,0.7],0.018);
  for(const [side,color]of [[-1,0xff3030],[1,0x39f38b]]) {
    box([0.16,0.11,0.2],[side*2.77,4.5,-5]);const lamp=new T.SphereGeometry(0.08,12,8);lamp.translate(side*2.77,4.58,-5);add(lamp,new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.8,roughness:0.3}));
  }
  for(const [material,geometries]of buckets){const mesh=new T.Mesh(mergeGeometries(geometries)!,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);geometries.forEach(g=>g.dispose());}
  const contains=(point:T.Vector3,padding=0.2)=>yachtHullContains(point,padding)||boxes.some(box=>vesselBoxContains(box,point,padding))||rods.some(rod=>{rod.line.closestPointToPoint(point,true,nearest);return nearest.distanceToSquared(point)<(rod.radius+padding)**2;})||panes.some(pane=>{pane.closestPointToPoint(point,nearest);return nearest.distanceToSquared(point)<padding**2;});
  return {root,boxes,paint:[paint,hullPaint],teak,contains};
}
