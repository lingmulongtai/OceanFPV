import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SpectralSea,WaveCascade,inverseFFT,installWaveFFT,waveFFTActive} from '../src/spectrum';

async function kernel(){return(await WebAssembly.instantiate(await readFile(new URL('../src/generated/wave-fft.wasm',import.meta.url)),{})).instance.exports;}
const bits=(array:Float32Array)=>new Uint32Array(array.buffer,array.byteOffset,array.byteLength/4);
function sameSea(a:SpectralSea,b:SpectralSea) {
  for(let i=0;i<3;i++) {
    for(const name of ['displacement','tangentX','tangentZ']as const)assert.deepEqual(bits(a.cascades[i][name]),bits(b.cascades[i][name]),`${i} ${name}`);
    for(const name of ['heightVariance','slopeVariance','compressionBound']as const)assert.equal(a.cascades[i][name],b.cascades[i][name],`${i} ${name}`);
  }
  assert.deepEqual(a.heightScales,b.heightScales);assert.deepEqual(a.horizontalScales,b.horizontalScales);
  for(const [x,z]of [[0,0],[-390,-450],[73.125,-810.5],[432.99,97.01],[-5000.25,1900.5]])assert.equal(a.heightAt(x,z,a.heightScales),b.heightAt(x,z,b.heightScales));
}

test('the installed optional kernel preserves full wave fields, foam and contacts through profile changes and rewind',async()=> {
  const exports=await kernel();installWaveFFT(null);const before=new SpectralSea();
  assert.equal(installWaveFFT(exports),true);const after=new SpectralSea();
  try {
    sameSea(before,after);
    for(const [time,scales]of [[0,[.55,.55,.55]],[.04,[.55,.55,.55]],[.2,[1,1,1]],[3,[2.15,2.15,1.15]],[10,[2.15,2.15,1.15]],[100,[2.15,2.15,1.15]],[-3,[1,1,1]],[0,[.55,.55,.55]]]as const) {
      installWaveFFT(null);before.update(time,scales);assert.equal(installWaveFFT(exports),true);after.update(time,scales);assert.equal(waveFFTActive(),true);sameSea(before,after);
    }
    const legacy=Float64Array.from([1,2,3,4]);inverseFFT(legacy,legacy,2);assert.deepEqual([...legacy],[1.6875,-.1875,-.375,0]);
    installWaveFFT(null);const smallBefore=new WaveCascade(64,97,519,.35,4,36,1.3);smallBefore.update(3);
    installWaveFFT(exports);const smallAfter=new WaveCascade(64,97,519,.35,4,36,1.3);smallAfter.update(3);
    assert.deepEqual(bits(smallBefore.displacement),bits(smallAfter.displacement));assert.equal(waveFFTActive(),true);
  }finally {installWaveFFT(null);}
});

test('a trap after earlier accelerated fields preserves the complete update through original JS recovery',async()=> {
  const exports=await kernel(),fft=exports.inverse_fft as (size:number,swaps:number)=>number,ptr=exports.buffer_ptr as (slot:number)=>number,memory=exports.memory as WebAssembly.Memory;let calls=0;
  installWaveFFT(null);const before=new SpectralSea(),after=new SpectralSea();before.update(3,[2.15,2.15,1.15]);
  assert.equal(installWaveFFT({...exports,inverse_fft:(...args:number[])=>{if(++calls===3){new Float64Array(memory.buffer,ptr(0),1)[0]=123;throw new WebAssembly.RuntimeError('partial field witness');}return fft(args[0],args[1]);}}),true);
  try {
    after.update(3,[2.15,2.15,1.15]);assert.equal(calls,3);assert.equal(waveFFTActive(),false);sameSea(before,after);
    before.update(4);after.update(4);sameSea(before,after);assert.equal(calls,3);
  }finally {installWaveFFT(null);}
});
