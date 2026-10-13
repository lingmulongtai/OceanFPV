import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { closedHullGeometry,hullDeckHeight,hullHalfWidth } from './hull';
import { metricPaintGeometry } from './paint';
import { type VesselBox } from './cruise';

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
  paint.name=hullPaint.name='Yacht paint';teak.name='Yacht teak';
  const buckets=new Map<T.Material,T.BufferGeometry[]>(),boxes:VesselBox[]=[];
  const add=(geometry:T.BufferGeometry,material:T.Material)=>{const g=material===paint||material===hullPaint?metricPaintGeometry(geometry):geometry.index?geometry.toNonIndexed():geometry.clone();geometry.dispose();if(!buckets.has(material))buckets.set(material,[]);buckets.get(material)!.push(g);};
  const box=(size:number[],position:number[],material:T.Material=paint,solid=true,radius=0.08)=> {
    const geometry=new RoundedBoxGeometry(size[0],size[1],size[2],3,radius);geometry.translate(...position as [number,number,number]);add(geometry,material);
    if(solid)boxes.push({min:new T.Vector3(...position).sub(new T.Vector3(...size).multiplyScalar(0.5)),max:new T.Vector3(...position).add(new T.Vector3(...size).multiplyScalar(0.5)),radius});
  };
  add(closedHullGeometry(YACHT_LENGTH,YACHT_BEAM,YACHT_DECK,YACHT_DRAFT,true),hullPaint);add(yachtDeckGeometry(),teak);
  box([5.5,1.75,12],[0,2.975,1]);box([4.8,1.1,5.8],[0,4.35,0],glass);box([5.7,0.24,7],[0,5.02,0]);
  for(const [material,geometries]of buckets){const mesh=new T.Mesh(mergeGeometries(geometries)!,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);geometries.forEach(g=>g.dispose());}
  return {root,boxes,paint:[paint,hullPaint],teak};
}
