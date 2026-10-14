import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {AFT_ROOM,buildAftLounge,buildAftLoungeFurniture} from '../src/aft-lounge';
import {windowRibbon} from '../src/ship-outline';

test('separate end ribbons preserve the original glazing triangles and face outwards',()=> {
  const args=[196.14,27.64,1.72,6.07,true]as const,all=windowRibbon(...args),bow=windowRibbon(...args,'bow'),aft=windowRibbon(...args,'aft');
  assert.deepEqual([...bow.index!.array,...aft.index!.array].sort((a,b)=>a-b),[...all.index!.array].sort((a,b)=>a-b));
  for(const [geometry,side]of [[aft,1],[bow,-1]]as const){const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.updateMatrixWorld(true);assert.ok(new T.Raycaster(new T.Vector3(0,0,side*110),new T.Vector3(0,0,-side)).intersectObject(mesh)[0]);assert.equal(new T.Raycaster(new T.Vector3(0,0,-side*110),new T.Vector3(0,0,side)).intersectObject(mesh).length,0);mesh.material.dispose();}
  for(const geometry of [all,bow,aft])geometry.dispose();
});

test('lounge chair and pedestal feet land on actual timber and retain fabric at both quality levels',()=> {
  const room=buildAftLounge(196),furniture=buildAftLoungeFurniture(196),material=new T.MeshBasicMaterial(),floor=new T.Mesh(room.parts.find(p=>p.finish==='teak')!.geometry,material);floor.updateMatrixWorld(true);
  assert.equal(furniture.feet.length,27);
  for(const foot of furniture.feet){const hit=new T.Raycaster(foot.clone().add(new T.Vector3(0,.1,0)),new T.Vector3(0,-1,0)).intersectObject(floor)[0];assert.ok(hit);assert.ok(hit.point.distanceTo(foot)<1e-6);}
  for(const part of furniture.parts.filter(p=>p.finish==='fabric')){assert.ok(part.coarse);part.geometry.computeBoundingBox();part.coarse.computeBoundingBox();assert.ok(part.geometry.boundingBox!.min.distanceTo(part.coarse.boundingBox!.min)<.00001);assert.ok(part.geometry.boundingBox!.max.distanceTo(part.coarse.boundingBox!.max)<.00001);}
  for(const part of [...room.parts,...furniture.parts])part.geometry.dispose();for(const part of furniture.parts)part.coarse?.dispose();material.dispose();
});

test('aft glazing looks into a six metre deep room with supported floor and ceiling',()=> {
  for(const length of [196,178,160,142]){
    const room=buildAftLounge(length),materials=room.parts.map(()=>new T.MeshBasicMaterial()),meshes=room.parts.map((part,i)=>new T.Mesh(part.geometry,materials[i]));meshes.forEach(m=>m.updateMatrixWorld(true));
    const glass=meshes.filter((_,i)=>room.parts[i].finish==='glass'),opaque=meshes.filter((_,i)=>room.parts[i].finish!=='glass');
    for(const x of [-6,0,6]){const ray=new T.Raycaster(new T.Vector3(x,1.2,length/2+1),new T.Vector3(0,0,-1)),pane=ray.intersectObjects(glass)[0],wall=ray.intersectObjects(opaque)[0];assert.ok(pane&&wall);assert.ok(pane.point.z-wall.point.z>6);assert.ok(Math.abs(wall.point.z-room.front)<.00001);}
    for(const x of [-10,0,10]){const ray=new T.Raycaster(new T.Vector3(x,1.2,room.front+2),new T.Vector3(0,-1,0)),hit=ray.intersectObjects(opaque)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-.06)<1e-6);ray.ray.direction.set(0,1,0);const roof=ray.intersectObjects(opaque)[0];assert.ok(roof);assert.ok(Math.abs(roof.point.y-2.55)<1e-6);}
    for(const p of room.edge)assert.ok(p.y>=room.front-1e-7&&Math.abs(p.x)<=AFT_ROOM.beam/2+1e-7);
    room.parts.forEach(p=>p.geometry.dispose());materials.forEach(m=>m.dispose());
  }
});
