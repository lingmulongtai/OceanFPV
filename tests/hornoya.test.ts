import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {hornoyaHeight,HORNOYA_SIZE,HORNOYA_HEIGHT} from '../src/hornoya';
import {terrainHeight,terrainSurfaceHeight,terrainSlope} from '../src/terrain';
import {COASTS,bathymetryData,sampleBathymetry} from '../src/bathymetry';

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

test('northeastern coast and uploaded green depth channel share the measured Hornoya grid',()=> {
  const coast=COASTS[1],data=bathymetryData();assert.equal(coast.profile,'hornoya');assert.equal(coast.x,800);assert.equal(coast.z,-900);assert.equal(coast.size*2.4,1200);
  for(let z=0;z<193;z++)for(let x=0;x<193;x++) {
    const px=-600+x*6.25,pz=-600+z*6.25,height=hornoyaHeight(px,pz);assert.equal(data[(z*193+x)*4+1],Math.fround(height));
    if(height>0)assert.ok(Math.hypot(coast.x+px,coast.z+pz)+Math.SQRT2*6.25<1900,'all positive terrain cells must be reachable inside the flight boundary');
  }
  for(const [ix,iz]of [[96,64],[80,64],[80,80],[96,96],[100,120],[62,106]])for(const [u,v]of [[.2,.3],[.7,.8]]) {
    const x=-600+(ix+u)*6.25,z=-600+(iz+v)*6.25,sample=sampleBathymetry(data,coast.x+x,coast.z+z);
    assert.ok(Math.abs(sample.height-terrainSurfaceHeight(x,z,500,67,'hornoya'))<.000005);
    const e=.0001;
    assert.ok(Math.abs(sample.dx-(terrainSurfaceHeight(x+e,z,500,67,'hornoya')-terrainSurfaceHeight(x-e,z,500,67,'hornoya'))/(2*e))<.000001);
    assert.ok(Math.abs(sample.dz-(terrainSurfaceHeight(x,z+e,500,67,'hornoya')-terrainSurfaceHeight(x,z-e,500,67,'hornoya'))/(2*e))<.000001);
  }
});
