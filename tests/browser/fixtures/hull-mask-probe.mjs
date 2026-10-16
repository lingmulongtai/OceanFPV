import * as T from 'three';
import {Ocean} from '../../../src/ocean.ts';
import {cruiseHullCode,cruiseHullSection} from '../../../src/cruise-hull.ts';

const renderer=new T.WebGLRenderer();renderer.setSize(1,1);document.body.append(renderer.domElement);
if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const ocean=new Ocean(new T.Vector3(0,1,0)),shader=ocean.material.fragmentShader,start=shader.indexOf('float shape=pow('),last=shader.indexOf('hullCutout=true;',start);
if(start<0||last<start)throw new Error('Production hull mask block missing');
const block=shader.slice(start,last+'hullCutout=true;'.length),uniforms={probeU:{value:0},probeX:{value:0},probeWidth:{value:17},probeVessel:{value:0}};
const material=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`${cruiseHullCode}
uniform float probeU,probeX,probeWidth;uniform int probeVessel;
void main(){float u=probeU,width=probeWidth;int i=probeVessel;vec2 local=vec2(probeX,0);bool hullCutout=false;float result=0.0;
if(u>0.0&&u<1.0){${block}result=shape*width;}gl_FragColor=vec4(result,hullCutout?1.0:0.0,0,1);}`});
const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10),target=new T.WebGLRenderTarget(1,1,{type:T.FloatType}),pixel=new Float32Array(4);scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));camera.position.z=1;
let widthError=0,aftWidthError=0,maskErrors=0;const samples=[],byVessel=Array.from({length:2},()=>({widthError:0,witness:null}));
const legacy=(u,width,transom)=>{let shape=Math.pow(Math.max(Math.sin(u*3.14159),.001),.42);if(transom&&u>.78)shape=T.MathUtils.lerp(shape,.72,T.MathUtils.smoothstep(u,.78,1));return width*shape;};
const positions=[-.01,0,.001,.01,.5,.78,.9,.94,.96,.98,.99,.999,1,1.01,...Array.from({length:128},(_,i)=>(i+.5)/128)];
for(const [vessel,width]of [[0,17],[1,3.3]])for(const value of positions){
 const u=Math.fround(value),active=u>0&&u<1,expected=active?(vessel===0?cruiseHullSection((u-.5)*260).width:legacy(u,width,vessel===1)):0;
 uniforms.probeU.value=u;uniforms.probeVessel.value=vessel;uniforms.probeWidth.value=width;
 for(const side of [-1,1])for(const offset of [-.005,.005]){
  const x=Math.fround(side*(expected*.98+offset));uniforms.probeX.value=x;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
  const error=Math.abs(pixel[0]-expected),mask=active&&Math.abs(x)<expected*.98; widthError=Math.max(widthError,error);if((pixel[1]>.5)!==mask)maskErrors++;
  if(error>byVessel[vessel].widthError)byVessel[vessel]={widthError:error,witness:{u,expected,actual:pixel[0]}};
  if(vessel===0&&u>.5)aftWidthError=Math.max(aftWidthError,error);
  samples.push({vessel,u,x,error,expectedMask:mask,actualMask:pixel[1]>.5});
 }
}
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');window.__HULL_MASK_PROBE__={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',count:samples.length,widthError,aftWidthError,maskErrors,byVessel};
