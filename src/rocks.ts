import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';
import { terrainSlope, terrainSurfaceHeight } from './terrain';
import { type Coast } from './bathymetry';
import {LIGHTHOUSE_COAST,type LighthouseReef} from './lighthouse-reef';
import { wetCoastalSurface } from './surfaces';

export type RockSite={x:number;z:number;scale:number;yaw:number};
export type RockPatch={sites:RockSite[];coast:Coast;fallback?:T.InstancedMesh;heightAt?:(x:number,z:number)=>number|null;avoid?:T.Box3[]};
type RockPlacement={matrix:T.Matrix4;inverse:T.Matrix4;bounds:T.Box3;scale:number};

/** Low coastal shelves support boulders without turning them upright on cliffs. */
export function coastalRockSites(coast:RockPatch['coast']) {
  const sites:RockSite[]=[];
  for(let i=0;i<2040&&sites.length<90;i++) {
    const angle=i*2.399963,radial=((i*37)%101)/100,r=coast.size*(coast.profile==='headland'?Math.sqrt(radial)*1.09:0.72+radial*0.37),x=Math.cos(angle)*r,z=Math.sin(angle)*r,scale=1.1+(i%7)*0.28;
    const height=terrainSurfaceHeight(x,z,coast.size,coast.height,coast.profile);
    if(height< -2||height>14||terrainSlope(x,z,coast.size,coast.height,coast.profile)>Math.PI/4.5)continue;
    if(sites.some(site=>Math.hypot(coast.x+x-site.x,coast.z+z-site.z)<1.8*(scale+site.scale)*0.75))continue;
    sites.push({x:coast.x+x,z:coast.z+z,scale,yaw:angle});
  }
  return sites;
}

/** Scanned outcrops sit on the actual reef, with tower and known flight space clear. */
export function lighthouseRockPatch(reef:LighthouseReef):RockPatch {
  const sites=[[-24,-7,2.2,0.4],[-8,-18,2.8,1.9],[12,-15,3.2,0.8],[22,-7,2.8,2.3],[20,10,2.7,1.4],[5,18,2.8,2.8],[-13,16,2.4,0.1],[-24,2,2.2,1.2],[-8,8,2.6,1.8]]
    .map(([x,z,scale,yaw])=>({x:reef.x+x,z:reef.z+z,scale,yaw})).filter(site=>(reef.topHeight(site.x,site.z)??-60)>0);
  const tower=new T.Box3(new T.Vector3(reef.x-3.5,9,reef.z-3.5),new T.Vector3(reef.x+3.5,39,reef.z+3.5)).expandByScalar(0.25);
  const flightSpace=new T.Box3().setFromCenterAndSize(new T.Vector3(reef.x+30,10,reef.z),new T.Vector3(1,1,1));
  return {sites,coast:LIGHTHOUSE_COAST,heightAt:(x,z)=>reef.topHeight(x,z),avoid:[tower,flightSpace]};
}

/** Rigid transforms retain photographed UVs, seams and captured normals. */
export function normaliseRockGeometry(source:T.BufferGeometry,matrix=new T.Matrix4()) {
  const geometry=source.clone().applyMatrix4(matrix);geometry.rotateY(Math.PI/2);geometry.scale(10,10,10);geometry.computeBoundingBox();
  const bounds=geometry.boundingBox!,centre=bounds.getCenter(new T.Vector3());
  geometry.translate(-centre.x,-bounds.min.y,-centre.z);geometry.computeBoundingBox();return geometry;
}

export class CoastalRockShape {
  readonly tree:MeshBVH;
  readonly feet:T.Vector3[]=[];
  private readonly point=new T.Vector3();
  private readonly ray=new T.Ray(new T.Vector3(),new T.Vector3(0.431,0.557,0.709).normalize());
  constructor(readonly geometry:T.BufferGeometry) {
    geometry.computeBoundingBox();this.tree=new MeshBVH(geometry,{indirect:true});
    const bounds=geometry.boundingBox!,ray=new T.Ray(new T.Vector3(),new T.Vector3(0,1,0));
    for(let x=bounds.min.x;x<=bounds.max.x;x+=0.16)for(let z=bounds.min.z;z<=bounds.max.z;z+=0.16) {
      ray.origin.set(x,bounds.min.y-0.1,z);const hit=this.tree.raycastFirst(ray,T.DoubleSide);if(hit)this.feet.push(hit.point.clone());
    }
    if(!this.feet.length)throw new Error('Rock has no support footprint');
  }
  place(site:RockSite,heightAt:(x:number,z:number)=>number):RockPlacement;
  place(site:RockSite,heightAt:(x:number,z:number)=>number|null):RockPlacement|null;
  place(site:RockSite,heightAt:(x:number,z:number)=>number|null):RockPlacement|null {
    const sample=(dx:number,dz:number)=>heightAt(site.x+dx,site.z+dz);
    const left=sample(-0.2,0),right=sample(0.2,0),back=sample(0,-0.2),front=sample(0,0.2);
    if(left===null||right===null||back===null||front===null)return null;
    const normal=new T.Vector3(-(right-left)/0.4,1,-(front-back)/0.4).normalize();
    const orientation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),normal).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),site.yaw));
    let support=-Infinity;
    for(const foot of this.feet) {
      this.point.copy(foot).multiplyScalar(site.scale).applyQuaternion(orientation);const height=heightAt(site.x+this.point.x,site.z+this.point.z);
      if(height===null)return null;support=Math.max(support,height-this.point.y);
    }
    // Settle on the highest support, then embed part of the stone into the ground.
    // Using the lowest support instead buries the whole boulder on uneven shores.
    const embed=Math.max(0.12,this.geometry.boundingBox!.getSize(new T.Vector3()).y*site.scale*0.2);
    const matrix=new T.Matrix4().compose(new T.Vector3(site.x,support-embed,site.z),orientation,new T.Vector3().setScalar(site.scale));
    return {matrix,inverse:matrix.clone().invert(),bounds:this.geometry.boundingBox!.clone().applyMatrix4(matrix),scale:site.scale};
  }
  contains(position:T.Vector3,placement:RockPlacement,padding=0.25) {
    const bounds=placement.bounds;
    if(position.x<bounds.min.x-padding||position.x>bounds.max.x+padding||position.y<bounds.min.y-padding||position.y>bounds.max.y+padding||position.z<bounds.min.z-padding||position.z>bounds.max.z+padding)return false;
    this.point.copy(position).applyMatrix4(placement.inverse);
    const nearest=this.tree.closestPointToPoint(this.point,undefined,0,padding/placement.scale);
    if(nearest&&nearest.distance<=padding/placement.scale)return true;
    this.ray.origin.copy(this.point);const hit=this.tree.raycastFirst(this.ray,T.DoubleSide);
    // The geometric face normal is outward; interpolated hit.normal faces the ray.
    return !!hit?.face&&hit.face.normal.dot(this.ray.direction)>0;
  }
}

