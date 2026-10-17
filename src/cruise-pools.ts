import * as T from 'three';

export const POOL_CENTRES=[7,37];
export const POOL={beam:9,length:17,innerBeam:7.67,innerLength:15.67,bottom:.12,water:1.22,rim:1.4};

/** Tanks sit above the existing timber; no hidden cut through the cabins below. */
export function buildCruisePools(floor:number) {
  const parts:{geometry:T.BufferGeometry;finish:'paint'|'tile'|'metal';kind:'base'|'wall'|'lining'|'step'|'ladder'}[]=[],solids:T.Box3[]=[],rails:{line:T.Line3;radius:number}[]=[],water:T.Box3[]=[],surfaces:T.BufferGeometry[]=[];
  for(const centre of POOL_CENTRES) {
    const box=(size:[number,number,number],p:[number,number,number],finish:typeof parts[number]['finish'],kind:typeof parts[number]['kind'])=>{
      const position=new T.Vector3(p[0],floor+p[1],centre+p[2]),geometry=new T.BoxGeometry(...size);geometry.translate(position.x,position.y,position.z);
      if(finish==='tile'){
        const a=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
        for(let i=0;i<a.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.9?a.getZ(i):a.getX(i))/.15,(Math.abs(n.getY(i))>.9?a.getZ(i):a.getY(i))/.15);
      }
      parts.push({geometry,finish,kind});solids.push(new T.Box3().setFromCenterAndSize(position,new T.Vector3(...size)));
    };
    box([9,.10,17],[0,.05,0],'paint','base');box([7.7,.02,15.7],[0,.11,0],'tile','lining');
    for(const side of [-1,1]) {
      box([.65,1.4,15.7],[side*4.175,.7,0],'paint','wall');box([9,1.4,.65],[0,.7,side*8.175],'paint','wall');
      box([.015,1.24,15.7],[side*3.8425,.74,0],'tile','lining');box([7.67,1.24,.015],[0,.74,side*7.8425],'tile','lining');
      // Six treads plus the coping landing give seven equal 20 cm rises.
      for(let step=1;step<=6;step++)box([3,step*.2,.3],[0,step*.1,side*(8.5+(6.5-step)*.3)],'paint','step');
    }
    for(const x of [-.55,.55]) {
      const curve=new T.CatmullRomCurve3([[x,1.4,-8.175],[x,1.98,-8.175],[x,2.1,-7.8],[x,1.8,-7.45],[x,.35,-7.45]].map(p=>new T.Vector3(p[0],floor+p[1],centre+p[2])));
      parts.push({geometry:new T.TubeGeometry(curve,48,.035,10,false),finish:'metal',kind:'ladder'});
      const points=curve.getPoints(48);for(let i=1;i<points.length;i++)rails.push({line:new T.Line3(points[i-1],points[i]),radius:.035});
    }
    for(const lift of [.5,.85,1.2]) {
      const geometry=new T.CylinderGeometry(.025,.025,1.1,12);geometry.rotateZ(Math.PI/2);geometry.translate(0,floor+lift,centre-7.45);
      parts.push({geometry,finish:'metal',kind:'ladder'});rails.push({line:new T.Line3(new T.Vector3(-.55,floor+lift,centre-7.45),new T.Vector3(.55,floor+lift,centre-7.45)),radius:.025});
    }
    const surface=new T.PlaneGeometry(POOL.innerBeam,POOL.innerLength);surface.rotateX(-Math.PI/2);surface.translate(0,floor+POOL.water,centre);surfaces.push(surface);
    water.push(new T.Box3(new T.Vector3(-POOL.innerBeam/2,floor+POOL.bottom,centre-POOL.innerLength/2),new T.Vector3(POOL.innerBeam/2,floor+POOL.water,centre+POOL.innerLength/2)));
  }
  return {parts,surfaces,contact:createPoolContacts(solids,rails,water)};
}

/** Retain only collision data, independently of the construction geometries. */
function createPoolContacts(solids:T.Box3[],rails:{line:T.Line3;radius:number}[],water:T.Box3[]) {
  const bounds=new T.Box3();for(const box of [...solids,...water])bounds.union(box);
  for(const {line,radius}of rails)for(const point of [line.start,line.end]){bounds.expandByPoint(point.clone().addScalar(radius));bounds.expandByPoint(point.clone().addScalar(-radius));}
  const expanded=new T.Box3(),path=new T.Box3(),ray=new T.Ray(),hit=new T.Vector3(),near=new T.Vector3();
  return (position:T.Vector3,previous=position,padding=.2):'structure'|'water'|null=>{
    path.makeEmpty().expandByPoint(position).expandByPoint(previous);expanded.copy(bounds).expandByScalar(padding);if(!path.intersectsBox(expanded))return null;
    const distanceSquared=position.distanceToSquared(previous);ray.origin.copy(previous);ray.direction.copy(position).sub(previous).normalize();
    const touches=(box:T.Box3)=>{expanded.copy(box).expandByScalar(padding);return expanded.containsPoint(position)||expanded.containsPoint(previous)||!!(distanceSquared&&ray.intersectBox(expanded,hit)&&hit.distanceToSquared(previous)<=distanceSquared);};
    if(solids.some(touches))return 'structure';
    for(const {line,radius}of rails){line.closestPointToPoint(position,true,near);if(near.distanceToSquared(position)<=(radius+padding)**2)return 'structure';if(distanceSquared&&ray.distanceSqToSegment(line.start,line.end,hit)<=(radius+padding)**2&&hit.distanceToSquared(previous)<=distanceSquared)return 'structure';}
    return water.some(touches)?'water':null;
  };
}
