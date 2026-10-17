import test from 'node:test';
import assert from 'node:assert/strict';
import {COASTS} from '../src/bathymetry';
import {terrainHeight,terrainSurfaceHeight,terrainSegments} from '../src/terrain';
import {IslandDepth} from '../src/island-depth';
import * as T from 'three';
import {coastalRockSites} from '../src/rocks';
import {vesselPose} from '../src/navigation';

test('legacy procedural headland keeps its two ridges and open bay',()=> {
  const coast={size:260,height:130,profile:'headland' as const},height=(u:number,v:number)=>terrainSurfaceHeight(u*coast.size,v*coast.size,coast.size,coast.height,coast.profile);
  assert.equal(coast.profile,'headland');
  assert.ok(height(-0.28,-0.18)>90);assert.ok(height(-0.3,0.39)>65);
  assert.ok(height(-0.5,-0.45)>70&&height(-0.12,-0.09)>70);
  assert.ok(height(-0.59,0.25)>50&&height(-0.25,0.45)>50);
  assert.ok(height(0.4,-0.11)>3&&height(0.4,-0.11)<30);
  for(let i=0;i<=30;i++)assert.ok(height(0.38+i/30*0.7,0.4+i/30*0.68)<-2);
  for(let i=0;i<=48;i++)for(const [x,z]of [[-1.2,-1.2+i/20],[1.2,-1.2+i/20],[-1.2+i/20,-1.2],[-1.2+i/20,1.2]])assert.equal(terrainHeight(x*coast.size,z*coast.size,coast.size,coast.height,coast.profile),-9);
});

test('photographed boulders populate inner headland coasts on real low shelves',()=> {
  const coast=COASTS[0],sites=coastalRockSites(coast);
  assert.equal(sites.length,90);
  assert.ok(sites.some(site=>site.x>coast.x&&Math.hypot(site.x-coast.x,site.z-coast.z)<coast.size*0.65));
});

test('upland drainage preserves low cape, saddle, southern ridge and radial heights',()=> {
  for(const [x,z,headland,radial]of [[104,-28.6,16.97922064390686,70.56201316748368],[98.8,104,-9,61.066104909070916],[-104,26,16.621305341207822,48.89090331940939],[-104,104,84.34010811450923,62.55408857650622]]) {
    assert.equal(terrainHeight(x,z,260,130,'headland'),headland);
    assert.equal(terrainHeight(x,z,260,130,'radial'),radial);
  }
  const oldChannel=55.76579269355146,channel=terrainHeight(-32.5,-113.75,260,130,'headland');
  assert.ok(oldChannel-channel>5&&oldChannel-channel<=8,'a connected northern channel must visibly lower the original slope');
  assert.ok(terrainHeight(-35.75,-113.75,260,130,'headland')<57.6718191530116-4,'the channel must extend across neighbouring grid cells');
});

test('northwestern measured meshes, flight contacts and detailed depth retain identical triangles',()=> {
  const coast=COASTS[0],segments=terrainSegments(coast.profile),geometry=new T.PlaneGeometry(coast.size*2.4,coast.size*2.4,segments,segments).rotateX(-Math.PI/2),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,terrainHeight(p.getX(i),p.getZ(i),coast.size,coast.height,coast.profile));
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial()),data=Float32Array.from({length:p.count},(_,i)=>p.getY(i)),step=coast.size*2.4/segments;
  const detail=new IslandDepth(0,data,segments+1,new T.Vector4(coast.x-coast.size*1.2,coast.z-coast.size*1.2,coast.size*2.4,coast.size*2.4));
  assert.equal(coast.profile,'trenyken');assert.equal(segments,768);
  for(let z=350;z<490;z+=39)for(let x=260;x<590;x+=107) {
    const px=-coast.size*1.2+(x+0.23)*step,pz=-coast.size*1.2+(z+0.31)*step;
    const ray=new T.Raycaster(new T.Vector3(px,250,pz),new T.Vector3(0,-1,0)),hit=ray.intersectObject(mesh)[0];assert.ok(hit);
    const contact=terrainSurfaceHeight(px,pz,coast.size,coast.height,coast.profile),depth=detail.sample(coast.x+px,coast.z+pz)!.height;
    assert.ok(Math.abs(hit.point.y-contact)<0.00002);assert.ok(Math.abs(depth-contact)<0.00002);
  }
  geometry.dispose();mesh.material.dispose();
});

test('complete vessel footprints stay in water around all island profiles',()=> {
  for(const [kind,length,width,omega]of [['cruise',260,17,0.018],['yacht',28,4.5,0.027]] as const)for(let i=0;i<360;i++) {
    const pose=vesselPose(kind,kind==='cruise'?i*10:i/360*2*Math.PI/omega),sin=Math.sin(pose.heading),cos=Math.cos(pose.heading);
    for(let j=0;j<=8;j++)for(const side of [-1,1]) {
      const x=side*width,z=(j/8-0.5)*length,px=pose.x+cos*x+sin*z,pz=pose.z-sin*x+cos*z;
      for(const coast of COASTS)assert.ok(terrainSurfaceHeight(px-coast.x,pz-coast.z,coast.size,coast.height,coast.profile)<-8,`${kind} footprint reaches a shallow shelf at phase${i}`);
    }
  }
});

test('small cruiser stays beside the southwest island and clear of the liner course',()=> {
  const island=COASTS[2];
  for(let time=0;time<240;time+=2) {
    const pose=vesselPose('yacht',time);
    assert.ok(Math.hypot(pose.x-island.x,pose.z-island.z)<460);
    assert.ok(pose.x<-400);
  }
});
