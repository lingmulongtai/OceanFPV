import * as T from 'three';
import {Ocean} from '../../../src/ocean.ts';

const renderer=new T.WebGLRenderer();renderer.setSize(1,1);document.body.append(renderer.domElement);
if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const ocean=new Ocean(new T.Vector3(0,1,0)),source=ocean.material.fragmentShader,header=source.split('void main()')[0];
// Exercise the actual production main block, including its Fresnel connection.
const start=source.indexOf('vec3 halfV='),end=source.indexOf('float breaking=',start),reflectionStart=source.indexOf('float nv=max(dot(normal,view)'),reflectionEnd=source.indexOf('float distortion=',reflectionStart);
if(start<0||end<start||reflectionStart<0||reflectionEnd<reflectionStart)throw new Error('Missing production ocean lighting block');
const uniforms={...ocean.material.uniforms,probeView:{value:new T.Vector3()},probeNormal:{value:new T.Vector3()},probeVariance:{value:0}};
uniforms.sunColor.value.setRGB(1,1,1);
const material=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`${header}
uniform vec3 probeView,probeNormal;uniform float probeVariance;
void main(){vec3 view=probeView,normal=probeNormal,normalFootprint=vec3(.04,.01,.02);float unresolvedVariance=probeVariance;
${source.slice(reflectionStart,reflectionEnd)}
${source.slice(start,end)}
float response=distribution*masking*.19/max(4.0*nv,.1);
gl_FragColor=vec4(glint.r/response,fresnel,glint.r,1.0);}`});
const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10),target=new T.WebGLRenderTarget(1,1,{type:T.FloatType}),pixel=new Float32Array(4);
scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));camera.position.z=1;
const fresnel=cosine=>.0204+.9796*(1-cosine)**5,samples=[];
let sunError=0,skyError=0,normalSpread=0,peakError=0,changed=0;
for(const [eyeElevation,sunElevation]of [[46,46],[9,9],[5,46],[15,46],[20,9],[35,9]]){
 const e=eyeElevation*Math.PI/180,l=sunElevation*Math.PI/180,view=new T.Vector3(Math.cos(e),Math.sin(e),0),sun=new T.Vector3(-Math.cos(l),Math.sin(l),0),half=view.clone().add(sun).normalize();
 uniforms.probeView.value.copy(view);uniforms.sunDirection.value.copy(sun);const expectedSun=fresnel(view.dot(half)),responses=[];
 for(const [normalIndex,normal]of [new T.Vector3(0,1,0),half,new T.Vector3(0,Math.cos(.3),Math.sin(.3))].entries())for(const variance of [0,.04,.2]){
  uniforms.probeNormal.value.copy(normal);uniforms.probeVariance.value=variance;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
  const expectedSky=fresnel(Math.max(normal.dot(view),.015)),errorSun=Math.abs(pixel[0]-expectedSun),errorSky=Math.abs(pixel[1]-expectedSky);
  if(!pixel.every(Number.isFinite))throw new Error('Non-finite production sun lighting');
  sunError=Math.max(sunError,errorSun);skyError=Math.max(skyError,errorSky);responses.push(pixel[0]);if(Math.abs(expectedSun-expectedSky)>.001)changed++;
  if(normalIndex===1||(normalIndex===0&&eyeElevation===sunElevation))peakError=Math.max(peakError,Math.abs(pixel[0]-pixel[1]));
  samples.push({eyeElevation,sunElevation,normalIndex,variance,normalView:normal.dot(view),normalLight:normal.dot(sun),viewHalf:view.dot(half),actual:[...pixel],expectedSun,expectedSky,errorSun,errorSky});
 }
 normalSpread=Math.max(normalSpread,Math.max(...responses)-Math.min(...responses));
}
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');window.__SUN_GLINT_PROBE__={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',count:samples.length,sunError,skyError,normalSpread,peakError,changed,samples};
