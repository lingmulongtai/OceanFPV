import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {buildPoolCabanas,CABANA_CENTRES} from '../src/pool-cabanas';
const floor=10.6+7*2.85+1.58+.18;

test('all six cabanas and furniture feet sit on the timber deck with open perimeter aisles',()=>{
  const model=buildPoolCabanas(floor),deck=new T.Mesh(new T.BoxGeometry(28,.18,74),new T.MeshBasicMaterial());deck.position.set(0,floor-.09,18);deck.updateMatrixWorld(true);
  assert.equal(model.feet.length,72);
  for(const foot of model.feet){const hit=new T.Raycaster(foot.clone().add(new T.Vector3(0,.5,0)),new T.Vector3(0,-1,0)).intersectObject(deck)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-foot.y)<1e-5);}
  for(const {solid,geometry}of model.parts){assert.ok(solid.min.y>=floor-1e-10);assert.ok(solid.min.z>=-19&&solid.max.z<=55);assert.ok(Math.abs(solid.min.x)>=8.3-1e-10&&Math.abs(solid.max.x)<=12.5+1e-10);geometry.dispose();}
  for(const side of [-1,1])for(const z of CABANA_CENTRES){assert.equal(model.contains(new T.Vector3(side*13.1,floor+1.5,z)),false);assert.equal(model.contains(new T.Vector3(side*7.5,floor+1.5,z)),false);}
  deck.geometry.dispose();deck.material.dispose();
});

test('real roofs, columns and furniture have contacts while the ocean openings and fly-throughs stay clear',()=>{
  const model=buildPoolCabanas(floor),meshes=model.parts.map(({geometry})=>new T.Mesh(geometry,new T.MeshBasicMaterial()));meshes.forEach(mesh=>mesh.updateMatrixWorld(true));
  for(const side of [-1,1])for(const z of CABANA_CENTRES){
    const roof=new T.Raycaster(new T.Vector3(side*10.4,floor+4,z+1),new T.Vector3(0,-1,0)).intersectObjects(meshes)[0];assert.ok(roof);assert.ok(Math.abs(roof.point.y-floor-3.2)<1e-5);assert.equal(model.contains(roof.point),true);
    const seat=new T.Raycaster(new T.Vector3(side*9.4,floor+1.5,z),new T.Vector3(0,-1,0)).intersectObjects(meshes)[0];assert.ok(seat);assert.ok(Math.abs(seat.point.y-floor-.59)<1e-5);assert.equal(model.contains(seat.point),true);
    for(const height of [1.5,2.4])assert.equal(model.contains(new T.Vector3(side*8.1,floor+height,z),new T.Vector3(side*13,floor+height,z)),false);
    assert.equal(model.contains(new T.Vector3(side*10.95,floor+.57,z)),true);assert.equal(model.contains(new T.Vector3(side*10.4,floor+3.6,z)),false);
  }
  meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});
});

test('fast finite paths cross every narrow column in either direction without phantom extensions',()=>{
  const model=buildPoolCabanas(floor);
  for(const side of [-1,1])for(const centre of CABANA_CENTRES)for(const x of [8.6,12.2])for(const dz of [-2.8,2.8]){
    const post=new T.Vector3(side*x,floor+1.5,centre+dz),from=post.clone().add(new T.Vector3(-.8,0,0)),to=post.clone().add(new T.Vector3(.8,0,0));
    assert.equal(model.contains(from),false);assert.equal(model.contains(to),false);assert.equal(model.contains(to,from),true);assert.equal(model.contains(from,to),true);
    const stop=post.clone().add(new T.Vector3(-.4,0,0));assert.equal(model.contains(stop,from),false);
  }
  for(const {geometry}of model.parts)geometry.dispose();
});
