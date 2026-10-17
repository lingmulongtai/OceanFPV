import * as T from 'three';
import {POOL} from './cruise-pools';

/** Periodic millimetre-scale ripples, encoded in the plane's tangent basis. */
export function poolRippleTexture() {
  const size=256,pixels=new Uint8Array(size*size*4),waves=[[3,1,.003],[-2,4,.0015],[5,-3,.0008]];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=(x+.5)/size,v=(y+.5)/size;let nx=0,ny=0;
    for(const [a,b,height]of waves){const slope=height*Math.PI*Math.cos(2*Math.PI*(a*u+b*v));nx-=a*slope;ny-=b*slope;}
    const length=Math.hypot(nx,ny,1),i=(y*size+x)*4;pixels[i]=Math.round((nx/length*.5+.5)*255);pixels[i+1]=Math.round((ny/length*.5+.5)*255);pixels[i+2]=Math.round((1/length*.5+.5)*255);pixels[i+3]=255;
  }
  const texture=new T.DataTexture(pixels,size,size);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=8;texture.repeat.set(POOL.innerBeam/2,POOL.innerLength/2);texture.needsUpdate=true;return texture;
}

export function createPoolWater() {
  const phase={value:0},material=new T.MeshPhysicalMaterial({color:0xe4f5f1,roughness:.045,metalness:0,transmission:.96,opacity:1,ior:1.333,thickness:POOL.water-POOL.bottom,attenuationColor:0x79c5bd,attenuationDistance:4,normalMap:poolRippleTexture(),envMapIntensity:1.15});
  material.name='Cruise pool water';material.customProgramCacheKey=()=> 'cruise-pool-water-v1';
  const original='vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;';
  const normals=T.ShaderChunk.normal_fragment_maps.replace(original,`vec3 poolA=texture2D(normalMap,vNormalMapUv+poolPhase*vec2(13.0,-9.0)).xyz*2.0-1.0;
    vec3 poolB=texture2D(normalMap,vNormalMapUv*1.73+poolPhase*vec2(-11.0,17.0)).xyz*2.0-1.0;
    vec3 mapN=normalize(vec3((poolA.xy+poolB.xy)*0.65,1.0));`);
  if(normals===T.ShaderChunk.normal_fragment_maps)throw new Error('Pool normals require the expected Three.js normal-map chunk');
  material.onBeforeCompile=shader=>{shader.uniforms.poolPhase=phase;shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float poolPhase;').replace('#include <normal_fragment_maps>',normals);};
  // Integer texture shifts make the 100-second wrap seamless and precise on long routes.
  return {material,advance:(time:number)=>{phase.value=(time%100)/100;}};
}

/** Metre-scaled UVs from the basin geometry keep floor and wall grout consistent. */
export function createPoolTiles() {
  const material=new T.MeshPhysicalMaterial({color:0x6caeb9,roughness:.4,metalness:0,clearcoat:.35,clearcoatRoughness:.15});material.name='Cruise pool tiles';material.customProgramCacheKey=()=> 'cruise-pool-tiles-v1';
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 poolTileUv;').replace('#include <begin_vertex>','#include <begin_vertex>\npoolTileUv=uv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 poolTileUv;').replace('#include <color_fragment>',`#include <color_fragment>
      vec2 cell=fract(poolTileUv),edge=min(cell,1.0-cell),footprint=max(fwidth(poolTileUv),vec2(0.0001));
      vec2 seams=1.0-smoothstep(vec2(0.015),vec2(0.015)+footprint,edge);float grout=max(seams.x,seams.y);
      float variation=fract(sin(dot(floor(poolTileUv),vec2(127.1,311.7)))*43758.5453);
      diffuseColor.rgb*=mix(vec3(mix(0.93,1.04,variation)),vec3(0.62,0.72,0.74),grout);`);
  };return material;
}
