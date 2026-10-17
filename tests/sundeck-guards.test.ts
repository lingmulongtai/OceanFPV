import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {buildSundeckGuards} from '../src/sundeck-guards';
import {deckGeometry} from '../src/ship-outline';
const floor=10.6+7*2.85+1.58;

test('top rails close all four corners and every post is supported by the rounded deck',()=>{
  const model=buildSundeckGuards(floor),top=model.segments.filter(({line})=>line.start.y===floor+1.05&&line.end.y===floor+1.05);
  assert.equal(top.length,4);const degree=new Map<string,number>();
  for(const {line}of top)for(const point of [line.start,line.end]){const key=`${point.x},${point.z}`;degree.set(key,(degree.get(key)??0)+1);}
  assert.deepEqual([...degree.keys()].sort(),['-14,-53','-14,80','14,-53','14,80']);assert.ok([...degree.values()].every(n=>n===2));
  const geometry=deckGeometry(145,32.6,.28,8);geometry.translate(0,floor-.14,15);
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.updateMatrixWorld(true);
  const posts=model.segments.filter(({line})=>line.start.y===floor);
  for(const {line}of posts){const origin=line.start.clone().add(new T.Vector3(0,1,0)),hit=new T.Raycaster(origin,new T.Vector3(0,-1,0)).intersectObject(mesh)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-floor)<1e-5);assert.ok(Math.abs(line.end.y-floor-1.05)<1e-10);}
  for(const coordinate of ['x','z'] as const)for(const fixed of coordinate==='x'?[-53,80]:[-14,14]) {
    const along=posts.filter(({line})=>line.start[coordinate==='x'?'z':'x']===fixed).map(({line})=>line.start[coordinate]).sort((a,b)=>a-b);
    for(let i=1;i<along.length;i++)assert.ok(along[i]-along[i-1]<=2.2+1e-10);
  }
  geometry.dispose();mesh.material.dispose();
});

test('thin guard contacts leave air above, between bars and inside the deck clear',()=>{
  const model=buildSundeckGuards(floor);
  for(const {line}of model.segments)assert.equal(model.contacts(line.getCenter(new T.Vector3())),true);
  for(const point of [[0,floor+1.5,-53],[0,floor+.8,-53],[0,floor+.8,0],[15,floor+.8,0]])assert.equal(model.contacts(new T.Vector3(...point)),false);
  assert.equal(model.contacts(new T.Vector3(0,floor+1.289,-53)),true);
  assert.equal(model.contacts(new T.Vector3(0,floor+1.291,-53)),false);
});

test('finite high-speed paths hit every side in either direction without extending the flight ray',()=>{
  const model=buildSundeckGuards(floor),paths=[
    [[0,floor+.55,-55],[0,floor+.55,-51]],[[0,floor+.55,78],[0,floor+.55,82]],
    [[12,floor+1.05,0],[16,floor+1.05,0]],[[-16,floor+1.05,0],[-12,floor+1.05,0]]
  ];
  for(const [a,b]of paths){const from=new T.Vector3(...a),to=new T.Vector3(...b);assert.equal(model.contacts(from),false);assert.equal(model.contacts(to),false);assert.equal(model.contacts(to,from),true);assert.equal(model.contacts(from,to),true);}
  for(const [a,b]of [[[0,floor+.55,-56],[0,floor+.55,-54]],[[0,floor+.55,-52],[0,floor+.55,-50]],[[0,floor+1.5,-55],[0,floor+1.5,-51]]])assert.equal(model.contacts(new T.Vector3(...b),new T.Vector3(...a)),false);
});
