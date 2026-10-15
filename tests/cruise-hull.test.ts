import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {cruiseHullContains,cruiseHullGeometry,cruiseHullHalfWidth,cruiseHullSection,cruiseHullSidePose} from '../src/cruise-hull';
import {closedHullGeometry,hullHalfWidth} from '../src/hull';

test('cruise aft shoulder tapers continuously to the transom and supports its promenade',()=> {
  let previous=17;for(let i=64;i<=128;i++){const width=cruiseHullHalfWidth(i/128);assert.ok(width<=previous&&width>0);previous=width;}
  for(const z of [100,112,124])assert.ok(cruiseHullSection(z).width>13.3);
  assert.ok(Math.abs(cruiseHullHalfWidth(1)-12.24)<1e-12);
  for(let i=0;i<=64;i++)assert.equal(cruiseHullHalfWidth(i/128),hullHalfWidth(i/128,34));
});

test('closed cruise contact follows actual side triangles and leaves outside air clear',()=> {
  const geometry=cruiseHullGeometry(),material=new T.MeshBasicMaterial(),mesh=new T.Mesh(geometry,material);mesh.updateMatrixWorld(true);
  for(const side of [-1,1])for(const z of [-129,-110,-50,0,80,100,110,120,125,129])for(const y of [-6,-3,1,4.2,7.6]) {
    const hit=new T.Raycaster(new T.Vector3(side*30,y,z),new T.Vector3(-side,0,0)).intersectObject(mesh)[0];assert.ok(hit);
    assert.equal(cruiseHullContains(hit.point),true);assert.equal(cruiseHullContains(hit.point.clone().add(new T.Vector3(side*.25,0,0))),false);
    assert.equal(cruiseHullContains(hit.point.clone().add(new T.Vector3(-side*.01,0,0)),0),true);
  }
  for(const z of [-130,0,130]){const {top}=cruiseHullSection(z);assert.equal(cruiseHullContains(new T.Vector3(0,top,z)),true);assert.equal(cruiseHullContains(new T.Vector3(0,top+.25,z)),false);}
  assert.equal(cruiseHullContains(new T.Vector3(0,5,130.3)),false);geometry.dispose();material.dispose();
});

test('cruise profile keeps closed outward triangles and leaves legacy vessels unchanged',()=> {
  const model=cruiseHullGeometry(),legacy=closedHullGeometry(260,34,9,7,true),edges=new Map<string,number>(),p=model.attributes.position,index=model.index!;
  assert.deepEqual([...index.array],[...legacy.index!.array]);
  for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++){const a=index.getX(i+j),b=index.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)??0)+1);}
  assert.ok([...edges.values()].every(count=>count===2));
  for(let i=0;i<=64*6;i++)for(let axis=0;axis<3;axis++)assert.equal(p.array[i*3+axis],legacy.attributes.position.array[i*3+axis]);
  for(const [length,beam,deck,draft,transom]of [[92,8.8,1.6,2.7,false],[28,6.6,2.05,2.1,true],[10.6,3.6,.6,1.25,true]]as const){const old=closedHullGeometry(length,beam,deck,draft,transom);for(let i=0;i<=128;i++)assert.equal(old.attributes.position.getX(i*6+1),Math.fround(hullHalfWidth(i/128,beam,transom)));old.dispose();}
  model.dispose();legacy.dispose();
});

test('aft fitted fixtures and section widths agree with the rendered cruise triangles',()=> {
  const model=cruiseHullGeometry(),material=new T.MeshBasicMaterial(),mesh=new T.Mesh(model,material);mesh.updateMatrixWorld(true);
  for(const side of [-1,1])for(const z of [0,80,100,110,120,125,129])for(const y of [1,4.2,7.6]){
    const pose=cruiseHullSidePose(y,z,side),hit=new T.Raycaster(pose.point.clone().addScaledVector(pose.normal,2),pose.normal.clone().negate()).intersectObject(mesh)[0];assert.ok(hit);assert.ok(hit.point.distanceTo(pose.point)<.00002);assert.ok(pose.normal.x*side>0);
  }
  const p=model.attributes.position;for(let i=0;i<=128;i++){const section=cruiseHullSection(p.getZ(i*6));assert.ok(Math.abs(section.width-p.getX(i*6+1))<1e-12);assert.ok(Math.abs(section.top-p.getY(i*6))<1e-12);}
  model.dispose();material.dispose();
});
