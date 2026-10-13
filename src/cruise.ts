import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { closedHullGeometry, foredeckGeometry, hullDeckHeight, hullHalfWidth, hullNameGeometry, upperHullSidePose } from './hull';
import { metricPaintGeometry } from './paint';

export type VesselBox={min:T.Vector3;max:T.Vector3;radius?:number};
export function deckOutline(length:number,beam:number,radius=6) {
  const w=beam/2,l=length/2,r=Math.min(radius,w,l),shape=new T.Shape();
  shape.moveTo(-w+r,-l);shape.lineTo(w-r,-l);shape.absarc(w-r,-l+r,r,-Math.PI/2,0,false);
  shape.lineTo(w,l-r);shape.absarc(w-r,l-r,r,0,Math.PI/2,false);
  shape.lineTo(-w+r,l);shape.absarc(-w+r,l-r,r,Math.PI/2,Math.PI,false);
  shape.lineTo(-w,-l+r);shape.absarc(-w+r,-l+r,r,Math.PI,Math.PI*1.5,false);
  return shape;
}
export function deckGeometry(length:number,beam:number,height:number,radius=6) {
  const geometry=new T.ExtrudeGeometry(deckOutline(length,beam,radius),{depth:height,bevelEnabled:false,curveSegments:12});
  geometry.rotateX(Math.PI/2);geometry.translate(0,height/2,0);return geometry;
}
function windowRibbon(length:number,beam:number,height:number,radius=6) {
  const points=deckOutline(length,beam,radius).getPoints(12),positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let i=0;i<points.length;i++) {const p=points[i];positions.push(p.x,-height/2,p.y,p.x,height/2,p.y);uvs.push(i/points.length,0,i/points.length,1);if(i){const a=(i-1)*2,b=i*2;indices.push(a,b,a+1,a+1,b,b+1);}}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function vesselBoxContains(box:VesselBox,p:T.Vector3,padding=0.2) {
  if(p.y<=box.min.y-padding||p.y>=box.max.y+padding)return false;
  const halfX=(box.max.x-box.min.x)/2+padding,halfZ=(box.max.z-box.min.z)/2+padding;
  const x=Math.abs(p.x-(box.min.x+box.max.x)/2),z=Math.abs(p.z-(box.min.z+box.max.z)/2),r=box.radius??0;
  if(x>=halfX||z>=halfZ)return false;
  if(!r)return true;
  const radius=r+padding;
  return Math.hypot(Math.max(0,x-(halfX-radius)),Math.max(0,z-(halfZ-radius)))<radius;
}
export function buildCruiseShip() {
  const root=new T.Group();root.name='Ocean Meridian · 260 m';
  const white=new T.MeshStandardMaterial({color:0xf2f0e5,roughness:0.45,metalness:0});
  const navy=new T.MeshStandardMaterial({color:0x172f48,roughness:0.4,metalness:0.25});
  const glass=new T.MeshPhysicalMaterial({color:0x193c49,metalness:0,roughness:0.14,clearcoat:1,clearcoatRoughness:0.08,envMapIntensity:1.3,side:T.DoubleSide});
  const balconyGlass=glass.clone();balconyGlass.transparent=true;balconyGlass.opacity=0.42;balconyGlass.depthWrite=false;
  const teak=new T.MeshStandardMaterial({color:0xbb9874,roughness:0.75});
  const orange=new T.MeshStandardMaterial({color:0xde6b22,roughness:0.38});
  const chrome=new T.MeshStandardMaterial({color:0xc1cdd0,metalness:0.82,roughness:0.28});
  const black=new T.MeshStandardMaterial({color:0x182329,roughness:0.75});
  const pool=new T.MeshPhysicalMaterial({color:0x36b9c7,roughness:0.08,metalness:0.12,clearcoat:1});
  const boxes:VesselBox[]=[],buckets=new Map<T.Material,T.BufferGeometry[]>();
  const add=(g:T.BufferGeometry,p:number[],m:T.Material,rotation=new T.Euler(),scale=new T.Vector3(1,1,1))=> {
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(rotation),scale));
    if(m===teak){const position=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<position.count;i++)uv.setXY(i,position.getX(i)/1.8,position.getZ(i)/1.8);}
    if(m===white){const projected=metricPaintGeometry(g);g.dispose();g=projected;}
    if(!buckets.has(m))buckets.set(m,[]);buckets.get(m)!.push(g.index?g.toNonIndexed():g);
  };
  const box=(s:number[],p:number[],m=white,solid=false,round=0)=> {
    add(round?new RoundedBoxGeometry(s[0],s[1],s[2],2,round):new T.BoxGeometry(s[0],s[1],s[2]),p,m);
    if(solid)boxes.push({min:new T.Vector3(p[0]-s[0]/2,p[1]-s[1]/2,p[2]-s[2]/2),max:new T.Vector3(p[0]+s[0]/2,p[1]+s[1]/2,p[2]+s[2]/2)});
  };
  const deckPlate=(length:number,beam:number,height:number,y:number,z:number,radius=6)=> {
    add(deckGeometry(length,beam,height,radius),[0,y,z],white);
    boxes.push({min:new T.Vector3(-beam/2,y-height/2,z-length/2),max:new T.Vector3(beam/2,y+height/2,z+length/2),radius});
  };
  const rod=(a:number[],b:number[],r=0.04,m=chrome)=> {
    const start=new T.Vector3(...a),end=new T.Vector3(...b),g=new T.CylinderGeometry(r,r,start.distanceTo(end),8);
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize());
    g.applyMatrix4(new T.Matrix4().compose(start.add(end).multiplyScalar(0.5),q,new T.Vector3(1,1,1)));
    const projected=m===white?metricPaintGeometry(g):g.toNonIndexed();if(m===white)g.dispose();
    if(!buckets.has(m))buckets.set(m,[]);buckets.get(m)!.push(projected);
  };
  const hullMat=white.clone();hullMat.side=T.DoubleSide;
  hullMat.onBeforeCompile=shader=> {
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 shipPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nshipPosition=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 shipPosition;').replace('#include <color_fragment>','#include <color_fragment>\nfloat stripe=1.0-smoothstep(2.9,3.15,abs(shipPosition.y-3.6));\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.022,0.054,0.091),stripe*0.95);\ndiffuseColor.rgb*=mix(0.28,1.0,smoothstep(-0.8,0.15,shipPosition.y));');
  };
  const hullSource=closedHullGeometry(260,34,9,7,true),hull=new T.Mesh(metricPaintGeometry(hullSource),hullMat);hullSource.dispose();hull.castShadow=hull.receiveShadow=true;root.add(hull);
  // Tall sheer hull, recessed balcony walls and overhanging deck slabs.
  for(let deck=0;deck<8;deck++) {
    const y=10.6+deck*2.85,length=deck<5?196:178-(deck-5)*18,z=deck<5?3:9+(deck-5)*3;
    deckPlate(length,27.5,2.56,y,z);
    deckPlate(length+3,32.6,0.28,y+1.44,z,8);
    add(windowRibbon(length+0.14,27.64,1.72,6.07),[0,y+0.02,z],glass);
    for(const p of deckOutline(length+0.2,27.7,6.1).getPoints(4)) {
      if(Math.abs(p.y)>length/2-7)rod([p.x,y-0.85,z+p.y],[p.x,y+0.9,z+p.y],0.045,white);
    }
    const start=z-length/2+8,end=z+length/2-8;
    for(const side of [-1,1]) {
      for(let cabin=start;cabin+3.5<=end;cabin+=3.5) {
        box([0.1,1.84,0.09],[side*13.85,y,cabin],white);
        box([2.1,1.84,0.075],[side*14.85,y,cabin],white);
        box([0.055,0.96,3.32],[side*16.05,y-0.16,cabin+1.72],balconyGlass);
        rod([side*16.18,y+0.44,cabin],[side*16.18,y+0.44,cabin+3.5],0.035);
        // Balcony chairs and table are actual geometry at FPV distance.
        if(deck<5) {box([0.5,0.06,0.5],[side*14.9,y-0.58,cabin+0.95],teak);rod([side*14.9,y-1,cabin+0.95],[side*14.9,y-0.58,cabin+0.95],0.04);}
      }
    }
  }
  // Continuous bow bridge with individual mullions and a cantilevered roof.
  box([31,2.5,9],[0,32.3,-70],white,true,0.35);box([31.2,1.65,0.09],[0,32.6,-74.56],glass);
  for(let x=-14;x<=14;x+=2)box([0.075,1.8,0.14],[x,32.6,-74.7],white);
  box([34.2,0.42,12],[0,33.82,-70],white);
  for(const side of [-1,1]) {box([0.08,1.6,8],[side*15.58,32.6,-70],glass);box([2.8,0.2,10],[side*16.2,31,-70],white);}
  // Teak promenade, bow foredeck, stern terraces and pool deck.
  add(foredeckGeometry(),[0,0,0],teak);
  for(const side of [-1,1])for(let station=2;station<=15;station++) {
    const u=station/128,z=(u-0.5)*260,x=side*(hullHalfWidth(u,34)-0.3),y=hullDeckHeight(u,260,9);
    if(station%2===0||station===15)rod([x,y,z],[x,y+1.05,z],0.035);
    if(station<15){const next=(station+1)/128,nx=side*(hullHalfWidth(next,34)-0.3),ny=hullDeckHeight(next,260,9),nz=(next-0.5)*260;for(const lift of [0.55,1.05])rod([x,y+lift,z],[nx,ny+lift,nz],0.03);}
  }
  box([26,0.16,24],[0,9.2,112],teak);
  const upperRoof=10.6+7*2.85+1.58,sunDeck=upperRoof+0.09;
  box([28,0.18,74],[0,sunDeck,18],teak,true);
  for(const z of [7,37]) {
    box([9,0.5,17],[0,sunDeck+0.35,z],white);box([7.7,0.1,15.7],[0,sunDeck+0.65,z],pool);
    for(const side of [-1,1])for(let offset=-5;offset<=5;offset+=2.5) {
      box([0.65,0.17,1.7],[side*6.4,sunDeck+0.25,z+offset],teak);box([0.65,0.7,0.15],[side*6.4,sunDeck+0.6,z+offset+0.78],white);
      for(const dx of [-0.22,0.22])for(const dz of [-0.55,0.55])rod([side*6.4+dx,sunDeck+0.09,z+offset+dz],[side*6.4+dx,sunDeck+0.165,z+offset+dz],0.025);
    }
  }
  for(let tier=0;tier<3;tier++) {box([30-tier*3,0.2,9],[0,12+tier*5.7,106-tier*7],teak);for(const side of [-1,1])rod([side*(14-tier*1.5),13+tier*5.7,102-tier*7],[side*(14-tier*1.5),13+tier*5.7,110-tier*7]);}
  // Eighteen enclosed orange lifeboats, davits and survival equipment.
  for(const side of [-1,1]) for(let z=-68;z<=60;z+=16) {
    add(new T.SphereGeometry(1,24,12),[side*18,11.65,z],orange,new T.Euler(),new T.Vector3(2,1.25,5.3));
    box([3.3,1,7.2],[side*18,12.8,z],white,true,0.28);box([3.4,0.5,0.08],[side*18,12.9,z-3.65],glass);
    boxes.push({min:new T.Vector3(side*18-2,10.4,z-5.3),max:new T.Vector3(side*18+2,12.9,z+5.3)});
    for(const dz of [-3.8,3.8]) {rod([side*14,14,z+dz],[side*19,14.7,z+dz],0.12,white);rod([side*19,14.7,z+dz],[side*19,13,z+dz],0.055,chrome);}
  }
  // Funnel, exhaust stacks, radar domes, communications mast and railings.
  const funnelBase=upperRoof,funnelCentre=funnelBase+3.75;
  box([9,7.5,14],[0,funnelCentre,69],navy,true,0.9);box([10,0.45,15],[0,funnelCentre+3.9,69],chrome);
  for(const x of [-2.7,0,2.7])add(new T.CylinderGeometry(0.72,0.72,2.3,20),[x,funnelCentre+4.6,69],black);
  for(const z of [-47,-20]) {add(new T.SphereGeometry(2.6,32,20),[0,upperRoof+3.6,z],white);add(new T.CylinderGeometry(1.8,2.1,2,24),[0,upperRoof+1,z],white);}
  const mastBase=10.6+6*2.85+1.58;
  rod([0,mastBase,-59],[0,47,-59],0.22,white);rod([-7,42,-59],[7,42,-59],0.09,chrome);
  for(let x=-4;x<=4;x+=2)rod([x,42,-59],[x,44,-59],0.035);
  for(const side of [-1,1])for(const [base,y,start,end,width]of [[upperRoof,upperRoof+1.05,-53,80,14],[9,10,101,123,13]]) {
    rod([side*width,y,start],[side*width,y,end]);rod([side*width,y-0.5,start],[side*width,y-0.5,end],0.025);
    for(let z=start;z<=end;z+=2.2)rod([side*width,base,z],[side*width,y,z]);
  }
  // Hull portholes, seam bands, anchor recesses and bow mooring machinery.
  for(const side of [-1,1])for(let z=-85;z<99;z+=3.4) {
    const pose=upperHullSidePose(7.6,z,side),position=pose.point.addScaledVector(pose.normal,0.026);
    const rotation=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),pose.normal));
    add(new T.CylinderGeometry(0.25,0.25,0.06,16),position.toArray(),black,rotation);
  }
  for(const side of [-1,1]) {
    const pose=upperHullSidePose(7,-113,side),position=pose.point.addScaledVector(pose.normal,0.035);
    const rotation=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(1,0,0),pose.normal));
    add(new T.BoxGeometry(0.07,2.4,3.3),position.toArray(),navy,rotation);
    const top=upperHullSidePose(7.2,-113,side),bottom=upperHullSidePose(4.8,-113,side);
    rod(top.point.addScaledVector(top.normal,0.12).toArray(),bottom.point.addScaledVector(bottom.normal,0.12).toArray(),0.1,chrome);
  }
  for(const x of [-5,5])for(const z of [-113,116]) {const y=hullDeckHeight((z+130)/260,260,9)+0.15;add(new T.CylinderGeometry(0.4,0.4,0.9,20),[x,y+0.45,z],chrome);box([1.9,0.12,1.2],[x,y,z],navy);}
  for(const [m,geometries]of buckets) {const geo=mergeGeometries(geometries);if(!geo)throw new Error('Cruise geometry merge failed');const mesh=new T.Mesh(geo,m);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);geometries.forEach(g=>g.dispose());}
  const labelCanvas=document.createElement('canvas');labelCanvas.width=1024;labelCanvas.height=128;const ctx=labelCanvas.getContext('2d')!;ctx.fillStyle='#d8dfe0';ctx.font='600 68px Arial';ctx.textAlign='center';ctx.fillText('OCEAN  MERIDIAN',512,87);
  const label=new T.CanvasTexture(labelCanvas);label.colorSpace=T.SRGBColorSpace;
  for(const side of [-1,1])root.add(new T.Mesh(hullNameGeometry(side),new T.MeshStandardMaterial({map:label,transparent:true,depthWrite:false,roughness:0.5})));
  return {root,boxes,paint:[white,hullMat],teak};
}
