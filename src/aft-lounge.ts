import * as T from 'three';
import {deckOutline,windowRibbon} from './ship-outline';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export const AFT_ROOM={beam:27.64,radius:6.07,height:2.56,glassBottom:.43,glassTop:2.15};

/** Local Y starts at the supporting deck; Z shares the cabin deck's centre. */
export function buildAftLounge(length:number) {
  const outline=deckOutline(length+.14,AFT_ROOM.beam,AFT_ROOM.radius),front=length/2-6,edge=outline.getPoints(12).filter(p=>p.y>=front-1e-7),shape=new T.Shape(edge);
  const parts:{geometry:T.BufferGeometry;finish:'paint'|'teak'|'glass'}[]=[],box=(size:number[],position:number[])=>{const geometry=new T.BoxGeometry(...size as [number,number,number]);geometry.translate(...position as [number,number,number]);parts.push({geometry,finish:'paint'});};
  const floor=new T.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:false,curveSegments:12});floor.rotateX(Math.PI/2);floor.translate(0,.06,0);parts.push({geometry:floor,finish:'teak'});
  const ceiling=floor.clone();ceiling.scale(1,1/3,1);ceiling.translate(0,2.55,0);parts.push({geometry:ceiling,finish:'paint'});
  box([AFT_ROOM.beam,2.56,.12],[0,1.28,front-.06]);
  const pane=windowRibbon(length+.14,AFT_ROOM.beam,1.72,AFT_ROOM.radius,true,'aft');pane.translate(0,1.29,0);parts.push({geometry:pane,finish:'glass'});
  // Short opaque wall segments share the same curved boundary as the glazing.
  for(let i=1;i<edge.length;i++) {
    const a=edge[i-1],b=edge[i],distance=a.distanceTo(b);if(distance<1e-8)continue;
    const rotation=-Math.atan2(b.y-a.y,b.x-a.x),centre=a.clone().add(b).multiplyScalar(.5);
    for(const [bottom,top]of [[0,.43],[2.15,2.56]]){const geometry=new T.BoxGeometry(distance+.004,top-bottom,.12);geometry.rotateY(rotation);geometry.translate(centre.x,(bottom+top)/2,centre.y);parts.push({geometry,finish:'paint'});}
  }
  // Frames at regular arc-length intervals also subdivide the broad flat aft span.
  const framePoints:T.Vector2[]=[edge[0]],spacing=2.3;let travelled=0,next=spacing;
  for(let i=1;i<edge.length;i++){const a=edge[i-1],b=edge[i],distance=a.distanceTo(b);while(next<=travelled+distance){framePoints.push(a.clone().lerp(b,(next-travelled)/distance));next+=spacing;}travelled+=distance;}
  framePoints.push(edge.at(-1)!);for(const p of framePoints)box([.085,1.8,.14],[p.x,1.29,p.y]);
  return {parts,front,edge};
}

/** Upholstered chairs and pedestal tables, all rooted on the 6 cm timber floor. */
export function buildAftLoungeFurniture(length:number) {
  const parts:{geometry:T.BufferGeometry;finish:'fabric'|'teak'|'metal';coarse?:T.BufferGeometry}[]=[],feet:T.Vector3[]=[],front=length/2-6;
  const box=(size:number[],position:number[],finish:'fabric'|'teak'|'metal',radius=0)=>{
    const geometry=radius?new RoundedBoxGeometry(...size as [number,number,number],2,radius):new T.BoxGeometry(...size as [number,number,number]);geometry.translate(...position as [number,number,number]);
    const coarse=finish==='fabric'?new RoundedBoxGeometry(...size as [number,number,number],1,radius):undefined;coarse?.translate(...position as [number,number,number]);parts.push({geometry,finish,coarse});
  };
  for(const centre of [-8,0,8]) {
    for(const side of [-1,1]){
      const x=centre+side,z=front+3.15;
      box([.82,.14,.82],[x,.51,z],'fabric',.06);box([.82,.84,.14],[x,.86,z-.35],'fabric',.06);
      for(const edge of [-1,1]){box([.11,.14,.76],[x+edge*.4,.76,z],'fabric',.045);for(const dz of [-.28,.28]){box([.055,.38,.055],[x+edge*.31,.25,z+dz],'metal');feet.push(new T.Vector3(x+edge*.31,.06,z+dz));}}
    }
    const z=front+4.05,top=new T.CylinderGeometry(.45,.45,.06,24);top.translate(centre,.67,z);parts.push({geometry:top,finish:'teak'});
    const stem=new T.CylinderGeometry(.055,.055,.55,12);stem.translate(centre,.365,z);parts.push({geometry:stem,finish:'metal'});
    const base=new T.CylinderGeometry(.27,.27,.03,20);base.translate(centre,.075,z);parts.push({geometry:base,finish:'metal'});feet.push(new T.Vector3(centre,.06,z));
  }
  return {parts,feet};
}
