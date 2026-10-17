import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadCruiseOcclusion} from '../src/cruise-occlusion';
import {CABIN_ATLAS_BYTES} from '../src/occlusion';
import {CRUISE_OCCLUSION} from '../src/generated/cruise-occlusion';

const original=new Uint8Array(await readFile(new URL('../src/generated/cruise-occlusion.rgba',import.meta.url)));
const response=()=>new Response(original.slice());

test('the checked-in atlas reaches texture restoration without changing any byte',async t=>{
  const requests:RequestInit[]=[];
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{requests.push(init);return response();});
  assert.equal(CRUISE_OCCLUSION.byteLength,CABIN_ATLAS_BYTES);
  assert.deepEqual(await loadCruiseOcclusion(),original);assert.equal(requests.length,1);
  assert.equal(requests[0].cache,undefined);assert.ok(requests[0].signal instanceof AbortSignal);
});

for(const failure of ['truncated','same-size corruption','body failure','timeout','server failure'] as const) {
  test(`${failure} retries only once with cache reload before accepting exact bytes`,async t=>{
    const requests:RequestInit[]=[];
    t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
      requests.push(init);if(requests.length>1)return response();
      if(failure==='timeout')throw new DOMException('Controlled deadline','TimeoutError');
      if(failure==='server failure')return new Response(null,{status:503});
      if(failure==='body failure')return {ok:true,arrayBuffer:async()=>{throw new TypeError('Controlled body failure');}};
      const bytes=original.slice();if(failure==='same-size corruption')bytes[100]^=1;
      return new Response(failure==='truncated'?bytes.subarray(0,100):bytes);
    });
    assert.deepEqual(await loadCruiseOcclusion(),original);assert.equal(requests.length,2);
    assert.equal(requests[0].cache,undefined);assert.equal(requests[1].cache,'reload');
    assert.notEqual(requests[0].signal,requests[1].signal);
  });
}

test('permanent missing data returns the CPU fallback without retrying',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:404});});
  assert.equal(await loadCruiseOcclusion(),null);assert.equal(calls,1);
});

test('repeated corruption returns the CPU fallback after two attempts',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;const bytes=original.slice();bytes[100]^=1;return new Response(bytes);});
  assert.equal(await loadCruiseOcclusion(),null);assert.equal(calls,2);
});

test('unavailable integrity verification skips the download and keeps the CPU fallback',async t=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto')!;
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return response();});
  try {
    Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});
    assert.equal(await loadCruiseOcclusion(),null);
  }finally {Object.defineProperty(globalThis,'crypto',descriptor);}
  assert.equal(calls,0);
});
