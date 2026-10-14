import test from 'node:test';
import assert from 'node:assert/strict';
import {COASTS} from '../src/bathymetry';
import {terrainHeight,terrainSurfaceHeight} from '../src/terrain';
import {coastalRockSites} from '../src/rocks';
import {vesselPose} from '../src/navigation';

test('headland has two high ridges, a low cape and a bay connected to open sea',()=> {
  const coast=COASTS[0],height=(u:number,v:number)=>terrainSurfaceHeight(u*coast.size,v*coast.size,coast.size,coast.height,coast.profile);
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

test('complete vessel footprints stay in water around all island profiles',()=> {
  for(const [kind,length,width,omega]of [['explorer',92,4.4,0.025],['cruise',260,17,0.018],['yacht',28,4.5,0.027]] as const)for(let i=0;i<360;i++) {
    const pose=vesselPose(kind,i/360*2*Math.PI/omega),sin=Math.sin(pose.heading),cos=Math.cos(pose.heading);
    for(let j=0;j<=8;j++)for(const side of [-1,1]) {
      const x=side*width,z=(j/8-0.5)*length,px=pose.x+cos*x+sin*z,pz=pose.z-sin*x+cos*z;
      for(const coast of COASTS)assert.ok(terrainSurfaceHeight(px-coast.x,pz-coast.z,coast.size,coast.height,coast.profile)<-8,`${kind} footprint reaches a shallow shelf at phase${i}`);
    }
  }
});
