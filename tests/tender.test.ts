import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {buildTenderModel,TENDER_MOUNTS,TENDER_HOOKS} from '../src/tender';

test('tender hull and raked canopy close every edge with outward volume',()=> {
  const model=buildTenderModel();
  for(const geometry of [model.hull,model.canopy,model.coaming]) {
    const p=geometry.attributes.position,index=geometry.index!,edges=new Map<string,number>();let volume=0;
    for(let i=0;i<index.count;i+=3) {
      const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)],vertices=ids.map(j=>new T.Vector3().fromBufferAttribute(p,j));
      volume+=vertices[0].dot(vertices[1].clone().cross(vertices[2]))/6;
      for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');edges.set(key,(edges.get(key)??0)+1);}
    }
    assert.ok(volume>1);assert.ok([...edges.values()].every(n=>n===2));
  }
});

test('canopy coaming bridges the hull deck to the full cabin base',()=> {
  const model=buildTenderModel(),material=new T.MeshBasicMaterial(),hull=new T.Mesh(model.hull,material),coaming=new T.Mesh(model.coaming,material);hull.updateMatrixWorld();coaming.updateMatrixWorld();
  for(const z of [-4.3,-3.5,0,3.6,4.3]) {
    const ray=new T.Raycaster(new T.Vector3(0,3,z),new T.Vector3(0,-1,0)),deck=ray.intersectObject(hull)[0],seal=ray.intersectObject(coaming)[0];
    assert.ok(deck&&seal);assert.ok(model.coaming.boundingBox!.min.y<deck.point.y);assert.ok(Math.abs(seal.point.y-model.canopy.boundingBox!.min.y)<0.000001);
  }
  material.dispose();
});

test('tender forefoot rises to the stem while the stern draft and end caps stay sound',()=> {
  const model=buildTenderModel(),p=model.hull.attributes.position;
  assert.ok(p.getY(3)>-0.151&&p.getY(3)<-0.149);assert.ok(p.getY(128*6+3)<-1.249);
  for(let station=1;station<128;station++)assert.ok(p.getY(station*6+3)<=p.getY((station-1)*6+3));
  for(const [end,center]of [[0,p.count-2],[128,p.count-1]]) {
    const ys=Array.from({length:6},(_,row)=>p.getY(end*6+row));assert.ok(p.getY(center)>Math.min(...ys)&&p.getY(center)<Math.max(...ys));
  }
  assert.equal(model.contains(new T.Vector3(0,-1.0,-5.2)),false);assert.equal(model.contains(new T.Vector3(0,-1.0,4.8)),true);
});

test('tender contacts include independently raycast surfaces but leave bow airspace free',()=> {
  const model=buildTenderModel(),material=new T.MeshBasicMaterial({side:T.FrontSide}),meshes=[model.hull,model.canopy].map(geometry=>new T.Mesh(geometry,material));
  for(const mesh of meshes)mesh.updateMatrixWorld();
  for(const [eye,direction]of [[[5,0,0],[-1,0,0]],[[-5,0,0],[1,0,0]],[[0,0,-8],[0,0,1]],[[0,0,8],[0,0,-1]],[[0,5,0],[0,-1,0]],[[0,-4,0],[0,1,0]]] as const) {
    const ray=new T.Raycaster(new T.Vector3(...eye),new T.Vector3(...direction)),hit=ray.intersectObjects(meshes)[0];
    assert.ok(hit);assert.equal(model.contains(hit.point),true);assert.equal(model.contains(new T.Vector3(...eye)),false);
  }
  assert.equal(model.contains(new T.Vector3(0,-0.5,0)),true);
  assert.equal(model.contains(new T.Vector3(1.2,-1.05,-4.8)),false);
  assert.equal(model.contains(new T.Vector3(2.7,1,0)),false);
  material.dispose();
});

test('tender windows face outwards and mounting footprints clear railings and neighbours',()=> {
  const model=buildTenderModel(),panes=model.parts.filter(p=>p.finish==='glass');assert.equal(panes.length,16);assert.equal(TENDER_MOUNTS.length,18);
  for(const {geometry}of panes) {
    const p=geometry.attributes.position,n=geometry.attributes.normal,center=new T.Vector3();for(let i=0;i<p.count;i++)center.add(new T.Vector3().fromBufferAttribute(p,i));center.divideScalar(p.count);
    const normal=new T.Vector3().fromBufferAttribute(n,0);assert.ok(normal.dot(new T.Vector3(center.x,0,center.z))>0);
  }
  for(const mount of TENDER_MOUNTS) {
    const bounds=model.bounds.clone().translate(mount);assert.ok(Math.min(Math.abs(bounds.min.x),Math.abs(bounds.max.x))>16.3);
    for(const other of TENDER_MOUNTS)if(other!==mount)assert.equal(bounds.intersectsBox(model.bounds.clone().translate(other)),false);
    for(const hook of TENDER_HOOKS){const point=mount.clone().add(hook);assert.ok(point.y<14.9&&point.y>13.8);assert.equal(model.contains(hook),true);}
  }
});

