import * as T from 'three';

export const STERN_TERRACES=Array.from({length:3},(_,tier)=>({width:30-tier*3,depth:9,y:12.04+tier*5.7,z:106-tier*7}));

/** Timber is a thin walking surface above a painted structural slab. */
export function buildSternTerraces() {
  const parts:{geometry:T.BufferGeometry;finish:'paint'|'teak'|'metal'}[]=[],solids:T.Box3[]=[],rails:{line:T.Line3;radius:number}[]=[],near=new T.Vector3(),bounds=new T.Box3();
  const box=(size:number[],position:number[],finish:'paint'|'teak')=>{
    const geometry=new T.BoxGeometry(...size as [number,number,number]);geometry.translate(...position as [number,number,number]);parts.push({geometry,finish});
    solids.push(new T.Box3().setFromCenterAndSize(new T.Vector3(...position),new T.Vector3(...size)));
  };
  const rod=(a:T.Vector3,b:T.Vector3,radius:number,finish:'paint'|'metal')=>{
    const geometry=new T.CylinderGeometry(radius,radius,a.distanceTo(b),12),rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());
    geometry.applyMatrix4(new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),rotation,new T.Vector3(1,1,1)));parts.push({geometry,finish});rails.push({line:new T.Line3(a,b),radius});
  };
  for(const [tier,deck]of STERN_TERRACES.entries()) {
    box([deck.width,.28,deck.depth],[0,deck.y,deck.z],'paint');
    box([deck.width-.12,.06,deck.depth-.12],[0,deck.y+.17,deck.z],'teak');
    const foot=tier?STERN_TERRACES[tier-1].y+.2:9.28,bottom=deck.y-.14,z=tier?deck.z+3.3:deck.z-3.3;
    const supportX=tier?deck.width/2-1.1:12.4;
    for(const side of [-1,1])box([.38,bottom-foot,1.2],[side*supportX,(foot+bottom)/2,z],'paint');
    const floor=deck.y+.2,x=deck.width/2-.14,front=deck.z-deck.depth/2+.14,aft=deck.z+deck.depth/2-.14,posts=new Map<string,T.Vector3>();
    const railing=(a:T.Vector3,b:T.Vector3)=>{
      for(const lift of [.55,1.05])rod(a.clone().add(new T.Vector3(0,lift,0)),b.clone().add(new T.Vector3(0,lift,0)),lift===1.05?.032:.022,'metal');
      const count=Math.ceil(a.distanceTo(b)/1.5);for(let i=0;i<=count;i++){const point=a.clone().lerp(b,i/count);posts.set(`${point.x},${point.z}`,point);}
    };
    for(const side of [-1,1])railing(new T.Vector3(side*x,floor,front),new T.Vector3(side*x,floor,aft));
    railing(new T.Vector3(-x,floor,aft),new T.Vector3(x,floor,aft));
    for(const point of posts.values())rod(point,point.clone().add(new T.Vector3(0,1.05,0)),.028,'paint');
  }
  for(const part of parts){part.geometry.computeBoundingBox();bounds.union(part.geometry.boundingBox!);}
  return {parts,solids,rails,bounds,contains:(position:T.Vector3,padding=.2)=>{
    if(bounds.distanceToPoint(position)>padding)return false;
    return solids.some(box=>box.distanceToPoint(position)<=padding)||rails.some(({line,radius})=>{line.closestPointToPoint(position,true,near);return near.distanceToSquared(position)<=(radius+padding)**2;});
  }};
}
