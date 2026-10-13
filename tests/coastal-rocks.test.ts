import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import { CoastalRockShape,coastalRockSites,normaliseRockGeometry } from '../src/rocks';
import { COASTS } from '../src/bathymetry';
import { terrainSlope,terrainSurfaceHeight } from '../src/terrain';

const directory=new URL('../public/models/rock_07/',import.meta.url);
const gltf=JSON.parse(readFileSync(new URL('rock_07_4k.gltf',directory),'utf8'));
const binary=readFileSync(new URL('rock_07.bin',directory));
function capturedGeometry() {
  const geometry=new T.BufferGeometry(),primitive=gltf.meshes[0].primitives[0];
  const attribute=(index:number,components:number)=> {
    const a=gltf.accessors[index],view=gltf.bufferViews[a.bufferView],offset=(view.byteOffset??0)+(a.byteOffset??0),Constructor=a.componentType===5123?Uint16Array:Float32Array;
    return new T.BufferAttribute(new Constructor(binary.buffer,binary.byteOffset+offset,a.count*components).slice(),components);
  };
  for(const [name,semantic,size]of [['position','POSITION',3],['normal','NORMAL',3],['uv','TEXCOORD_0',2],['color','COLOR_0',4]]as const)geometry.setAttribute(name,attribute(primitive.attributes[semantic],size));
  geometry.setIndex(attribute(primitive.indices,1));return geometry;
}
test('captured rock keeps photographed seams, index and normals under rigid normalisation',()=> {
  const source=capturedGeometry(),geometry=normaliseRockGeometry(source),size=geometry.boundingBox!.getSize(new T.Vector3());
  assert.equal(geometry.index!.count/3,14844);assert.deepEqual(geometry.index!.array,source.index!.array);
  assert.deepEqual(geometry.attributes.uv.array,source.attributes.uv.array);assert.deepEqual(geometry.attributes.color.array,source.attributes.color.array);
  assert.ok(Math.abs(size.x-3.2027696)<1e-5);assert.ok(Math.abs(size.y-1.4372015)<1e-5);assert.ok(Math.abs(size.z-1.6888191)<1e-5);assert.ok(Math.abs(geometry.boundingBox!.min.y)<1e-6);
  for(let i=0;i<source.attributes.normal.count;i++) {
    const expected=new T.Vector3().fromBufferAttribute(source.attributes.normal,i).applyAxisAngle(new T.Vector3(0,1,0),Math.PI/2),actual=new T.Vector3().fromBufferAttribute(geometry.attributes.normal,i);
    assert.ok(expected.distanceTo(actual)<1e-6);
  }
  const indices=geometry.index!.array.slice();new CoastalRockShape(geometry);assert.deepEqual(geometry.index!.array,indices);
});
test('actual rock contacts include its closed interior and surface but leave nearby air free',()=> {
  const shape=new CoastalRockShape(normaliseRockGeometry(capturedGeometry())),placement=shape.place({x:15,z:-4,scale:3,yaw:1.7},()=>2);
  const hit=shape.tree.raycastFirst(new T.Ray(new T.Vector3(0,3,0),new T.Vector3(0,-1,0)),T.DoubleSide)!;assert.ok(hit);
  const normal=hit.face!.normal,at=(offset:number)=>hit.point.clone().addScaledVector(normal,offset).applyMatrix4(placement.matrix);
  assert.equal(shape.contains(at(-0.1),placement,0.01),true);
  assert.equal(shape.contains(at(0.05),placement,0.25),true);assert.equal(shape.contains(at(0.2),placement,0.25),false);
  assert.equal(shape.contains(new T.Vector3(30,3,-4),placement),false);
  // A leaf can pass BVH pruning yet return a triangle beyond the 0.25 m margin.
  assert.equal(shape.contains(new T.Vector3(13.78405149,2.70148343,0.84103536),placement),false);
});
test('all coastal placements preserve scale and settle into rendered terrain rather than floating',()=> {
  const shape=new CoastalRockShape(normaliseRockGeometry(capturedGeometry())),point=new T.Vector3();let count=0;
  for(const coast of COASTS)for(const site of coastalRockSites(coast)) {
    const {scale}=site;
    const ground=(x:number,z:number)=>terrainSurfaceHeight(x-coast.x,z-coast.z,coast.size,coast.height),placement=shape.place(site,ground);
    assert.ok(ground(site.x,site.z)>=-2&&ground(site.x,site.z)<=14);assert.ok(terrainSlope(site.x-coast.x,site.z-coast.z,coast.size,coast.height)<=Math.PI/4.5);
    const scales=new T.Vector3().setFromMatrixScale(placement.matrix);assert.ok(scales.distanceTo(new T.Vector3().setScalar(scale))<1e-6);
    const gaps=shape.feet.map(foot=>{point.copy(foot).applyMatrix4(placement.matrix);return point.y-ground(point.x,point.z);});
    const embed=shape.geometry.boundingBox!.getSize(new T.Vector3()).y*scale*0.2;
    assert.ok(Math.abs(Math.min(...gaps)+embed)<1e-5);assert.ok(Number.isFinite(placement.bounds.min.y));assert.ok(placement.bounds.max.y-ground(site.x,site.z)>0.3);count++;
  }
  assert.equal(count,270);
});
