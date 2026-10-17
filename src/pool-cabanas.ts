import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export const CABANA_CENTRES=[0,22,46];

/** Original sea-facing seating bays; floor is the actual timber walking height. */
export function buildPoolCabanas(floor:number) {
  const parts:{geometry:T.BufferGeometry;finish:'paint'|'teak'|'metal'|'fabric';solid:T.Box3}[]=[],feet:T.Vector3[]=[];
  for(const side of [-1,1])for(const centre of CABANA_CENTRES) {
    const box=(size:[number,number,number],position:[number,number,number],finish:typeof parts[number]['finish'],radius=0)=>{
      const p=new T.Vector3(side*position[0],floor+position[1],centre+position[2]);
      const geometry=radius?new RoundedBoxGeometry(...size,2,radius):new T.BoxGeometry(...size);geometry.translate(p.x,p.y,p.z);
      parts.push({geometry,finish,solid:new T.Box3().setFromCenterAndSize(p,new T.Vector3(...size))});
    };
    const foot=(x:number,z:number)=>feet.push(new T.Vector3(side*x,floor,centre+z));
    // A thin closed canopy rests on four columns; the ocean-facing side stays open.
    box([4.2,.10,6.4],[10.4,3.15,0],'paint');
    for(const x of [8.6,12.2])for(const z of [-2.8,2.8]){box([.10,3.1,.10],[x,1.55,z],'metal');foot(x,z);}
    for(const x of [8.34,12.46])box([.08,.18,6.4],[x,3.13,0],'paint');
    for(const z of [-3.16,3.16])box([4.04,.18,.08],[10.4,3.13,z],'paint');
    for(const x of [8.65,12.15])box([.12,.14,5.7],[x,3.03,0],'teak');
    for(let z=-2.7;z<=2.7;z+=.45)box([3.5,.045,.065],[10.4,3.0775,z],'teak');
    // Three separate cushions, a continuous back and supported timber base.
    box([1.08,.12,4.12],[9.2,.34,0],'teak');
    for(const x of [8.82,9.58])for(const z of [-1.75,1.75]){box([.07,.28,.07],[x,.14,z],'metal');foot(x,z);}
    box([.17,.8,4.05],[8.75,.73,0],'fabric',.065);
    for(const z of [-1.3,0,1.3]){box([.94,.20,1.23],[9.25,.49,z],'fabric',.075);box([.20,.43,.52],[8.96,.79,z],'fabric',.065);}
    for(const z of [-2.03,2.03])box([1.1,.15,.13],[9.2,.77,z],'teak');
    // Low table leaves a full-height flight corridor in front of the sofa.
    box([1.1,.075,1.5],[10.95,.57,0],'teak');
    for(const x of [10.57,11.33])for(const z of [-.55,.55]){box([.045,.5325,.045],[x,.26625,z],'metal');foot(x,z);}
  }
  const bounds=new T.Box3();for(const {solid}of parts)bounds.union(solid);
  const pathBounds=new T.Box3(),expanded=new T.Box3(),ray=new T.Ray(),hit=new T.Vector3();
  return {parts,feet,contains:(position:T.Vector3,previous=position,padding=.2)=>{
    pathBounds.makeEmpty().expandByPoint(position).expandByPoint(previous);expanded.copy(bounds).expandByScalar(padding);
    if(!pathBounds.intersectsBox(expanded))return false;
    const distanceSquared=position.distanceToSquared(previous);ray.origin.copy(previous);ray.direction.copy(position).sub(previous).normalize();
    for(const {solid}of parts) {
      expanded.copy(solid).expandByScalar(padding);
      if(expanded.containsPoint(position)||expanded.containsPoint(previous))return true;
      if(distanceSquared&&ray.intersectBox(expanded,hit)&&hit.distanceToSquared(previous)<=distanceSquared)return true;
    }
    return false;
  }};
}
