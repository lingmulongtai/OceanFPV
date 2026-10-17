import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadWaveFFT} from '../src/wave-fft-load';

test('optional loading accepts the fixed kernel even with a non-WASM content type',async()=> {
  const fetch=globalThis.fetch,bytes=await readFile(new URL('../src/generated/wave-fft.wasm',import.meta.url));let calls=0;
  globalThis.fetch=async(input,init)=>{calls++;assert.match(String(input),/wave-fft\.wasm\?no-inline$/);assert.ok(init?.signal instanceof AbortSignal);return new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}});};
  try {const exports=await loadWaveFFT();assert.ok(exports?.memory instanceof WebAssembly.Memory);assert.equal(typeof exports?.inverse_fft,'function');assert.equal(calls,1);}
  finally {globalThis.fetch=fetch;}
});

test('HTTP, corrupt bytes, network cancellation and blocked compilation return to JS',async()=> {
  const fetch=globalThis.fetch,instantiate=WebAssembly.instantiate;
  try {
    globalThis.fetch=async()=>new Response(null,{status:404});assert.equal(await loadWaveFFT(),null);
    globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]));assert.equal(await loadWaveFFT(),null);
    globalThis.fetch=async()=>{throw new DOMException('witness','AbortError');};assert.equal(await loadWaveFFT(),null);
    globalThis.fetch=async()=>new Response(new Uint8Array([0,97,115,109,1,0,0,0]));
    WebAssembly.instantiate=(async()=>{throw new WebAssembly.CompileError('CSP witness');}) as typeof WebAssembly.instantiate;
    assert.equal(await loadWaveFFT(),null);
  }finally {globalThis.fetch=fetch;WebAssembly.instantiate=instantiate;}
});

test('a browser without WASM does not request an accelerator',async()=> {
  const fetch=globalThis.fetch,wasm=globalThis.WebAssembly;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('No network request expected');};
  Reflect.set(globalThis,'WebAssembly',undefined);
  try {assert.equal(await loadWaveFFT(),null);assert.equal(calls,0);}
  finally {Reflect.set(globalThis,'WebAssembly',wasm);globalThis.fetch=fetch;}
});
