import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {captureReflectedGeometry} from '../src/ocean-reflection';

function setup(){
  const scene=new T.Scene();scene.background=new T.Texture();
  const clear=new T.Color(.2,.3,.4),clears:{color:number[];alpha:number}[]=[];let alpha=.7;
  const renderer={getClearColor:(out:T.Color)=>out.copy(clear),getClearAlpha:()=>alpha,setClearColor:(value:T.ColorRepresentation,next:number)=>{clear.set(value);alpha=next;},clear:()=>clears.push({color:clear.toArray(),alpha})} as unknown as T.WebGLRenderer;
  const state=()=>({background:scene.background,color:clear.toArray(),alpha});return {scene,renderer,state,clears};
}

test('reflection capture restores the exact background and clear state after normal and failed draws',()=>{
  const {scene,renderer,state,clears}=setup(),before=state();
  assert.equal(captureReflectedGeometry(renderer,scene,()=>{assert.deepEqual(state(),{...before,background:null});renderer.clear();assert.deepEqual(clears,[{color:[0,0,0],alpha:0}]);assert.deepEqual(state(),{...before,background:null});return 42;}),42);assert.deepEqual(state(),before);
  assert.throws(()=>captureReflectedGeometry(renderer,scene,()=>{scene.background=new T.Color(.8,.4,.2);renderer.setClearColor(.6,.2);throw new Error('Controlled reflection failure');}),/Controlled reflection failure/);assert.deepEqual(state(),before);
});

test('nested reflection captures restore the outer transparent state before restoring the scene',()=>{
  const {scene,renderer,state}=setup(),before=state();
  captureReflectedGeometry(renderer,scene,()=>{const outer=state();captureReflectedGeometry(renderer,scene,()=>{assert.deepEqual(state(),outer);renderer.setClearColor(0xffffff,.5);});assert.deepEqual(state(),outer);});assert.deepEqual(state(),before);
});

test('transmission clears stay black without changing their logical state or the original clear method',()=>{
  const {scene,renderer,state,clears}=setup(),before=state(),original=renderer.clear;
  captureReflectedGeometry(renderer,scene,()=>{renderer.setClearColor(0xffffff,.5);renderer.clear();assert.deepEqual(clears,[{color:[0,0,0],alpha:0}]);assert.deepEqual(state(),{background:null,color:[1,1,1],alpha:.5});});
  assert.equal(renderer.clear,original);assert.deepEqual(state(),before);renderer.clear();assert.deepEqual(clears[1],{color:before.color,alpha:before.alpha});
});

test('a failing clear restores the logical state and original method',()=>{
  const {scene,renderer,state}=setup(),before=state();renderer.clear=()=>{assert.deepEqual(state(),{background:null,color:[0,0,0],alpha:0});throw new Error('Controlled clear failure');};const original=renderer.clear;
  assert.throws(()=>captureReflectedGeometry(renderer,scene,()=>renderer.clear()),/Controlled clear failure/);assert.deepEqual(state(),before);assert.equal(renderer.clear,original);
});
