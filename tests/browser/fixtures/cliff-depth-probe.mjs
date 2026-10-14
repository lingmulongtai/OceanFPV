import * as T from 'three';
import {Ocean} from '../../../src/ocean.ts';
import {CliffSurface} from '../../../src/cliff.ts';
import {CliffGround} from '../../../src/cliff-ground.ts';
import {COASTS} from '../../../src/bathymetry.ts';
import {terrainHeight,TERRAIN_SEGMENTS} from '../../../src/terrain.ts';
import {nearshoreEnvelope} from '../../../src/nearshore.ts';

const renderer=new T.WebGLRenderer();renderer.setSize(1,1);document.body.append(renderer.domElement);
if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const source=new T.BufferGeometry();source.setAttribute('position',new T.Float32BufferAttribute([-394,-8,-470,-386,6,-470,-386,6,-430,-394,-8,-430],3));source.setIndex([0,2,1,0,3,2]);
const scan=new CliffSurface(source),coast=COASTS[0],island=new T.PlaneGeometry(coast.size*2.4,coast.size*2.4,TERRAIN_SEGMENTS,TERRAIN_SEGMENTS).rotateX(-Math.PI/2),p=island.attributes.position;
for(let i=0;i<p.count;i++)p.setY(i,terrainHeight(p.getX(i),p.getZ(i),coast.size,coast.height,coast.profile));
const ground=new CliffGround(island,coast),ocean=new Ocean(new T.Vector3(0,1,0));ocean.installIslandDepth(0,ground.geometry,scan);
const uniforms={...ocean.material.uniforms,probePoint:{value:new T.Vector2()}},header=ocean.material.vertexShader.split('uniform mat4 textureMatrix;')[0];
const material=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`${header}\nuniform vec2 probePoint;void main(){vec3 bottom=coastalBottom(probePoint);gl_FragColor=vec4(bottom,nearshoreAt(probePoint).x);}`});
const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10),target=new T.WebGLRenderTarget(1,1,{type:T.FloatType});scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));camera.position.z=1;
let heightError=0,gradientError=0,envelopeError=0;const samples=[],pixel=new Float32Array(4);
for(const x of [-395,-394.2,-393.7,-392.4,-391.3,-390.2,-389.1,-388.3,-387.2,-386.2,-385.8])for(const z of [-471,-469.7,-462.3,-451.4,-441.7,-430.3,-429]) {
 const px=Math.fround(x),pz=Math.fround(z),expected=ocean.bottomAt(px,pz);uniforms.probePoint.value.set(px,pz);renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
 const h=Math.abs(pixel[0]-expected.height),g=Math.max(Math.abs(pixel[1]-expected.dx),Math.abs(pixel[2]-expected.dz)),e=Math.abs(pixel[3]-nearshoreEnvelope(-expected.height).value);
 heightError=Math.max(heightError,h);gradientError=Math.max(gradientError,g);envelopeError=Math.max(envelopeError,e);samples.push({x:px,z:pz,h,g,e});
}
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
window.__CLIFF_DEPTH_PROBE__={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',samples,heightError,gradientError,envelopeError};
