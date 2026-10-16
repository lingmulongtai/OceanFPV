import * as T from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Ocean } from './ocean';
import { SEA_SCALE, type SeaState } from './sea';
import { GATES } from './race';
import { closedHullGeometry } from './hull';
import {cruiseHullContains} from './cruise-hull';
import { buildCruiseShip, vesselBoxContains } from './cruise';
import { buildMotorYacht,YACHT_BEAM } from './yacht';
import { vesselPose, vesselWakeTrail, WAKE_SAMPLES } from './navigation';
import { blendGroundCover, blendRockScale, wetCoastalSurface, loadSurfaces, type SurfaceGroup, type SurfaceFailure } from './surfaces';
import { coastalTreeSites, terrainCover, terrainSurfaceHeight, TERRAIN_SEGMENTS, type TerrainProfile } from './terrain';
import { COASTS, type Coast } from './bathymetry';
import { CoastalForest, type TreeSite } from './vegetation';
import { CoastalRocks, coastalRockSites, lighthouseRockPatch, type RockPatch } from './rocks';
import { LighthouseReef } from './lighthouse-reef';
import { metricPaintGeometry } from './paint';
import {CoastalCliff} from './coastal-cliff';
import {CliffGround} from './cliff-ground';

export type LightPreset = 'golden' | 'day' | 'blue';
type Collider = { min: T.Vector3; max: T.Vector3 };
type NaturalObstacle={x:number;z:number;y:number;radius:number;height:number};

function canvasTexture(paint: (ctx: CanvasRenderingContext2D) => void, size = 512) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!; paint(ctx);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8; return texture;
}

function steelTexture() {
  const texture = canvasTexture(ctx => {
    ctx.fillStyle = '#899396'; ctx.fillRect(0, 0, 512, 512);
    let seed = 173;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 15000; i++) {
      ctx.fillStyle = `rgba(27,33,35,${random()*0.12})`; ctx.fillRect(random()*512,random()*512,1,random()*4+1);
    }
    ctx.strokeStyle = 'rgba(20,30,35,.16)'; ctx.lineWidth = 1;
    for (let x = 0; x <= 512; x += 128) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,512); ctx.stroke(); }
    for (let y = 0; y < 512; y += 128) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(512,y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(210,218,220,.4)';
    for (let x = 5; x < 512; x += 32) for (let y = 5; y < 512; y += 128) { ctx.beginPath(); ctx.arc(x,y,1.4,0,Math.PI*2); ctx.fill(); }
  });
  texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(2, 3); return texture;
}

export class World {
  scene = new T.Scene();
  ship = new T.Group();
  drone = new T.Group();
  sky = new Sky();
  sun = new T.Vector3();
  sunlight = new T.DirectionalLight(0xffe3bf, 3.3);
  hemisphere = new T.HemisphereLight(0xbdddea, 0x243b41, 1.75);
  ocean: Ocean;
  radar = new T.Group();
  cruise=buildCruiseShip();
  yacht=new T.Group();
  private yachtContact:((p:T.Vector3)=>boolean)=()=>false;
  gateMeshes: T.Group[] = [];
  colliders: Collider[] = [];
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
    this.scene.add(this.ship,this.cruise.root,this.yacht,this.drone,this.sky,this.sunlight,this.hemisphere);
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
    this.buildShip(); this.buildDrone(); this.buildGates();
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
    this.groundMaterials.forEach(material=>material.needsUpdate=true);
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

