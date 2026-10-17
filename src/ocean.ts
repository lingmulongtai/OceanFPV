import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { SEA_SCALE, type SeaState } from './sea';
import { SpectralSea } from './spectrum';
import { bathymetryData, sampleBathymetry, sampleCoastalDepth, BATHY_SIZE, BATHY_COASTS } from './bathymetry';
import {IslandDepth} from './island-depth';
import {hornoyaDepthData,HORNOYA_SEGMENTS} from './hornoya';
import {LighthouseReef} from './lighthouse-reef';
import { nearshoreCode, nearshoreEnvelope } from './nearshore';
import {waterOpticsCode} from './water-optics';
import { WAKE_SAMPLES, WAKE_STEP } from './navigation';
import { WaveMipmaps } from './wave-mips';
import {type CliffSurface} from './cliff';
import {CliffDepth,CLIFF_DEPTH_SIZE} from './cliff-depth';
import {cruiseHullCode} from './cruise-hull';
import {wakeSurfaceCode} from './wake-surface';
import {captureReflectedGeometry,oceanReflectionCode} from './ocean-reflection';
import {whitecapCode} from './whitecaps';

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
${nearshoreCode}
${cruiseHullCode}
uniform sampler2D displacement0, displacement1, displacement2;
uniform sampler2D tangentX0, tangentX1, tangentX2, tangentZ0, tangentZ1, tangentZ2;
uniform float seaScale,chopScale;
uniform vec3 slopeVariance,heightVariance;
uniform vec3 slopeMipEnergy[8],heightMipEnergy[8],slopeMipCross[8],heightMipCross[8];
uniform bool manualInterpolation;
vec2 cascadeUV(vec2 p,float length) {return fract(p/length)+vec2(0.5/128.0);}
vec4 fieldLevel(sampler2D field,vec2 uv,float level) {
  float width=128.0/exp2(level);
  vec2 pixel=uv*width-0.5,base=floor(pixel),f=fract(pixel),a=(base+0.5)/width;
  return mix(mix(textureLod(field,a,level),textureLod(field,a+vec2(1.0/width,0),level),f.x),mix(textureLod(field,a+vec2(0,1.0/width),level),textureLod(field,a+vec2(1.0/width),level),f.x),f.y);
}
vec4 fieldSampleLod(sampler2D field,vec2 uv,float lod,bool precise) {
  lod=clamp(lod,0.0,7.0);if(!manualInterpolation&&!precise)return textureLod(field,uv,lod);
  float low=floor(lod),high=min(low+1.0,7.0);vec4 a=fieldLevel(field,uv,low);if(lod==low||high==low)return a;
  return mix(a,fieldLevel(field,uv,high),lod-low);
}
vec4 fieldSampleLod(sampler2D field,vec2 uv,float lod) {return fieldSampleLod(field,uv,lod,false);}
vec4 fieldSample(sampler2D field,vec2 uv) {return fieldSampleLod(field,uv,0.0);}
vec3 waveLod(float footprint) {return clamp(log2(max(vec3(1.0),footprint*vec3(128.0/433.0,128.0/97.0,128.0/23.3))),vec3(0),vec3(7));}
vec4 displacementAt(vec2 p) {
  vec4 a=fieldSample(displacement0,cascadeUV(p,433.0)),b=fieldSample(displacement1,cascadeUV(p,97.0)),c=fieldSample(displacement2,cascadeUV(p,23.3));
  return vec4((a.xyz+b.xyz+c.xyz)*vec3(chopScale,seaScale*nearshoreAt(p).x,chopScale),max(max(a.w,b.w),c.w));
}
vec3 normalAt(vec2 p,vec3 lod) {
  vec3 coast=nearshoreAt(p);bool precise=coast.x!=1.0||dot(coast.yz,coast.yz)>0.0;
  vec3 strength=vec3(chopScale,seaScale,chopScale);
  vec3 tx=vec3(1,0,0)+(fieldSampleLod(tangentX0,cascadeUV(p,433.0),lod.x,precise).xyz+fieldSampleLod(tangentX1,cascadeUV(p,97.0),lod.y,precise).xyz+fieldSampleLod(tangentX2,cascadeUV(p,23.3),lod.z,precise).xyz)*strength;
  vec3 tz=vec3(0,0,1)+(fieldSampleLod(tangentZ0,cascadeUV(p,433.0),lod.x,precise).xyz+fieldSampleLod(tangentZ1,cascadeUV(p,97.0),lod.y,precise).xyz+fieldSampleLod(tangentZ2,cascadeUV(p,23.3),lod.z,precise).xyz)*strength;
  float height=(fieldSampleLod(displacement0,cascadeUV(p,433.0),lod.x,precise).y+fieldSampleLod(displacement1,cascadeUV(p,97.0),lod.y,precise).y+fieldSampleLod(displacement2,cascadeUV(p,23.3),lod.z,precise).y)*seaScale;
  tx.y=tx.y*coast.x+height*coast.y;tz.y=tz.y*coast.x+height*coast.z;
  vec3 n=cross(tz,tx);return normalize(vec3(n.x,max(n.y,0.025),n.z));
}
float spectralVarianceAt(vec2 p,vec3 lod) {
  vec3 coast=nearshoreAt(p);float slope=0.0,height=0.0;
  for(int i=0;i<3;i++) {
    float level=clamp(lod[i],0.0,7.0),f=fract(level);int low=int(floor(level)),high=min(low+1,7);
    float retainedSlope=(1.0-f)*(1.0-f)*slopeMipEnergy[low][i]+2.0*f*(1.0-f)*slopeMipCross[low][i]+f*f*slopeMipEnergy[high][i];
    float retainedHeight=(1.0-f)*(1.0-f)*heightMipEnergy[low][i]+2.0*f*(1.0-f)*heightMipCross[low][i]+f*f*heightMipEnergy[high][i];
    slope+=max(0.0,slopeVariance[i]-retainedSlope);height+=max(0.0,heightVariance[i]-retainedHeight);
  }
  return 0.5*(slope*coast.x*coast.x+height*dot(coast.yz,coast.yz));
}
`;

export class Ocean {
  mesh:Reflector;
  material:T.ShaderMaterial;
  readonly simulation=new SpectralSea();
  readonly waveMipmaps=this.simulation.cascades.map(c=>({displacement:new WaveMipmaps(c.displacement,c.size),tangentX:new WaveMipmaps(c.tangentX,c.size),tangentZ:new WaveMipmaps(c.tangentZ,c.size)}));
  private bottomData:Float32Array;
  private cliffDepth:CliffDepth|null=null;
  readonly islandDepth:IslandDepth;
  private coastalScale=(x:number,z:number)=>nearshoreEnvelope(-this.bottomAt(x,z).height).value;
  private textures:T.DataTexture[]=[];
  private fieldsDirty=true;
  private quality='high';
  private state:SeaState='breeze';
  private reflectedView:T.Camera|null=null;
  bottomAt(x:number,z:number) {
    const ground=sampleCoastalDepth(this.bottomData,x,z,this.islandDepth),scan=this.cliffDepth?.sample(x,z);return scan&&scan.height>ground.height?scan:ground;
  }
  /** One atomic upload serves CPU wave/contact sampling and the water shader. */
  installIslandDepth(channel:number,geometry:T.BufferGeometry,scan:CliffSurface) {
    const position=geometry.attributes.position;
    if(channel<0||channel>=3||position.count!==BATHY_SIZE*BATHY_SIZE)throw new Error('Invalid island depth grid');
    const data=this.bottomData.slice();
    for(let i=0;i<position.count;i++)data[i*4+channel]=position.getY(i);
    const depth=new CliffDepth(scan,(x,z)=>sampleBathymetry(data,x,z).height);
    const detail=new T.DataTexture(depth.data,CLIFF_DEPTH_SIZE,CLIFF_DEPTH_SIZE,T.RedFormat,T.FloatType);detail.magFilter=detail.minFilter=T.NearestFilter;detail.needsUpdate=true;
    this.bottomData=data;const texture=this.material.uniforms.bathymetry.value as T.DataTexture;texture.image.data=data;texture.needsUpdate=true;
    this.cliffDepth=depth;(this.material.uniforms.cliffBathymetry.value as T.Texture).dispose();this.material.uniforms.cliffBathymetry.value=detail;this.material.uniforms.cliffBounds.value.copy(depth.bounds);
  }
  constructor(sun:T.Vector3,reef=new LighthouseReef()) {
    this.bottomData=bathymetryData(reef);
    const coast=BATHY_COASTS[1],extent=coast.size*1.2;
    this.islandDepth=new IslandDepth(1,hornoyaDepthData(),HORNOYA_SEGMENTS+1,new T.Vector4(coast.x-extent,coast.z-extent,extent*2,extent*2));
    this.mesh=new Reflector(radialGeometry(),{textureWidth:1536,textureHeight:1536,multisample:0,clipBias:0.012});
    const reflect=this.mesh.onBeforeRender.bind(this.mesh);
    this.mesh.onBeforeRender=(renderer,scene,camera,...args)=> {
      if(this.reflectedView===camera&&!this.mesh.forceUpdate)return;
      if(this.material.uniforms.hasFoamEnvironment.value)captureReflectedGeometry(renderer,scene,()=>reflect(renderer,scene,camera,...args));
      else reflect(renderer,scene,camera,...args);
      this.reflectedView=camera;
    };
    this.mesh.getRenderTarget().texture.generateMipmaps=true;this.mesh.getRenderTarget().texture.minFilter=T.LinearMipmapLinearFilter;
    this.mesh.rotation.x=-Math.PI/2;this.mesh.frustumCulled=false;
    this.material=this.mesh.material as T.ShaderMaterial;this.material.lights=false;this.material.side=T.DoubleSide;
    Object.assign(this.material.defines,{ENVMAP_TYPE_CUBE_UV:'',CUBEUV_TEXEL_WIDTH:1/336,CUBEUV_TEXEL_HEIGHT:1/64,CUBEUV_MAX_MIP:'4.0'});
    Object.assign(this.material.uniforms,{
      mirrorSampler:{value:this.mesh.getRenderTarget().texture},eye:{value:new T.Vector3()},time:{value:0},sunDirection:{value:sun},sunColor:{value:new T.Color(0xffe7bf)},seaScale:{value:SEA_SCALE.breeze},
      dusk:{value:0.4},foamEnabled:{value:true},whitecapFiltering:{value:true},seabedMap:{value:null},hasSeabedMap:{value:false},vessels:{value:Array.from({length:2},()=>new T.Vector4())},vesselDirections:{value:Array.from({length:2},()=>new T.Vector2(1,0))},vesselWidths:{value:[17,4.5]},vesselSpeeds:{value:[0,0]},
      cruiseInverse:{value:new T.Matrix4()},
      chopScale:{value:this.simulation.horizontalScale},
      slopeVariance:{value:new T.Vector3()},
      heightVariance:{value:new T.Vector3()},
      slopeMipEnergy:{value:Array.from({length:8},()=>new T.Vector3())},heightMipEnergy:{value:Array.from({length:8},()=>new T.Vector3())},
      slopeMipCross:{value:Array.from({length:8},()=>new T.Vector3())},heightMipCross:{value:Array.from({length:8},()=>new T.Vector3())},
      wakePoints:{value:Array.from({length:2*WAKE_SAMPLES},()=>new T.Vector4())},wakeBounds:{value:Array.from({length:2},()=>new T.Vector4())},
      reflectionSize:{value:1536},
      foamEnvironment:{value:null},hasFoamEnvironment:{value:false},foamEnvironmentIntensity:{value:0},foamEnvironmentRotation:{value:new T.Matrix3()},
      skyReflectionIntensity:{value:1},skyReflectionRotation:{value:new T.Matrix3()},
      foamSunIrradiance:{value:new T.Color(0)},foamSkyIrradiance:{value:new T.Color(0)},foamGroundIrradiance:{value:new T.Color(0)},foamHemisphereDirection:{value:new T.Vector3(0,1,0)},
      islands:{value:BATHY_COASTS.map(c=>new T.Vector4(c.x,c.z,c.size,c.sizeZ??c.size))},
    });
    const cliffBottom=new T.DataTexture(new Float32Array([-60]),1,1,T.RedFormat,T.FloatType);cliffBottom.needsUpdate=true;
    this.material.uniforms.cliffBathymetry={value:cliffBottom};this.material.uniforms.cliffBounds={value:new T.Vector4()};
    const islandBottom=new T.DataTexture(this.islandDepth.data,this.islandDepth.width,this.islandDepth.width,T.RedFormat,T.FloatType);
    islandBottom.magFilter=islandBottom.minFilter=T.NearestFilter;islandBottom.needsUpdate=true;
    Object.assign(this.material.uniforms,{islandBathymetry:{value:islandBottom},islandBounds:{value:this.islandDepth.bounds},islandDepthSize:{value:this.islandDepth.width},islandDepthChannel:{value:this.islandDepth.channel}});
    const bottom=new T.DataTexture(this.bottomData,BATHY_SIZE,BATHY_SIZE,T.RGBAFormat,T.FloatType);
    bottom.magFilter=bottom.minFilter=T.NearestFilter;bottom.needsUpdate=true;this.material.uniforms.bathymetry={value:bottom};
    this.simulation.cascades.forEach((c,i)=> {
      for(const [name,data] of [['displacement',c.displacement],['tangentX',c.tangentX],['tangentZ',c.tangentZ]] as const) {
        const texture=new T.DataTexture(data,c.size,c.size,T.RGBAFormat,T.FloatType);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
        texture.mipmaps=this.waveMipmaps[i][name].levels;texture.generateMipmaps=false;texture.needsUpdate=true;
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
      ${wakeSurfaceCode}
      ${waterOpticsCode}
      uniform sampler2D mirrorSampler;
      uniform float skyReflectionIntensity;uniform mat3 skyReflectionRotation;
      uniform sampler2D foamEnvironment;uniform bool hasFoamEnvironment;uniform float foamEnvironmentIntensity;
      uniform mat3 foamEnvironmentRotation;uniform vec3 foamSunIrradiance,foamSkyIrradiance,foamGroundIrradiance,foamHemisphereDirection;
      #include <cube_uv_reflection_fragment>
      uniform vec3 eye,sunDirection,sunColor;uniform float time,dusk,reflectionSize;uniform bool foamEnabled;
      uniform vec4 vessels[2];uniform vec2 vesselDirections[2];uniform float vesselWidths[2],vesselSpeeds[2];
      uniform mat4 cruiseInverse;
      uniform vec4 wakePoints[${2*WAKE_SAMPLES}],wakeBounds[2];
      varying vec3 worldPosition;varying vec2 waveCoordinate;varying vec4 mirrorCoord;
      ${oceanReflectionCode}
      vec3 foamIllumination(vec3 normal) {
        vec3 irradiance=mix(foamGroundIrradiance,foamSkyIrradiance,0.5*dot(normal,foamHemisphereDirection)+0.5);
        irradiance+=foamSunIrradiance*max(dot(normal,sunDirection),0.0);
        if(hasFoamEnvironment)irradiance+=3.14159265359*textureCubeUV(foamEnvironment,foamEnvironmentRotation*normal,1.0).rgb*foamEnvironmentIntensity;
        return max(irradiance,vec3(0.0))*0.31830988618;
      }
      float hash(vec2 p) {
        uint h=uint(int(p.x))*0x9e3779b9u^uint(int(p.y))*0x85ebca6bu;
        h=(h^(h>>16u))*0x85ebca6bu;h=(h^(h>>13u))*0xc2b2ae35u;h^=h>>16u;
        return float(h>>8u)/16777216.0;
      }
      float noise(vec2 p) {vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
      float foamNoise(vec2 p) {return noise(p)*0.55+noise(p*2.17+8.6)*0.3+noise(p*4.79)*0.15;}
      ${whitecapCode}
      vec3 shortWave(vec2 p,float footprint,float wavelength,float angle,float steepness,float phase) {
        float k=6.28318530718/wavelength,omega=sqrt(9.81*k+0.000074*k*k*k);
        vec2 direction=vec2(cos(angle),sin(angle));
        float resolved=1.0-smoothstep(wavelength*0.25,wavelength*0.5,footprint);
        return vec3(direction*steepness*cos(dot(p,direction)*k-omega*time+phase)*resolved,0.25*steepness*steepness*(1.0-resolved*resolved));
      }
      vec3 ripplesAt(vec2 p,float footprint) {
        // Sub-centimetre wind waves occupy wavelengths below the FFT's 0.45 m band.
        vec3 ripple=shortWave(p,footprint,0.31,0.52,0.018,0.4)
          +shortWave(p,footprint,0.231,0.9,0.020,2.1)
          +shortWave(p,footprint,0.169,0.18,0.017,4.7)
          +shortWave(p,footprint,0.123,1.14,0.014,1.3)
          +shortWave(p,footprint,0.087,0.66,0.009,5.2)
          +shortWave(p,footprint,0.061,1.02,0.006,3.4);
        float strength=sqrt(clamp(seaScale/1.15,0.25,2.0));
        return ripple*vec3(strength,strength,strength*strength);
      }
      void main() {
        vec3 view=normalize(eye-worldPosition);float distanceToEye=length(eye-worldPosition);vec2 p=worldPosition.xz;
        float footprint=max(length(dFdx(waveCoordinate)),length(dFdy(waveCoordinate)));
        vec2 foamQDx=dFdx(waveCoordinate),foamQDy=dFdy(waveCoordinate),foamPDx=dFdx(p),foamPDy=dFdy(p);
        // Transfer subpixel wave slopes into the BRDF before the hull discard.
        vec3 lod=waveLod(footprint);
        vec3 normal=normalAt(waveCoordinate,lod);
        float waterFootprint=max(length(dFdx(p)),length(dFdy(p)));
        vec3 ripple=ripplesAt(p,waterFootprint);
        normal=normalize(vec3(normal.x-ripple.x*normal.y,normal.y,normal.z-ripple.y*normal.y));
        vec3 normalFootprint=fwidth(normal);
        float unresolvedVariance=spectralVarianceAt(waveCoordinate,lod)+ripple.z;
        // Resolve porous shoreline foam before hull discard; average subpixel pores.
        vec3 grain=vec3(noise(p*24.0),noise(p*52.08+8.6),noise(p*114.96));
        vec3 grainResolved=1.0-smoothstep(vec3(0.25),vec3(0.5),waterFootprint*vec3(24.0,52.08,114.96));
        float foamGrain=dot(grain,vec3(0.55,0.3,0.15)),filteredGrain=dot(mix(vec3(0.5),grain,grainResolved),vec3(0.55,0.3,0.15));
        float grainEdge=max(0.02,0.5*fwidth(foamGrain));
        float shoreDetail=mix(0.5,smoothstep(0.5-grainEdge,0.5+grainEdge,filteredGrain),grainResolved.x);
        vec2 mirrorUV=mirrorCoord.xy/max(mirrorCoord.w,0.001);
        // Subtract the origin before rotating to preserve long-route precision.
        vec3 cruiseLocal=mat3(cruiseInverse)*(worldPosition-vessels[0].xyz);
        float cruiseWidth=cruiseHullWidthAt(cruiseLocal);
        bool hullCutout=cruiseWidth>=0.0&&abs(cruiseLocal.x)<cruiseWidth*0.98;
        float wakeFoam=0.0,n=foamNoise(p*0.53+vec2(time*0.12,-time*0.09));
        vec2 wakeGradient=vec2(0);
        for(int i=0;i<2;i++) {
          vec2 rel=p-vessels[i].xz;float c=vesselDirections[i].x,s=vesselDirections[i].y;vec2 local=vec2(c*rel.x-s*rel.y,s*rel.x+c*rel.y);
          float length=vessels[i].w,width=vesselWidths[i],speed=vesselSpeeds[i],aft=local.y-length*0.5,bow=local.y+length*0.5;
          float u=(local.y+length*0.5)/length;
          if(i==1&&u>0.0&&u<1.0) {
            float shape=pow(max(sin(u*3.14159),0.001),0.42);
            if(u>0.78)shape=mix(shape,0.72,smoothstep(0.78,1.0,u));
            if(abs(local.x)<width*shape*0.98)hullCutout=true;
          }
          float safeAft=max(aft,0.0);
          float launched=1.0-smoothstep(max(time*speed-2.0,0.0),max(time*speed,0.01),safeAft);
          float trail=step(0.0,aft)*exp(-safeAft/80.0)*smoothstep(0.5,3.0,speed)*launched,kelvin=abs(local.x)-width-safeAft*0.354,crest=exp(-kelvin*kelvin/(3.0+safeAft*0.1));
          wakeFoam+=trail*crest*0.72*smoothstep(0.18,0.75,n);
          wakeGradient+=wakeSlope(local,aft,width,speed,time,vesselDirections[i]);
          if(all(greaterThanEqual(p,wakeBounds[i].xy))&&all(lessThanEqual(p,wakeBounds[i].zw))) {
            float historical=0.0;
            for(int j=0;j<${WAKE_SAMPLES-1};j++) {
              vec4 a=wakePoints[i*${WAKE_SAMPLES}+j],b=wakePoints[i*${WAKE_SAMPLES}+j+1];vec2 segment=b.xy-a.xy;
              float length2=dot(segment,segment);if(length2<0.0001)continue;
              float along=clamp(dot(p-a.xy,segment)/length2,0.0,1.0),age=mix(a.z,b.z,along),emissionSpeed=mix(a.w,b.w,along);
              vec2 across=p-mix(a.xy,b.xy,along);float travelled=age*emissionSpeed;
              float tail=1.0-smoothstep(${(WAKE_SAMPLES-3)*WAKE_STEP}.0,${(WAKE_SAMPLES-1)*WAKE_STEP}.0,age);
              historical=max(historical,exp(-dot(across,across)/max(width*width+travelled*1.1,0.1))*exp(-age/48.0)*tail*smoothstep(0.5,3.0,emissionSpeed));
            }
            wakeFoam+=historical*0.63*smoothstep(0.18,0.75,n);
          }
          float edge=exp(-pow((abs(local.x)-width)/1.8,2.0))*(1.0-smoothstep(length*0.44,length*0.53,abs(local.y))),bowFoam=exp(-bow*bow/40.0-local.x*local.x/(width*width));
          wakeFoam+=(edge*0.22+bowFoam*0.75)*smoothstep(0.2,0.65,n)*smoothstep(0.2,3.0,speed);
        }
        normal=normalize(vec3(normal.x-wakeGradient.x*normal.y,normal.y,normal.z-wakeGradient.y*normal.y));
        float nv=max(dot(normal,view),0.015),fresnel=0.0204+0.9796*pow(1.0-nv,5.0);
        float distortion=0.012+0.16/max(distanceToEye,2.0);
        vec2 reflectionUV=mirrorUV+normal.xz*distortion;
        float mirrorFootprint=max(length(dFdx(reflectionUV)),length(dFdy(reflectionUV)))*reflectionSize;
        float reflectionLOD=log2(max(1.0,max(mirrorFootprint,sqrt(unresolvedVariance)*distortion*reflectionSize)));
        if(hullCutout)discard;
        vec3 reflected=seaReflection(view,normal,unresolvedVariance,normalFootprint,reflectionUV,reflectionLOD);float shoreFoam=0.0;
        // Optical depth follows the displaced fragment and includes the detailed cliff shelf.
        vec3 bottom=coastalBottom(p);float bottomHeight=bottom.x,depth=max(worldPosition.y-bottomHeight,0.0);
        float wash=0.65+0.35*sin(time*1.2+bottomHeight*1.8);
        shoreFoam=(1.0-smoothstep(0.4,3.2,depth))*wash*smoothstep(0.23,0.65,n);
        shoreFoam=max(shoreFoam,smoothstep(0.3,0.7,1.0-normal.y)*(1.0-smoothstep(0.5,4.0,max(-bottomHeight,0.0))));
        shoreFoam*=shoreDetail;
        vec3 waterRadiance=coastalWaterRadiance(p,bottom,depth,view,sunDirection,sunColor);
        float crestLight=max(displacementAt(waveCoordinate).y,0.0)*(1.0-nv)*pow(max(dot(-sunDirection,view),0.0),3.0);waterRadiance+=vec3(0.018,0.11,0.078)*crestLight;
        vec3 halfV=normalize(view+sunDirection);
        float sunFresnel=0.0204+0.9796*pow(1.0-clamp(dot(view,halfV),0.0,1.0),5.0);
        float a2=pow(0.12,4.0)+min(0.2,unresolvedVariance+0.15*dot(normalFootprint,normalFootprint));
        float nh=max(dot(normal,halfV),0.0),nl=max(dot(normal,sunDirection),0.001),den=nh*nh*(a2-1.0)+1.0;
        float distribution=a2/(3.14159*den*den+0.000001),masking=2.0*nv/(nv+sqrt(a2+(1.0-a2)*nv*nv));masking*=2.0*nl/(nl+sqrt(a2+(1.0-a2)*nl*nl));
        vec3 glint=sunColor*distribution*masking*sunFresnel*0.19/max(4.0*nv,0.1);
        float breaking=whitecapFootprint(waveCoordinate,p,foamQDx,foamQDy,foamPDx,foamPDy),foam=foamEnabled?clamp(breaking*0.82+wakeFoam+shoreFoam*0.8,0.0,0.97):0.0;
        vec3 foamColor=vec3(0.78,0.86,0.84)*(0.76+filteredGrain*0.3)*foamIllumination(normal);
        vec3 color=mix(waterRadiance*(1.0-fresnel)+reflected*fresnel+min(glint,vec3(9.0)),foamColor,foam);
        float haze=1.0-exp(-distanceToEye*0.0001);color=mix(color,mix(vec3(0.45,0.62,0.72),vec3(0.62,0.45,0.32),dusk),haze);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
  }
  private foamRotation=new T.Matrix4();
  setLighting(scene:T.Scene,sunlight:T.DirectionalLight,hemisphere:T.HemisphereLight) {
    const u=this.material.uniforms,environment=scene.environment;
    const height=(environment?.image as {height?:number}|undefined)?.height;
    const valid=environment?.mapping===T.CubeUVReflectionMapping&&height!==undefined&&height>=64;
    u.hasFoamEnvironment.value=valid;u.foamEnvironment.value=valid?environment:null;
    u.foamEnvironmentIntensity.value=scene.environmentIntensity;
    u.foamEnvironmentRotation.value.setFromMatrix4(this.foamRotation.makeRotationFromEuler(scene.environmentRotation)).transpose();
    u.skyReflectionIntensity.value=scene.backgroundIntensity;
    u.skyReflectionRotation.value.setFromMatrix4(this.foamRotation.makeRotationFromEuler(scene.backgroundRotation)).transpose();
    u.foamSunIrradiance.value.copy(sunlight.color).multiplyScalar(sunlight.intensity);
    u.foamSkyIrradiance.value.copy(hemisphere.color).multiplyScalar(hemisphere.intensity);
    u.foamGroundIrradiance.value.copy(hemisphere.groundColor).multiplyScalar(hemisphere.intensity);
    hemisphere.getWorldPosition(u.foamHemisphereDirection.value).normalize();
    if(valid) {
      const maxMip=Math.log2(height!)-2,defines=this.material.defines;
      const width=1/(3*Math.max(2**maxMip,112)),texelHeight=1/height!;
      if(defines.CUBEUV_TEXEL_WIDTH!==width||defines.CUBEUV_TEXEL_HEIGHT!==texelHeight) {
        Object.assign(defines,{CUBEUV_TEXEL_WIDTH:width,CUBEUV_TEXEL_HEIGHT:texelHeight,CUBEUV_MAX_MIP:maxMip.toFixed(1)});this.material.needsUpdate=true;
      }
    }
  }
  heightAt(x:number,z:number) {return this.simulation.heightAt(x,z,SEA_SCALE[this.state],this.coastalScale);}
  configureFiltering(floatLinear:boolean) {
    this.material.uniforms.manualInterpolation={value:!floatLinear};
    this.textures.forEach(texture=>{texture.magFilter=floatLinear?T.LinearFilter:T.NearestFilter;texture.minFilter=floatLinear?T.LinearMipmapLinearFilter:T.NearestMipmapNearestFilter;texture.needsUpdate=true;});
  }
  refreshFields() {
    this.waveMipmaps.forEach(fields=>Object.values(fields).forEach(mips=>mips.update()));this.textures.forEach(t=>t.needsUpdate=true);
    const scale=SEA_SCALE[this.state]**2;
    for(let level=0;level<8;level++) {
      this.material.uniforms.slopeMipEnergy.value[level].set(...this.waveMipmaps.map(f=>(f.tangentX.energy[level]+f.tangentZ.energy[level])*scale));
      this.material.uniforms.heightMipEnergy.value[level].set(...this.waveMipmaps.map(f=>f.displacement.energy[level]*scale));
      this.material.uniforms.slopeMipCross.value[level].set(...this.waveMipmaps.map(f=>(f.tangentX.crossEnergy[level]+f.tangentZ.crossEnergy[level])*scale));
      this.material.uniforms.heightMipCross.value[level].set(...this.waveMipmaps.map(f=>f.displacement.crossEnergy[level]*scale));
    }
    this.fieldsDirty=false;
  }
  advance(time:number,state:SeaState) {
    this.state=state;
    if(this.simulation.update(time,SEA_SCALE[state]))this.fieldsDirty=true;
    this.material.uniforms.time.value=time;this.material.uniforms.seaScale.value=SEA_SCALE[state];
    this.material.uniforms.chopScale.value=this.simulation.horizontalScale;
    this.material.uniforms.slopeVariance.value.set(...this.simulation.cascades.map(c=>c.slopeVariance*SEA_SCALE[state]**2));
    this.material.uniforms.heightVariance.value.set(...this.simulation.cascades.map(c=>c.heightVariance*SEA_SCALE[state]**2));
  }
  update(time:number,camera:T.Vector3,state:SeaState) {
    this.reflectedView=null;
    this.advance(time,state);if(this.fieldsDirty)this.refreshFields();
    this.material.uniforms.eye.value.copy(camera);this.mesh.position.x=camera.x;this.mesh.position.z=camera.z;
  }
  setQuality(quality:string) {
    this.material.uniforms.whitecapFiltering.value=quality!=='balanced';
    const size=quality==='ultra'?3072:quality==='high'?1536:512,target=this.mesh.getRenderTarget();if(target.width!==size)target.setSize(size,size);
    this.material.uniforms.reflectionSize.value=size;
    if(this.quality!==quality) {this.mesh.geometry.dispose();this.mesh.geometry=radialGeometry(quality);this.quality=quality;}
  }
}
