import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as T from 'three';
import {cliffBoundary,CliffSurface} from '../src/cliff';

function plane() {
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));geometry.setIndex([0,1,2,0,2,3]);return geometry;
}
test('open cliff tracing retains source triangles and rejects broken winding',()=> {
  const geometry=plane(),positions=geometry.attributes.position.array.slice(),indices=geometry.index!.array.slice();
  assert.deepEqual(cliffBoundary(geometry).vertices,[0,1,2,3]);
  assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.index!.array,indices);
  geometry.setIndex([0,1,2,0,3,2]);assert.throws(()=>cliffBoundary(geometry),/inconsistent/);
});
test('open cliff contact sweeps both directions and leaves distant air clear',()=> {
  const surface=new CliffSurface(plane()),p=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
  assert.equal(surface.contacts(p(.5,.5,1),p(.5,.5,-1)),true);
  assert.equal(surface.contacts(p(.5,.5,-1),p(.5,.5,1)),true);
  assert.equal(surface.contacts(p(.5,.5,.2)),true);
  assert.equal(surface.contacts(p(.5,.5,.3)),false);
  assert.equal(surface.contacts(p(1.2,1.2,1),p(1.2,1.2,-1)),false);
  assert.equal(surface.contacts(p(1.15,.7,1),p(1.15,.7,-1)),true);
  assert.equal(surface.contacts(p(3,.5,-2),p(3,.5,-1)),false);
  assert.equal(surface.contacts(p(.5,.5,-2)),false);
  const face=new T.BufferGeometry();face.setAttribute('position',new T.Float32BufferAttribute([0,0,0,10,0,0,0,10,0],3));face.setIndex([0,1,2]);
  const wide=new CliffSurface(face);
  assert.equal(wide.contacts(p(3,3,1),p(3,3,-1)),true);
  assert.equal(wide.contacts(p(3,3,-1),p(3,3,1)),true);
  assert.equal(wide.contacts(p(3,3,2),p(3,3,1)),false);
});
test('captured cliff boundary is one physical loop across photographed seams',()=> {
  const root=new URL('../public/models/coastal_cliff_02/',import.meta.url),gltf=JSON.parse(readFileSync(new URL('coastal_cliff_02_4k.gltf',root),'utf8')),binary=readFileSync(new URL('coastal_cliff_02.bin',root)),primitive=gltf.meshes[0].primitives[0],geometry=new T.BufferGeometry();
  const attribute=(id:number,size:number)=>{const a=gltf.accessors[id],view=gltf.bufferViews[a.bufferView],offset=(view.byteOffset??0)+(a.byteOffset??0),Constructor=a.componentType===5125?Uint32Array:Float32Array;return new T.BufferAttribute(new Constructor(binary.buffer,binary.byteOffset+offset,a.count*size),size);};
  geometry.setAttribute('position',attribute(primitive.attributes.POSITION,3));geometry.setIndex(attribute(primitive.indices,1));
  geometry.setAttribute('normal',attribute(primitive.attributes.NORMAL,3));geometry.setAttribute('uv',attribute(primitive.attributes.TEXCOORD_0,2));
  const boundary=cliffBoundary(geometry);assert.equal(boundary.weldedVertices,472771);assert.equal(boundary.vertices.length,2256);assert.equal(new Set(boundary.vertices).size,2256);
  assert.equal(geometry.index!.count/3,943284);assert.equal(geometry.attributes.position.count,482925);
  const indices=geometry.index!.array.slice(),surface=new CliffSurface(geometry),ray=new T.Ray(new T.Vector3(0,4,10),new T.Vector3(0,0,-1));
  const hit=surface.tree.raycastFirst(ray,T.DoubleSide)!;assert.ok(hit);
  const front=hit.point.clone().add(new T.Vector3(0,0,2)),back=hit.point.clone().add(new T.Vector3(0,0,-2));
  assert.equal(surface.contacts(back,front),true);assert.equal(surface.contacts(front,back),true);
  assert.equal(surface.contacts(new T.Vector3(0,4,-6)),false);
  assert.ok((surface.topHeight(0,0)??-1)>7);assert.equal(surface.topHeight(30,0),null);
  assert.deepEqual(geometry.index!.array,indices);
});
