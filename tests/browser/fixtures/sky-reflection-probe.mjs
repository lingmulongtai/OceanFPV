import * as T from 'three';
import {Ocean} from '../../../src/ocean.ts';
import {captureReflectedGeometry} from '../../../src/ocean-reflection.ts';
import {Reflector} from 'three/addons/objects/Reflector.js';

const renderer=new T.WebGLRenderer();renderer.setSize(1,1);document.body.append(renderer.domElement);
if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const ocean=new Ocean(new T.Vector3(0,1,0)),source=ocean.material.fragmentShader,header=source.split('void main()')[0];
// An analytical environment isolates the production direction, roughness and composition.
// The full-scene test separately compiles the actual PMREM sampler on the native GPU.
const analytical=header.replace('#include <cube_uv_reflection_fragment>',`uniform bool probeRoughness;
vec4 textureCubeUV(sampler2D environment,vec3 direction,float roughness){return vec4(probeRoughness?vec3(roughness):vec3(.4)+.2*normalize(direction),1.0);}`);
const planar=new T.DataTexture(new Float32Array(4),1,1,T.RGBAFormat,T.FloatType);planar.needsUpdate=true;
const uniforms={...ocean.material.uniforms,mirrorSampler:{value:planar},probeRoughness:{value:false},probeView:{value:new T.Vector3()},probeNormal:{value:new T.Vector3()},probeCoordinate:{value:new T.Vector2()},probeVariance:{value:0}};
const material=new T.ShaderMaterial({uniforms,defines:ocean.material.defines,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`${analytical}
uniform vec3 probeView,probeNormal;uniform vec2 probeCoordinate;uniform float probeVariance;
void main(){gl_FragColor=vec4(seaReflection(probeView,probeNormal,probeVariance,vec3(.04,.01,.02),probeCoordinate,0.0),1.0);}`});
const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10),target=new T.WebGLRenderTarget(1,1,{type:T.FloatType}),pixel=new Float32Array(4),samples=[];
scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));camera.position.z=1;
const lightingScene=new T.Scene(),sun=new T.DirectionalLight(),hemisphere=new T.HemisphereLight();
const generator=new T.PMREMGenerator(renderer),constantScene=new T.Scene();constantScene.background=new T.Color(.2,.4,.6);lightingScene.environment=generator.fromScene(constantScene,0,.1,100,{size:16}).texture;
let maximum=0;
const read=()=>{renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);if(!pixel.every(Number.isFinite))throw new Error('Non-finite reflection');return [...pixel].slice(0,3);};
for(const rotation of [new T.Euler(),new T.Euler(0,.8,0),new T.Euler(.3,.7,-.2)])for(const intensity of [.4,1.7])for(const [view,normal]of [[[.8,.6,0],[0,1,0]],[[0,.6,.8],[.6,.8,0]],[[0,1,0],[0,.8,.6]]])for(const alpha of [0,.35,1]){
 lightingScene.backgroundRotation.copy(rotation);lightingScene.environmentRotation.set(-.6,.2,.4);lightingScene.backgroundIntensity=intensity;lightingScene.environmentIntensity=.13;ocean.setLighting(lightingScene,sun,hemisphere);
 uniforms.probeView.value.set(...view);uniforms.probeNormal.value.set(...normal);uniforms.probeCoordinate.value.set(.4,.6);
 const object=[.7,.2,.1],data=planar.image.data;for(let c=0;c<3;c++)data[c]=object[c]*alpha;data[3]=alpha;planar.needsUpdate=true;
 const cosine=view.reduce((sum,v,i)=>sum+v*normal[i],0),direction=new T.Vector3(...normal.map((n,i)=>2*cosine*n-view[i])).applyQuaternion(new T.Quaternion().setFromEuler(rotation).invert()),sky=direction.toArray().map(v=>(.4+.2*v)*intensity);
 for(const [label,coordinate,enabled]of [['inside',[.4,.6],true],['outside',[-.2,.6],true],['fallback',[.4,.6],false]]){
  uniforms.probeCoordinate.value.set(...coordinate);uniforms.hasFoamEnvironment.value=enabled;
  const expected=enabled?(label==='outside'?sky:sky.map((v,i)=>v*(1-alpha)+object[i]*alpha)):object.map(v=>v*alpha),actual=read(),error=Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])));maximum=Math.max(maximum,error);samples.push({label,rotation:rotation.toArray(),intensity,alpha,actual,expected,error});
 }
}
uniforms.hasFoamEnvironment.value=true;uniforms.probeRoughness.value=true;uniforms.probeCoordinate.value.set(.5,.5);planar.image.data.fill(0);planar.needsUpdate=true;uniforms.skyReflectionIntensity.value=1;
for(const variance of [0,.04,.2]){uniforms.probeVariance.value=variance;const expected=Math.sqrt(Math.sqrt(.12**4+Math.min(.2,variance+.15*(.04**2+.01**2+.02**2)))),actual=read(),error=Math.max(...actual.map(v=>Math.abs(v-expected)));maximum=Math.max(maximum,error);samples.push({label:'roughness',variance,actual,expected,error});}

// Verify real framebuffer alpha; RGB is already weighted and must not be multiplied twice.
const background=new T.Color(.2,.4,.6),objectColor=new T.Color(.7,.2,.1),captureScene=new T.Scene();captureScene.background=background;
const mesh=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({color:objectColor,transparent:true,opacity:.35}));captureScene.add(mesh);
const capture=()=>{renderer.setRenderTarget(target);renderer.render(captureScene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);return [...pixel];};
const reference=capture(),objects=captureReflectedGeometry(renderer,captureScene,capture),composite=objects.slice(0,3).map((v,c)=>v+background.toArray()[c]*(1-objects[3]));
const alphaError=Math.abs(objects[3]-.35),compositeError=Math.max(...composite.map((v,c)=>Math.abs(v-reference[c])));
mesh.material=new T.MeshPhysicalMaterial({color:0xffffff,transmission:.94,thickness:.012,roughness:.055,ior:1.5});captureScene.environment=lightingScene.environment;
const glassReference=capture(),glassObjects=captureReflectedGeometry(renderer,captureScene,capture),glassComposite=glassObjects.slice(0,3).map((v,c)=>v+background.toArray()[c]*(1-glassObjects[3])),glassError=Math.max(...glassComposite.map((v,c)=>Math.abs(v-glassReference[c])));
// A real nested reflection inside a transmission pass must preserve renderer state.
const mirror=new Reflector(new T.PlaneGeometry(2,2),{textureWidth:16,textureHeight:16,multisample:0}),reflect=mirror.onBeforeRender;
mirror.onBeforeRender=function(renderer,scene,...args){captureReflectedGeometry(renderer,scene,()=>reflect.call(this,renderer,scene,...args));};captureScene.add(mirror);mesh.position.z=.4;mesh.material.side=T.DoubleSide;
renderer.setClearColor(new T.Color(.17,.23,.31),1);const clearMethod=renderer.clear,beforeClear=renderer.getClearColor(new T.Color()).toArray(),beforeAlpha=renderer.getClearAlpha();capture();
const afterClear=renderer.getClearColor(new T.Color()).toArray(),nestedStateError=Math.max(Math.abs(renderer.getClearAlpha()-beforeAlpha),...afterClear.map((v,c)=>Math.abs(v-beforeClear[c]))),nestedRestored=renderer.clear===clearMethod&&captureScene.background===background;
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');window.__SKY_REFLECTION_PROBE__={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',count:samples.length,maximum,alphaError,compositeError,glassError,glassObjects,glassReference,glassComposite,nestedStateError,nestedRestored,samples};
