import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as T from 'three';
import {cliffBoundary} from '../src/cliff';

function plane() {
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));geometry.setIndex([0,1,2,0,2,3]);return geometry;
}
test('open cliff tracing retains source triangles and rejects broken winding',()=> {
  const geometry=plane(),positions=geometry.attributes.position.array.slice(),indices=geometry.index!.array.slice();
  assert.deepEqual(cliffBoundary(geometry).vertices,[0,1,2,3]);
  assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.index!.array,indices);
  geometry.setIndex([0,1,2,0,3,2]);assert.throws(()=>cliffBoundary(geometry),/inconsistent/);
});
test('captured cliff boundary is one physical loop across photographed seams',()=> {
  const root=new URL('../public/models/coastal_cliff_02/',import.meta.url),gltf=JSON.parse(readFileSync(new URL('coastal_cliff_02_4k.gltf',root),'utf8')),binary=readFileSync(new URL('coastal_cliff_02.bin',root)),primitive=gltf.meshes[0].primitives[0],geometry=new T.BufferGeometry();
  const attribute=(id:number,size:number)=>{const a=gltf.accessors[id],view=gltf.bufferViews[a.bufferView],offset=(view.byteOffset??0)+(a.byteOffset??0),Constructor=a.componentType===5125?Uint32Array:Float32Array;return new T.BufferAttribute(new Constructor(binary.buffer,binary.byteOffset+offset,a.count*size),size);};
  geometry.setAttribute('position',attribute(primitive.attributes.POSITION,3));geometry.setIndex(attribute(primitive.indices,1));
  const boundary=cliffBoundary(geometry);assert.equal(boundary.weldedVertices,472771);assert.equal(boundary.vertices.length,2256);assert.equal(new Set(boundary.vertices).size,2256);
  assert.equal(geometry.index!.count/3,943284);assert.equal(geometry.attributes.position.count,482925);
});
