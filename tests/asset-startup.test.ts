import test from 'node:test';import assert from 'node:assert/strict';import type * as T from 'three';
import {World} from '../src/world';import {CoastalCliff} from '../src/coastal-cliff';import {CoastalForest} from '../src/vegetation';import {CoastalRocks} from '../src/rocks';

test('lighting failures reject startup before pending coastal assets finish',async t=>{
  let release!:()=>void;const cliffReady=new Promise<null>(resolve=>{release=()=>resolve(null);});
  t.mock.method(CoastalCliff,'load',()=>cliffReady);t.mock.method(CoastalForest,'load',async()=>null);t.mock.method(CoastalRocks,'load',async()=>null);
  const world=Object.assign(Object.create(World.prototype),{surfaceGroups:[],surfaceFailures:[]}) as World;
  const renderer={capabilities:{getMaxAnisotropy:()=>1}} as unknown as T.WebGLRenderer,error=new Error('Controlled lighting failure');let settled=false;
  const observed=world.loadSurfaceTextures(renderer,()=>Promise.reject(error)).then(()=>assert.fail('Lighting failure was swallowed'),actual=>{assert.equal(actual,error);settled=true;});
  try{await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(settled,true,'Startup must fail before the model download settles');}
  finally{release();await observed;}
});

test('material readiness does not wait for coastal assets and retains missing-model fallback',async t=>{
  let release!:()=>void;const cliffReady=new Promise<null>(resolve=>{release=()=>resolve(null);});
  t.mock.method(CoastalCliff,'load',()=>cliffReady);t.mock.method(CoastalForest,'load',async()=>null);t.mock.method(CoastalRocks,'load',async()=>null);
  const world=Object.assign(Object.create(World.prototype),{surfaceGroups:[],surfaceFailures:[],groundMaterials:[],coastalRockDetail:{map:null},ocean:{material:{uniforms:{seabedMap:{value:null},hasSeabedMap:{value:false}}}}}) as World;
  const renderer={capabilities:{getMaxAnisotropy:()=>1}} as unknown as T.WebGLRenderer;let lightingReady=false,bootSettled=false;
  const boot=world.loadSurfaceTextures(renderer,async textures=>{assert.deepEqual(await textures,[]);lightingReady=true;}).then(missing=>{bootSettled=true;return missing;});
  try{await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(lightingReady,true);assert.equal(bootSettled,false);}
  finally{release();assert.deepEqual(await boot,['coastal cliff','coastal tree','coastal rock']);}
});
