import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {cruiseHullContains,cruiseHullGeometry,cruiseHullHalfWidth,cruiseHullSection,cruiseHullSidePose,cruiseHullSurface} from '../src/cruise-hull';
import {closedHullGeometry,hullHalfWidth} from '../src/hull';

test('cruise aft shoulder tapers continuously to the transom and supports its promenade',()=> {
  let previous=17;for(let i=64;i<=128;i++){const width=cruiseHullHalfWidth(i/128);assert.ok(width<=previous&&width>0);previous=width;}
  for(const z of [100,112,124])assert.ok(cruiseHullSection(z).width>13.3);
  assert.ok(Math.abs(cruiseHullHalfWidth(1)-12.24)<1e-12);
  for(let i=0;i<=64;i++)assert.equal(cruiseHullHalfWidth(i/128),hullHalfWidth(i/128,34));
});

test('closed cruise contact follows actual side triangles and leaves outside air clear',()=> {
  const geometry=cruiseHullGeometry(),material=new T.MeshBasicMaterial(),mesh=new T.Mesh(geometry,material);mesh.updateMatrixWorld(true);
  for(const side of [-1,1])for(const z of [-129,-123.5,-110,-50,0,80,100,110,120,125,129])for(const y of [-6,-3,1,4.2,7.6]) {
    const hit=new T.Raycaster(new T.Vector3(side*30,y,z),new T.Vector3(-side,0,0)).intersectObject(mesh)[0];
    if(!hit){assert.equal(cruiseHullSurface(y,z,side),null);assert.equal(cruiseHullContains(new T.Vector3(0,y,z),0),false);continue;}
    assert.equal(cruiseHullContains(hit.point),true);assert.equal(cruiseHullContains(hit.point.clone().addScaledVector(hit.face!.normal,.25)),false);
    assert.equal(cruiseHullContains(hit.point.clone().add(new T.Vector3(-side*.01,0,0)),0),true);
  }
  for(const z of [-130,0,130]){const {top}=cruiseHullSection(z);assert.equal(cruiseHullContains(new T.Vector3(0,top,z)),true);assert.equal(cruiseHullContains(new T.Vector3(0,top+.25,z)),false);}
  assert.equal(cruiseHullContains(new T.Vector3(0,5,130.3)),false);geometry.dispose();material.dispose();
});

test('cruise contact padding follows mesh distance around sloped sides, caps and corners',()=> {
  const geometry=cruiseHullGeometry(),positions=geometry.attributes.position,index=geometry.index!,triangle=new T.Triangle(),closest=new T.Vector3();
  const samples=[new T.Vector3(0,5,-130.15),new T.Vector3(0,5,-130.25),new T.Vector3(0,5,130.15),new T.Vector3(0,5,130.25),new T.Vector3(0,-7.15,0),new T.Vector3(0,-7.25,0)];
  for(const side of [-1,1])for(const z of [-123.5,-110,0,120,129])for(const y of [-6,-3,4.2,9]){
    const surface=cruiseHullSurface(y,z,side);assert.ok(surface);
    for(const offset of [.15,.25])samples.push(new T.Vector3(side*surface.width,y,z).addScaledVector(surface.normal,offset));
  }
  for(const row of [0,2,3]){
    const vertex=new T.Vector3().fromBufferAttribute(positions,row);
    for(const distance of [.15,.25])samples.push(vertex.clone().addScaledVector(new T.Vector3(-1,row===0?1:-1,-1).normalize(),distance));
  }
  const material=new T.MeshBasicMaterial(),mesh=new T.Mesh(geometry,material);mesh.updateMatrixWorld(true);
  for(const height of [-6.5,-3.36,0,10.5]){
    const hit=new T.Raycaster(new T.Vector3(0,height,-150),new T.Vector3(0,0,1)).intersectObject(mesh)[0];assert.ok(hit);
    for(const offset of [.15,.25])samples.push(hit.point.clone().addScaledVector(hit.face!.normal,offset));
  }
  for(const point of samples){
    let distance=Infinity;
    for(let i=0;i<index.count;i+=3){triangle.a.fromBufferAttribute(positions,index.getX(i));triangle.b.fromBufferAttribute(positions,index.getX(i+1));triangle.c.fromBufferAttribute(positions,index.getX(i+2));triangle.closestPointToPoint(point,closest);distance=Math.min(distance,point.distanceTo(closest));}
    assert.equal(cruiseHullContains(point,0),false,`outside volume: ${point.toArray()}`);
    assert.equal(cruiseHullContains(point),distance<=.2,`mesh distance ${distance}: ${point.toArray()}`);
  }
  geometry.dispose();material.dispose();
});

