import * as T from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/** Rendered reef and contacts share triangles in metres despite its unequal axes. */
export class LighthouseReef {
  readonly x=145;
  readonly z=-135;
  readonly geometry=new T.IcosahedronGeometry(20,2).scale(1.8,0.65,1.35).translate(0,-1,0);
  private readonly tree:MeshBVH;
  private readonly point=new T.Vector3();
  private readonly ray=new T.Ray(new T.Vector3(),new T.Vector3(0.431,0.557,0.709).normalize());
  private readonly topRay=new T.Ray(new T.Vector3(),new T.Vector3(0,-1,0));
  constructor() {
    this.geometry.computeBoundingBox();this.tree=new MeshBVH(this.geometry,{indirect:true});
  }
  /** Highest rendered triangle at world X/Z, or null beyond the reef footprint. */
  topHeight(x:number,z:number) {
    const bounds=this.geometry.boundingBox!,localX=x-this.x,localZ=z-this.z;
    if(localX<bounds.min.x||localX>bounds.max.x||localZ<bounds.min.z||localZ>bounds.max.z)return null;
    this.topRay.origin.set(localX,bounds.max.y+1,localZ);
    return this.tree.raycastFirst(this.topRay,T.DoubleSide)?.point.y??null;
  }
  contains(position:T.Vector3,padding=0.25) {
    const p=this.point.set(position.x-this.x,position.y,position.z-this.z),bounds=this.geometry.boundingBox!;
    if(p.x<bounds.min.x-padding||p.x>bounds.max.x+padding||p.y<bounds.min.y-padding||p.y>bounds.max.y+padding||p.z<bounds.min.z-padding||p.z>bounds.max.z+padding)return false;
    const nearest=this.tree.closestPointToPoint(p,undefined,0,padding);
    if(nearest&&nearest.distance<=padding)return true;
    this.ray.origin.copy(p);const hit=this.tree.raycastFirst(this.ray,T.DoubleSide);
    return !!hit?.face&&hit.face.normal.dot(this.ray.direction)>0;
  }
}
