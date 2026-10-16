import test from 'node:test';
import assert from 'node:assert/strict';
import {hornoyaRangeClient} from '../scripts/fetch-hornoya';
import {HORNOYA_SOURCE} from '../scripts/import-hornoya';

test('range acquisition pins the source and accepts only exact bounded bodies',async()=> {
  const client=hornoyaRangeClient(async(url,options)=> {
    assert.equal(url,HORNOYA_SOURCE.url);assert.equal(new Headers(options?.headers).get('If-Match'),HORNOYA_SOURCE.etag);
    return new Response(new Uint8Array([1,2,3,4]),{status:206,headers:{'Content-Range':`bytes 100-103/${HORNOYA_SOURCE.tileBytes}`,'Content-Length':'4',ETag:HORNOYA_SOURCE.etag}});
  });
  const response=await client.request({headers:{Range:'bytes=100-103'}});
  assert.deepEqual([...new Uint8Array(await response.getData())],[1,2,3,4]);assert.equal(client.evidence.length,1);
  await assert.rejects(client.request({headers:{Range:'bytes=0-608143983'}}),/budget/);
});

test('range acquisition cancels full-file, changed, truncated and oversized responses',async()=> {
  for(const variant of ['full','changed','truncated','oversized']) {
    let cancelled=false;
    const client=hornoyaRangeClient(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(variant==='truncated'?2:variant==='oversized'?5:4));if(variant!=='oversized')controller.close();},cancel(){cancelled=true;}}),{
      status:variant==='full'?200:206,headers:{'Content-Range':`bytes 100-103/${HORNOYA_SOURCE.tileBytes}`,'Content-Length':'4',ETag:variant==='changed'?'different':HORNOYA_SOURCE.etag}
    }));
    await assert.rejects(client.request({headers:{Range:'bytes=100-103'}}),/differs|Truncated|Oversized/);
    if(variant==='oversized')assert.equal(cancelled,true);assert.equal(client.evidence.length,0);
  }
});