test('raked cruise bow keeps a closed outward hull, fixed deck rim and unchanged aft body',()=> {
  const model=cruiseHullGeometry(),legacy=closedHullGeometry(260,34,9,7,true,cruiseHullHalfWidth),edges=new Map<string,{count:number;balance:number}>(),used=new Set<number>(),p=model.attributes.position,index=model.index!;
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),normal=new T.Vector3(),interior=new T.Vector3(0,-1,0);let volume=0;
  for(let i=0;i<index.count;i+=3){
    a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));normal.crossVectors(b.clone().sub(a),c.clone().sub(a));
    assert.ok(normal.length()>.01);assert.ok(normal.dot(a.clone().sub(interior))>0);volume+=a.dot(b.clone().cross(c))/6;
    for(let j=0;j<3;j++){const a=index.getX(i+j),b=index.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`,edge=edges.get(key)??{count:0,balance:0};used.add(a);edge.count++;edge.balance+=a<b?1:-1;edges.set(key,edge);}
  }
  assert.ok([...edges.values()].every(edge=>edge.count===2&&edge.balance===0));assert.equal(used.size-edges.size+index.count/3,2);assert.ok(volume>0);
  for(let station=0;station<=128;station++)for(let row=0;row<6;row++){
    const i=station*6+row;
    if(row<2||station/128>=.18)for(let axis=0;axis<3;axis++)assert.equal(p.array[i*3+axis],legacy.attributes.position.array[i*3+axis]);
    if(station)assert.ok(p.getZ(i)>p.getZ(i-6));
  }
  assert.equal(p.getZ(2),-126);assert.equal(p.getZ(3),-124);assert.equal(p.getZ(0),-130);
  for(let i=128*36;i<128*36+12;i+=3){a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));normal.crossVectors(b.sub(a),c.sub(a)).normalize();assert.equal(normal.x,0);assert.ok(normal.z<0);}
  for(const [length,beam,deck,draft,transom]of [[92,8.8,1.6,2.7,false],[28,6.6,2.05,2.1,true],[10.6,3.6,.6,1.25,true]]as const){const old=closedHullGeometry(length,beam,deck,draft,transom);for(let i=0;i<=128;i++)assert.equal(old.attributes.position.getX(i*6+1),Math.fround(hullHalfWidth(i/128,beam,transom)));old.dispose();}
  model.dispose();legacy.dispose();
});

test('fitted fixtures and section widths agree with the rendered cruise triangles',()=> {
  const model=cruiseHullGeometry(),material=new T.MeshBasicMaterial(),mesh=new T.Mesh(model,material);mesh.updateMatrixWorld(true);
  for(const side of [-1,1])for(const z of [-129,-125,-113,-96,-50,0,80,100,110,120,125,129])for(const y of [1,4.2,7.6]){
    if(!new T.Raycaster(new T.Vector3(side*30,y,z),new T.Vector3(-side,0,0)).intersectObject(mesh).length){assert.equal(cruiseHullSurface(y,z,side),null);assert.throws(()=>cruiseHullSidePose(y,z,side),RangeError);continue;}
    const pose=cruiseHullSidePose(y,z,side),hit=new T.Raycaster(pose.point.clone().addScaledVector(pose.normal,2),pose.normal.clone().negate()).intersectObject(mesh)[0];assert.ok(hit);assert.ok(hit.point.distanceTo(pose.point)<.00002);assert.ok(pose.normal.x*side>0);
  }
  const p=model.attributes.position;for(let i=0;i<=128;i++){const section=cruiseHullSection(p.getZ(i*6));assert.ok(Math.abs(section.width-p.getX(i*6+1))<1e-12);assert.ok(Math.abs(section.top-p.getY(i*6))<1e-12);}
  model.dispose();material.dispose();
});

test('cruise surface queries reject points above, below and beyond the actual sides',()=> {
  for(const side of [-1,1])for(const [y,z]of [[12,0],[-7.01,0],[0,-130.01],[0,130.01],[cruiseHullSection(0).top+.001,0],[9.3,-29.453125]])assert.equal(cruiseHullSurface(y,z,side),null);
});
