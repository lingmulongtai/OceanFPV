import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { foredeckGeometry, hullDeckHeight, hullHalfWidth, hullNameGeometry } from './hull';
import { metricPaintGeometry } from './paint';
import { bakeCabinOcclusion,roomOcclusionUV,type RoomSurface } from './occlusion';
import {buildTenderModel,TENDER_MOUNTS} from './tender';
import {buildSternTerraces} from './stern-terraces';
import {cruiseHullGeometry,cruiseHullSidePose} from './cruise-hull';

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
export function windowRibbon(length:number,beam:number,height:number,radius=6,endsOnly=false) {
  const points=deckOutline(length,beam,radius).getPoints(12),positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let i=0;i<points.length;i++) {const p=points[i];positions.push(p.x,-height/2,p.y,p.x,height/2,p.y);uvs.push(i/points.length,0,i/points.length,1);if(i){const a=(i-1)*2,b=i*2,previous=points[i-1],longSide=Math.abs(p.x-previous.x)<1e-7&&Math.abs(Math.abs(p.x)-beam/2)<1e-7;if(!endsOnly||!longSide)indices.push(a,a+1,b,a+1,b+1,b);}}
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
  const cabinGlass=new T.MeshPhysicalMaterial({color:0xecf4f1,roughness:0.055,transmission:0.94,thickness:0.012,ior:1.5,attenuationColor:0xd9ece5,attenuationDistance:2});
  cabinGlass.name='Cabin glazing';
  const balconyGlass=glass.clone();balconyGlass.transparent=true;balconyGlass.opacity=0.42;balconyGlass.depthWrite=false;
  const teak=new T.MeshStandardMaterial({color:0xbb9874,roughness:0.75});
  const orange=new T.MeshStandardMaterial({color:0xde6b22,roughness:0.38});
  const chrome=new T.MeshStandardMaterial({color:0xc1cdd0,metalness:0.82,roughness:0.28});
  const black=new T.MeshStandardMaterial({color:0x182329,roughness:0.75});
  const pool=new T.MeshPhysicalMaterial({color:0x36b9c7,roughness:0.08,metalness:0.12,clearcoat:1});
  const linen=new T.MeshPhysicalMaterial({color:0xe4e0d5,roughness:0.94,sheen:0.8,sheenColor:0xeee9de,sheenRoughness:0.8});
  const quilts=[0x557d83,0x8b8579,0x8e6551].map(color=>new T.MeshPhysicalMaterial({color,roughness:0.95,sheen:0.7,sheenColor:color,sheenRoughness:0.85}));
  const curtain=new T.MeshPhysicalMaterial({color:0xb7ad96,roughness:0.94,sheen:0.7,sheenColor:0xd4c8af,sheenRoughness:0.9,side:T.DoubleSide});
  const tenderUpholstery=new T.MeshPhysicalMaterial({color:0xc4b89d,roughness:0.92,sheen:0.35,sheenColor:0xe6dcc6,sheenRoughness:0.85});
  tenderUpholstery.name='Tender upholstery';
  const boxes:VesselBox[]=[],buckets=new Map<T.Material,T.BufferGeometry[]>();
  const furnitureMaterials=new Set<T.Material>([linen,...quilts]),coarseFurniture=new Map<T.Material,T.BufferGeometry[]>();
  const blockers:T.BufferGeometry[]=[];let capture=false,aoFloor=0,aoCabin=0,aoSide=1;
  const add=(g:T.BufferGeometry,p:number[],m:T.Material,rotation=new T.Euler(),scale=new T.Vector3(1,1,1),surface?:RoomSurface)=> {
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(rotation),scale));
    if(m===teak){const position=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<position.count;i++)uv.setXY(i,position.getX(i)/1.8,position.getZ(i)/1.8);}
    if(m===white){const projected=metricPaintGeometry(g);g.dispose();g=projected;}
    if(m===white||m===teak)roomOcclusionUV(g,aoFloor,aoCabin,aoSide,surface);
    if(capture&&m!==glass&&m!==cabinGlass&&m!==balconyGlass)blockers.push(g.clone());
    if(!buckets.has(m))buckets.set(m,[]);buckets.get(m)!.push(g.index?g.toNonIndexed():g);
  };
  const box=(s:number[],p:number[],m=white,solid=false,round=0,surface?:RoomSurface)=> {
    add(round?new RoundedBoxGeometry(s[0],s[1],s[2],2,round):new T.BoxGeometry(s[0],s[1],s[2]),p,m,new T.Euler(),new T.Vector3(1,1,1),surface);
    if(furnitureMaterials.has(m)) {
      const geometry=round?new RoundedBoxGeometry(s[0],s[1],s[2],1,round):new T.BoxGeometry(s[0],s[1],s[2]);geometry.translate(p[0],p[1],p[2]);
      if(!coarseFurniture.has(m))coarseFurniture.set(m,[]);coarseFurniture.get(m)!.push(geometry.index?geometry.toNonIndexed():geometry);
    }
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
    if(m===white||m===teak)roomOcclusionUV(projected);if(capture)blockers.push(projected.clone());
    if(!buckets.has(m))buckets.set(m,[]);buckets.get(m)!.push(projected);
  };
  const hullMat=white.clone();hullMat.side=T.DoubleSide;
  hullMat.onBeforeCompile=shader=> {
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 shipPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nshipPosition=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 shipPosition;').replace('#include <color_fragment>','#include <color_fragment>\nfloat stripe=1.0-smoothstep(2.9,3.15,abs(shipPosition.y-3.6));\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.022,0.054,0.091),stripe*0.95);\ndiffuseColor.rgb*=mix(0.28,1.0,smoothstep(-0.8,0.15,shipPosition.y));');
  };
  const hullSource=cruiseHullGeometry(),hull=new T.Mesh(metricPaintGeometry(hullSource),hullMat);hullSource.dispose();hull.castShadow=hull.receiveShadow=true;root.add(hull);
  // Tall sheer hull, recessed balcony walls and overhanging deck slabs.
  for(let deck=0;deck<8;deck++) {
    const y=10.6+deck*2.85,length=deck<5?196:178-(deck-5)*18,z=deck<5?3:9+(deck-5)*3,floor=y-1.27;
    capture=deck===0;
    if(deck===0)deckPlate(length+3,32.6,0.28,floor-0.14,z,8);
    deckPlate(length,15.2,2.56,y,z);
    // Keep the closed external glazing envelope solid to drone contacts.
    boxes.at(-1)!.min.x=-13.75;boxes.at(-1)!.max.x=13.75;
    deckPlate(length+3,32.6,0.28,y+1.44,z,8);
    capture=false;
    add(windowRibbon(length+0.14,27.64,1.72,6.07,true),[0,y+0.02,z],glass);
    for(const p of deckOutline(length+0.2,27.7,6.1).getPoints(4)) {
      if(Math.abs(p.y)>length/2-7)rod([p.x,y-0.85,z+p.y],[p.x,y+0.9,z+p.y],0.045,white);
    }
    const start=z-length/2+8,end=z+length/2-8;
    for(const side of [-1,1]) {
      capture=deck===0&&side===1;
      box([0.1,0.43,length-12],[side*13.77,floor+0.215,z],white);
      box([0.1,0.4,length-12],[side*13.77,y+1.08,z],white);
      const flatStart=z-length/2+6,flatEnd=z+length/2-6,lastEdge=start+Math.floor((end-start)/3.5)*3.5;
      aoFloor=floor;aoCabin=lastEdge;aoSide=side;
      for(const [a,b]of [[flatStart,start-0.22],[lastEdge-0.22,flatEnd]])box([0.1,2.56,b-a],[side*13.77,y,(a+b)/2],white);
      box([6.22,2.56,0.08],[side*10.71,y,lastEdge],white,false,0,'partition');
      for(let cabin=start;cabin+3.5<=end;cabin+=3.5) {
        aoFloor=floor;aoCabin=cabin;aoSide=side;capture=deck===0&&side===1&&cabin<=start+3.5;
        box([6.22,2.56,0.08],[side*10.71,y,cabin],white,false,0,'partition');
        box([6.22,0.06,3.42],[side*10.71,floor+0.03,cabin+1.75],teak,false,0,'floor');
        box([0.02,2.49,3.42],[side*7.61,floor+1.305,cabin+1.75],white,false,0,'back');
        box([6.22,0.02,3.42],[side*10.71,floor+2.56,cabin+1.75],white,false,0,'ceiling');
        box([2.4,0.02,3.42],[side*14.96,floor+2.56,cabin+1.75],white,false,0,'balcony');
        box([1.95,0.26,1.3],[side*8.695,floor+0.19,cabin+0.97],teak);
        box([0.12,0.95,1.55],[side*7.65,floor+0.535,cabin+0.97],teak);
        box([1.98,0.22,1.36],[side*8.695,floor+0.43,cabin+0.97],linen,false,0.09);
        for(const offset of [0.65,1.3])box([0.34,0.12,0.54],[side*7.92,floor+0.6,cabin+offset],linen,false,0.045);
        const fabric=quilts[(deck+Math.round((cabin-start)/3.5))%quilts.length];
        box([1.15,0.035,1.38],[side*9.05,floor+0.555,cabin+0.97],fabric);
        box([0.55,0.6,0.48],[side*7.875,floor+0.36,cabin+1.98],teak);
        for(const seat of [cabin+0.8,cabin+2.62]) {
          box([0.72,0.13,0.74],[side*11.8,floor+0.425,seat],fabric,false,0.06);
          box([0.13,0.78,0.74],[side*11.46,floor+0.79,seat],fabric,false,0.06);
          for(const lift of [-0.38,0.38]) {
            box([0.65,0.11,0.09],[side*11.8,floor+0.72,seat+lift],fabric,false,0.04);
            rod([side*12.05,floor+0.49,seat+lift],[side*12.05,floor+0.665,seat+lift],0.015,chrome);
          }
          for(const x of [11.55,12.05])for(const dz of [-0.26,0.26])rod([side*x,floor+0.06,seat+dz],[side*x,floor+0.36,seat+dz],0.02,chrome);
        }
        box([0.55,0.06,0.55],[side*12.35,floor+0.59,cabin+1.75],teak);
        rod([side*12.35,floor+0.06,cabin+1.75],[side*12.35,floor+0.56,cabin+1.75],0.04,chrome);
        const curtainWidth=0.32+0.12*((deck+Math.round((cabin-start)/3.5))%3);
        for(const centre of [cabin+0.22+curtainWidth/2,cabin+3.28-curtainWidth/2]) {
          const folds=new T.PlaneGeometry(curtainWidth,2.44,24,1),positions=folds.attributes.position;
          for(let i=0;i<positions.count;i++)positions.setZ(i,0.025*Math.sin(positions.getX(i)/curtainWidth*Math.PI*12));folds.computeVertexNormals();
          add(folds,[side*13.70,floor+1.28,centre],curtain,new T.Euler(0,side*Math.PI/2,0));
        }
        rod([side*13.705,floor+2.51,cabin+0.22],[side*13.705,floor+2.51,cabin+3.28],0.02,chrome);
        box([0.1,1.72,0.44],[side*13.77,y+0.02,cabin],white,false,0,'front');
        add(new T.PlaneGeometry(3.06,1.72),[side*13.82,y+0.02,cabin+1.75],cabinGlass,new T.Euler(0,side*Math.PI/2,0));
        box([0.1,2.57,0.09],[side*13.85,floor+1.285,cabin],white);
        box([2.1,2.57,0.075],[side*14.85,floor+1.285,cabin],white);
        // Raised jambs, sill and sliding-panel mullion give each cabin depth.
        for(const edge of [0.22,3.28])box([0.24,1.88,0.075],[side*13.94,y+0.02,cabin+edge],white);
        for(const edge of [-0.875,0.915])box([0.24,0.09,3.135],[side*13.94,y+edge,cabin+1.75],white);
        box([0.15,1.72,0.045],[side*13.94,y+0.02,cabin+1.65],chrome);
        rod([side*13.895,y-0.24,cabin+1.52],[side*13.895,y-0.02,cabin+1.52],0.018,chrome);
        for(const lift of [-0.24,-0.02])rod([side*13.815,y+lift,cabin+1.52],[side*13.895,y+lift,cabin+1.52],0.012,chrome);
        box([0.055,1.02,3.32],[side*16.05,floor+0.51,cabin+1.72],balconyGlass);
        rod([side*16.18,floor+1.05,cabin],[side*16.18,floor+1.05,cabin+3.5],0.035);
        // Balcony chairs and table are actual geometry at FPV distance.
        if(deck<5) {box([0.5,0.06,0.5],[side*14.9,floor+0.69,cabin+0.95],teak);rod([side*14.9,floor,cabin+0.95],[side*14.9,floor+0.66,cabin+0.95],0.04);}
      }
      capture=false;
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
  const sternTerraces=buildSternTerraces();for(const part of sternTerraces.parts)add(part.geometry,[0,0,0],part.finish==='paint'?white:part.finish==='teak'?teak:chrome);
  const tender=buildTenderModel(),tenderMaterials={orange,white,glass:cabinGlass,rubber:black,metal:chrome,upholstery:tenderUpholstery},hoists:{line:T.Line3;radius:number}[]=[],nearTender=new T.Vector3();
  const hoist=(a:T.Vector3,b:T.Vector3,radius:number,material:T.MeshStandardMaterial)=>{rod(a.toArray(),b.toArray(),radius,material);hoists.push({line:new T.Line3(a,b),radius});};
  for(const mount of TENDER_MOUNTS) {
    tender.parts.forEach(({geometry,finish})=>add(geometry.clone(),mount.toArray(),tenderMaterials[finish]));
    const side=Math.sign(mount.x);
    for(const hook of tender.hooks) {
      const bottom=hook.clone().add(mount),top=new T.Vector3(mount.x,14.9,bottom.z),base=new T.Vector3(side*14.4,12.2,bottom.z),elbow=new T.Vector3(side*14.4,14.5,bottom.z);
      box([0.55,0.1,0.68],[base.x,12.19,base.z],white,true);
      hoist(base,elbow,0.14,white);hoist(elbow,top,0.14,white);hoist(base,top,0.085,white);hoist(top,bottom,0.027,chrome);
      add(new T.CylinderGeometry(0.16,0.16,0.09,12),top.toArray(),black,new T.Euler(0,0,Math.PI/2));
    }
  }
  const tenderContains=(point:T.Vector3,padding=0.2)=>TENDER_MOUNTS.some(mount=>tender.contains(nearTender.copy(point).sub(mount),padding))||hoists.some(({line,radius})=>{line.closestPointToPoint(point,true,nearTender);return nearTender.distanceToSquared(point)<(radius+padding)**2;});
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
    const pose=cruiseHullSidePose(7.6,z,side),position=pose.point.addScaledVector(pose.normal,0.026);
    const rotation=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),pose.normal));
    add(new T.CylinderGeometry(0.25,0.25,0.06,16),position.toArray(),black,rotation);
  }
  for(const side of [-1,1]) {
    const pose=cruiseHullSidePose(7,-113,side),position=pose.point.addScaledVector(pose.normal,0.035);
    const rotation=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(1,0,0),pose.normal));
    add(new T.BoxGeometry(0.07,2.4,3.3),position.toArray(),navy,rotation);
    const top=cruiseHullSidePose(7.2,-113,side),bottom=cruiseHullSidePose(4.8,-113,side);
    rod(top.point.addScaledVector(top.normal,0.12).toArray(),bottom.point.addScaledVector(bottom.normal,0.12).toArray(),0.1,chrome);
  }
  for(const x of [-5,5])for(const z of [-113,116]) {const y=hullDeckHeight((z+130)/260,260,9)+0.15;add(new T.CylinderGeometry(0.4,0.4,0.9,20),[x,y+0.45,z],chrome);box([1.9,0.12,1.2],[x,y,z],navy);}
  const bakeStarted=performance.now(),ao=bakeCabinOcclusion(blockers,9.33,-87),occlusionBakeMs=performance.now()-bakeStarted;blockers.forEach(g=>g.dispose());white.aoMap=teak.aoMap=ao;white.aoMapIntensity=teak.aoMapIntensity=0.75;
  const furnitureLods:{mesh:T.Mesh;fine:T.BufferGeometry;coarse:T.BufferGeometry}[]=[];
  for(const [m,geometries]of buckets) {
    const geo=mergeGeometries(geometries);if(!geo)throw new Error('Cruise geometry merge failed');const mesh=new T.Mesh(geo,m);mesh.castShadow=m!==cabinGlass;mesh.receiveShadow=true;root.add(mesh);geometries.forEach(g=>g.dispose());
    const low=coarseFurniture.get(m);
    if(low){const coarse=mergeGeometries(low);if(!coarse)throw new Error('Furniture geometry merge failed');low.forEach(g=>g.dispose());furnitureLods.push({mesh,fine:geo,coarse});}
  }
  const setQuality=(quality:string)=>furnitureLods.forEach(({mesh,fine,coarse})=>{mesh.geometry=quality==='balanced'?coarse:fine;});
  const labelCanvas=document.createElement('canvas');labelCanvas.width=1024;labelCanvas.height=128;const ctx=labelCanvas.getContext('2d')!;ctx.fillStyle='#d8dfe0';ctx.font='600 68px Arial';ctx.textAlign='center';ctx.fillText('OCEAN  MERIDIAN',512,87);
  const label=new T.CanvasTexture(labelCanvas);label.colorSpace=T.SRGBColorSpace;
  for(const side of [-1,1])root.add(new T.Mesh(hullNameGeometry(side),new T.MeshStandardMaterial({map:label,transparent:true,depthWrite:false,roughness:0.5})));
  return {root,boxes,paint:[white,hullMat],teak,glazing:cabinGlass,occlusionBakeMs,setQuality,tenderContains,terraceContains:sternTerraces.contains,hoistSegments:hoists};
}
