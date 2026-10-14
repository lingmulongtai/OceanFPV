import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CliffSurface} from './cliff';
import {wetCoastalSurface} from './surfaces';

function disposeSource(source:T.Group) {
  const materials=new Set<T.Material>(),textures=new Set<T.Texture>();
  source.traverse(object=>{if(object instanceof T.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
  for(const material of materials){for(const value of Object.values(material))if(value instanceof T.Texture)textures.add(value);material.dispose();}
  for(const texture of textures){texture.dispose();(texture.image as {close?:()=>void})?.close?.();}
}

/** Keep the full photographed geometry and UVs at their captured metre scale. */
export class CoastalCliff {
  readonly surface:CliffSurface;
  static async load(renderer:T.WebGLRenderer,wash:{value:number}) {
    const manager=new T.LoadingManager(),loader=new GLTFLoader(manager);let expired=false,source:T.Group|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const url=new URL(`${import.meta.env.BASE_URL}models/coastal_cliff_02/coastal_cliff_02_4k.gltf`,document.baseURI);
      const pending=loader.loadAsync(url.href).then(model=>{if(expired)disposeSource(model.scene);return model;});
      const model=await Promise.race([pending,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;manager.abort();reject(new Error('Cliff asset deadline'));},45000);})]);
      clearTimeout(timer);source=model.scene;
      const meshes:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>[]=[];
      source.traverse(object=>{if(object instanceof T.Mesh&&!Array.isArray(object.material)&&object.material instanceof T.MeshStandardMaterial)meshes.push(object as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>);});
      if(meshes.length!==1||meshes[0].geometry.index?.count!==2829852||!meshes[0].material.map||!meshes[0].material.normalMap||!meshes[0].material.roughnessMap)throw new Error('Incomplete cliff model');
      source.position.set(-390,-3,-450);source.rotation.y=Math.PI/2;source.updateMatrixWorld(true);
      return new CoastalCliff(renderer,source,meshes[0],wash);
    }catch{if(timer)clearTimeout(timer);if(source)disposeSource(source);return null;}
  }
  private constructor(renderer:T.WebGLRenderer,readonly group:T.Group,mesh:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>,wash:{value:number}) {
    mesh.name='photographed-coastal-cliff';mesh.castShadow=mesh.receiveShadow=true;
    for(const value of Object.values(mesh.material))if(value instanceof T.Texture)value.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
    wetCoastalSurface(mesh.material,wash);
    this.surface=new CliffSurface(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  }
  dispose(){this.surface.geometry.dispose();disposeSource(this.group);}
}
