import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {buildCruiseMoorings} from '../src/cruise-moorings';import {foredeckGeometry} from '../src/hull';

test('mooring base corners meet rendered timber and post caps meet their bases',()=>{
  const timber=foredeckGeometry(),model=buildCruiseMoorings(timber,9.28),material=new T.MeshBasicMaterial(),bow=new T.Mesh(timber,material),aft=new T.Mesh(new T.BoxGeometry(26,.16,24).translate(0,9.2,112),material),down=new T.Vector3(0,-1,0);
  for(const mesh of [bow,aft])mesh.updateMatrixWorld(true);
  assert.equal(model.parts.length,8);
  for(let i=0;i<4;i++){
    const base=new T.Mesh(model.parts[i*2].geometry,material),post=model.parts[i*2+1].geometry;base.updateMatrixWorld(true);
    for(const [geometry,support]of [[base.geometry,model.supports[i].point.z<0?bow:aft],[post,base]] as const){
      const p=geometry.attributes.position,n=geometry.attributes.normal;let feet=0;
      for(let j=0;j<p.count;j++)if(n.getY(j)<-.9){
        const point=new T.Vector3().fromBufferAttribute(p,j),hit=new T.Raycaster(point.clone().add(new T.Vector3(0,.3,0)),down).intersectObject(support)[0];
        assert.ok(hit);assert.ok(Math.abs(hit.point.y-point.y)<2e-5,`supported foot ${point.toArray()}`);feet++;
      }
      assert.ok(feet>=4);
    }
  }
  timber.dispose();aft.geometry.dispose();material.dispose();model.parts.forEach(p=>p.geometry.dispose());
});

test('mooring contacts follow real flat caps, polygon sides and diagonal cap clearance',()=>{
  const timber=foredeckGeometry(),model=buildCruiseMoorings(timber,9.28);
  for(const {pose}of model.supports){
    const p=(x:number,y:number,z:number)=>new T.Vector3(x,y,z).applyMatrix4(pose);
    for(const point of [p(0,.57,0),p(0,.57,.59),p(0,1.21,0),p(0,1.15,.53)])assert.equal(model.contacts(point),true);
    for(const point of [p(0,.57,.61),p(0,1.23,0),p(0,1.17,.55)])assert.equal(model.contacts(point),false);
    const angle=Math.PI/20;
    assert.equal(model.contacts(p(Math.sin(angle)*.595,.57,Math.cos(angle)*.595)),true);
    assert.equal(model.contacts(p(Math.sin(angle)*.598,.57,Math.cos(angle)*.598)),false,'rounded cylinder would incorrectly fill the facet clearance');
  }
  for(const x of [-5,5])for(const [y,z]of [[11.4,-113],[9.7,116]])assert.equal(model.contacts(new T.Vector3(x,y,z)),true);
  timber.dispose();model.parts.forEach(p=>p.geometry.dispose());
});

test('finite fast paths cross post faces and flat caps without phantom extensions',()=>{
  const timber=foredeckGeometry(),model=buildCruiseMoorings(timber,9.28);
  for(const {pose}of model.supports){
    const p=(x:number,y:number,z:number)=>new T.Vector3(x,y,z).applyMatrix4(pose),from=p(-2,.57,0),to=p(2,.57,0);
    assert.equal(model.contacts(from),false);assert.equal(model.contacts(to),false);assert.equal(model.contacts(to,from),true);assert.equal(model.contacts(from,to),true);
    assert.equal(model.contacts(p(-.65,.57,0),from),false,'do not extend the finite path');
    assert.equal(model.contacts(p(2,1.23,0),p(-2,1.23,0)),false,'clear air over the flat cap');
    assert.equal(model.contacts(p(2,1.21,0),p(-2,1.21,0)),true,'grazing the cap within padding');
    assert.equal(model.contacts(p(0,-.4,0),p(0,2,0)),true,'cross the interior of a cap triangle');
    assert.equal(model.contacts(p(0,1.3,0),p(0,2,0)),false);
  }
  timber.dispose();model.parts.forEach(p=>p.geometry.dispose());
});

test('render batching and disposal leave an independent mooring contact mesh',()=>{
  const timber=foredeckGeometry(),model=buildCruiseMoorings(timber,9.28),point=new T.Vector3(5,9.85,116);
  assert.equal(model.contacts(point),true);
  for(const {geometry}of model.parts){geometry.translate(10000,10000,10000);geometry.dispose();}
  assert.equal(model.contacts(point),true);assert.equal(model.contacts(new T.Vector3(6,9.85,116)),false);timber.dispose();
});
