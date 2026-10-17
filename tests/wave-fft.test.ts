import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inverseFFT} from '../src/spectrum';
import {createWaveFFT} from '../src/wave-fft';

function plan() {
  const n=128,swaps:number[]=[],stages=[];
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)swaps.push(i,j);}
  for(let length=2;length<=n;length*=2){const real=new Float64Array(length/2),imaginary=new Float64Array(length/2);for(let j=0;j<length/2;j++){const angle=2*Math.PI*j/length;real[j]=Math.cos(angle);imaginary[j]=Math.sin(angle);}stages.push({length,real,imaginary});}
  return{swaps:Uint32Array.from(swaps),stages};
}
async function kernel(){return(await WebAssembly.instantiate(await readFile(new URL('../src/generated/wave-fft.wasm',import.meta.url)),{})).instance.exports;}
const field=()=>Float64Array.from({length:128*128},(_,i)=>Math.sin(i*37.1));

test('fixed128 adapter retains exact bits with copy-in/out and disjoint shared buffers',async()=> {
  const fft=createWaveFFT(await kernel(),plan());assert.ok(fft);
  for(const scale of [0,1,1e-310,1e150]) {
    const storage=new Float64Array(2*128*128),real=storage.subarray(0,128*128),imaginary=storage.subarray(128*128);
    real.set(field().map(v=>v*scale));imaginary.set(field().map(v=>-v*scale));
    const a=real.slice(),b=imaginary.slice();inverseFFT(a,b,128);assert.equal(fft(real,imaginary,128),true);
    assert.deepEqual(new Uint32Array(real.buffer,real.byteOffset,real.length*2),new Uint32Array(a.buffer));
    assert.deepEqual(new Uint32Array(imaginary.buffer,imaginary.byteOffset,imaginary.length*2),new Uint32Array(b.buffer));
  }
});

test('overlap, unsupported fields and unsafe plans preserve original input for fallback',async()=> {
  const exports=await kernel(),fft=createWaveFFT(exports,plan());assert.ok(fft);
  const storage=Float64Array.from({length:128*128+1},(_,i)=>i),before=storage.slice();
  assert.equal(fft(storage.subarray(0,-1),storage.subarray(1),128),false);assert.deepEqual(storage,before);
  assert.equal(fft(storage.subarray(0,-1),storage.subarray(0,-1),128),false);assert.deepEqual(storage,before);
  const a=field(),b=field(),saved=a.slice();assert.equal(fft(a,b,64),false);assert.deepEqual(a,saved);
  assert.equal(fft(a.subarray(1),b,128),false);assert.deepEqual(a,saved);
  const invalid=plan();invalid.swaps[0]=128;assert.equal(createWaveFFT(exports,invalid),null);
  const twiddles=plan();twiddles.stages[0].real[0]=NaN;assert.equal(createWaveFFT(exports,twiddles),null);
  assert.equal(createWaveFFT({} as WebAssembly.Exports,plan()),null);
  assert.equal(createWaveFFT({...exports,buffer_ptr:()=>0},plan()),null);
  assert.equal(createWaveFFT({...exports,buffer_ptr:()=>2097152},plan()),null);
});

test('a partial kernel trap or memory replacement disables acceleration without changing caller data',async()=> {
  for(const failure of ['trap','reject','grow']as const) {
    const exports=await kernel(),memory=exports.memory as WebAssembly.Memory,ptr=exports.buffer_ptr as (slot:number)=>number;let calls=0;
    const fft=createWaveFFT({...exports,inverse_fft:()=>{calls++;new Float64Array(memory.buffer,ptr(0),1)[0]=123;if(failure==='trap')throw new WebAssembly.RuntimeError('witness');return 0;}},plan());assert.ok(fft);
    const a=field(),b=field(),saved=a.slice();if(failure==='grow')memory.grow(0);
    assert.equal(fft(a,b,128),false);assert.deepEqual(a,saved);assert.deepEqual(b,saved);
    assert.equal(fft(a,b,128),false);assert.deepEqual(a,saved);assert.deepEqual(b,saved);
    assert.equal(calls,failure==='grow'?0:1);
  }
});