test('hatches, hoist seats and protection-rail feet meet the actual gelcoat roof',()=> {
  const model=buildTenderModel(),material=new T.MeshBasicMaterial(),roof=model.parts.filter(p=>p.name==='roof gelcoat').map(p=>new T.Mesh(p.geometry,material));roof.forEach(mesh=>mesh.updateMatrixWorld());
  const supported=model.parts.filter(p=>['roof access hatch','hoist reinforcement','rail support'].includes(p.name));assert.equal(supported.length,10);
  for(const {geometry,name}of supported) {
    const bounds=geometry.boundingBox!,center=bounds.getCenter(new T.Vector3()),ray=new T.Raycaster(new T.Vector3(center.x,4,center.z),new T.Vector3(0,-1,0)),hit=ray.intersectObjects(roof)[0];
    assert.ok(hit);assert.ok(bounds.min.y<=hit.point.y&&hit.point.y-bounds.min.y<0.004,`${name} floats or sinks through roof`);
    if(name!=='rail support')assert.equal(model.contains(new T.Vector3(center.x,bounds.max.y+0.19,center.z)),true);
  }
  material.dispose();
});

test('all sixteen tender windows have real wall openings and retain sealed contacts',()=> {
  const model=buildTenderModel(),material=new T.MeshBasicMaterial({side:T.DoubleSide}),shell=model.parts.find(p=>p.name==='apertured canopy')!,mesh=new T.Mesh(shell.geometry,material);mesh.updateMatrixWorld();
  assert.equal(model.parts.some(p=>p.geometry===model.canopy),false);
  for(const pane of model.parts.filter(p=>p.finish==='glass')) {
    const p=pane.geometry.attributes.position,normal=new T.Vector3().fromBufferAttribute(pane.geometry.attributes.normal,0),centre=new T.Vector3();
    for(let i=0;i<p.count;i++)centre.add(new T.Vector3().fromBufferAttribute(p,i));centre.divideScalar(p.count);
    const ray=new T.Raycaster(centre.clone().addScaledVector(normal,0.1),normal.clone().negate(),0,0.3);
    assert.equal(ray.intersectObject(mesh).length,0);assert.equal(model.contains(centre),true);
  }
  for(const side of [-1,1]) {
    const ray=new T.Raycaster(new T.Vector3(side*2,1.36,-2.29),new T.Vector3(-side,0,0),0,1);
    const hits=ray.intersectObject(mesh);assert.ok(hits.length>=2);assert.ok(hits[1].distance-hits[0].distance>0.045);
  }
  material.dispose();
});

test('tender canopy provides standing headroom and remains below every davit',()=> {
  const model=buildTenderModel(),material=new T.MeshBasicMaterial({side:T.DoubleSide}),mesh=new T.Mesh(model.parts.find(p=>p.name==='apertured canopy')!.geometry,material);mesh.updateMatrixWorld();
  const floor=new T.Mesh(model.parts.find(p=>p.name==='cabin floor')!.geometry,material);floor.updateMatrixWorld();
  for(const z of [-3,-1,1,3]) {
    const origin=new T.Vector3(0,1,z),ceiling=new T.Raycaster(origin,new T.Vector3(0,1,0)).intersectObject(mesh)[0],deck=new T.Raycaster(origin,new T.Vector3(0,-1,0)).intersectObject(floor)[0];
    assert.ok(ceiling&&deck);assert.ok(ceiling.point.y-deck.point.y>2.0);
  }
  for(const mount of TENDER_MOUNTS) {
    assert.ok(model.bounds.max.y+mount.y<14.9);
    for(const hook of TENDER_HOOKS)assert.ok(14.9-(hook.y+mount.y)>0.15);
  }
  material.dispose();
});

test('tender seats rest on the rendered floor and stay inside the raked shell',()=> {
  const model=buildTenderModel(),material=new T.MeshBasicMaterial({side:T.DoubleSide}),floorParts=model.parts.filter(p=>p.name==='cabin floor'||p.name==='helm floor'),floors=floorParts.map(p=>new T.Mesh(p.geometry,material)),canopy=new T.Mesh(model.canopy,material);
  for(const mesh of [...floors,canopy])mesh.updateMatrixWorld();
  for(const part of model.parts.filter(p=>p.name==='seat pedestal'||p.name==='helm pedestal')) {
    const bounds=part.geometry.boundingBox!,centre=bounds.getCenter(new T.Vector3()),hit=new T.Raycaster(new T.Vector3(centre.x,2,centre.z),new T.Vector3(0,-1,0)).intersectObjects(floors)[0];
    assert.ok(hit);assert.ok(Math.abs(bounds.min.y-hit.point.y)<0.001);
  }
  const seats=model.parts.filter(p=>p.finish==='upholstery');assert.equal(seats.length,26);
  for(const part of seats) {
    const p=part.geometry.attributes.position;
    for(let i=0;i<p.count;i+=5) {
      const point=new T.Vector3().fromBufferAttribute(p,i),hit=new T.Raycaster(point,new T.Vector3(1,0,0)).intersectObject(canopy)[0];
      assert.ok(hit&&hit.face!.normal.x>0,'Upholstery protrudes through cabin');
    }
  }
  material.dispose();
});

test('rendered tender seating is visible through the actual side apertures',()=> {
  const model=buildTenderModel(),material=new T.MeshBasicMaterial({side:T.DoubleSide}),meshes=model.parts.filter(p=>p.finish!=='glass').map(p=>{const mesh=new T.Mesh(p.geometry,material);mesh.name=p.name;mesh.updateMatrixWorld();return mesh;});
  for(const side of [-1,1]) {
    const eye=new T.Vector3(side*2.4,2.2,0.44),target=new T.Vector3(side*1.39,1.4,0.44),hit=new T.Raycaster(eye,target.sub(eye).normalize()).intersectObjects(meshes)[0];
    assert.ok(hit);assert.equal(hit.object.name,'passenger back');assert.equal(model.contains(hit.point),true);
  }
  material.dispose();
});
