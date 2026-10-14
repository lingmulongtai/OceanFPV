import * as T from 'three';
import {deckOutline,windowRibbon} from './ship-outline';

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
