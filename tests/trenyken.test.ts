import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {trenykenHeight,trenykenDepthData,TRENYKEN_SIZE,TRENYKEN_HEIGHT,TRENYKEN_SEGMENTS} from '../src/trenyken';
import {terrainHeight,terrainSurfaceHeight,terrainSegments} from '../src/terrain';
import {bathymetryData,COASTS,sampleCoastalDepth} from '../src/bathymetry';
import {IslandDepth} from '../src/island-depth';

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

test('northwestern placement is reachable, retains coarse vertices and exposes native fine relief to water',()=> {
  const coast=COASTS[0],data=bathymetryData(),heights=trenykenDepthData(),bounds=new T.Vector4(coast.x-600,coast.z-600,1200,1200),detail=new IslandDepth(0,heights,769,bounds);
  assert.deepEqual([coast.x,coast.z,coast.size,coast.profile],[-730,-490,500,'trenyken']);
  for(let z=0;z<769;z++)for(let x=0;x<769;x++) {
    const h=heights[z*769+x];if(h>0)assert.ok(Math.hypot(bounds.x+x*1.5625,bounds.y+z*1.5625)+Math.SQRT2*1.5625<1900);
    if(x%4===0&&z%4===0)assert.equal(data[((z/4)*193+x/4)*4],h);
  }
  for(const [cx,cz]of [[260,350],[450,390],[580,350],[385,487]])for(const [u,v]of [[.2,.3],[.7,.8]]) {
    const x=-600+(cx+u)*1.5625,z=-600+(cz+v)*1.5625;
    const bottom=sampleCoastalDepth(data,x+coast.x,z+coast.z,null,detail);
    assert.ok(Math.abs(bottom.height-terrainSurfaceHeight(x,z,500,143,'trenyken'))<1e-5);
  }
});
