import * as T from 'three';

export const STERN_TERRACES=Array.from({length:3},(_,tier)=>({width:30-tier*3,depth:9,y:12.04+tier*5.7,z:106-tier*7}));

/** Timber is a thin walking surface above a painted structural slab. */
export function buildSternTerraces() {
  const parts:{geometry:T.BufferGeometry;finish:'paint'|'teak'}[]=[],solids:T.Box3[]=[];
  const box=(size:number[],position:number[],finish:'paint'|'teak')=>{
    const geometry=new T.BoxGeometry(...size as [number,number,number]);geometry.translate(...position as [number,number,number]);parts.push({geometry,finish});
    solids.push(new T.Box3().setFromCenterAndSize(new T.Vector3(...position),new T.Vector3(...size)));
  };
  for(const [tier,deck]of STERN_TERRACES.entries()) {
    box([deck.width,.28,deck.depth],[0,deck.y,deck.z],'paint');
    box([deck.width-.12,.06,deck.depth-.12],[0,deck.y+.17,deck.z],'teak');
    const foot=tier?STERN_TERRACES[tier-1].y+.2:9.28,bottom=deck.y-.14,z=tier?deck.z+3.3:deck.z-3.3;
    for(const side of [-1,1])box([.38,bottom-foot,1.2],[side*(deck.width/2-1.1),(foot+bottom)/2,z],'paint');
  }
  return {parts,solids,contains:(position:T.Vector3,padding=.2)=>solids.some(box=>box.distanceToPoint(position)<=padding)};
}
