import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector4} from 'three';
import {IslandDepth} from '../src/island-depth';
import {bathymetryData,sampleBathymetry,sampleCoastalDepth,COASTS} from '../src/bathymetry';

test('detailed island triangles retain independent slopes, both halves and boundary fallback',()=> {
  const depth=new IslandDepth(1,new Float32Array([1,3,9,5,12,6,8,4,2]),3,new Vector4(100,-80,20,12));
  const lower=depth.sample(102,-78.2)!;
  assert.ok(Math.abs(lower.height-2.6)<1e-12);assert.equal(lower.dx,.2);assert.equal(lower.dz,2/3);
  const upper=depth.sample(108,-75.2)!;
  assert.ok(Math.abs(upper.height-8.8)<1e-12);assert.equal(upper.dx,.7);assert.equal(upper.dz,1.5);
  assert.equal(depth.sample(120,-68)!.height,2);
  for(const [x,z]of [[99.999,-80],[120.001,-68],[110,-80.001],[110,-67.999],[NaN,-70],[110,Infinity]])assert.equal(depth.sample(x,z),null);
  for(const [x,z]of [[102,-78.2],[108,-75.2],[117,-70.4]]) {
    const sample=depth.sample(x,z)!,e=.00001;
    assert.ok(Math.abs(sample.dx-(depth.sample(x+e,z)!.height-depth.sample(x-e,z)!.height)/(2*e))<1e-8);
    assert.ok(Math.abs(sample.dz-(depth.sample(x,z+e)!.height-depth.sample(x,z-e)!.height)/(2*e))<1e-8);
  }
});

test('two detailed islands independently replace their own coarse channel without filling fine valleys',()=> {
  const data=bathymetryData(),northwest=COASTS[0],northeast=COASTS[1];
  for(let i=0;i<data.length;i+=4){data[i]=100;data[i+1]=200;}
  const west=new IslandDepth(0,new Float32Array([-9,-7,-8,-3]),2,new Vector4(northwest.x-600,northwest.z-600,1200,1200));
  const east=new IslandDepth(1,new Float32Array([1,3,5,9]),2,new Vector4(northeast.x-600,northeast.z-600,1200,1200));
  for(const depth of [west,east])for(const [u,v]of [[.2,.3],[.7,.8],[0,0],[1,1]]) {
    const x=depth.bounds.x+u*1200,z=depth.bounds.y+v*1200;
    assert.deepEqual(sampleCoastalDepth(data,x,z,east,west),depth.sample(x,z));
  }
  assert.equal(data[0],100);assert.equal(data[1],200);
  assert.deepEqual(sampleCoastalDepth(data,10000,10000,east,west),{height:-60,dx:0,dz:0});
});

test('explicit depth replacement exposes fine valleys without changing the supplied coarse array',()=> {
  const data=bathymetryData(),coast=COASTS[1];for(let i=1;i<data.length;i+=4)data[i]=30;
  const detail=new IslandDepth(1,new Float32Array([-9,-9,-9,-9]),2,new Vector4(coast.x-600,coast.z-600,1200,1200));
  assert.equal(sampleBathymetry(data,coast.x,coast.z).height,30);
  assert.deepEqual(sampleCoastalDepth(data,coast.x,coast.z,detail),{height:-9,dx:0,dz:0});
  assert.equal(sampleBathymetry(data,coast.x,coast.z).height,30);
  assert.deepEqual(sampleCoastalDepth(data,10000,10000,detail),sampleBathymetry(data,10000,10000));
  assert.throws(()=>new IslandDepth(3,new Float32Array(4),2,new Vector4(0,0,1,1)),/Invalid/);
  assert.throws(()=>new IslandDepth(1,new Float32Array(3),2,new Vector4(0,0,1,1)),/Invalid/);
});
