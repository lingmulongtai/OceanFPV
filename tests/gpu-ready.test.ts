import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForGpu} from '../src/gpu-ready';

function context(statuses:number[],lost=()=>false) {
  const calls:{name:string;args:unknown[]}[]=[],sync={};
  const gl={SYNC_GPU_COMMANDS_COMPLETE:0x9117,ALREADY_SIGNALED:0x911a,CONDITION_SATISFIED:0x911c,TIMEOUT_EXPIRED:0x911b,
    isContextLost:lost,
    fenceSync:(...args:unknown[])=>{calls.push({name:'fence',args});return sync;},
    flush:()=>{calls.push({name:'flush',args:[]});},
    clientWaitSync:(...args:unknown[])=>{calls.push({name:'wait',args});return statuses.shift();},
    deleteSync:(...args:unknown[])=>{calls.push({name:'delete',args});},
  } as unknown as WebGL2RenderingContext;
  return {gl,calls,sync};
}

test('GPU readiness yields until completion without a blocking wait',async()=> {
  for(const done of [0x911a,0x911c]) {
    const {gl,calls,sync}=context([0x911b,done]);let ready=false;
    const pending=waitForGpu(gl).then(result=>{ready=result;});
    await Promise.resolve();assert.equal(ready,false);
    assert.deepEqual(calls.map(call=>call.name),['fence','flush']);
    await pending;assert.equal(ready,true);
    assert.deepEqual(calls.map(call=>call.name),['fence','flush','wait','wait','delete']);
    for(const call of calls.filter(call=>call.name==='wait'))assert.deepEqual(call.args,[sync,0,0]);
    assert.deepEqual(calls[0].args,[gl.SYNC_GPU_COMMANDS_COMPLETE,0]);assert.deepEqual(calls.at(-1)!.args,[sync]);
  }
});

test('context loss stops readiness polling and releases its fence',async()=> {
  let lost=false;const {gl,calls}=context([0x911b],()=>lost),pending=waitForGpu(gl);lost=true;
  assert.equal(await pending,false);assert.deepEqual(calls.map(call=>call.name),['fence','flush','delete']);
  const initial=context([],()=>true);assert.equal(await waitForGpu(initial.gl),false);assert.deepEqual(initial.calls,[]);
  const duringAllocation=context([]);duringAllocation.gl.fenceSync=()=>{duringAllocation.gl.isContextLost=()=>true;return null;};
  assert.equal(await waitForGpu(duringAllocation.gl),false);
  const duringWait=context([]);duringWait.gl.clientWaitSync=()=>{duringWait.gl.isContextLost=()=>true;return 0x911d;};
  assert.equal(await waitForGpu(duringWait.gl),false);assert.equal(duringWait.calls.at(-1)!.name,'delete');
});

test('GPU wait and allocation failures reject instead of starting asset deadlines',async()=> {
  const failed=context([0x911d]);await assert.rejects(waitForGpu(failed.gl),/fence failed/);
  assert.equal(failed.calls.at(-1)!.name,'delete');
  const allocation=context([]);allocation.gl.fenceSync=()=>null;
  await assert.rejects(waitForGpu(allocation.gl),/Unable to fence/);assert.deepEqual(allocation.calls,[]);
});
