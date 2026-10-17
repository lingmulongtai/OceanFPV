import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inverseFFT} from '../src/spectrum';

test('the authored f64 kernel retains source provenance and exact finite FFT results',async()=> {
  const bytes=await readFile(new URL('../src/generated/wave-fft.wasm',import.meta.url));
  const manifest=JSON.parse(await readFile(new URL('../src/generated/wave-fft.json',import.meta.url),'utf8'));
  const hash=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
  assert.equal(bytes.length,manifest.byteLength);assert.equal(hash(bytes),manifest.sha256);
  assert.equal(hash(await readFile(new URL('../scripts/wave-fft.rs',import.meta.url))),manifest.sourceSHA256);
  const module=await WebAssembly.compile(bytes);assert.deepEqual(WebAssembly.Module.imports(module),[]);
  const {exports}=await WebAssembly.instantiate(module,{});
  const memory=exports.memory as WebAssembly.Memory,ptr=exports.buffer_ptr as (slot:number)=>number;
  const fft=exports.inverse_fft as (size:number,swaps:number)=>number;
  assert.equal(memory.buffer.byteLength,manifest.memoryBytes);
  const actualReal=new Float64Array(memory.buffer,ptr(0),16384),actualImaginary=new Float64Array(memory.buffer,ptr(1),16384);
  const wr=new Float64Array(memory.buffer,ptr(2),127),wi=new Float64Array(memory.buffer,ptr(3),127),swaps=new Uint32Array(memory.buffer,ptr(4),128);
  for(const n of [2,4,8,16,32,64,128]) {
    const permutation:number[]=[];
    for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)permutation.push(i,j);}
    swaps.set(permutation);let offset=0;
    for(let length=2;length<=n;length*=2)for(let j=0;j<length/2;j++){const angle=2*Math.PI*j/length;wr[offset]=Math.cos(angle);wi[offset++]=Math.sin(angle);}
    for(const scale of [0,1,1e-150,1e-310,1e150]) {
      const real=Float64Array.from({length:n*n},(_,i)=>Math.sin(i*37.1)*scale),imaginary=Float64Array.from(real,(_,i)=>-Math.cos(i*13.7)*scale);
      actualReal.set(real);actualImaginary.set(imaginary);inverseFFT(real,imaginary,n);assert.equal(fft(n,permutation.length),1);
      assert.deepEqual(new Uint32Array(memory.buffer,ptr(0),n*n*2),new Uint32Array(real.buffer),`real n${n} scale${scale}`);
      assert.deepEqual(new Uint32Array(memory.buffer,ptr(1),n*n*2),new Uint32Array(imaginary.buffer),`imaginary n${n} scale${scale}`);
    }
  }
  assert.equal(fft(1,0),0);assert.equal(fft(256,0),0);assert.equal(fft(128,129),0);
  assert.throws(()=>memory.grow(1),RangeError);
});
