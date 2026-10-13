import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { SEA_SCALE, type SeaState } from './sea';
import { SpectralSea } from './spectrum';
import { bathymetryData, BATHY_SIZE, COASTS } from './bathymetry';

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
uniform sampler2D tangentX0, tangentX1, tangentX2, tangentZ0, tangentZ1, tangentZ2;
uniform float seaScale,chopScale;
uniform bool manualInterpolation;
vec2 cascadeUV(vec2 p,float length) {return fract(p/length)+vec2(0.5/128.0);}
vec4 fieldSample(sampler2D field,vec2 uv) {
  if(!manualInterpolation)return texture2D(field,uv);
  vec2 pixel=uv*128.0-0.5,base=floor(pixel),f=fract(pixel),a=(base+0.5)/128.0;
  return mix(mix(texture2D(field,a),texture2D(field,a+vec2(1.0/128.0,0)),f.x),mix(texture2D(field,a+vec2(0,1.0/128.0)),texture2D(field,a+vec2(1.0/128.0)),f.x),f.y);
}
vec4 displacementAt(vec2 p) {
  vec4 a=fieldSample(displacement0,cascadeUV(p,433.0)),b=fieldSample(displacement1,cascadeUV(p,97.0)),c=fieldSample(displacement2,cascadeUV(p,23.3));
  return vec4((a.xyz+b.xyz+c.xyz)*vec3(chopScale,seaScale,chopScale),max(max(a.w,b.w),c.w));
}
vec3 normalAt(vec2 p) {
  vec3 strength=vec3(chopScale,seaScale,chopScale);
  vec3 tx=vec3(1,0,0)+(fieldSample(tangentX0,cascadeUV(p,433.0)).xyz+fieldSample(tangentX1,cascadeUV(p,97.0)).xyz+fieldSample(tangentX2,cascadeUV(p,23.3)).xyz)*strength;
  vec3 tz=vec3(0,0,1)+(fieldSample(tangentZ0,cascadeUV(p,433.0)).xyz+fieldSample(tangentZ1,cascadeUV(p,97.0)).xyz+fieldSample(tangentZ2,cascadeUV(p,23.3)).xyz)*strength;
  vec3 n=cross(tz,tx);return normalize(vec3(n.x,max(n.y,0.025),n.z));
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
      chopScale:{value:this.simulation.horizontalScale},
      islands:{value:[...COASTS.map(c=>new T.Vector4(c.x,c.z,c.size,c.height)),new T.Vector4(145,-135,36,27)]},
    });
    const bottom=new T.DataTexture(bathymetryData(),BATHY_SIZE,BATHY_SIZE,T.RGBAFormat,T.FloatType);
    bottom.magFilter=bottom.minFilter=T.NearestFilter;bottom.needsUpdate=true;this.material.uniforms.bathymetry={value:bottom};
    this.simulation.cascades.forEach((c,i)=> {
      for(const [name,data] of [['displacement',c.displacement],['tangentX',c.tangentX],['tangentZ',c.tangentZ]] as const) {
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
      uniform sampler2D bathymetry;
      uniform vec3 eye,sunDirection,sunColor;uniform float time,dusk;uniform bool foamEnabled;
      uniform vec4 vessels[3],islands[4];uniform float headings[3],vesselWidths[3],vesselSpeeds[3];
      varying vec3 worldPosition;varying vec2 waveCoordinate;varying vec4 mirrorCoord;
      float hash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p) {vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
      float foamNoise(vec2 p) {return noise(p)*0.55+noise(p*2.17+8.6)*0.3+noise(p*4.79)*0.15;}
      vec4 bottomAt(vec2 uv) {
        vec2 pixel=uv*${BATHY_SIZE-1}.0,base=min(floor(pixel),vec2(${BATHY_SIZE-2}.0)),f=pixel-base,a=(base+0.5)/${BATHY_SIZE}.0;
        vec4 h=texture2D(bathymetry,a),b=texture2D(bathymetry,a+vec2(0,1.0/${BATHY_SIZE}.0)),d=texture2D(bathymetry,a+vec2(1.0/${BATHY_SIZE}.0,0));
        if(f.x+f.y<=1.0)return h+(b-h)*f.y+(d-h)*f.x;
        vec4 c=texture2D(bathymetry,a+vec2(1.0/${BATHY_SIZE}.0));return c+(b-c)*(1.0-f.x)+(d-c)*(1.0-f.y);
      }
      void main() {
        vec3 view=normalize(eye-worldPosition);float distanceToEye=length(eye-worldPosition);vec2 p=worldPosition.xz;
        vec3 normal=normalAt(waveCoordinate);
        float detailFade=1.0-smoothstep(40.0,1200.0,distanceToEye),d=0.035;vec2 flow=p*2.1+vec2(time*0.28,-time*0.17);
        vec2 micro=vec2(noise(flow+vec2(d,0))-noise(flow-vec2(d,0)),noise(flow+vec2(0,d))-noise(flow-vec2(0,d)))/d;
        normal=normalize(normal+vec3(micro.x,0.0,micro.y)*0.13*detailFade);
        float wakeFoam=0.0,wakeWave=0.0,n=foamNoise(p*0.53+vec2(time*0.12,-time*0.09));
        for(int i=0;i<3;i++) {
          vec2 rel=p-vessels[i].xz;float c=cos(headings[i]),s=sin(headings[i]);vec2 local=vec2(c*rel.x-s*rel.y,s*rel.x+c*rel.y);
          float length=vessels[i].w,width=vesselWidths[i],speed=vesselSpeeds[i],aft=local.y-length*0.5,bow=local.y+length*0.5;
          float u=(local.y+length*0.5)/length;
          if(u>0.0&&u<1.0) {
            float shape=pow(max(sin(u*3.14159),0.001),0.42);
            if(i==1&&u>0.78)shape=mix(shape,0.72,smoothstep(0.78,1.0,u));
            if(abs(local.x)<width*shape*0.98)discard;
          }
          float safeAft=max(aft,0.0);
          float trail=step(0.0,aft)*exp(-safeAft/300.0)*smoothstep(0.5,3.0,speed),kelvin=abs(local.x)-width-safeAft*0.354,crest=exp(-kelvin*kelvin/(3.0+safeAft*0.1));
          wakeFoam+=trail*(exp(-local.x*local.x/max(width*width+safeAft*1.1,0.1))*0.63+crest*0.72)*smoothstep(0.18,0.75,n);
          wakeWave+=trail*crest*sin(kelvin*1.7-aft*0.14-time*1.8)*0.35;
          float edge=exp(-pow((abs(local.x)-width)/1.8,2.0))*(1.0-smoothstep(length*0.44,length*0.53,abs(local.y))),bowFoam=exp(-bow*bow/40.0-local.x*local.x/(width*width));
          wakeFoam+=(edge*0.22+bowFoam*0.75)*smoothstep(0.2,0.65,n)*smoothstep(0.2,3.0,speed);
        }
        normal=normalize(normal+vec3(wakeWave*0.12,0.0,wakeWave*0.16));
        float nv=max(dot(normal,view),0.015),fresnel=0.0204+0.9796*pow(1.0-nv,5.0);
        vec2 reflectionUV=mirrorCoord.xy/max(mirrorCoord.w,0.001)+normal.xz*(0.012+0.16/max(distanceToEye,2.0));
        vec3 reflected=texture2D(mirrorSampler,clamp(reflectionUV,0.001,0.999)).rgb;float shallow=0.0,shoreFoam=0.0;
        for(int i=0;i<4;i++) {
          vec2 uv=(p-islands[i].xy)/(islands[i].z*2.4)+0.5;float bottomHeight=-60.0;
          if(i<3&&all(greaterThanEqual(uv,vec2(0)))&&all(lessThanEqual(uv,vec2(1))))bottomHeight=bottomAt(uv)[i];
          if(i==3){vec2 reef=(p-islands[i].xy)/islands[i].zw;float r=dot(reef,reef);bottomHeight=r<1.0?-1.0+13.0*sqrt(1.0-r):-60.0;}
          float depth=max(worldPosition.y-bottomHeight,0.0);
          shallow=max(shallow,pow(1.0-smoothstep(0.0,8.0,depth),2.0));
          float wash=0.65+0.35*sin(time*1.2+bottomHeight*1.8);
          shoreFoam=max(shoreFoam,(1.0-smoothstep(0.4,3.2,depth))*wash*smoothstep(0.23,0.65,n));
        }
        vec3 absorption=mix(vec3(0.006,0.045,0.082),vec3(0.016,0.17,0.145),shallow);
        float crestLight=max(displacementAt(waveCoordinate).y,0.0)*(1.0-nv)*pow(max(dot(-sunDirection,view),0.0),3.0);absorption+=vec3(0.018,0.11,0.078)*crestLight;
        vec3 halfV=normalize(view+sunDirection);float rough=0.12+smoothstep(80.0,1800.0,distanceToEye)*0.16;
        vec3 normalFootprint=fwidth(normal);rough=max(rough,min(0.48,sqrt(length(normalFootprint))*0.6));
        float a2=pow(rough,4.0),nh=max(dot(normal,halfV),0.0),nl=max(dot(normal,sunDirection),0.001),den=nh*nh*(a2-1.0)+1.0;
        float distribution=a2/(3.14159*den*den+0.000001),masking=2.0*nv/(nv+sqrt(a2+(1.0-a2)*nv*nv));masking*=2.0*nl/(nl+sqrt(a2+(1.0-a2)*nl*nl));
        vec3 glint=sunColor*distribution*masking*fresnel*0.19/max(4.0*nv,0.1);
        float breaking=smoothstep(0.12,0.8,displacementAt(waveCoordinate).w)*smoothstep(0.42,0.76,n),foam=foamEnabled?clamp(breaking*0.82+wakeFoam+shoreFoam*0.8,0.0,0.97):0.0;
        vec3 foamColor=mix(vec3(0.78,0.86,0.84),vec3(0.82,0.78,0.66),dusk)*(0.76+noise(p*7.3)*0.3);
        vec3 color=mix(absorption*(1.0-fresnel)+reflected*fresnel+min(glint,vec3(9.0)),foamColor,foam);
        float haze=1.0-exp(-distanceToEye*0.0001);color=mix(color,mix(vec3(0.45,0.62,0.72),vec3(0.62,0.45,0.32),dusk),haze);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
  }
  heightAt(x:number,z:number) {return this.simulation.heightAt(x,z,SEA_SCALE[this.state]);}
  configureFiltering(floatLinear:boolean) {
    this.material.uniforms.manualInterpolation={value:!floatLinear};
    if(!floatLinear)this.textures.forEach(texture=>{texture.magFilter=texture.minFilter=T.NearestFilter;texture.needsUpdate=true;});
  }
  advance(time:number,state:SeaState) {
    this.state=state;
    if(this.simulation.update(time,SEA_SCALE[state]))this.textures.forEach(t=>t.needsUpdate=true);
    this.material.uniforms.time.value=time;this.material.uniforms.seaScale.value=SEA_SCALE[state];
    this.material.uniforms.chopScale.value=this.simulation.horizontalScale;
  }
  update(time:number,camera:T.Vector3,state:SeaState) {
    this.advance(time,state);this.material.uniforms.eye.value.copy(camera);this.mesh.position.x=camera.x;this.mesh.position.z=camera.z;
  }
  setQuality(quality:string) {
    const size=quality==='ultra'?3072:quality==='high'?1536:512,target=this.mesh.getRenderTarget();if(target.width!==size)target.setSize(size,size);
    if(this.quality!==quality) {this.mesh.geometry.dispose();this.mesh.geometry=radialGeometry(quality);this.quality=quality;}
  }
}
