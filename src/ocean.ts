import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { SEA_SCALE, type SeaState } from './sea';
import { SpectralSea } from './spectrum';

function radialGeometry(quality='high') {
  const segments=quality==='ultra'?512:quality==='high'?384:192,rings=quality==='ultra'?360:quality==='high'?280:170;
  const positions:number[]=[],indices:number[]=[];
  for(let r=0;r<=rings;r++) {
    const radius=22000*Math.expm1(r/rings*8)/Math.expm1(8);
    for(let a=0;a<=segments;a++) {const angle=a/segments*Math.PI*2;positions.push(Math.cos(angle)*radius,Math.sin(angle)*radius,0);}
  }
  for(let r=0;r<rings;r++) for(let a=0;a<segments;a++) {const i=r*(segments+1)+a,j=i+segments+1;indices.push(i,j,i+1,i+1,j,j+1);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

const spectralCode=`
uniform sampler2D displacement0, displacement1, displacement2;
uniform sampler2D normals0, normals1, normals2;
uniform float seaScale;
vec2 cascadeUV(vec2 p,float length) {return fract(p/length)+vec2(0.5/128.0);}
vec4 displacementAt(vec2 p) {
  vec4 a=texture2D(displacement0,cascadeUV(p,433.0)),b=texture2D(displacement1,cascadeUV(p,97.0)),c=texture2D(displacement2,cascadeUV(p,23.3));
  return vec4((a.xyz+b.xyz+c.xyz)*seaScale,max(max(a.w,b.w),c.w));
}
vec3 normalAt(vec2 p,float distanceToEye) {
  vec3 a=texture2D(normals0,cascadeUV(p,433.0)).xyz,b=texture2D(normals1,cascadeUV(p,97.0)).xyz,c=texture2D(normals2,cascadeUV(p,23.3)).xyz;
  vec2 slope=a.xz/max(a.y,0.15)+b.xz/max(b.y,0.15)+c.xz/max(c.y,0.15)*(1.0-smoothstep(250.0,4000.0,distanceToEye));
  return normalize(vec3(slope.x*seaScale,1.0,slope.y*seaScale));
}
`;

export class Ocean {
  mesh:Reflector;
  material:T.ShaderMaterial;
  readonly simulation=new SpectralSea();
  private textures:T.DataTexture[]=[];
  private quality='high';
  private state:SeaState='breeze';
  constructor(sun:T.Vector3) {
    this.mesh=new Reflector(radialGeometry(),{textureWidth:1536,textureHeight:1536,multisample:0,clipBias:0.012});
    this.mesh.rotation.x=-Math.PI/2;this.mesh.frustumCulled=false;
    this.material=this.mesh.material as T.ShaderMaterial;this.material.lights=false;this.material.side=T.DoubleSide;
    Object.assign(this.material.uniforms,{
      mirrorSampler:{value:this.mesh.getRenderTarget().texture},eye:{value:new T.Vector3()},time:{value:0},sunDirection:{value:sun},sunColor:{value:new T.Color(0xffe7bf)},seaScale:{value:SEA_SCALE.breeze},
      dusk:{value:0.4},foamEnabled:{value:true},vessels:{value:Array.from({length:3},()=>new T.Vector4())},headings:{value:[0,0,0]},vesselWidths:{value:[4.4,17,4.5]},vesselSpeeds:{value:[0,0,0]},
      islands:{value:[new T.Vector4(-580,-420,260,130),new T.Vector4(610,-800,320,190),new T.Vector4(-850,420,190,85),new T.Vector4(145,-135,30,12)]},
    });
    this.simulation.cascades.forEach((c,i)=> {
      for(const [name,data] of [['displacement',c.displacement],['normals',c.normal]] as const) {
        const texture=new T.DataTexture(data,c.size,c.size,T.RGBAFormat,T.FloatType);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;
        this.material.uniforms[`${name}${i}`]={value:texture};this.textures.push(texture);
      }
    });
    this.material.vertexShader=`${spectralCode}
      uniform mat4 textureMatrix;
      varying vec3 worldPosition;varying vec2 waveCoordinate;varying vec4 mirrorCoord;
      void main() {
        vec4 world=modelMatrix*vec4(position,1.0);waveCoordinate=world.xz;
        vec3 displacement=displacementAt(world.xz).xyz;world.xyz+=displacement;worldPosition=world.xyz;
        mirrorCoord=textureMatrix*vec4(position.x+displacement.x,position.y-displacement.z,position.z+displacement.y,1.0);
        gl_Position=projectionMatrix*viewMatrix*world;
      }`;
    this.material.fragmentShader=`${spectralCode}
      uniform sampler2D mirrorSampler;
      uniform vec3 eye,sunDirection,sunColor;uniform float time,dusk;uniform bool foamEnabled;
      uniform vec4 vessels[3],islands[4];uniform float headings[3],vesselWidths[3],vesselSpeeds[3];
      varying vec3 worldPosition;varying vec2 waveCoordinate;varying vec4 mirrorCoord;
      float hash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p) {vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
      float foamNoise(vec2 p) {return noise(p)*0.55+noise(p*2.17+8.6)*0.3+noise(p*4.79)*0.15;}
      void main() {
        vec3 view=normalize(eye-worldPosition);float distanceToEye=length(eye-worldPosition);vec2 p=worldPosition.xz;
        vec3 normal=normalAt(waveCoordinate,distanceToEye);
        float detailFade=1.0-smoothstep(40.0,1200.0,distanceToEye),d=0.035;vec2 flow=p*2.1+vec2(time*0.28,-time*0.17);
        vec2 micro=vec2(noise(flow+vec2(d,0))-noise(flow-vec2(d,0)),noise(flow+vec2(0,d))-noise(flow-vec2(0,d)))/d;
        normal=normalize(normal+vec3(micro.x,0.0,micro.y)*0.13*detailFade);
        float wakeFoam=0.0,wakeWave=0.0,n=foamNoise(p*0.53+vec2(time*0.12,-time*0.09));
        for(int i=0;i<3;i++) {
          vec2 rel=p-vessels[i].xz;float c=cos(headings[i]),s=sin(headings[i]);vec2 local=vec2(c*rel.x-s*rel.y,s*rel.x+c*rel.y);
          float length=vessels[i].w,width=vesselWidths[i],speed=vesselSpeeds[i],aft=local.y-length*0.5,bow=local.y+length*0.5;
          float trail=step(0.0,aft)*exp(-aft/300.0)*smoothstep(0.5,3.0,speed),kelvin=abs(local.x)-width-aft*0.354,crest=exp(-kelvin*kelvin/(3.0+aft*0.1));
          wakeFoam+=trail*(exp(-local.x*local.x/(width*width+aft*1.1))*0.63+crest*0.72)*smoothstep(0.18,0.75,n);
          wakeWave+=trail*crest*sin(kelvin*1.7-aft*0.14-time*1.8)*0.35;
          float edge=exp(-pow((abs(local.x)-width)/1.8,2.0))*(1.0-smoothstep(length*0.44,length*0.53,abs(local.y))),bowFoam=exp(-bow*bow/40.0-local.x*local.x/(width*width));
          wakeFoam+=(edge*0.22+bowFoam*0.75)*smoothstep(0.2,0.65,n)*smoothstep(0.2,3.0,speed);
        }
        normal=normalize(normal+vec3(wakeWave*0.12,0.0,wakeWave*0.16));
        float nv=max(dot(normal,view),0.015),fresnel=0.0204+0.9796*pow(1.0-nv,5.0);
        vec2 reflectionUV=mirrorCoord.xy/max(mirrorCoord.w,0.001)+normal.xz*(0.012+0.16/max(distanceToEye,2.0));
        vec3 reflected=texture2D(mirrorSampler,clamp(reflectionUV,0.001,0.999)).rgb;float shallow=0.0,shoreFoam=0.0;
        for(int i=0;i<4;i++) {float coast=length(p-islands[i].xy)-islands[i].z*0.83;shallow=max(shallow,1.0-smoothstep(-8.0,38.0,coast));shoreFoam=max(shoreFoam,exp(-coast*coast/28.0)*smoothstep(0.23,0.65,n));}
        vec3 absorption=mix(vec3(0.006,0.045,0.082),vec3(0.016,0.17,0.145),shallow);
        float crestLight=max(displacementAt(waveCoordinate).y,0.0)*(1.0-nv)*pow(max(dot(-sunDirection,view),0.0),3.0);absorption+=vec3(0.018,0.11,0.078)*crestLight;
        vec3 halfV=normalize(view+sunDirection);float rough=0.12+smoothstep(80.0,1800.0,distanceToEye)*0.16;
        float a2=pow(rough,4.0),nh=max(dot(normal,halfV),0.0),nl=max(dot(normal,sunDirection),0.001),den=nh*nh*(a2-1.0)+1.0;
        float distribution=a2/(3.14159*den*den+0.000001),masking=2.0*nv/(nv+sqrt(a2+(1.0-a2)*nv*nv));masking*=2.0*nl/(nl+sqrt(a2+(1.0-a2)*nl*nl));
        vec3 glint=sunColor*distribution*masking*fresnel*0.19/max(4.0*nv,0.1);
        float breaking=displacementAt(waveCoordinate).w*smoothstep(0.22,0.68,n),foam=foamEnabled?clamp(breaking*0.78+wakeFoam+shoreFoam*0.8,0.0,0.97):0.0;
        vec3 foamColor=mix(vec3(0.78,0.86,0.84),vec3(0.82,0.78,0.66),dusk)*(0.76+noise(p*7.3)*0.3);
        vec3 color=mix(absorption*(1.0-fresnel)+reflected*fresnel+min(glint,vec3(9.0)),foamColor,foam);
        float haze=1.0-exp(-distanceToEye*0.0001);color=mix(color,mix(vec3(0.45,0.62,0.72),vec3(0.62,0.45,0.32),dusk),haze);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
  }
  heightAt(x:number,z:number) {return this.simulation.heightAt(x,z,SEA_SCALE[this.state]);}
  advance(time:number,state:SeaState) {
    this.state=state;const before=this.simulation.time;this.simulation.update(time);
    if(before!==this.simulation.time)this.textures.forEach(t=>t.needsUpdate=true);
    this.material.uniforms.time.value=time;this.material.uniforms.seaScale.value=SEA_SCALE[state];
  }
  update(time:number,camera:T.Vector3,state:SeaState) {
    this.advance(time,state);this.material.uniforms.eye.value.copy(camera);this.mesh.position.x=camera.x;this.mesh.position.z=camera.z;
  }
  setQuality(quality:string) {
    const size=quality==='ultra'?3072:quality==='high'?1536:512,target=this.mesh.getRenderTarget();if(target.width!==size)target.setSize(size,size);
    if(this.quality!==quality) {this.mesh.geometry.dispose();this.mesh.geometry=radialGeometry(quality);this.quality=quality;}
  }
}
