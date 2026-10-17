import test from 'node:test';
import assert from 'node:assert/strict';
import {WaveCascade} from '../src/spectrum';

test('fresh foam fades faster than residual coverage without changing wave tangents',()=>{
  const wave=new WaveCascade(4,16,17,0,1,16),geometry=wave.tangentX.slice();
  // A controlled compressed patch injects foam, then remains flat as it ages.
  for(let i=0;i<wave.tangentX.length;i+=4)wave.tangentX[i]=-.8;
  wave.updateFoam(0,1,1);
  for(let i=0;i<wave.displacement.length;i+=4){assert.equal(wave.displacement[i+3],1);assert.equal(wave.tangentX[i+3],1);wave.tangentX[i]=0;}
  for(let tick=1;tick<=10;tick++)wave.updateFoam(tick*.05,1,1);
  for(let i=0;i<wave.displacement.length;i+=4){
    assert.ok(Math.abs(wave.displacement[i+3]-Math.exp(-.85*.5))<2e-7);
    assert.ok(Math.abs(wave.tangentX[i+3]-Math.exp(-1.6*.5))<2e-7);
    for(let channel=0;channel<3;channel++)assert.equal(wave.tangentX[i+channel],geometry[i+channel]);
  }
  const unchanged=wave.tangentX.slice();wave.updateFoam(.5,1,1);assert.deepEqual(wave.tangentX,unchanged);
});

test('profile changes and rewinds clear both fresh and residual foam before seeding',()=>{
  for(const reset of ['profile','rewind']as const){
    const wave=new WaveCascade(4,16,17,0,1,16);wave.updateFoam(1,1,1);
    for(let i=3;i<wave.displacement.length;i+=4){wave.displacement[i]=1;wave.tangentX[i]=1;}
    wave.updateFoam(reset==='rewind'?.5:1,1,1,reset==='profile');
    for(let i=3;i<wave.displacement.length;i+=4){assert.equal(wave.displacement[i],0);assert.equal(wave.tangentX[i],0);}
  }
});
