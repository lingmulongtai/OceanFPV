import * as T from 'three';

/** One closed perimeter supplies both visible rods and finite swept contacts. */
export function buildSundeckGuards(floor:number) {
  const segments:{line:T.Line3;radius:number}[]=[],posts=new Map<string,T.Vector3>();
  const corners=[[-14,-53],[14,-53],[14,80],[-14,80]].map(([x,z])=>new T.Vector3(x,floor,z));
  for(let side=0;side<corners.length;side++) {
    const a=corners[side],b=corners[(side+1)%corners.length];
    for(const [lift,radius]of [[.55,.025],[1.05,.04]]) {
      const rise=new T.Vector3(0,lift,0);segments.push({line:new T.Line3(a.clone().add(rise),b.clone().add(rise)),radius});
    }
    const count=Math.ceil(a.distanceTo(b)/2.2);
    for(let i=0;i<=count;i++){const point=a.clone().lerp(b,i/count);posts.set(`${point.x},${point.z}`,point);}
  }
  for(const point of posts.values())segments.push({line:new T.Line3(point,point.clone().add(new T.Vector3(0,1.05,0))),radius:.04});
  const bounds=new T.Box3();for(const {line,radius}of segments){bounds.expandByPoint(line.start.clone().addScalar(-radius));bounds.expandByPoint(line.start.clone().addScalar(radius));bounds.expandByPoint(line.end.clone().addScalar(-radius));bounds.expandByPoint(line.end.clone().addScalar(radius));}
  const sweepBounds=new T.Box3(),expandedBounds=new T.Box3(),ray=new T.Ray(),near=new T.Vector3(),onRay=new T.Vector3();
  return {segments,contacts:(position:T.Vector3,previous=position,padding=.2)=>{
    sweepBounds.makeEmpty().expandByPoint(position).expandByPoint(previous);expandedBounds.copy(bounds).expandByScalar(padding);
    if(!sweepBounds.intersectsBox(expandedBounds))return false;
    const distanceSquared=position.distanceToSquared(previous);ray.origin.copy(previous);ray.direction.copy(position).sub(previous).normalize();
    for(const {line,radius}of segments) {
      const reach=(radius+padding)**2;
      line.closestPointToPoint(position,true,near);if(near.distanceToSquared(position)<=reach)return true;
      if(distanceSquared===0)continue;
      const separation=ray.distanceSqToSegment(line.start,line.end,onRay);
      if(separation<=reach&&onRay.distanceToSquared(previous)<=distanceSquared)return true;
    }
    return false;
  }};
}
