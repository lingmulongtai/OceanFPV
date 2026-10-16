import * as T from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Ocean } from './ocean';
import { SEA_SCALE, type SeaState } from './sea';
import { GATES } from './race';
import {cruiseHullContains} from './cruise-hull';
import { buildCruiseShip, vesselBoxContains } from './cruise';
import { buildMotorYacht,YACHT_BEAM } from './yacht';
import { vesselPose, vesselWakeTrail, withinFlightArea, WAKE_SAMPLES } from './navigation';
import { blendGroundCover, blendRockScale, wetCoastalSurface, loadSurfaces, type SurfaceGroup, type SurfaceFailure } from './surfaces';
import { coastalTreeSites, terrainCover, terrainSurfaceHeight, terrainSegments, type TerrainProfile } from './terrain';
import { COASTS, type Coast } from './bathymetry';
import { CoastalForest, type TreeSite } from './vegetation';
import { CoastalRocks, coastalRockSites, lighthouseRockPatch, type RockPatch } from './rocks';
import { LighthouseReef } from './lighthouse-reef';
import { metricPaintGeometry } from './paint';
import {CoastalCliff} from './coastal-cliff';
import {CliffGround} from './cliff-ground';

export type LightPreset = 'golden' | 'day' | 'blue';
type NaturalObstacle={x:number;z:number;y:number;radius:number;height:number};
// 1.2 m above the actual foredeck triangles, clear of winches and cabins.
const CRUISE_LAUNCH=new T.Vector3(0,11.835878,-112);

function canvasTexture(paint: (ctx: CanvasRenderingContext2D) => void, size = 512) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!; paint(ctx);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8; return texture;
}

export class World {
  scene = new T.Scene();
  drone = new T.Group();
  sky = new Sky();
  sun = new T.Vector3();
  sunlight = new T.DirectionalLight(0xffe3bf, 3.3);
  hemisphere = new T.HemisphereLight(0xbdddea, 0x243b41, 1.75);
  ocean: Ocean;
  cruise=buildCruiseShip();
  yacht=new T.Group();
  private yachtContact:((p:T.Vector3)=>boolean)=()=>false;
  gateMeshes: T.Group[] = [];
  islands: Coast[] = [];
  light: LightPreset = 'golden';
  private propellers: T.Mesh[] = [];
  private vesselTime=-1;
  private vesselSeaScale=NaN;
  private launchVelocity:T.Vector3|null=null;
  private launchSample:{time:number;position:T.Vector3}|null=null;
  private surfaceGroups:SurfaceGroup[]=[];
  readonly surfaceFailures:SurfaceFailure[]=[];
  private groundCover=new T.MeshStandardMaterial();
  private coastalRockDetail=new T.MeshStandardMaterial({color:0xc7c8af,roughness:0.95});
  private groundMaterials:T.MeshStandardMaterial[]=[];
  private naturalObstacles:NaturalObstacle[]=[];
  private rockMaterial=new T.MeshStandardMaterial({color:0xc7c8af,roughness:0.95});
  private lighthouseReef=new LighthouseReef();
  private shorelineWash={value:SEA_SCALE.breeze};
  private treeSites:TreeSite[]=[];
  private rockPatches:RockPatch[]=[];
  private fallbackRockObstacles:NaturalObstacle[]=[];
  private fallbackRockLists=new Map<T.InstancedMesh,NaturalObstacle[]>();
  forest:CoastalForest|null=null;
  rocks:CoastalRocks|null=null;
  cliff:CoastalCliff|null=null;
  private cliffGround:CliffGround|null=null;
  private headlandMesh:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>|null=null;
  quality='high';

