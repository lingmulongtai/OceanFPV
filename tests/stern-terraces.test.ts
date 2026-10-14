import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {buildSternTerraces,STERN_TERRACES} from '../src/stern-terraces';

test('stern terraces put timber above painted structure with real surface contacts',()=> {
  const model=buildSternTerraces(),meshes=model.parts.map(part=>new T.Mesh(part.geometry,new T.MeshBasicMaterial()));meshes.forEach(mesh=>mesh.updateMatrixWorld(true));
  assert.equal(model.parts.filter(p=>p.finish==='teak').length,3);
  for(const deck of STERN_TERRACES) {
    const ray=new T.Raycaster(new T.Vector3(deck.width/2-.3,deck.y+1,deck.z+3.6),new T.Vector3(0,-1,0)),hit=ray.intersectObjects(meshes)[0];assert.ok(hit);
    assert.ok(Math.abs(hit.point.y-(deck.y+.2))<1e-5);assert.equal(model.contains(hit.point),true);
    assert.equal(model.contains(new T.Vector3(0,deck.y+.5,deck.z+3.6)),false);
    assert.equal(model.contains(new T.Vector3(deck.width/2+.6,deck.y,deck.z+3.6)),false);
    const underside=new T.Raycaster(new T.Vector3(deck.width/2-.3,deck.y-1,deck.z+3.6),new T.Vector3(0,1,0)).intersectObjects(meshes)[0];assert.ok(underside);assert.ok(Math.abs(underside.point.y-(deck.y-.14))<1e-5);
    assert.equal(model.parts[meshes.findIndex(mesh=>mesh===underside.object)].finish,'paint');
  }
});

test('terrace guardrails have supported posts and keep the space above them clear',()=> {
  const model=buildSternTerraces();
  for(const deck of STERN_TERRACES) {
    const floor=deck.y+.2,aft=deck.z+deck.depth/2-.14,ray=new T.Raycaster(new T.Vector3(0,floor+1.05,aft+1),new T.Vector3(0,0,-1)),meshes=model.parts.map(part=>new T.Mesh(part.geometry,new T.MeshBasicMaterial()));
    meshes.forEach(mesh=>mesh.updateMatrixWorld(true));const hit=ray.intersectObjects(meshes)[0];assert.ok(hit);assert.equal(model.contains(hit.point),true);
    assert.equal(model.contains(new T.Vector3(0,floor+1.4,aft)),false);assert.equal(model.contains(new T.Vector3(0,floor+.8,aft+.5)),false);
    const posts=model.rails.filter(r=>Math.abs(r.line.start.y-floor)<1e-9);assert.ok(posts.length>20);
    for(const {line}of posts)assert.ok(Math.abs(line.end.y-floor-1.05)<1e-9);
  }
});

test('terrace support walls span to the previous deck without blocking open air',()=> {
  const model=buildSternTerraces();
  for(const [tier,deck]of STERN_TERRACES.entries()) {
    const foot=tier?STERN_TERRACES[tier-1].y+.2:9.28,top=deck.y-.14,z=tier?deck.z+3.3:deck.z-3.3;
    for(const side of [-1,1]) {const x=side*(tier?deck.width/2-1.1:12.4);assert.equal(model.contains(new T.Vector3(x,(foot+top)/2,z),0),true);assert.equal(model.contains(new T.Vector3(x,foot+.001,z),0),true);}
    assert.equal(model.contains(new T.Vector3(0,(foot+top)/2,z),.1),false);
  }
  for(const support of model.solids.slice(2,4)){assert.ok(support.min.x>=-13&&support.max.x<=13);assert.ok(support.min.z>=100&&support.max.z<=124);assert.ok(Math.abs(support.min.y-9.28)<1e-12);}
});

test('all terraces stay behind cabin glazing and their supports land on the deck below',()=> {
  const model=buildSternTerraces(),glazingEnds=[101.07,101.07,98.07];
  for(const [tier,deck]of STERN_TERRACES.entries()) {
    assert.ok(deck.z-deck.depth/2>glazingEnds[tier]);
    if(tier){const lower=STERN_TERRACES[tier-1],supports=model.solids.slice(tier*4+2,tier*4+4);for(const support of supports){assert.ok(support.min.x>=-lower.width/2&&support.max.x<=lower.width/2);assert.ok(support.min.z>=lower.z-lower.depth/2&&support.max.z<=lower.z+lower.depth/2);}}
  }
});
