import * as T from 'three';
import {Ocean} from '../../../src/ocean.ts';
const renderer=new T.WebGLRenderer();renderer.setSize(1,1);document.body.append(renderer.domElement);
if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const ocean=new Ocean(new T.Vector3(0,1,0)),header=ocean.material.fragmentShader.split('void main()')[0];
const lighting=new T.Scene(),sun=new T.DirectionalLight(),hemisphere=new T.HemisphereLight(),generator=new T.PMREMGenerator(renderer),constantScene=new T.Scene();
const radiance=[.125,.25,.5],body=[.1,.2,.3];constantScene.background=new T.Color(...radiance);
const environment=generator.fromScene(constantScene,0,.1,100,{size:16});lighting.environment=environment.texture;
const uniforms={...ocean.material.uniforms,probeView:{value:new T.Vector3()},probeDistance:{value:0},probeDusk:{value:0}};
const main='uniform vec3 probeView;uniform float probeDistance,probeDusk;void main(){gl_FragColor=vec4(seaAerialPerspective(vec3(.1,.2,.3),probeView,probeDistance,probeDusk),1.0);}';
const analytical=header.replace('#include <cube_uv_reflection_fragment>','vec4 textureCubeUV(sampler2D environment,vec3 direction,float roughness){return vec4(vec3(.4)+vec3(.25,.2,.15)*normalize(direction),1.0);}');
const material=source=>new T.ShaderMaterial({uniforms,defines:ocean.material.defines,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:source+main});
lighting.backgroundIntensity=1;lighting.environmentIntensity=.13;ocean.setLighting(lighting,sun,hemisphere);
const analyticalMaterial=material(analytical),realMaterial=material(header),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10),mesh=new T.Mesh(new T.PlaneGeometry(2,2),analyticalMaterial),target=new T.WebGLRenderTarget(1,1,{type:T.FloatType}),pixel=new Float32Array(4),samples=[];
scene.add(mesh);camera.position.z=1;let analyticalError=0,constantError=0;
function check(label,view,distance,horizon) {
  uniforms.probeView.value.set(...view);uniforms.probeDistance.value=distance;
  renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
  if(!pixel.every(Number.isFinite))throw new Error('Non-finite aerial perspective');
  const transmission=Math.exp(-distance*.0001),expected=body.map((value,c)=>value*transmission+horizon[c]*(1-transmission)),actual=[...pixel].slice(0,3),error=Math.max(...actual.map((value,c)=>Math.abs(value-expected[c])));
  if(label==='real PMREM')constantError=Math.max(constantError,error);else analyticalError=Math.max(analyticalError,error);
  samples.push({label,view,distance,actual,expected,error});
}
const views=[[-.8,.6,0],[.8,.6,0],[0,.6,-.8],[0,.6,.8],[0,1,0]];
for(const rotation of [new T.Euler(),new T.Euler(0,.8,0),new T.Euler(.3,.7,-.2)])for(const intensity of [.4,1.7]) {
  lighting.backgroundRotation.copy(rotation);lighting.environmentRotation.set(-.6,.2,.4);lighting.backgroundIntensity=intensity;ocean.setLighting(lighting,sun,hemisphere);
  for(const view of views) {
    const ray=new T.Vector3(-view[0],.002,-view[2]).normalize().applyQuaternion(new T.Quaternion().setFromEuler(rotation).invert()),horizon=ray.toArray().map((value,c)=>(.4+[.25,.2,.15][c]*value)*intensity);
    for(const distance of [0,1000,100000])check('analytical direction',view,distance,horizon);
  }
}
uniforms.hasFoamEnvironment.value=false;
for(const dusk of [0,.55,.85]) {uniforms.probeDusk.value=dusk;const horizon=[.45,.62,.72].map((value,c)=>value*(1-dusk)+[.62,.45,.32][c]*dusk);for(const distance of [0,1000,100000])check('legacy fallback',views[0],distance,horizon);}
mesh.material=realMaterial;lighting.backgroundRotation.set(0,.8,0);
for(const intensity of [.4,1.7]) {
  lighting.backgroundIntensity=intensity;ocean.setLighting(lighting,sun,hemisphere);
  for(const view of views)for(const distance of [0,1000,100000])check('real PMREM',view,distance,radiance.map(value=>value*intensity));
}
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');window.__OCEAN_HAZE_PROBE__={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',count:samples.length,analyticalError,constantError,glError:gl.getError(),samples};