  constructor() {
    wetCoastalSurface(this.rockMaterial,this.shorelineWash);
    this.scene.add(this.cruise.root,this.yacht,this.drone,this.sky,this.sunlight,this.hemisphere);
    this.sky.scale.setScalar(10000);
    this.sky.material.uniforms.turbidity.value = 4;
    this.sky.material.uniforms.rayleigh.value = 2.4;
    this.sky.material.uniforms.mieCoefficient.value = 0.003;
    this.sky.material.uniforms.mieDirectionalG.value = 0.86;
    this.sky.material.uniforms.cloudCoverage.value = 0.42;
    this.sky.material.uniforms.cloudDensity.value = 0.52;
    this.sky.material.uniforms.cloudScale.value = 0.00025;
    // Limit the solar disc before bloom; its raw radiance otherwise washes out
    // the entire FPV frame when composited in an HDR target.
    this.sky.material.fragmentShader=this.sky.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );','gl_FragColor = vec4( min(texColor * 0.22, vec3(6.0)), 1.0 );');
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(4096,4096);
    this.sunlight.shadow.camera.left = -410; this.sunlight.shadow.camera.right = 350;
    this.sunlight.shadow.camera.top = 500; this.sunlight.shadow.camera.bottom = -350;
    this.sunlight.shadow.camera.near = 1; this.sunlight.shadow.camera.far = 650;
    this.sunlight.shadow.bias = -0.0003; this.sunlight.shadow.normalBias = 0.04;
    this.setLight('golden');
    this.ocean = new Ocean(this.sun,this.lighthouseReef); this.scene.add(this.ocean.mesh);
    this.buildDrone(); this.buildGates();
    for(const coast of COASTS)this.buildIsland(coast);
    this.buildLighthouse(); this.buildYacht();
    this.surfaceGroups.push({asset:'blue_metal_plate',resolution:'2k',materials:this.cruise.paint,colour:false,roughness:1},{asset:'wood_floor_deck',resolution:'1k',materials:[this.cruise.teak],colour:true},{asset:'rocky_terrain',resolution:'2k',materials:[this.rockMaterial],colour:true});
    this.surfaceGroups.push({asset:'aerial_grass_rock',resolution:'2k',materials:[this.groundCover],colour:true});
    this.scene.fog = new T.FogExp2(0x9facac,0.00019);
  }
  async loadSurfaceTextures(renderer:T.WebGLRenderer,lightingReady:Promise<unknown>) {
    const textures=loadSurfaces(this.surfaceGroups,renderer.capabilities.getMaxAnisotropy(),this.surfaceFailures);
    const cliff=await CoastalCliff.load(renderer,this.shorelineWash);
    if(cliff&&this.headlandMesh){this.installCliff(cliff,this.headlandMesh);}else cliff?.dispose();
    const [missing,forest,rocks]=await Promise.all([textures,CoastalForest.load(renderer,this.treeSites,this.scene,lightingReady),CoastalRocks.load(renderer,this.rockPatches,this.shorelineWash)]);
    if(!this.cliff)missing.push('coastal cliff');
    // Keep the painted terrain colours only when photographs are unavailable.
    this.groundMaterials.forEach(material=>{if(material.map)material.vertexColors=false;material.needsUpdate=true;});
    this.ocean.material.uniforms.seabedMap.value=this.coastalRockDetail.map;
    this.ocean.material.uniforms.hasSeabedMap.value=!!this.coastalRockDetail.map;
    if(forest) {
      this.forest=forest;this.scene.add(forest.group);
      for(const site of this.treeSites)for(const mesh of site.fallback){this.scene.remove(mesh);mesh.geometry.dispose();(mesh.material as T.Material).dispose();}
    }else missing.push('coastal tree');
    if(rocks) {
      this.rocks=rocks;this.scene.add(rocks.group);
      for(const patch of this.rockPatches)if(patch.fallback){this.scene.remove(patch.fallback);patch.fallback.geometry.dispose();}
      this.fallbackRockObstacles=[];
    }else missing.push('coastal rock');
    return missing;
  }
  private installCliff(cliff:CoastalCliff,mesh:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>) {
    const ground=new CliffGround(mesh.geometry,COASTS[0]);
    this.ocean.installIslandDepth(0,ground.geometry,cliff.surface);
    const retain=(instances:T.InstancedMesh,indices:number[])=>{
      const matrix=new T.Matrix4(),colour=new T.Color();
      indices.forEach((index,i)=>{instances.getMatrixAt(index,matrix);instances.setMatrixAt(i,matrix);if(instances.instanceColor){instances.getColorAt(index,colour);instances.setColorAt(i,colour);}});
      instances.count=indices.length;instances.instanceMatrix.needsUpdate=true;if(instances.instanceColor)instances.instanceColor.needsUpdate=true;
      instances.computeBoundingBox();instances.computeBoundingSphere();
    };
    for(const site of this.treeSites) {
      const keep=site.matrices.map((matrix,i)=>({matrix,i})).filter(({matrix})=>{const e=matrix.elements,scale=new T.Vector3().setFromMatrixScale(matrix).x;return !ground.excludes(e[12],e[14],5*scale);}).map(({i})=>i);
      site.fallback.forEach(instances=>retain(instances,keep));site.matrices=keep.map(i=>site.matrices[i]);
    }
    this.naturalObstacles=this.naturalObstacles.filter(p=>!ground.excludes(p.x,p.z,p.radius));
    for(const patch of this.rockPatches)if(patch.coast.x===COASTS[0].x&&patch.coast.z===COASTS[0].z) {
      patch.sites=patch.sites.filter(site=>!ground.excludes(site.x,site.z,site.scale*3.2));
      patch.heightAt=(x,z)=>ground.excludes(x,z)?null:ground.heightAt(x,z);
      if(patch.fallback){const obstacles=this.fallbackRockLists.get(patch.fallback)!;const keep=obstacles.map((p,i)=>({p,i})).filter(({p})=>!ground.excludes(p.x,p.z,p.radius)).map(({i})=>i);retain(patch.fallback,keep);}
    }
    this.fallbackRockObstacles=this.fallbackRockObstacles.filter(p=>!ground.excludes(p.x,p.z,p.radius));
    const old=mesh.geometry;mesh.geometry=ground.geometry;old.dispose();this.cliffGround=ground;this.cliff=cliff;this.scene.add(cliff.group);
  }
  setLight(preset: LightPreset) {
    this.light = preset;
    const elevation = preset === 'day' ? 46 : preset === 'golden' ? 9 : 3;
    const azimuth = preset === 'day' ? 135 : 125;
    this.sun.setFromSphericalCoords(1,T.MathUtils.degToRad(90-elevation),T.MathUtils.degToRad(azimuth));
    this.sky.material.uniforms.sunPosition.value.copy(this.sun).multiplyScalar(450000);
    this.sky.material.uniforms.rayleigh.value = preset === 'blue' ? 3.5 : 2.3;
    this.sunlight.position.copy(this.sun).multiplyScalar(280);
    this.sunlight.color.set(preset === 'day' ? 0xfff3e3 : preset === 'golden' ? 0xffcf8e : 0xe3a2ae);
    this.sunlight.intensity = preset === 'day' ? 3.4 : preset === 'golden' ? 2.6 : 1.4;
    this.hemisphere.intensity = preset === 'blue' ? 1.0 : 1.6;
    if (this.ocean) {
      this.ocean.material.uniforms.sunColor.value.copy(this.sunlight.color);
      this.ocean.material.uniforms.dusk.value = preset === 'day' ? 0 : preset === 'golden' ? 0.55 : 0.85;
    }
  }

  private buildDrone() {
    const carbon=new T.MeshStandardMaterial({color:0x17242b,roughness:0.45,metalness:0.55});
    const orange=new T.MeshStandardMaterial({color:0xf0b15a,roughness:0.4,metalness:0.35});
    const body=new T.Mesh(new RoundedBoxGeometry(0.22,0.08,0.32,2,0.025),carbon);this.drone.add(body);
    const battery=new T.Mesh(new RoundedBoxGeometry(0.11,0.07,0.22,2,0.01),orange);battery.position.y=0.06;this.drone.add(battery);
    for(const x of [-0.18,0.18]) for(const z of [-0.18,0.18]) {
      const arm=new T.Mesh(new T.BoxGeometry(0.045,0.035,0.29),carbon);arm.position.set(x/2,0,z/2);arm.rotation.y=x*z>0?Math.PI/4:-Math.PI/4;this.drone.add(arm);
      const motor=new T.Mesh(new T.CylinderGeometry(0.024,0.024,0.035,10),orange);motor.position.set(x,0.03,z);this.drone.add(motor);
      const prop=new T.Mesh(new T.BoxGeometry(0.18,0.007,0.023),carbon);prop.position.set(x,0.05,z);this.drone.add(prop);this.propellers.push(prop);
    }
  }

  private buildGates() {
    GATES.forEach((gate,i)=> {
      const group=new T.Group();group.position.copy(gate.position);group.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),gate.normal);
      const ring=new T.Mesh(new T.TorusGeometry(gate.radius,0.11,8,80),new T.MeshStandardMaterial({color:0x576a70,emissive:0x214349,emissiveIntensity:0.6,roughness:0.32,metalness:0.5}));
      group.add(ring);
      const label=canvasTexture(ctx=> {ctx.clearRect(0,0,512,512);ctx.fillStyle='#bcecdf';ctx.textAlign='center';ctx.font='bold 180px Arial';ctx.fillText(String(i+1).padStart(2,'0'),256,310);});
      const mesh=new T.Mesh(new T.PlaneGeometry(1.8,1.8),new T.MeshBasicMaterial({map:label,transparent:true,side:T.DoubleSide,depthWrite:false}));mesh.position.y=gate.radius+1.3;group.add(mesh);
      this.gateMeshes.push(group);this.scene.add(group);
    });
  }
  updateGates(active: boolean, next: number) {
    this.gateMeshes.forEach((group,i)=> {
      group.visible=active;
      const material=(group.children[0] as T.Mesh<T.TorusGeometry,T.MeshStandardMaterial>).material;
      material.color.set(i===next?0x94f3ca:0x567276);material.emissive.set(i===next?0x4cdda0:0x112b30);material.emissiveIntensity=i===next?1.6:0.5;
    });
  }
  private buildIsland(coast:Coast) {
    const {x,z,size,height,profile}=coast;this.islands.push({...coast});
    const segments=terrainSegments(profile),geo=new T.PlaneGeometry(size*2.4,size*2.4,segments,segments);geo.rotateX(-Math.PI/2);
    const pos=geo.attributes.position;const colors:number[]=[],cover:number[]=[];
    for(let i=0;i<pos.count;i++) {
      const px=pos.getX(i),pz=pos.getZ(i);const y=this.terrain(px,pz,size,height,profile);pos.setY(i,y);
      const color=new T.Color(y<5?0xd0c6a9:y<28?0xa9b99b:y<height*0.65?0x92a28d:0xb7b9a2);
      const variance=0.86+(Math.sin(px*0.37+pz*0.27)*0.5+0.5)*0.25;color.multiplyScalar(variance);colors.push(color.r,color.g,color.b);
      geo.attributes.uv.setXY(i,px/90,pz/90);
      cover.push(terrainCover(px,pz,size,height,profile));
    }
    geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setAttribute('groundCover',new T.Float32BufferAttribute(cover,1));geo.computeVertexNormals();
    const material=new T.MeshStandardMaterial({vertexColors:true,roughness:0.96});this.surfaceGroups.push({asset:'rocky_terrain',resolution:'2k',materials:[material],colour:true});
    blendGroundCover(material,this.groundCover,this.coastalRockDetail);wetCoastalSurface(material,this.shorelineWash);this.groundMaterials.push(material);
    const mesh=new T.Mesh(geo,material);mesh.position.set(x,0,z);mesh.receiveShadow=mesh.castShadow=true;this.scene.add(mesh);
    if(coast===COASTS[0])this.headlandMesh=mesh;
    const crownParts:T.BufferGeometry[]=[];
    for(let i=0;i<7;i++) {const g=new T.IcosahedronGeometry(1,2),p=g.attributes.position;for(let v=0;v<p.count;v++){const k=0.9+0.1*Math.sin(p.getX(v)*17+p.getY(v)*19+p.getZ(v)*11);p.setXYZ(v,p.getX(v)*k,p.getY(v)*k,p.getZ(v)*k);}g.scale(i?2.6:3.1,i?3:4,i?2.6:3.1);g.translate(i?Math.cos(i*2.4)*2.3:0,6+i*0.55,i?Math.sin(i*2.4)*2.3:0);g.computeVertexNormals();crownParts.push(g);}
    const crowns=new T.InstancedMesh(mergeGeometries(crownParts)!,new T.MeshStandardMaterial({color:0xffffff,roughness:0.9}),170);crownParts.forEach(g=>g.dispose());
    const trunks=new T.InstancedMesh(new T.CylinderGeometry(0.22,0.48,8,8),new T.MeshStandardMaterial({color:0x504437,roughness:1}),170);
    const matrices:T.Matrix4[]=[],sites=coastalTreeSites(x,z,size,height,profile);crowns.count=trunks.count=sites.length;
    for(let i=0;i<sites.length;i++) {
      const {x:tx,z:tz,y,scale,yaw:angle}=sites[i];
      const matrix=new T.Matrix4().compose(new T.Vector3(tx,y,tz),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),angle),new T.Vector3(scale,scale,scale));
      matrices.push(matrix);
      crowns.setMatrixAt(i,matrix);trunks.setMatrixAt(i,new T.Matrix4().compose(new T.Vector3(tx,y+4*scale,tz),new T.Quaternion(),new T.Vector3(scale,scale,scale)));crowns.setColorAt(i,new T.Color().setHSL(0.26+(i%5)*0.007,0.23,0.15+(i%9)*0.009));
      this.naturalObstacles.push({x:tx,z:tz,y,radius:5*scale,height:10*scale});
    }
    crowns.castShadow=trunks.castShadow=true;this.scene.add(crowns,trunks);
    this.treeSites.push({matrices,fallback:[crowns,trunks]});
    const rockSites=coastalRockSites(coast),fallbackSites=profile==='headland'||profile==='measured-islet'||profile==='hornoya'?rockSites:null;
    const rocks=new T.InstancedMesh(new T.IcosahedronGeometry(1,2),this.rockMaterial,fallbackSites?.length??90);
    const obstacles:NaturalObstacle[]=[];this.fallbackRockLists.set(rocks,obstacles);
    for(let i=0;i<rocks.count;i++) {const site=fallbackSites?.[i],angle=site?.yaw??i*2.399,r=size*(0.68+(i%9)*0.027),tx=site?site.x-x:Math.cos(angle)*r,tz=site?site.z-z:Math.sin(angle)*r,y=this.terrain(tx,tz,size,height,profile),s=site?site.scale*2:2+(i%7)*0.6;
      rocks.setMatrixAt(i,new T.Matrix4().compose(new T.Vector3(x+tx,y+s*0.25,z+tz),new T.Quaternion().setFromEuler(new T.Euler(angle,angle*0.7,angle*0.3)),new T.Vector3(s*1.6,s*0.8,s)));
      const obstacle={x:x+tx,z:z+tz,y:y-s*0.1,radius:s*1.3,height:s*1.1};obstacles.push(obstacle);this.fallbackRockObstacles.push(obstacle);}
    rocks.castShadow=rocks.receiveShadow=true;this.scene.add(rocks);
    this.rockPatches.push({sites:rockSites,coast:{...coast},fallback:rocks,embedFraction:0.45,maxTilt:Math.PI/12,minSupportFraction:0.8});
  }
  private terrain(x:number,z:number,size:number,height:number,profile:TerrainProfile='radial') {
    return terrainSurfaceHeight(x,z,size,height,profile);
  }
  private buildLighthouse() {
    const root=new T.Group();root.position.set(this.lighthouseReef.x,0,this.lighthouseReef.z);
    const stone=this.rockMaterial;
    const reefStone=this.coastalRockDetail;blendRockScale(reefStone,stone);wetCoastalSurface(reefStone,this.shorelineWash);
    this.groundMaterials.push(reefStone);
    this.surfaceGroups.push({asset:'seaside_rock',resolution:'4k',materials:[reefStone],colour:true});
    const rock=new T.Mesh(metricPaintGeometry(this.lighthouseReef.geometry,2),reefStone);root.add(rock);
    const tower=new T.Mesh(new T.CylinderGeometry(2.1,3.2,24,24),new T.MeshStandardMaterial({color:0xe0ddd0,roughness:0.7}));tower.position.y=21;root.add(tower);
    for(const y of [13,25]) {const stripe=new T.Mesh(new T.CylinderGeometry(2.8-(y-13)*0.035,2.85-(y-13)*0.035,3,24),new T.MeshStandardMaterial({color:0xa2483d,roughness:0.6}));stripe.position.y=y;root.add(stripe);}
    const glass=new T.Mesh(new T.CylinderGeometry(2.4,2.4,3,16),new T.MeshPhysicalMaterial({color:0x173848,roughness:0.08,metalness:0.4,clearcoat:1}));glass.position.y=34;root.add(glass);
    const roof=new T.Mesh(new T.ConeGeometry(3.5,3,24),stone);roof.position.y=37;root.add(roof);
    const balcony=new T.Mesh(new T.CylinderGeometry(3.4,3.4,0.3,32),stone);balcony.position.y=32.5;root.add(balcony);
    this.scene.add(root);
    this.rockPatches.push(lighthouseRockPatch(this.lighthouseReef));
  }
  private buildYacht() {
    const model=buildMotorYacht();this.yacht.add(model.root);this.yachtContact=model.contains;
    this.surfaceGroups.push({asset:'blue_metal_plate',resolution:'2k',materials:model.paint,colour:false,roughness:1},{asset:'wood_floor_deck',resolution:'1k',materials:[model.teak],colour:true});
  }
  update(time: number,camera: T.Vector3,state: SeaState,dronePosition:T.Vector3,orientation:T.Quaternion,motor:number) {
    this.shorelineWash.value=SEA_SCALE[state];
    this.ocean.update(time,camera,state);
    this.sky.material.uniforms.time.value=time;
    this.advanceVessels(time);
    this.forest?.update(camera,time,this.quality,this.light);
    this.drone.position.copy(dronePosition);this.drone.quaternion.copy(orientation);
    this.propellers.forEach((p,i)=>p.rotation.y=time*(i%2?-1:1)*motor*170);
  }
  advanceVessels(time:number) {
    const scale=this.ocean.material.uniforms.seaScale.value as number;
    if(time===this.vesselTime&&scale===this.vesselSeaScale)return;
    if(scale!==this.vesselSeaScale||time<this.vesselTime||time-this.vesselTime>=0.2) {
      this.launchSample=null;this.launchVelocity=null;
    }
    for(const [i,kind,root,length,width]of [[0,'cruise',this.cruise.root,260,17],[1,'yacht',this.yacht,28,YACHT_BEAM/2]] as const) {
      const p=vesselPose(kind,time),forward=new T.Vector3(-Math.sin(p.heading),0,-Math.cos(p.heading));
      const h=this.ocean.heightAt(p.x,p.z)*(kind==='cruise'?0.2:0.45),half=length*0.3;
      const front=this.ocean.heightAt(p.x+forward.x*half,p.z+forward.z*half),back=this.ocean.heightAt(p.x-forward.x*half,p.z-forward.z*half);
      root.position.set(p.x,h,p.z);root.rotation.set((front-back)/(half*2)*0.55,p.heading,0,'YXZ');root.updateMatrixWorld(true);
      this.ocean.material.uniforms.vessels.value[i].set(p.x,0,p.z,length);this.ocean.material.uniforms.headings.value[i]=p.heading;
      this.ocean.material.uniforms.vesselWidths.value[i]=width;this.ocean.material.uniforms.vesselSpeeds.value[i]=p.speed;
      const trail=vesselWakeTrail(kind,time,length),bounds=new T.Box2(),padding=3*Math.sqrt(width*width+trail.at(-1)!.age*Math.max(...trail.map(point=>point.speed))*1.1);
      trail.forEach((point,j)=> {this.ocean.material.uniforms.wakePoints.value[i*WAKE_SAMPLES+j].set(point.x,point.z,point.age,point.speed);bounds.expandByPoint(new T.Vector2(point.x,point.z));});
      bounds.expandByScalar(padding);this.ocean.material.uniforms.wakeBounds.value[i].set(bounds.min.x,bounds.min.y,bounds.max.x,bounds.max.y);
    }
    // A wave snapshot spans several physics ticks. Keep its full-interval deck
    // velocity between snapshots instead of dividing the jump by one tick.
    if(this.ocean.simulation.time===time&&time!==this.launchSample?.time) {
      const position=this.cruise.root.localToWorld(CRUISE_LAUNCH.clone()),dt=time-(this.launchSample?.time??time);
      this.launchVelocity=this.launchSample&&dt>0&&dt<0.2?position.clone().sub(this.launchSample.position).divideScalar(dt):null;
      this.launchSample={time,position};
    }
    this.vesselTime=time;this.vesselSeaScale=scale;
  }
  launchPose(time:number) {
    this.advanceVessels(time);const pose=vesselPose('cruise',time);
    return {position:this.cruise.root.localToWorld(CRUISE_LAUNCH.clone()),velocity:this.launchVelocity?.clone()??new T.Vector3(pose.vx,0,pose.vz),heading:pose.heading};
  }
  collision(p:T.Vector3,time:number,_state:SeaState,previous=p):string|null {
    if(this.cliff?.surface.contacts(p,previous))return '海岸の崖に接触しました';
    if(p.y < this.ocean.heightAt(p.x,p.z)+0.18) return '海面に接触しました';
    if(p.y>500||!withinFlightArea(p.x,p.z,time)) return '飛行エリアの外に出ました';
    const passenger=this.cruise.root.worldToLocal(p.clone());
    if(cruiseHullContains(passenger))return '客船の船体・甲板に接触しました';
    for(const c of this.cruise.boxes)if(vesselBoxContains(c,passenger))return '客船の構造物に接触しました';
    if(this.cruise.tenderContains(passenger))return '客船の救命艇・吊り機構に接触しました';
    if(this.cruise.terraceContains(passenger))return '客船のテラスに接触しました';
    for(const island of this.islands) {
      const h=this.cliffGround&&island.x===COASTS[0].x&&island.z===COASTS[0].z?this.cliffGround.heightAt(p.x,p.z):this.terrain(p.x-island.x,p.z-island.z,island.size,island.height,island.profile);
      if(p.y<h+0.25) return '島に接触しました';
    }
    for(const obstacle of this.naturalObstacles)if(p.y>obstacle.y&&p.y<obstacle.y+obstacle.height&&Math.hypot(p.x-obstacle.x,p.z-obstacle.z)<obstacle.radius)return '木・岩に接触しました';
    for(const obstacle of this.fallbackRockObstacles)if(p.y>obstacle.y&&p.y<obstacle.y+obstacle.height&&Math.hypot(p.x-obstacle.x,p.z-obstacle.z)<obstacle.radius)return '木・岩に接触しました';
    if(this.rocks?.contains(p))return '岩に接触しました';
    if(Math.hypot(p.x-145,p.z+135)<3.5&&p.y<39) return '灯台に接触しました';
    if(this.lighthouseReef.contains(p)) return '岩礁に接触しました';
    const yacht=this.yacht.worldToLocal(p.clone());
    if(this.yachtContact(yacht))return 'ヨットに接触しました';
    return null;
  }
}
