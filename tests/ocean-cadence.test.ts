import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Ocean} from '../src/ocean';
import {SEA_BANDS} from '../src/sea';

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

test('ocean rendering, contact and mip statistics use the same unequal band profile',()=>{
  const saved=SEA_BANDS.swell;SEA_BANDS.swell=[2.15,2.15,1.15];
  try{
    const ocean=new Ocean(new T.Vector3(0,1,0)),gains=SEA_BANDS.swell;
    ocean.update(6,new T.Vector3(50,20,0),'swell');
    assert.deepEqual(ocean.material.uniforms.heightScales.value.toArray(),gains);
    assert.deepEqual(ocean.material.uniforms.chopScales.value.toArray(),ocean.simulation.horizontalScales);
    assert.equal(ocean.material.uniforms.uniformBands.value,false);
    assert.equal(ocean.heightAt(10000,10000),ocean.simulation.heightAt(10000,10000,gains,()=>1));
    assert.deepEqual(ocean.material.uniforms.slopeVariance.value.toArray(),ocean.simulation.cascades.map((c,i)=>c.slopeVariance*gains[i]**2));
    assert.deepEqual(ocean.material.uniforms.heightVariance.value.toArray(),ocean.simulation.cascades.map((c,i)=>c.heightVariance*gains[i]**2));
    for(let level=0;level<8;level++)for(const [name,field]of [['Energy','energy'],['Cross','crossEnergy']]as const){
      assert.deepEqual(ocean.material.uniforms[`heightMip${name}`].value[level].toArray(),ocean.waveMipmaps.map((f,i)=>f.displacement[field][level]*gains[i]**2));
      assert.deepEqual(ocean.material.uniforms[`slopeMip${name}`].value[level].toArray(),ocean.waveMipmaps.map((f,i)=>(f.tangentX[field][level]+f.tangentZ[field][level])*gains[i]**2));
    }
    const revision=ocean.simulation.profileVersion;SEA_BANDS.swell=[2.15,2.15,.75];ocean.advance(6,'swell');
    assert.equal(ocean.simulation.profileVersion,revision+1);assert.equal(ocean.material.uniforms.heightScales.value.z,.75);
  }finally{SEA_BANDS.swell=saved;}
});

test('local slope moments share render snapshots and respect quality and mip support',()=>{
  const ocean=new Ocean(new T.Vector3(0,1,0)),camera=new T.Vector3(50,20,0),texture=ocean.slopeMoments.texture,initial=texture.version;
  ocean.configureFiltering(false,true);assert.equal(ocean.material.uniforms.localSlopeMomentsEnabled.value,true);
  ocean.advance(6,'swell');assert.equal(texture.version,initial);ocean.update(6,camera,'swell');assert.equal(texture.version,initial+1);
  const encoded=ocean.slopeMoments.data[0],slope=ocean.simulation.cascades[0].tangentX[1];assert.equal(encoded,T.DataUtils.toHalfFloat(slope*slope));
  ocean.update(6,camera,'swell');assert.equal(texture.version,initial+1);
  ocean.advance(6,'calm');ocean.update(6,camera,'calm');assert.equal(texture.version,initial+2);
  ocean.advance(0,'calm');ocean.update(0,camera,'calm');assert.equal(texture.version,initial+3);
  ocean.setQuality('balanced');assert.equal(ocean.material.uniforms.localSlopeMomentsEnabled.value,false);
  ocean.setQuality('ultra');assert.equal(ocean.material.uniforms.localSlopeMomentsEnabled.value,true);
  ocean.configureFiltering(false,false);assert.equal(texture.generateMipmaps,false);assert.equal(ocean.material.uniforms.localSlopeMomentsEnabled.value,false);
  ocean.setQuality('high');assert.equal(ocean.material.uniforms.localSlopeMomentsEnabled.value,false);
  ocean.configureFiltering(false,true);assert.equal(texture.generateMipmaps,true);assert.equal(ocean.material.uniforms.localSlopeMomentsEnabled.value,true);
});
