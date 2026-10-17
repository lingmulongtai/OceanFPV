import * as T from 'three';
import {Ocean} from '../../../src/ocean.ts';

const renderer=new T.WebGLRenderer();renderer.setSize(1,1);document.body.append(renderer.domElement);
if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const ocean=new Ocean(new T.Vector3(0,1,0)),header=ocean.material.fragmentShader.split('void main()')[0];
const uniforms={point:{value:new T.Vector2()},direction:{value:new T.Vector2(1,0)},length:{value:260},width:{value:17},speed:{value:7},probeTime:{value:60},probeMode:{value:0}};
const material=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`${header}
uniform vec2 point,direction;uniform float length,width,speed,probeTime;uniform int probeMode;
void main(){float c=direction.x,s=direction.y;vec2 local=vec2(c*point.x-s*point.y,s*point.x+c*point.y);
vec2 slope=wakeSlope(local,local.y-length*0.5,width,speed,probeTime,direction);gl_FragColor=probeMode==0?vec4(normalize(vec3(-slope.x,1,-slope.y)),1):vec4(c,s,local);}`});
const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10),target=new T.WebGLRenderTarget(1,1,{type:T.FloatType}),pixel=new Float32Array(4);
scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));camera.position.z=1;
const smooth=(lo,hi,v)=>{const q=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));return q*q*(3-2*q);};
// Independent scalar surface; central differences do not repeat the shader's derivatives.
function height(x,z,{heading,length,width,speed,time}) {
 const c=Math.cos(heading),s=Math.sin(heading),lx=c*x-s*z,a=s*x+c*z-length*.5;if(a<=0)return 0;
 const k=Math.abs(lx)-width-a*.354;
 return .035*Math.exp(-a/80)*smooth(.5,3,speed)*(1-smooth(Math.max(time*speed-2,0),Math.max(time*speed,.01),a))*Math.exp(-k*k/(3+a*.1))*Math.sin(k*1.7-a*.14-time*1.8);
}
let maximum=0,count=0;const witnesses=[];
function sample(x,z,settings) {
 uniforms.point.value.set(x,z);uniforms.direction.value.set(Math.cos(settings.heading),Math.sin(settings.heading));for(const key of ['length','width','speed'])uniforms[key].value=settings[key];uniforms.probeTime.value=settings.time;
 renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
 const e=.0001,expected=new T.Vector3(-(height(x+e,z,settings)-height(x-e,z,settings))/(2*e),1,-(height(x,z+e,settings)-height(x,z-e,settings))/(2*e)).normalize().toArray();
 const error=Math.max(...expected.map((v,i)=>Math.abs(v-pixel[i])));count++;
 if(error>maximum){maximum=error;witnesses.push({x,z,settings,actual:[...pixel],expected,error});}
 if(!Number.isFinite(error)||error>0.00005){
  uniforms.probeMode.value=1;renderer.render(scene,camera);const transform=new Float32Array(4);renderer.readRenderTargetPixels(target,0,0,1,1,transform);
  throw new Error(`Wake slope mismatch ${JSON.stringify({...witnesses.at(-1),transform:[...transform],expectedTransform:[Math.cos(settings.heading),Math.sin(settings.heading),Math.cos(settings.heading)*x-Math.sin(settings.heading)*z,Math.sin(settings.heading)*x+Math.cos(settings.heading)*z]})}`);
 }
 return [...pixel];
}
for(const [length,width]of [[260,17],[28,4.5]])for(const heading of [0,.7,Math.PI/2,-1.1])for(const speed of [0,.5,1.8,7])for(const time of [.5,12,60]){
 for(const aft of [-3,.02,4.7,35,time*speed-1.4,time*speed-.4,time*speed+.1])for(const offset of [-2.2,0,1.7])for(const side of [-1,1]){
  if(Math.abs(aft)<.001)continue;
  const lx=side*(width+Math.max(aft,0)*.354+offset),lz=length*.5+aft,c=Math.cos(heading),s=Math.sin(heading);
  sample(c*lx+s*lz,-s*lx+c*lz,{heading,length,width,speed,time});
 }
}
const settings={heading:0,length:260,width:17,speed:7,time:60},x=17+25*.354+.8,z=130+25;
const right=sample(x,z,settings),left=sample(-x,z,settings),turned=sample(z,-x,{...settings,heading:Math.PI/2});
const symmetryError=Math.max(Math.abs(right[0]+left[0]),Math.abs(right[1]-left[1]),Math.abs(right[2]-left[2]));
const rotationError=Math.max(Math.abs(turned[0]-right[2]),Math.abs(turned[1]-right[1]),Math.abs(turned[2]+right[0]));
if(symmetryError>0.00001||rotationError>0.00001)throw new Error(`Wake symmetry ${symmetryError}, rotation ${rotationError}`);
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
window.__WAKE_SLOPE_PROBE__={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',count,maximum,symmetryError,rotationError,witnesses};
