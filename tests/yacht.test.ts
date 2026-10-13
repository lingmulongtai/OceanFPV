import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {closedHullGeometry} from '../src/hull.ts';
import {buildMotorYacht,yachtDeckGeometry,yachtHullContains} from '../src/yacht.ts';
import {vesselBoxContains} from '../src/cruise.ts';

test('yacht planking follows actual closed hull triangles and stays inside both gunwales',()=> {
  const hull=new T.Mesh(closedHullGeometry(28,6.6,2.05,2.1,true),new T.MeshBasicMaterial({side:T.DoubleSide})),deck=yachtDeckGeometry(),p=deck.attributes.position,ray=new T.Raycaster();hull.updateMatrixWorld(true);
  for(let i=0;i<p.count;i+=17) {
    const point=new T.Vector3().fromBufferAttribute(p,i);ray.set(point.clone().add(new T.Vector3(0,2,0)),new T.Vector3(0,-1,0));const hit=ray.intersectObject(hull)[0];
    assert.ok(hit,'planking overhangs the closed hull');assert.ok(Math.abs(point.y-hit.point.y-0.035)<1e-5,'planking is detached from hull sheer');
  }
  assert.ok(p.count>1000);hull.geometry.dispose();deck.dispose();
});
test('yacht contacts reject bow airspace and include actual side and roof surfaces',()=> {
  const model=buildMotorYacht(),ray=new T.Raycaster();model.root.updateMatrixWorld(true);
  assert.equal(yachtHullContains(new T.Vector3(3,2.1,-13)),false);
  for(const z of [-12,-7,0,7,12])for(const side of [-1,1]) {
    ray.set(new T.Vector3(side*8,1.2,z),new T.Vector3(-side,0,0));const hit=ray.intersectObject(model.root,true)[0];assert.ok(hit);
    assert.equal(yachtHullContains(hit.point.clone().add(new T.Vector3(-side*0.03,0,0))),true);
    assert.equal(yachtHullContains(hit.point.clone().add(new T.Vector3(side*0.6,0,0))),false);
  }
  ray.set(new T.Vector3(0,9,0),new T.Vector3(0,-1,0));const roof=ray.intersectObject(model.root,true)[0];assert.ok(roof);
  assert.ok(model.boxes.some(box=>vesselBoxContains(box,roof.point)),'rendered roof is not solid to drone contacts');
  model.root.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});
});