  private buildShip() {
    const metal = steelTexture();
    const paint = new T.MeshStandardMaterial({color:0xd1d9d7,map:metal,roughness:0.55,metalness:0.5,bumpMap:metal,bumpScale:0.025});
    const dark = new T.MeshStandardMaterial({color:0x182e34,roughness:0.6,metalness:0.5});
    const deck = new T.MeshStandardMaterial({color:0x5a625a,map:metal,roughness:0.87,metalness:0.18});
    const windows = new T.MeshPhysicalMaterial({color:0x122c38,roughness:0.13,metalness:0.55,clearcoat:1,clearcoatRoughness:0.15});
    const orange = new T.MeshStandardMaterial({color:0xc15325,roughness:0.7});
    const white = new T.MeshStandardMaterial({color:0xd5d8cf,roughness:0.58});
    const buckets = new Map<T.Material,T.BufferGeometry[]>();
    const part = (geometry: T.BufferGeometry, p: number[], material: T.Material, rotation?: T.Euler) => {
      const matrix = new T.Matrix4().compose(new T.Vector3(p[0],p[1],p[2]),new T.Quaternion().setFromEuler(rotation ?? new T.Euler()),new T.Vector3(1,1,1));
      geometry.applyMatrix4(matrix);
      if (!buckets.has(material)) buckets.set(material,[]); buckets.get(material)!.push(geometry.index ? geometry.toNonIndexed() : geometry);
    };
    const box = (s: number[], p: number[], m = paint, collision = false, bevel = 0.04) => {
      part(bevel ? new RoundedBoxGeometry(s[0],s[1],s[2],2,bevel) : new T.BoxGeometry(s[0],s[1],s[2]),p,m);
      if (collision) this.colliders.push({ min:new T.Vector3(p[0]-s[0]/2,p[1]-s[1]/2,p[2]-s[2]/2),max:new T.Vector3(p[0]+s[0]/2,p[1]+s[1]/2,p[2]+s[2]/2) });
    };
    const cylinder = (radius: number, height: number, p: number[], m = paint, rx = 0) => part(new T.CylinderGeometry(radius,radius,height,16),p,m,new T.Euler(rx,0,0));
    const beam = (a: T.Vector3, b: T.Vector3, radius: number, material = paint) => {
      const geometry = new T.CylinderGeometry(radius,radius,a.distanceTo(b),6);
      const quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());
      geometry.applyMatrix4(new T.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),quaternion,new T.Vector3(1,1,1)));
      if (!buckets.has(material)) buckets.set(material,[]); buckets.get(material)!.push(geometry.toNonIndexed());
    };
    const hullMat = paint.clone();
    this.surfaceGroups.push({asset:'blue_metal_plate',resolution:'2k',materials:[paint,hullMat,deck],colour:false});
    hullMat.side = T.DoubleSide;
    hullMat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 hullPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nhullPosition = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 hullPosition;').replace('#include <color_fragment>','#include <color_fragment>\nfloat waterline = smoothstep(-0.28,0.15,hullPosition.y);\ndiffuseColor.rgb *= mix(vec3(0.18,0.23,0.24),vec3(1.0),waterline);\nfloat rust = pow(sin(hullPosition.z*2.7)*0.5+0.5,8.0)*exp(-abs(hullPosition.y-0.2)*3.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.22,0.09,0.04),rust*0.22);');
    };
    const hull = new T.Mesh(closedHullGeometry(),hullMat); hull.castShadow = hull.receiveShadow = true; this.ship.add(hull);
    box([5.5,0.16,29],[0,1.73,-23],deck); box([6.3,0.16,31],[0,1.7,23],deck);
    box([5.8,3.4,9],[0,3.4,-16],paint,true,0.15);
    box([5,2.5,5.5],[0,6.2,-17],paint,true,0.15);
    box([5.6,0.24,6.2],[0,7.65,-17],paint,true);
    for (let i=-2;i<=2;i++) box([0.75,0.7,0.04],[i*0.94,6.75,-19.78],windows);
    for (const side of [-1,1]) for(let i=0;i<4;i++) box([0.04,0.7,0.8],[side*2.52,6.75,-19+i*1.05],windows);
    box([4.2,1.8,8],[0,2.7,24],paint,true,0.12);
    for(const z of [-5,8]) {
      cylinder(1.45,7,[0,5.3,z]); cylinder(1.49,0.7,[0,9.15,z],dark);
      this.colliders.push({min:new T.Vector3(-1.5,1.8,z-1.5),max:new T.Vector3(1.5,9.5,z+1.5)});
      for(let h=3;h<8;h+=0.55) box([0.11,0.18,2.7],[1.47,h,z],dark);
      box([0.45,0.65,2.3],[0,9.6,z],dark);
    }
    for(const z of [-31,30]) {
      cylinder(1.55,1.15,[0,2.3,z]); box([2.6,1.8,2.6],[0,3.05,z],paint,true,0.14);
      cylinder(0.105,5.8,[0,3.25,z-3.5],dark,Math.PI/2);
    }
    for(const z of [1,17]) {
      cylinder(1,0.3,[0,2,z],dark);
      for(const x of [-0.65,0,0.65]) cylinder(0.25,7,[x,2.5,z],paint,Math.PI/2);
    }
    for(const side of [-1,1]) {
      box([1.0,0.55,5],[side*2.8,3.05,10],white,false,0.19);
      box([0.8,0.22,3.9],[side*2.8,3.41,10],dark);
      for(const z of [-21,-11,12,23]) {
        box([0.1,1.5,0.8],[side*3.2,2.6,z],paint);
        cylinder(0.44,0.12,[side*3.29,3,z],orange,Math.PI/2);
      }
    }
    for(const z of [-40,42]) for(const x of [-1.2,1.2]) { cylinder(0.17,0.42,[x,2.05,z],dark); box([0.9,0.1,0.7],[x,1.85,z],dark); }
    cylinder(0.55,0.5,[0,2.14,-39],dark);
    for(let z=-43;z<-36;z+=0.45) box([0.14,0.06,0.25],[0,1.95,z],dark);
    for(const z of [-13,23]) {
      const tip=new T.Vector3(0,z<0?20:14,z+2), base=new T.Vector3(0,3,z);
      beam(base,tip,0.11); beam(tip.clone().add(new T.Vector3(-4,-2,0)),tip.clone().add(new T.Vector3(4,-2,0)),0.065);
      for(const x of [-3,3]) for(const dz of [-7,9]) beam(tip,new T.Vector3(x,2,z+dz),0.012,dark);
      this.colliders.push({min:new T.Vector3(-0.27,3,z-0.3),max:new T.Vector3(0.27,tip.y,z+2.3)});
      for(let h=4;h<tip.y-1;h+=0.4) beam(new T.Vector3(-0.22,h,z+0.3),new T.Vector3(0.22,h,z+0.3),0.025);
    }
    for(const side of [-1,1]) {
      let last:T.Vector3|null=null;
      for(let i=1;i<90;i++) {
        const u=i/90, p=new T.Vector3(side*4.4*Math.pow(Math.sin(Math.PI*u),0.42),1.65+0.75*Math.pow(1-u,4),-46+u*92);
        beam(p,p.clone().add(new T.Vector3(0,1.05,0)),0.024);
        if(last) for(const y of [0.5,1.05]) beam(last.clone().add(new T.Vector3(0,y,0)),p.clone().add(new T.Vector3(0,y,0)),0.015);
        last=p;
      }
    }
    for(const z of [-23,-9,12,20]) for(const x of [-1.8,1.8]) {
      box([0.7,0.06,1.0],[x,1.86,z],dark); box([0.62,0.04,0.92],[x,1.91,z],paint);
    }
    for(const [material,geometries] of buckets) {
      const merged=mergeGeometries(geometries); if(!merged) throw new Error('Ship geometry merge failed');
      const mesh=new T.Mesh(merged,material); mesh.castShadow=mesh.receiveShadow=true; this.ship.add(mesh);
      geometries.forEach(g=>g.dispose());
    }
    const marking=canvasTexture(ctx=> {
      ctx.clearRect(0,0,512,512); ctx.strokeStyle='#e2dfbb';ctx.lineWidth=8;ctx.beginPath();ctx.arc(256,256,207,0,Math.PI*2);ctx.stroke();
      ctx.font='bold 230px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e2dfbb';ctx.fillText('H',256,263);
      ctx.font='30px Arial';ctx.fillText('OCEAN · 07',256,480);
    });
    const pad=new T.Mesh(new T.PlaneGeometry(5,5),new T.MeshStandardMaterial({map:marking,transparent:true,depthWrite:false,roughness:0.85}));
    pad.rotation.x=-Math.PI/2;pad.position.set(0,1.81,38);this.ship.add(pad);
    const number=canvasTexture(ctx=> {ctx.clearRect(0,0,512,512);ctx.fillStyle='#e1e4d9';ctx.font='bold 230px Arial';ctx.textAlign='center';ctx.fillText('07',256,340);});
    for(const side of [-1,1]) {
      const n=new T.Mesh(new T.PlaneGeometry(2.8,1.4),new T.MeshStandardMaterial({map:number,transparent:true,depthWrite:false,side:T.DoubleSide}));
      n.position.set(side*3.25,0.9,-36);n.rotation.y=side*Math.PI/2;this.ship.add(n);
    }
    const radar=new T.Mesh(new RoundedBoxGeometry(2.8,0.75,0.12,2,0.04),dark);
    this.radar.position.set(0,20,-11);this.radar.add(radar);this.ship.add(this.radar);
    for(const side of [-1,1]) {
      const light=new T.Mesh(new T.SphereGeometry(0.12,8,8),new T.MeshBasicMaterial({color:side<0?0xff3a32:0x2ff5ae}));
      light.position.set(side*2.8,7.5,-17);this.ship.add(light);
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
    const geo=new T.PlaneGeometry(size*2.4,size*2.4,TERRAIN_SEGMENTS,TERRAIN_SEGMENTS);geo.rotateX(-Math.PI/2);
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
    const rockSites=coastalRockSites(coast),fallbackSites=profile==='headland'||profile==='measured-islet'?rockSites:null;
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
    this.radar.rotation.y=time*0.7;
    this.drone.position.copy(dronePosition);this.drone.quaternion.copy(orientation);
    this.propellers.forEach((p,i)=>p.rotation.y=time*(i%2?-1:1)*motor*170);
  }
  advanceVessels(time:number) {
    const scale=this.ocean.material.uniforms.seaScale.value as number;
    if(time===this.vesselTime&&scale===this.vesselSeaScale)return;
    if(scale!==this.vesselSeaScale||time<this.vesselTime||time-this.vesselTime>=0.2) {
      this.launchSample=null;this.launchVelocity=null;
    }
    for(const [i,kind,root,length,width]of [[0,'explorer',this.ship,92,4.4],[1,'cruise',this.cruise.root,260,17],[2,'yacht',this.yacht,28,YACHT_BEAM/2]] as const) {
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
      const position=this.ship.localToWorld(new T.Vector3(0,5.4,38)),dt=time-(this.launchSample?.time??time);
      this.launchVelocity=this.launchSample&&dt>0&&dt<0.2?position.clone().sub(this.launchSample.position).divideScalar(dt):null;
      this.launchSample={time,position};
    }
    this.vesselTime=time;this.vesselSeaScale=scale;
  }
  launchPose(time:number) {
    this.advanceVessels(time);const pose=vesselPose('explorer',time);
    const before=vesselPose('explorer',time-0.01),after=vesselPose('explorer',time+0.01),turn=Math.atan2(Math.sin(after.heading-before.heading),Math.cos(after.heading-before.heading))/0.02;
    const offset=new T.Vector3(0,5.4,38).applyQuaternion(this.ship.quaternion);
    return {position:this.ship.localToWorld(new T.Vector3(0,5.4,38)),velocity:this.launchVelocity?.clone()??new T.Vector3(pose.vx+turn*offset.z,0,pose.vz-turn*offset.x),heading:pose.heading};
  }
  collision(p:T.Vector3,_time:number,_state:SeaState,previous=p):string|null {
    if(this.cliff?.surface.contacts(p,previous))return '海岸の崖に接触しました';
    if(p.y < this.ocean.heightAt(p.x,p.z)+0.18) return '海面に接触しました';
    if(p.y>500||Math.hypot(p.x,p.z)>1900) return '飛行エリアの外に出ました';
    const local=p.clone();this.ship.worldToLocal(local);
    if(local.z>-46&&local.z<46) {
      const u=(local.z+46)/92, width=4.4*Math.pow(Math.max(Math.sin(Math.PI*u),0.012),0.42);
      if(Math.abs(local.x)<width+0.2&&local.y<1.84+0.75*Math.pow(1-u,4)) return '船体・甲板に接触しました';
    }
    for(const c of this.colliders) if(local.x>c.min.x-0.2&&local.x<c.max.x+0.2&&local.y>c.min.y-0.2&&local.y<c.max.y+0.2&&local.z>c.min.z-0.2&&local.z<c.max.z+0.2) return '船の構造物に接触しました';
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
