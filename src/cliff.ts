import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';

/** An open scan blocks motion across its surface without inventing an interior. */
export class CliffSurface {
  readonly tree:MeshBVH;
  readonly bounds:T.Box3;
  private readonly ray=new T.Ray();
  private readonly segment=new T.Box3();
  constructor(readonly geometry:T.BufferGeometry) {
    geometry.computeBoundingBox();this.bounds=geometry.boundingBox!.clone();
    this.tree=new MeshBVH(geometry,{indirect:true});
  }
  contacts(position:T.Vector3,previous=position,padding=0.25) {
    this.segment.setFromPoints([previous,position]).expandByScalar(padding);
    if(!this.bounds.intersectsBox(this.segment))return false;
    const nearest=this.tree.closestPointToPoint(position,undefined,0,padding);
    if(nearest&&nearest.distance<=padding)return true;
    this.ray.origin.copy(previous);this.ray.direction.copy(position).sub(previous);const length=this.ray.direction.length();
    if(length>0){this.ray.direction.divideScalar(length);if(this.tree.raycastFirst(this.ray,T.DoubleSide,0,length))return true;}
    // Segment-to-edge and endpoint distances additionally catch grazing contact.
    const line=new T.Line3(previous,position);
    return this.tree.shapecast({intersectsBounds:box=>box.intersectsBox(this.segment),intersectsTriangle:triangle=>triangle.closestPointToSegment(line)<=padding});
  }
  topHeight(x:number,z:number) {
    if(x<this.bounds.min.x||x>this.bounds.max.x||z<this.bounds.min.z||z>this.bounds.max.z)return null;
    this.ray.origin.set(x,this.bounds.max.y+1,z);this.ray.direction.set(0,-1,0);
    return this.tree.raycastFirst(this.ray,T.DoubleSide)?.point.y??null;
  }
}

/** Trace the physical boundary across captured UV/normal seams without altering source faces. */
export function cliffBoundary(geometry:T.BufferGeometry) {
  const position=geometry.attributes.position,index=geometry.index;
  if(!position||!index)throw new Error('Cliff boundary requires indexed positions');
  const welded=new Uint32Array(position.count),representatives:number[]=[],positions=new Map<string,number>();
  for(let i=0;i<position.count;i++) {
    const key=`${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;let id=positions.get(key);
    if(id===undefined){id=representatives.length;positions.set(key,id);representatives.push(i);}welded[i]=id;
  }
  const width=representatives.length,edges=new Map<number,number>();
  for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++) {
    const a=welded[index.getX(i+j)],b=welded[index.getX(i+(j+1)%3)];
    if(a===b)throw new Error('Cliff has a collapsed physical edge');
    const key=Math.min(a,b)*width+Math.max(a,b),direction=a<b?1:-1,previous=edges.get(key);
    if(previous===undefined)edges.set(key,direction);
    else {if(previous===0||previous===direction)throw new Error('Cliff has non-manifold or inconsistent edges');edges.set(key,0);}
  }
  const next=new Map<number,number>();
  for(const [key,direction]of edges)if(direction!==0) {
    const low=Math.floor(key/width),high=key-low*width,a=direction>0?low:high,b=direction>0?high:low;
    if(next.has(a))throw new Error('Cliff boundary branches');next.set(a,b);
  }
  if(next.size===0)throw new Error('Cliff has no open boundary');
  const start=next.keys().next().value!,loop:number[]=[],seen=new Set<number>();let at=start;
  do {
    if(seen.has(at)||!next.has(at))throw new Error('Cliff boundary does not form a loop');
    seen.add(at);loop.push(representatives[at]);at=next.get(at)!;
  }while(at!==start);
  if(loop.length!==next.size)throw new Error('Cliff has multiple open boundaries');
  return {vertices:loop,weldedVertices:width};
}
