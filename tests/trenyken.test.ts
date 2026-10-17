import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {trenykenHeight,trenykenDepthData,TRENYKEN_SIZE,TRENYKEN_HEIGHT,TRENYKEN_SEGMENTS} from '../src/trenyken';
import {terrainHeight,terrainSurfaceHeight,terrainSegments} from '../src/terrain';

test('measured northwest profile keeps rendered triangles and independent depth copies at native scale',()=> {
  assert.equal(terrainSegments('trenyken'),768);assert.equal(TRENYKEN_SEGMENTS,768);assert.equal(TRENYKEN_SIZE*2.4,1200);
  const source=trenykenDepthData(),copy=trenykenDepthData();copy[0]=99;assert.equal(source[0],-9);
  for(const [x,z]of [[-601,0],[0,601],[NaN,0],[0,Infinity]])assert.equal(trenykenHeight(x,z),-9);
  const geometry=new T.PlaneGeometry(1200,1200,768,768).rotateX(-Math.PI/2),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,terrainHeight(p.getX(i),p.getZ(i),TRENYKEN_SIZE,TRENYKEN_HEIGHT,'trenyken'));
  const material=new T.MeshBasicMaterial(),mesh=new T.Mesh(geometry,material);
  for(const [gx,gz]of [[260.2,350.3],[320.8,410.7],[450.25,390.6],[580.8,350.5],[385.35,487.82]]) {
    const x=gx/768*1200-600,z=gz/768*1200-600,ray=new T.Raycaster(new T.Vector3(x,200,z),new T.Vector3(0,-1,0));
    const hit=ray.intersectObject(mesh)[0];assert.ok(hit);
    assert.ok(Math.abs(hit.point.y-terrainSurfaceHeight(x,z,TRENYKEN_SIZE,TRENYKEN_HEIGHT,'trenyken'))<1e-5);
  }
  geometry.dispose();material.dispose();
});
