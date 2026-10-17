import * as T from 'three';
import {Ocean} from '../../../src/ocean.ts';
import {cruiseHullCode,cruiseHullGeometry} from '../../../src/cruise-hull.ts';

const renderer=new T.WebGLRenderer();renderer.setSize(1,1);document.body.append(renderer.domElement);
if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const ocean=new Ocean(new T.Vector3(0,1,0)),shader=ocean.material.fragmentShader,start=shader.indexOf('vec3 cruiseLocal='),last=shader.indexOf('float wakeFoam=',start);
const yachtStart=shader.indexOf('float shape=pow('),yachtLast=shader.indexOf('hullCutout=true;',yachtStart);
if(start<0||last<start||yachtStart<last||yachtLast<yachtStart)throw new Error('Production hull mask blocks missing');
const block=shader.slice(start,last),yachtBlock=shader.slice(yachtStart,yachtLast+'hullCutout=true;'.length);
const uniforms={probeU:{value:0},probeX:{value:0},probeWidth:{value:17},probeVessel:{value:0},probeWorld:{value:new T.Vector3()},cruiseInverse:{value:new T.Matrix4()},vessels:{value:[new T.Vector4(),new T.Vector4()]}};
const material=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`${cruiseHullCode}
uniform float probeU,probeX,probeWidth;uniform int probeVessel;uniform vec3 probeWorld;uniform mat4 cruiseInverse;uniform vec4 vessels[2];
void main(){float result=0.0;bool cutout=false;
if(probeVessel==0){vec3 worldPosition=probeWorld;${block}result=cruiseWidth;cutout=hullCutout;}
else{float u=probeU,width=probeWidth;vec2 local=vec2(probeX,0);bool hullCutout=false;
if(u>0.0&&u<1.0){${yachtBlock}result=shape*width;}cutout=hullCutout;}
gl_FragColor=vec4(result,cutout?1.0:0.0,0,1);}`});
const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10),target=new T.WebGLRenderTarget(1,1,{type:T.FloatType}),pixel=new Float32Array(4);scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));camera.position.z=1;
let widthError=0,aftWidthError=0,posedWidthError=0,maskErrors=0,cruiseCount=0;const samples=[],byVessel=Array.from({length:2},()=>({widthError:0,witness:null}));
const legacy=(u,width,transom)=>{let shape=Math.pow(Math.max(Math.sin(u*3.14159),.001),.42);if(transom&&u>.78)shape=T.MathUtils.lerp(shape,.72,T.MathUtils.smoothstep(u,.78,1));return width*shape;};
const positions=[-.01,0,.001,.01,.5,.78,.9,.94,.96,.98,.99,.999,1,1.01,...Array.from({length:128},(_,i)=>(i+.5)/128)];
function sample(vessel,u,x,expected,mask,pose,y) {
 renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
 const error=Math.abs(pixel[0]-expected);widthError=Math.max(widthError,error);if((pixel[1]>.5)!==mask)maskErrors++;
 if(error>byVessel[vessel].widthError)byVessel[vessel]={widthError:error,witness:{u,y,pose,expected,actual:pixel[0]}};
 if(vessel===0&&pose===0&&u>.5)aftWidthError=Math.max(aftWidthError,error);
 if(vessel===0&&pose>0)posedWidthError=Math.max(posedWidthError,error);
 samples.push({vessel,u,x,y,pose,error,expectedMask:mask,actualMask:pixel[1]>.5});
}
// The reference comes from independent rays against the actual Float32 mesh,
// including each triangle's diagonal; it does not repeat the shader's formula.
const hull=new T.Mesh(cruiseHullGeometry(),new T.MeshBasicMaterial({side:T.DoubleSide}));hull.updateMatrixWorld(true);
const poses=[[0,0,0,0,0],[80,.8,220,.4,.03],[-35,-.7,-15000,-.4,-.035],[0,1.1,-15000,0,.04],[0,-.9,220,0,-.04]];
uniforms.probeVessel.value=0;
for(const [pose,values]of poses.entries()) {
 const [x,y,z,yaw,pitch]=values,matrix=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(pitch,yaw,0,'YXZ')),new T.Vector3(1,1,1));
 uniforms.cruiseInverse.value.copy(matrix).invert();
 uniforms.vessels.value[0].set(x,y,z,260);
 const us=pose?[.001,.01,.12,.5,.78,.9,.94,.98,.999]:positions,ys=pose?[-6.5,-3.3601,0,2,7.5]:[-7.01,-7,-6.5,-4.7,-3.3601,-3.36,-3.3599,-2,0,2,7.5,9.3,12];
 for(const u of us)for(const height of ys)for(const side of [-1,1]) {
  const localZ=(u-.5)*260,hit=new T.Raycaster(new T.Vector3(side*30,height,localZ),new T.Vector3(-side,0,0)).intersectObject(hull)[0],expected=hit?Math.abs(hit.point.x):-1;
  for(const offset of [-.005,.005]) {
   const localX=side*(Math.max(expected,0)*.98+offset),local=new T.Vector3(localX,height,localZ);uniforms.probeWorld.value.copy(local).applyMatrix4(matrix);
   sample(0,u,localX,expected,expected>=0&&Math.abs(localX)<expected*.98,pose,height);cruiseCount++;
  }
 }
}
for(const value of positions){
 const vessel=1,width=3.3,u=Math.fround(value),active=u>0&&u<1,expected=active?legacy(u,width,true):0;
 uniforms.probeU.value=u;uniforms.probeVessel.value=vessel;uniforms.probeWidth.value=width;
 for(const side of [-1,1])for(const offset of [-.005,.005]){
  const x=Math.fround(side*(expected*.98+offset));uniforms.probeX.value=x;sample(vessel,u,x,expected,active&&Math.abs(x)<expected*.98,null,null);
 }
}
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');window.__HULL_MASK_PROBE__={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',count:samples.length,cruiseCount,poseCount:poses.length,widthError,aftWidthError,posedWidthError,maskErrors,byVessel,mismatches:samples.filter(s=>s.expectedMask!==s.actualMask)};
