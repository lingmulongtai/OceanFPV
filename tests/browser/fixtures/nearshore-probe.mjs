import * as T from 'three';
import {Ocean} from '../../../src/ocean.ts';
import {COASTS,BATHY_SIZE,sampleBathymetry} from '../../../src/bathymetry.ts';
import {nearshoreEnvelope} from '../../../src/nearshore.ts';
const renderer=new T.WebGLRenderer();renderer.setSize(1,1);document.body.append(renderer.domElement);
if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const ocean=new Ocean(new T.Vector3(0,1,0)),uniforms={...ocean.material.uniforms,probePoint:{value:new T.Vector2()},probeMode:{value:0},probeResolved:{value:new T.Vector3(1,1,1)}};
const header=ocean.material.vertexShader.split('uniform mat4 textureMatrix;')[0];
const material=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`${header}
uniform vec2 probePoint;uniform int probeMode;uniform vec3 probeResolved;
void main(){if(probeMode==0)gl_FragColor=vec4(displacementAt(probePoint).xyz,nearshoreAt(probePoint).x);else if(probeMode==1)gl_FragColor=vec4(normalAt(probePoint,probeResolved),1);else gl_FragColor=vec4(spectralVarianceAt(probePoint,probeResolved),0,0,1);}`});
const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0.1,10),target=new T.WebGLRenderTarget(1,1,{type:T.FloatType});
scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));camera.position.z=1;
const data=uniforms.bathymetry.value.image.data,points=[];
for(const coast of COASTS)for(const depth of [-5,0,0.2,0.8,1.5,2,2.5,3,4,6,8,8.2]) {
  let closest;
  for(let z=0;z<BATHY_SIZE-1;z++)for(let x=0;x<BATHY_SIZE-1;x++) {
    const px=coast.x+((x+0.23)/(BATHY_SIZE-1)*2-1)*coast.size*1.2,pz=coast.z+((z+0.31)/(BATHY_SIZE-1)*2-1)*coast.size*1.2;
    const bottom=sampleBathymetry(data,px,pz),error=Math.abs(-bottom.height-depth);
    if(!closest||error<closest.error)closest={x:px,z:pz,error};
  }
  points.push(closest);
}
points.push({x:10000,z:10000});
const samples=[];let heightError=0,normalError=0,varianceError=0,contactError=0;
for(const manual of [false,true]) {
  if(!manual&&!renderer.getContext().getExtension('OES_texture_float_linear'))continue;
  ocean.configureFiltering(!manual);
  uniforms.manualInterpolation=ocean.material.uniforms.manualInterpolation;
  for(const state of ['calm','breeze','swell']) {
    ocean.advance(6,state);
    for(const controlled of [false,true]) {
      if(controlled)for(const [index,c]of ocean.simulation.cascades.entries()) {
        c.displacement.fill(0);c.tangentX.fill(0);c.tangentZ.fill(0);
        for(let i=0;i<c.displacement.length;i+=4)c.displacement[i+1]=(index+1)*0.25;
      }
      // Re-upload modified arrays even though the simulation time is frozen.
      for(const [name,uniform]of Object.entries(uniforms))if(/^(displacement|tangent[ZX])\d$/.test(name))uniform.value.needsUpdate=true;
      for(const point of points)for(const kind of ['height','normal','variance'])for(const resolved of kind==='height'?[[1,1,1]]:[[1,1,1],[0.6,0.15,0],[0,0,0]]) {
        uniforms.probePoint.value.set(point.x,point.z);uniforms.probeMode.value=['height','normal','variance'].indexOf(kind);uniforms.probeResolved.value.set(...resolved);
        renderer.setRenderTarget(target);renderer.render(scene,camera);const actual=new Float32Array(4);renderer.readRenderTargetPixels(target,0,0,1,1,actual);
        const scale=uniforms.seaScale.value,horizontal=uniforms.chopScale.value,bottom=sampleBathymetry(data,point.x,point.z),envelope=nearshoreEnvelope(-bottom.height),sum=(channel,field='displacement')=>ocean.simulation.cascades.reduce((v,c)=>v+c.sample(point.x,point.z,channel,c[field]),0),filtered=(channel,field='displacement')=>ocean.simulation.cascades.reduce((v,c,i)=>v+c.sample(point.x,point.z,channel,c[field])*resolved[i],0);
        let expected;
        if(kind==='height')expected=[sum(0)*horizontal,sum(1)*scale*envelope.value,sum(2)*horizontal,envelope.value];
        else if(kind==='variance') {
          const missing=resolved.map(v=>1-v*v),slope=uniforms.slopeVariance.value.toArray(),height=uniforms.heightVariance.value.toArray();
          expected=[0.5*(missing.reduce((s,v,i)=>s+v*slope[i],0)*envelope.value**2+missing.reduce((s,v,i)=>s+v*height[i],0)*envelope.derivative**2*(bottom.dx**2+bottom.dz**2))];
        }else if(controlled) {
          // Independent central differences of the modified geometric height.
          const amplitude=(0.25*resolved[0]+0.5*resolved[1]+0.75*resolved[2])*scale,height=(x,z)=>amplitude*nearshoreEnvelope(-sampleBathymetry(data,x,z).height).value,e=0.001;
          expected=new T.Vector3(-(height(point.x+e,point.z)-height(point.x-e,point.z))/(2*e),1,-(height(point.x,point.z+e)-height(point.x,point.z-e))/(2*e)).normalize().toArray();
        }else {
          const tx=new T.Vector3(1+filtered(0,'tangentX')*horizontal,filtered(1,'tangentX')*scale*envelope.value-filtered(1)*scale*envelope.derivative*bottom.dx,filtered(2,'tangentX')*horizontal);
          const tz=new T.Vector3(filtered(0,'tangentZ')*horizontal,filtered(1,'tangentZ')*scale*envelope.value-filtered(1)*scale*envelope.derivative*bottom.dz,1+filtered(2,'tangentZ')*horizontal),n=tz.cross(tx);n.y=Math.max(n.y,0.025);expected=n.normalize().toArray();
        }
        const error=Math.max(...expected.map((v,i)=>Math.abs(v-actual[i])));samples.push({manual,state,controlled,kind,resolved,point,actual:[...actual],expected,error});
        if(!Number.isFinite(error)||error>0.003)throw new Error(`Nearshore mismatch ${JSON.stringify(samples.at(-1))}`);
        if(kind==='height') {
          heightError=Math.max(heightError,error);
          if(!controlled)contactError=Math.max(contactError,Math.abs(ocean.heightAt(point.x+actual[0],point.z+actual[2])-actual[1]));
        }else if(kind==='normal')normalError=Math.max(normalError,error);else varianceError=Math.max(varianceError,error);
      }
      if(controlled){ocean.advance(0,state);ocean.advance(6,state);}
    }
  }
}
const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');window.__NEARSHORE_PROBE__={gpu:gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),samples,heightError,normalError,varianceError,contactError};
