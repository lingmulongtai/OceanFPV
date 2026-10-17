import * as T from 'three';
import {World} from '../../../src/world.ts';

const renderer=new T.WebGLRenderer();renderer.setSize(1,1);document.body.append(renderer.domElement);
if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const world=new World(),ocean=world.ocean,source=ocean.material.fragmentShader,header=source.split('void main()')[0],start=source.indexOf('vec3 foamColor='),end=source.indexOf(';',start);
if(start<0||end<start)throw new Error('Missing production foam blend');
const uniforms={...ocean.material.uniforms,probeNormal:{value:new T.Vector3()},probeGrain:{value:0}};
const material=new T.ShaderMaterial({uniforms,defines:ocean.material.defines,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`${header}
uniform vec3 probeNormal;uniform float probeGrain;
void main(){vec3 normal=probeNormal;float filteredGrain=probeGrain;${source.slice(start,end+1)}gl_FragColor=vec4(foamColor,1.0);}`});
const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10),target=new T.WebGLRenderTarget(1,1,{type:T.FloatType}),pixel=new Float32Array(4);
scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));camera.position.z=1;
const generator=new T.PMREMGenerator(renderer),constantScene=new T.Scene(),radiance=new T.Color(.12,.27,.43);constantScene.background=radiance;
const constant=generator.fromScene(constantScene,0,.1,100,{size:16});world.scene.environment=constant.texture;world.scene.environmentIntensity=.6;
const normals=[[0,1,0],[.8,.6,0],[-.8,.6,0],[0,.6,.8],[0,.6,-.8]].map(v=>new T.Vector3(...v)),albedo=[.78,.86,.84],samples=[];
let maximum=0,rotationError=0,environmentSpread=0,lastVersion=-1;
function draw(normal,grain){
 ocean.setLighting(world.scene,world.sunlight,world.hemisphere);
 if(lastVersion!==ocean.material.version){material.needsUpdate=true;lastVersion=ocean.material.version;}
 uniforms.probeNormal.value.copy(normal);uniforms.probeGrain.value=grain;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
 if(!pixel.every(Number.isFinite))throw new Error('Non-finite production foam radiance');return [...pixel].slice(0,3);
}
function check(label,normal,grain,environment){
 const actual=draw(normal,grain),weight=(normal.y+1)/2,cosine=Math.max(0,normal.dot(world.sun)),expected=albedo.map((a,c)=>{
  const sky=world.hemisphere.color.toArray()[c]*world.hemisphere.intensity,ground=world.hemisphere.groundColor.toArray()[c]*world.hemisphere.intensity,sun=world.sunlight.color.toArray()[c]*world.sunlight.intensity;
  return a*(.76+grain*.3)*((sky*weight+ground*(1-weight)+sun*cosine)/Math.PI+environment[c]*world.scene.environmentIntensity);
 });
 const error=Math.max(...actual.map((v,c)=>Math.abs(v-expected[c])));maximum=Math.max(maximum,error);samples.push({label,normal:normal.toArray(),grain,actual,expected,error});
}
for(const preset of ['day','golden','blue']){world.setLight(preset);for(const normal of normals)for(const grain of [0,1])check(preset,normal,grain,radiance.toArray());}
world.sunlight.intensity=0;world.hemisphere.intensity=0;
for(const intensity of [0,.6,1.7]){world.scene.environmentIntensity=intensity;for(const normal of normals)check('constant environment '+intensity,normal,.4,radiance.toArray());}
world.scene.environment=null;world.hemisphere.intensity=.7;for(const normal of normals)check('hemisphere only',normal,.4,[0,0,0]);
world.hemisphere.intensity=0;world.sunlight.intensity=2;for(const normal of normals)check('sun only',normal,.4,[0,0,0]);
world.sunlight.intensity=0;for(const normal of normals)check('unlit',normal,.4,[0,0,0]);
const gradientScene=new T.Scene();gradientScene.add(new T.Mesh(new T.BoxGeometry(10,10,10),new T.ShaderMaterial({side:T.BackSide,vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1);}',fragmentShader:'varying vec3 direction;void main(){vec3 d=normalize(direction);gl_FragColor=vec4(vec3(.4)+vec3(.25*d.x,.2*d.y,.15*d.z),1);}'})));
const gradient=generator.fromScene(gradientScene,0,.1,100,{size:64});world.scene.environment=gradient.texture;world.scene.environmentIntensity=1;
const baseline=normals.map(n=>draw(n,.4));environmentSpread=Math.max(...baseline.map(v=>v[0]))-Math.min(...baseline.map(v=>v[0]));
for(const rotation of [new T.Euler(0,.8,0),new T.Euler(.3,.7,-.2)])for(const normal of normals){
 world.scene.environmentRotation.set(0,0,0);const reference=draw(normal.clone().applyQuaternion(new T.Quaternion().setFromEuler(rotation).invert()),.4);
 world.scene.environmentRotation.copy(rotation);const actual=draw(normal,.4),error=Math.max(...actual.map((v,c)=>Math.abs(v-reference[c])));rotationError=Math.max(rotationError,error);samples.push({label:'rotated environment',rotation:rotation.toArray(),normal:normal.toArray(),actual,expected:reference,error});
}
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');window.__FOAM_LIGHTING_PROBE__={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',count:samples.length,maximum,rotationError,environmentSpread,samples};
