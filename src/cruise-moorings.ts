import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MeshBVH} from 'three-mesh-bvh';

/** Bases follow the actual timber triangles; both fittings use the same pose. */
export function buildCruiseMoorings(foredeck:T.BufferGeometry,aftTop:number) {
  const parts:{geometry:T.BufferGeometry;finish:'base'|'metal'}[]=[],supports:{point:T.Vector3;normal:T.Vector3;pose:T.Matrix4}[]=[];
  const material=new T.MeshBasicMaterial(),deck=new T.Mesh(foredeck,material),down=new T.Vector3(0,-1,0),up=new T.Vector3(0,1,0);
  deck.updateMatrixWorld(true);
  for(const x of [-5,5])for(const z of [-113,116]) {
    const hit=z<0?new T.Raycaster(new T.Vector3(x,20,z),down).intersectObject(deck)[0]:null;
    if(z<0&&!hit)throw new Error('Mooring base has no foredeck support');
    const point=hit?.point.clone()??new T.Vector3(x,aftTop,z),normal=hit?.face?.normal.clone()??up.clone();
    const pose=new T.Matrix4().compose(point,new T.Quaternion().setFromUnitVectors(up,normal),new T.Vector3(1,1,1));supports.push({point,normal,pose});
    parts.push({geometry:new T.BoxGeometry(1.9,.12,1.2).translate(0,.06,0).applyMatrix4(pose),finish:'base'});
    parts.push({geometry:new T.CylinderGeometry(.4,.4,.9,20).translate(0,.57,0).applyMatrix4(pose),finish:'metal'});
  }
  material.dispose();
  const contact=mergeGeometries(parts.map(part=>part.geometry));if(!contact)throw new Error('Mooring contact merge failed');
  return {parts,supports,contacts:createMooringContacts(contact)};
}

/** Keep an independent mesh so batching/disposal cannot change the contacts. */
function createMooringContacts(geometry:T.BufferGeometry) {
  geometry.computeBoundingBox();const bounds=geometry.boundingBox!.clone(),tree=new MeshBVH(geometry,{indirect:true});
  const pathBounds=new T.Box3(),expanded=new T.Box3(),path=new T.Line3(),hit=new T.Vector3(),ray=new T.Ray(),insideRay=new T.Ray(new T.Vector3(),new T.Vector3(.431,.557,.709).normalize());
  const contains=(point:T.Vector3,padding:number)=>{
    const closest=tree.closestPointToPoint(point,undefined,0,padding);if(closest&&closest.distance<=padding)return true;
    insideRay.origin.copy(point);const crossing=tree.raycastFirst(insideRay,T.DoubleSide);return !!(crossing?.face&&crossing.face.normal.dot(insideRay.direction)>0);
  };
  return (position:T.Vector3,previous=position,padding=.2)=>{
    pathBounds.makeEmpty().expandByPoint(position).expandByPoint(previous);expanded.copy(bounds).expandByScalar(padding);
    if(!pathBounds.intersectsBox(expanded))return false;
    if(contains(position,padding)||contains(previous,padding))return true;
    const distanceSquared=position.distanceToSquared(previous);if(!distanceSquared)return false;
    path.start.copy(previous);path.end.copy(position);ray.origin.copy(previous);ray.direction.copy(position).sub(previous).normalize();
    return tree.shapecast({
      intersectsBounds:box=>{expanded.copy(box).expandByScalar(padding);return pathBounds.intersectsBox(expanded);},
      intersectsTriangle:triangle=>{
        if(ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,hit)&&hit.distanceToSquared(previous)<=distanceSquared)return true;
        return triangle.closestPointToSegment(path)<=padding;
      },
    });
  };
}
