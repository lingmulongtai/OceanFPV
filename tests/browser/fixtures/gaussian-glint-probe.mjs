import * as T from 'three';
import {anisotropicGlintCode} from '../../../src/anisotropic-glint.ts';

const renderer=new T.WebGLRenderer();renderer.setSize(256,256);document.body.append(renderer.domElement);
const gl=renderer.getContext();if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const uniforms={normal:{value:new T.Vector3(0,1,0)},covariance:{value:new T.Vector3(.04,.08,.02)},view:{value:new T.Vector3(0,1,0)},light:{value:new T.Vector3(0,1,0)},mode:{value:0}};
const material=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`
uniform vec3 normal,covariance,view,light;uniform int mode;
${anisotropicGlintCode}
void main(){
 mat3 frame=slopeNormalFrame(normal);vec3 cov=slopeFrameCovariance(frame,covariance);
 if(mode==0){gl_FragColor=vec4(cov,1.0);return;}
 if(mode==1){
  vec3 v=slopeFrameDirection(frame,view),l=slopeFrameDirection(frame,light),h=normalize(v+l);
  gl_FragColor=vec4(gaussianSlopeDistribution(h,covariance),gaussianSlopeMasking(v,l,covariance),0.0,1.0);return;
 }
 // Independent hemisphere quadrature, rather than sampling a slope-space PDF.
 float theta=gl_FragCoord.x/256.0*1.570796326795,phi=gl_FragCoord.y/256.0*6.28318530718;
 vec3 localHalf=vec3(sin(theta)*cos(phi),cos(theta),sin(theta)*sin(phi));
 vec3 worldHalf=frame*localHalf;
 float value=gaussianSlopeDistribution(slopeFrameDirection(frame,worldHalf),covariance)*dot(normal,worldHalf)*sin(theta);
 gl_FragColor=vec4(value,0.0,0.0,1.0);
}`});
const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10),target=new T.WebGLRenderTarget(256,256,{type:T.FloatType}),pixels=new Float32Array(256*256*4);
scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));camera.position.z=1;
const draw=mode=>{uniforms.mode.value=mode;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);if(!pixels.every(Number.isFinite))throw new Error('Non-finite Gaussian glint');return [...pixels.slice(0,4)];};
const normals=[[0,1,0],[.5,Math.sqrt(.75),0],[Math.SQRT1_2,Math.SQRT1_2,0],[0,Math.sqrt(.75),-.5],[.4,.8,Math.sqrt(.2)]].map(n=>new T.Vector3(...n).normalize());
const covariances=[[.04,.08,.02],[.08,.03,-.015],[.003,.12,.012]];
const frame=n=>{const x=new T.Vector3(n.y,-n.x,0).normalize();return[x,n,new T.Vector3().crossVectors(x,n)];};
const world=(basis,direction)=>basis[0].clone().multiplyScalar(direction.x).addScaledVector(basis[1],direction.y).addScaledVector(basis[2],direction.z);
let covarianceCount=0,covarianceError=0,normalizationCount=0,normalizationError=0,invarianceCount=0,invarianceError=0,smithCount=0,smithError=0,smithModelError=0,backfaceCount=0,backfaceError=0;

for(const n of normals)for(const c of covariances){
 uniforms.normal.value.copy(n);uniforms.covariance.value.set(...c);
 // Differentiate the exact projected slope coordinates numerically on CPU.
 const basis=frame(n),mean=[-n.x/n.y,-n.z/n.y],epsilon=1e-5;
 const projected=s=>{const r=new T.Vector3(-s[0],1,-s[1]);return[-basis[0].dot(r)/n.dot(r),-basis[2].dot(r)/n.dot(r)];};
 const columns=[0,1].map(axis=>{const a=[...mean],b=[...mean];a[axis]+=epsilon;b[axis]-=epsilon;const pa=projected(a),pb=projected(b);return pa.map((v,i)=>(v-pb[i])/(2*epsilon));});
 const j=[[columns[0][0],columns[1][0]],[columns[0][1],columns[1][1]]],product=(a,b)=>a[0]*b[0]*c[0]+a[1]*b[1]*c[1]+(a[0]*b[1]+a[1]*b[0])*c[2];
 const expected=[product(j[0],j[0]),product(j[1],j[1]),product(j[0],j[1])],actual=draw(0);
 covarianceError=Math.max(covarianceError,...expected.map((v,i)=>Math.abs(v-actual[i])));covarianceCount++;
 draw(2);let integral=0;for(let i=0;i<pixels.length;i+=4)integral+=pixels[i];integral*=Math.PI*Math.PI/(256*256);
 normalizationError=Math.max(normalizationError,Math.abs(1-integral));normalizationCount++;
 const localView=new T.Vector3(.28,.8,.31).normalize(),localLight=new T.Vector3(-.15,.9,.24).normalize();
 uniforms.normal.value.set(0,1,0);uniforms.view.value.copy(localView);uniforms.light.value.copy(localLight);const baseline=draw(1);
 uniforms.normal.value.copy(n);uniforms.view.value.copy(world(basis,localView));uniforms.light.value.copy(world(basis,localLight));const rotated=draw(1);
 invarianceError=Math.max(invarianceError,...baseline.slice(0,2).map((v,i)=>Math.abs(v-rotated[i])/Math.max(Math.abs(v),.001)));invarianceCount++;
}

// Simpson integration of the defining erf integral is independent of the fit.
const erf=a=>{const steps=4096,h=a/steps;let sum=1+Math.exp(-a*a);for(let i=1;i<steps;i++)sum+=(i%2?4:2)*Math.exp(-((i*h)**2));return 2/Math.sqrt(Math.PI)*sum*h/3;};
for(const c of covariances)for(const azimuth of[0,Math.PI/4,Math.PI/2])for(const a of[.1,.5,1,1.599,1.6,3]){
 const x=Math.cos(azimuth),z=Math.sin(azimuth),variance=x*x*c[0]+z*z*c[1]+2*x*z*c[2],tanElevation=a*Math.sqrt(2*variance),direction=new T.Vector3(x,tanElevation,z).normalize();
 uniforms.normal.value.set(0,1,0);uniforms.covariance.value.set(...c);uniforms.view.value.copy(direction);uniforms.light.value.copy(direction);const actual=draw(1)[1];
 const fit=a>=1.6?0:Math.max(0,(1-1.259*a+.396*a*a)/(3.535*a+2.181*a*a)),exact=(erf(a)-1)/2+Math.exp(-a*a)/(2*a*Math.sqrt(Math.PI));
 smithError=Math.max(smithError,Math.abs(actual-1/(1+2*fit)));smithModelError=Math.max(smithModelError,Math.abs(actual-1/(1+2*exact))/(1/(1+2*exact)));smithCount++;
}
for(const [v,l]of [[[0,-1,0],[.3,1,0]],[[.3,1,0],[0,-1,0]],[[1,0,0],[0,1,0]]]){
 uniforms.view.value.set(...v).normalize();uniforms.light.value.set(...l).normalize();backfaceError=Math.max(backfaceError,Math.abs(draw(1)[1]));backfaceCount++;
}
const ext=gl.getExtension('WEBGL_debug_renderer_info');window.__GAUSSIAN_GLINT_PROBE__={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',covarianceCount,covarianceError,normalizationCount,normalizationError,invarianceCount,invarianceError,smithCount,smithError,smithModelError,backfaceCount,backfaceError,glError:gl.getError()};
