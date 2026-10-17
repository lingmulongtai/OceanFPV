import * as T from 'three';
import {CoastalForest} from '../../../src/vegetation.ts';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas')});renderer.setSize(32,32);
const lighting=new T.Scene(),sun=new T.DirectionalLight(0xffffff,1);sun.position.set(1,2,3);lighting.add(sun,new T.HemisphereLight());
const relight=CoastalForest.prototype.relight;let published=null,publications=0,queued=false,publishedBeforeChange=false;
CoastalForest.prototype.relight=function(renderer,scene) {
  relight.call(this,renderer,scene);
  if(!queued){queued=true;queueMicrotask(()=> {
    sun.color.set(0xffcf8e);sun.intensity=2;sun.position.set(-3,2,1);
    publishedBeforeChange=published!==null;published?.relight(renderer,lighting);
  });}
};
try {
  const forest=await CoastalForest.load(renderer,[{matrices:[new T.Matrix4()],fallback:[]}],lighting,Promise.resolve(),value=>{published=value;publications++;});
  if(!forest)throw new Error('Forest loading failed');
  const actual=forest.bakeScene.children.find(child=>child.isDirectionalLight);
  const gl=renderer.getContext();
  window.__FOREST_READY_PROBE__={publications,publishedBeforeChange,same:published===forest,intensity:actual.intensity,colour:actual.color.getHex(),direction:actual.position.distanceTo(sun.position),glError:gl.getError()};
} finally {CoastalForest.prototype.relight=relight;renderer.dispose();}
