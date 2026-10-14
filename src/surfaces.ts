import * as T from 'three';

export type SurfaceGroup={asset:string;resolution:'1k'|'2k'|'4k';materials:T.MeshStandardMaterial[];colour:boolean;roughness?:number};
/** World-space projections keep photographed scale on ground and steep cliffs. */
export function blendGroundCover(material:T.MeshStandardMaterial,cover:T.MeshStandardMaterial) {
  const available=()=>!!(material.map&&material.normalMap&&material.roughnessMap&&cover.map&&cover.normalMap&&cover.roughnessMap);
  material.customProgramCacheKey=()=>`coastal-cover-triplanar-${available()}`;
  material.onBeforeCompile=shader=> {
    if(!available())return;
    Object.assign(shader.uniforms,{coverMap:{value:cover.map},coverNormalMap:{value:cover.normalMap},coverRoughnessMap:{value:cover.roughnessMap}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float groundCover;varying float vGroundCover;varying vec3 vGroundPosition,vGroundNormal;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundCover=groundCover;')
      .replace('#include <project_vertex>',`#include <project_vertex>
        vGroundPosition=(modelMatrix*vec4(transformed,1.0)).xyz;
        vGroundNormal=transformNormalByInverseViewMatrix(transformedNormal,viewMatrix);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D coverMap,coverNormalMap,coverRoughnessMap;
      varying float vGroundCover;varying vec3 vGroundPosition,vGroundNormal;
      vec3 groundWeights(){vec3 w=pow(abs(normalize(vGroundNormal)),vec3(4.0));return w/max(dot(w,vec3(1.0)),0.0001);}
      vec4 groundSample(sampler2D surface,float metres){
        vec3 w=groundWeights();
        return texture2D(surface,vGroundPosition.zy/metres)*w.x+texture2D(surface,vGroundPosition.xz/metres)*w.y+texture2D(surface,vGroundPosition.xy/metres)*w.z;
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normalmap_pars_fragment>',`#include <normalmap_pars_fragment>
      #if defined(USE_NORMALMAP_TANGENTSPACE) && !defined(USE_TANGENT)
        vec3 groundNormal(sampler2D surface,float metres,vec3 baseNormal,vec3 eyePosition){
          vec2 ux=vGroundPosition.zy/metres,uy=vGroundPosition.xz/metres,uz=vGroundPosition.xy/metres;
          vec3 nx=texture2D(surface,ux).xyz*2.0-1.0,ny=texture2D(surface,uy).xyz*2.0-1.0,nz=texture2D(surface,uz).xyz*2.0-1.0;
          nx.xy*=normalScale;ny.xy*=normalScale;nz.xy*=normalScale;
          vec3 w=groundWeights();
          return normalize(normalize(getTangentFrame(eyePosition,baseNormal,ux)*nx)*w.x+normalize(getTangentFrame(eyePosition,baseNormal,uy)*ny)*w.y+normalize(getTangentFrame(eyePosition,baseNormal,uz)*nz)*w.z);
        }
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec3 groundBase=diffuseColor.rgb;
      diffuseColor*=groundSample(map,90.0);
      diffuseColor.rgb=mix(diffuseColor.rgb,groundBase*groundSample(coverMap,15.0).rgb,vGroundCover);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`float roughnessFactor=roughness*mix(groundSample(roughnessMap,90.0).g,groundSample(coverRoughnessMap,15.0).g,vGroundCover);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #if defined(USE_NORMALMAP_TANGENTSPACE) && !defined(USE_TANGENT)
        normal=normalize(mix(groundNormal(normalMap,90.0,nonPerturbedNormal,-vViewPosition),groundNormal(coverNormalMap,15.0,nonPerturbedNormal,-vViewPosition),vGroundCover));
      #else
        #include <normal_fragment_maps>
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
