import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {hornoyaHeight,HORNOYA_SIZE,HORNOYA_HEIGHT} from '../src/hornoya';
import {terrainHeight,terrainSurfaceHeight,terrainSlope} from '../src/terrain';

test('Hornoya runtime preserves source witnesses, extent and submerged boundaries',()=> {
  assert.equal(HORNOYA_SIZE,500);assert.equal(HORNOYA_HEIGHT,67);
  for(const [x,z,height]of [[0,-200,14.466],[-100,-200,55.538],[-100,-100,47.28],[0,0,14.69],[25,150,5.382],[-212.5,62.5,66.984]]) {
    assert.ok(Math.abs(hornoyaHeight(x,z)-height)<.000005);
    assert.equal(terrainHeight(x,z,500,67,'hornoya'),hornoyaHeight(x,z));
  }
  for(let i=0;i<=192;i++)for(const [x,z]of [[-600,i*6.25-600],[600,i*6.25-600],[i*6.25-600,-600],[i*6.25-600,600]])assert.equal(hornoyaHeight(x,z),-9);
  for(const [x,z]of [[-600.001,0],[600.001,0],[0,-600.001],[0,600.001],[NaN,0],[0,Infinity]])assert.equal(hornoyaHeight(x,z),-9);
});

test('Hornoya contact height and slope match rays against both mesh triangle halves',()=> {
  const geometry=new T.PlaneGeometry(1200,1200,192,192).rotateX(-Math.PI/2),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,hornoyaHeight(p.getX(i),p.getZ(i)));
  geometry.computeVertexNormals();const material=new T.MeshBasicMaterial(),mesh=new T.Mesh(geometry,material);let count=0;
  for(const [ix,iz]of [[96,64],[80,64],[80,80],[96,96],[100,120],[62,106]])for(const [u,v]of [[.2,.3],[.7,.8]]) {
    const x=-600+(ix+u)*6.25,z=-600+(iz+v)*6.25,hit=new T.Raycaster(new T.Vector3(x,100,z),new T.Vector3(0,-1,0)).intersectObject(mesh)[0];assert.ok(hit);
    assert.ok(Math.abs(terrainSurfaceHeight(x,z,500,67,'hornoya')-hit.point.y)<.00003);
    assert.ok(Math.abs(terrainSlope(x,z,500,67,'hornoya')-Math.acos(Math.min(1,hit.face!.normal.y)))<.000002);count++;
  }
  assert.equal(count,12);geometry.dispose();material.dispose();
});