/** Custom mesh ground can reject unsupported feet; exclusions stay in world metres. */
export function rockPatchPlacements(shape:CoastalRockShape,patch:RockPatch) {
  const {coast}=patch,heightAt=patch.heightAt??((x:number,z:number)=>terrainSurfaceHeight(x-coast.x,z-coast.z,coast.size,coast.height,coast.profile));
  return patch.sites.map(site=>shape.place(site,heightAt)).filter((p):p is RockPlacement=>p!==null&&!patch.avoid?.some(bounds=>p.bounds.intersectsBox(bounds)));
}

function disposeModel(source:T.Group,disposeTextures=true) {
  const materials=new Set<T.Material>(),textures=new Set<T.Texture>();
  source.traverse(object=> {if(!(object instanceof T.Mesh))return;object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);});
  for(const material of materials){for(const property of Object.values(material))if(property instanceof T.Texture)textures.add(property);material.dispose();}
  if(disposeTextures)for(const texture of textures){texture.dispose();(texture.image as {close?:()=>void})?.close?.();}
}

/** Small immutable batches let every camera cull distant shoreline sections. */
export function buildRockBatches(geometry:T.BufferGeometry,material:T.MeshStandardMaterial,placements:RockPlacement[]) {
  const cells=new Map<string,RockPlacement[]>();
  for(const placement of placements) {
    const position=placement.matrix.elements,key=`${Math.floor(position[12]/32)},${Math.floor(position[14]/32)}`;
    if(!cells.has(key))cells.set(key,[]);cells.get(key)!.push(placement);
  }
  return [...cells.values()].map(cell=> {
    const mesh=new T.InstancedMesh(geometry,material,cell.length);mesh.name='photographed-coastal-rock';mesh.castShadow=mesh.receiveShadow=true;
    cell.forEach((placement,i)=>mesh.setMatrixAt(i,placement.matrix));
    mesh.computeBoundingBox();mesh.computeBoundingSphere();return mesh;
  });
}

export class CoastalRocks {
  readonly group=new T.Group();
  readonly shape:CoastalRockShape;
  readonly placements:RockPlacement[]=[];
  static async load(renderer:T.WebGLRenderer,patches:RockPatch[],wash:{value:number}) {
    const manager=new T.LoadingManager(),loader=new GLTFLoader(manager);let timer:ReturnType<typeof setTimeout>|undefined,expired=false,source:T.Group|undefined;
    try {
      const url=new URL(`${import.meta.env.BASE_URL}models/rock_07/rock_07_4k.gltf`,document.baseURI);
      const pending=loader.loadAsync(url.href).then(model=>{if(expired)disposeModel(model.scene);return model;});
      const model=await Promise.race([pending,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;manager.abort();reject(new Error('Rock asset deadline'));},45000);})]);
      clearTimeout(timer);source=model.scene;source.updateMatrixWorld(true);
      const meshes:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>[]=[];
      source.traverse(object=>{if(object instanceof T.Mesh&&!Array.isArray(object.material)&&object.material instanceof T.MeshStandardMaterial)meshes.push(object as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>);});
      if(meshes.length!==1||!meshes[0].material.map||!meshes[0].material.normalMap||!meshes[0].material.roughnessMap)throw new Error('Incomplete rock model');
      const rocks=new CoastalRocks(renderer,meshes[0],patches,wash);disposeModel(source,false);return rocks;
    }catch{if(timer)clearTimeout(timer);if(source)disposeModel(source);return null;}
  }
  private constructor(renderer:T.WebGLRenderer,source:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>,patches:RockPatch[],wash:{value:number}) {
    const geometry=normaliseRockGeometry(source.geometry,source.matrixWorld);this.shape=new CoastalRockShape(geometry);
    const material=source.material.clone();material.vertexColors=false;material.color.set(0xffffff);material.side=T.FrontSide;
    for(const property of Object.values(material))if(property instanceof T.Texture)property.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
    wetCoastalSurface(material,wash);
    for(const patch of patches) {
      const placements=rockPatchPlacements(this.shape,patch);this.placements.push(...placements);
      this.group.add(...buildRockBatches(geometry,material,placements));
    }
  }
  contains(position:T.Vector3){return this.placements.some(placement=>this.shape.contains(position,placement));}
}
