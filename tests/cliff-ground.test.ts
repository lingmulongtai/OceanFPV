import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {CliffGround} from '../src/cliff-ground';import {COASTS,BATHY_SIZE,sampleBathymetry} from '../src/bathymetry';import {terrainHeight,TERRAIN_SEGMENTS} from '../src/terrain';
import {TRENYKEN_SIZE,TRENYKEN_HEIGHT} from '../src/trenyken';

test('cliff join retains distant vertices and samples its rendered triangles',()=> {
  const coast=COASTS[0],source=new T.PlaneGeometry(coast.size*2.4,coast.size*2.4,TERRAIN_SEGMENTS,TERRAIN_SEGMENTS).rotateX(-Math.PI/2),positions=source.attributes.position;
  for(let i=0;i<positions.count;i++)positions.setY(i,terrainHeight(positions.getX(i),positions.getZ(i),coast.size,coast.height,coast.profile));
  const before=positions.array.slice(),ground=new CliffGround(source,coast),data=new Float32Array(BATHY_SIZE*BATHY_SIZE*4).fill(-60),p=ground.geometry.attributes.position;let changed=0;
  for(let i=0;i<p.count;i++) {
    assert.equal(p.getX(i),positions.getX(i));assert.equal(p.getZ(i),positions.getZ(i));assert.ok(p.getY(i)<=positions.getY(i));
    if(p.getY(i)!==positions.getY(i)){changed++;assert.ok(ground.excludes(p.getX(i)+coast.x,p.getZ(i)+coast.z));}
    data[i*4]=p.getY(i);
  }
  assert.ok(changed>100&&changed<400);assert.deepEqual(positions.array,before);assert.deepEqual(ground.geometry.index!.array,source.index!.array);
  assert.equal(ground.heightAt(-380,-450),-7);assert.equal(ground.excludes(-390,-450),true);assert.equal(ground.excludes(-580,-420),false);
  assert.ok(ground.heightAt(-400,-450)>0,'land behind the captured cliff must remain connected above water');
  for(let i=0;i<500;i++){const x=-420+(i*37%100)/100*100,z=-490+(i*53%100)/100*100;assert.ok(Math.abs(ground.heightAt(x,z)-sampleBathymetry(data,x,z).height)<1e-10);}
  for(let i=0;i<p.count;i++)for(let j=0;j<3;j++)assert.ok(Number.isFinite(ground.geometry.attributes.normal.array[i*3+j]));
});

test('photographed cliff join follows a dense measured island without changing native triangles',()=> {
  const coast={x:-730,z:-490,size:TRENYKEN_SIZE,height:TRENYKEN_HEIGHT,profile:'trenyken' as const};
  const source=new T.PlaneGeometry(1200,1200,768,768).rotateX(-Math.PI/2),p=source.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,terrainHeight(p.getX(i),p.getZ(i),coast.size,coast.height,coast.profile));
  const ground=new CliffGround(source,coast),material=new T.MeshBasicMaterial(),mesh=new T.Mesh(ground.geometry,material);mesh.position.set(coast.x,0,coast.z);mesh.updateMatrixWorld();
  assert.ok(ground.heightAt(-400,-450)>0,'the measured land must remain behind the photographed cliff');
  assert.equal(ground.heightAt(-380,-450),-7);assert.equal(ground.heightAt(10000,10000),-9);
  for(const [x,z]of [[-401.2,-451.7],[-390.3,-443.6],[-373.6,-459.2],[-800.7,-580.3]]) {
    const hit=new T.Raycaster(new T.Vector3(x,200,z),new T.Vector3(0,-1,0)).intersectObject(mesh)[0];assert.ok(hit);
    assert.ok(Math.abs(ground.heightAt(x,z)-hit.point.y)<1e-5);
  }
  assert.deepEqual(ground.geometry.index!.array,source.index!.array);
  source.dispose();ground.geometry.dispose();material.dispose();
});
