import * as T from 'three';

export type SurfaceGroup={asset:string;resolution:'1k'|'2k';materials:T.MeshStandardMaterial[];colour:boolean;roughness?:number};
/** Use the same slope/height cover weight for colour, roughness and normals. */
export function blendGroundCover(material:T.MeshStandardMaterial,cover:T.MeshStandardMaterial) {
  const available=()=>!!(material.map&&material.normalMap&&cover.map&&cover.normalMap&&cover.roughnessMap);
  material.customProgramCacheKey=()=>`coastal-cover-${available()}`;
  material.onBeforeCompile=shader=> {
    if(!available())return;
    Object.assign(shader.uniforms,{coverMap:{value:cover.map},coverNormalMap:{value:cover.normalMap},coverRoughnessMap:{value:cover.roughnessMap}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float groundCover;varying float vGroundCover;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundCover=groundCover;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D coverMap,coverNormalMap,coverRoughnessMap;varying float vGroundCover;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec3 groundBase=diffuseColor.rgb;
      #include <map_fragment>
      diffuseColor.rgb=mix(diffuseColor.rgb,groundBase*texture2D(coverMap,vMapUv*6.0).rgb,vGroundCover);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,roughness*texture2D(coverRoughnessMap,vMapUv*6.0).g,vGroundCover);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      #ifdef USE_NORMALMAP_TANGENTSPACE
        vec3 coverN=texture2D(coverNormalMap,vMapUv*6.0).xyz*2.0-1.0;coverN.xy*=normalScale;
        normal=normalize(mix(normal,normalize(tbn*coverN),vGroundCover));
      #endif`);
  };
}
/** Residual wave wash on porous rock, using fragment world height on meshes and instances. */
export function wetCoastalSurface(material:T.MeshStandardMaterial,wash:{value:number}) {
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey=()=>`coastal-wet-${key()}`;
  material.onBeforeCompile=(shader,renderer)=> {
    compile.call(material,shader,renderer);shader.uniforms.shoreWash=wash;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCoastPosition;');
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      vec4 coastPosition=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        coastPosition=instanceMatrix*coastPosition;
      #endif
      vCoastPosition=(modelMatrix*coastPosition).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float shoreWash;varying vec3 vCoastPosition;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float washReach=shoreWash*1.5*(0.9+0.1*sin(vCoastPosition.x*0.19+sin(vCoastPosition.z*0.23)*2.0)*sin(vCoastPosition.z*0.13));
      float coastWetness=shoreWash>0.0?1.0-smoothstep(0.15,washReach,vCoastPosition.y):0.0;
      diffuseColor.rgb*=mix(1.0,0.62,coastWetness);`);
    // Run after the photographed rock/cover roughness has been blended.
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`roughnessFactor*=mix(1.0,0.45,coastWetness);
      #include <metalnessmap_fragment>`);
  };
}
/** Optional local assets fail as one coherent material group, retaining fallback. */
export async function loadSurfaces(groups:SurfaceGroup[],anisotropy:number) {
  const unique=new Map<string,SurfaceGroup>();
  for(const group of groups){const key=`${group.asset}:${group.resolution}:${group.colour}:${group.roughness??''}`;const existing=unique.get(key);if(existing)existing.materials.push(...group.materials);else unique.set(key,{...group,materials:[...group.materials]});}
  const results=await Promise.all(Array.from(unique.values()).map(async group=> {
    const names=group.colour?['diff','nor_gl','rough']:['nor_gl','rough'];
    const loaded=await Promise.allSettled(names.map(async name=> {
      const url=new URL(`${import.meta.env.BASE_URL}textures/${group.asset}_${name}_${group.resolution}.jpg`,document.baseURI);
      const response=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error(`Texture ${response.status}`);
      const bitmap=await createImageBitmap(await response.blob(),{imageOrientation:'flipY',premultiplyAlpha:'none'});
      const texture=new T.Texture(bitmap);texture.flipY=false;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=Math.min(16,anisotropy);
      if(name==='diff')texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;return {name,texture};
    }));
    if(loaded.some(result=>result.status==='rejected')) {
      loaded.forEach(result=>{if(result.status==='fulfilled'){result.value.texture.dispose();(result.value.texture.image as ImageBitmap).close();}});return group.asset;
    }
    const textures=Object.fromEntries(loaded.map(result=>{if(result.status!=='fulfilled')throw new Error('Unreachable material state');return [result.value.name,result.value.texture];}));
    for(const material of group.materials) {
      if(group.colour)material.map=textures.diff;
      material.normalMap=textures.nor_gl;material.normalScale.set(group.colour?0.65:0.22,group.colour?0.65:0.22);material.roughnessMap=textures.rough;
      if(group.roughness!==undefined)material.roughness=group.roughness;
      material.bumpMap=null;material.needsUpdate=true;
    }
    return null;
  }));
  return results.filter((result):result is string=>result!==null);
}
