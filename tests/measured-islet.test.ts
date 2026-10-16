import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {measuredIsletHeight,MEASURED_ISLET_SIZE,MEASURED_ISLET_HEIGHT} from '../src/measured-islet';
import {terrainHeight,terrainSurfaceHeight,terrainSlope,coastalTreeSites,terrainCover,TERRAIN_SEGMENTS} from '../src/terrain';

test('measured terrain keeps metre-scale source witnesses and all four submerged edges',()=> {
  assert.equal(MEASURED_ISLET_SIZE,250);assert.equal(MEASURED_ISLET_HEIGHT,22);assert.equal(TERRAIN_SEGMENTS,192);
  for(const [x,z,height]of [[0,-50,15.791],[0,0,1.117],[12.5,-50,13.761],[-6.25,-68.75,21.912]]) {
    assert.ok(Math.abs(measuredIsletHeight(x,z)-height)<.000002);
    assert.equal(terrainHeight(x,z,250,22,'measured-islet'),measuredIsletHeight(x,z));
  }
  for(let i=0;i<=192;i++)for(const [x,z]of [[-300,i*3.125-300],[300,i*3.125-300],[i*3.125-300,-300],[i*3.125-300,300]])assert.equal(measuredIsletHeight(x,z),-9);
  for(const [x,z]of [[-300.001,0],[300.001,0],[0,-300.001],[0,300.001],[NaN,0],[0,Infinity]])assert.equal(measuredIsletHeight(x,z),-9);
});

test('measured contact heights and slopes follow both rendered triangle halves',()=> {
  const geometry=new T.PlaneGeometry(600,600,192,192).rotateX(-Math.PI/2),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,measuredIsletHeight(p.getX(i),p.getZ(i)));
  geometry.computeVertexNormals();const material=new T.MeshBasicMaterial(),mesh=new T.Mesh(geometry,material);
  let checked=0;
  for(const [ix,iz]of [[94,74],[96,80],[96,96],[94,16],[80,70],[108,102]])for(const [u,v]of [[.2,.3],[.7,.8]]) {
    const x=-300+(ix+u)*3.125,z=-300+(iz+v)*3.125,ray=new T.Raycaster(new T.Vector3(x,80,z),new T.Vector3(0,-1,0)),hit=ray.intersectObject(mesh)[0];assert.ok(hit);
    assert.ok(Math.abs(terrainSurfaceHeight(x,z,250,22,'measured-islet')-hit.point.y)<.00002);
    const expected=Math.acos(Math.min(1,hit.face!.normal.y));assert.ok(Math.abs(terrainSlope(x,z,250,22,'measured-islet')-expected)<.000002);checked++;
  }
  assert.equal(checked,12);geometry.dispose();material.dispose();
});

test('measured trees root on dry supported slopes without a procedural island density quota',()=> {
  const sites=coastalTreeSites(-850,420,250,22,'measured-islet');assert.ok(sites.length>0&&sites.length<=170);
  assert.deepEqual(sites,coastalTreeSites(-850,420,250,22,'measured-islet'));
  for(const site of sites){const x=site.x+850,z=site.z-420;assert.ok(Math.abs(site.y-terrainSurfaceHeight(x,z,250,22,'measured-islet'))<.00000001);assert.ok(site.y>5&&terrainCover(x,z,250,22,'measured-islet')>=.3);assert.ok(terrainSlope(x,z,250,22,'measured-islet')<35*Math.PI/180);}
});
