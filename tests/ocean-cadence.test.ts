import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Ocean} from '../src/ocean';

test('water contacts advance on simulation ticks while render mipmaps rebuild once per draw',()=> {
  const ocean=new Ocean(new T.Vector3(0,1,0)),camera=new T.Vector3(50,20,0),refresh=ocean.refreshFields.bind(ocean);let builds=0;
  ocean.refreshFields=()=>{builds++;refresh();};
  const texture=ocean.material.uniforms.displacement0.value,version=texture.version,initialHeight=ocean.heightAt(10000,10000);
  for(const time of [6,6.05,6.1])ocean.advance(time,'breeze');
  assert.equal(builds,0);assert.equal(texture.version,version);assert.equal(ocean.simulation.time,6.1);
  const height=ocean.heightAt(10000,10000);assert.ok(Number.isFinite(height));assert.notEqual(height,initialHeight);
  ocean.update(6.1,camera,'breeze');assert.equal(builds,1);assert.ok(texture.version>version);
  assert.equal(ocean.heightAt(10000,10000),height);
  assert.equal(ocean.waveMipmaps[0].displacement.levels[0].data,ocean.simulation.cascades[0].displacement);
  ocean.update(6.1,camera,'breeze');assert.equal(builds,1);
  ocean.advance(6.1,'swell');assert.equal(builds,1);ocean.update(6.1,camera,'swell');assert.equal(builds,2);
  assert.equal(ocean.material.uniforms.heightMipEnergy.value[0].x,ocean.waveMipmaps[0].displacement.energy[0]*2.15**2);
  ocean.advance(0,'swell');ocean.update(0,camera,'swell');assert.equal(builds,3);
  ocean.update(0,camera,'swell');assert.equal(builds,3);
});
