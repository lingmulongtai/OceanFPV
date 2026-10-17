import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {buildCruisePools,POOL,POOL_CENTRES} from '../src/cruise-pools';
const floor=10.6+7*2.85+1.58+.18;
function meshes(model:ReturnType<typeof buildCruisePools>){return model.parts.map(({geometry})=>{const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.updateMatrixWorld(true);return mesh;});}
function dispose(model:ReturnType<typeof buildCruisePools>){for(const {geometry}of model.parts)geometry.dispose();model.surfaces.forEach(g=>g.dispose());}

test('raised pool base and every stair are supported above the intact timber deck',()=>{
  const model=buildCruisePools(floor),deck=new T.Mesh(new T.BoxGeometry(28,.18,74),new T.MeshBasicMaterial());deck.position.set(0,floor-.09,18);deck.updateMatrixWorld(true);
  for(const part of model.parts){part.geometry.computeBoundingBox();const b=part.geometry.boundingBox!;assert.ok(b.min.y>=floor-1e-5);assert.ok(b.min.x>=-4.5-1e-5&&b.max.x<=4.5+1e-5);assert.ok(b.min.z>=-19&&b.max.z<=55);
    if(part.kind==='base'||part.kind==='step'){const centre=b.getCenter(new T.Vector3()),hit=new T.Raycaster(centre.clone().setY(floor+2),new T.Vector3(0,-1,0)).intersectObject(deck)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-b.min.y)<1e-5);}}
  const surfaces=meshes(model);
  for(const z of POOL_CENTRES)for(const side of [-1,1]){let last=0;for(let step=1;step<=6;step++){const at=z+side*(8.5+(6.5-step)*.3),hit=new T.Raycaster(new T.Vector3(0,floor+3,at),new T.Vector3(0,-1,0)).intersectObjects(surfaces)[0];assert.ok(hit);const lift=hit.point.y-floor;assert.ok(Math.abs(lift-last-.2)<1e-5);last=lift;assert.equal(model.contact(hit.point),'structure');}assert.ok(Math.abs(POOL.rim-last-.2)<1e-5);}
  surfaces.forEach(m=>m.material.dispose());deck.geometry.dispose();deck.material.dispose();dispose(model);
});

test('water stays below coping with a tiled bottom and clear air above the actual tank',()=>{
  const model=buildCruisePools(floor),surfaces=meshes(model);
  assert.ok(Math.abs(POOL.water-POOL.bottom-1.1)<1e-12);assert.ok(Math.abs(POOL.rim-POOL.water-.18)<1e-12);
  for(const [i,z]of POOL_CENTRES.entries()){
    const bottom=new T.Raycaster(new T.Vector3(0,floor+1,z),new T.Vector3(0,-1,0)).intersectObjects(surfaces)[0];assert.ok(bottom);assert.ok(Math.abs(bottom.point.y-floor-POOL.bottom)<1e-5);
    const water=new T.Mesh(model.surfaces[i],new T.MeshBasicMaterial());water.updateMatrixWorld(true);const hit=new T.Raycaster(new T.Vector3(0,floor+2,z),new T.Vector3(0,-1,0)).intersectObject(water)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-floor-POOL.water)<1e-5);assert.equal(model.contact(hit.point),'water');water.material.dispose();
    assert.equal(model.contact(new T.Vector3(0,floor+1.65,z)),null);assert.equal(model.contact(new T.Vector3(5.2,floor+1,z)),null);
    for(const x of [-4.3,4.3])for(const dz of [-8.2,8.2])assert.equal(model.contact(new T.Vector3(x,floor+.8,z+dz)),'structure');
  }
  surfaces.forEach(m=>m.material.dispose());dispose(model);
});

test('finite wall, stair and water sweeps catch crossings while paths above the pool remain clear',()=>{
  const model=buildCruisePools(floor);
  for(const z of POOL_CENTRES){
    const a=new T.Vector3(-5,floor+1,z),b=new T.Vector3(5,floor+1,z);assert.equal(model.contact(a),null);assert.equal(model.contact(b),null);assert.equal(model.contact(a,b),'structure');assert.equal(model.contact(b,a),'structure');
    assert.equal(model.contact(new T.Vector3(0,floor+.7,z),new T.Vector3(0,floor+2,z)),'water');
    assert.equal(model.contact(new T.Vector3(0,floor+1.5,z),new T.Vector3(0,floor+2,z)),null);
    assert.equal(model.contact(new T.Vector3(5,floor+1.65,z),new T.Vector3(-5,floor+1.65,z)),null);
    assert.equal(model.contact(new T.Vector3(-4.8,floor+1,z),new T.Vector3(-5.5,floor+1,z)),null);
    const stairA=new T.Vector3(-2,floor+.4,z+9.55),stairB=new T.Vector3(2,floor+.4,z+9.55);assert.equal(model.contact(stairA),null);assert.equal(model.contact(stairB),null);assert.equal(model.contact(stairA,stairB),'structure');assert.equal(model.contact(stairB,stairA),'structure');
  }dispose(model);
});

test('ladder handrails meet the coping and retain narrow contacts with clear space overhead',()=>{
  const model=buildCruisePools(floor),surfaces=meshes(model);
  for(const z of POOL_CENTRES){const hit=new T.Raycaster(new T.Vector3(-1.5,floor+1.7,z-8.175),new T.Vector3(1,0,0),0,2).intersectObjects(surfaces)[0];assert.ok(hit);assert.equal(model.contact(hit.point),'structure');assert.equal(model.contact(new T.Vector3(0,floor+2.5,z-7.8)),null);}
  surfaces.forEach(m=>m.material.dispose());dispose(model);
});
