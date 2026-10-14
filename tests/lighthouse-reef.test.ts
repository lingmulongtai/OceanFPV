import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { LighthouseReef } from '../src/lighthouse-reef';
import {metricPaintGeometry} from '../src/paint';

test('metric reef charts preserve every contact triangle and captured normal',()=> {
  const reef=new LighthouseReef(),mapped=metricPaintGeometry(reef.geometry,2),source=reef.geometry;
  for(const name of ['position','normal'])assert.deepEqual(mapped.attributes[name].array,source.attributes[name].array);
  const uv=mapped.attributes.uv;let minimumArea=Infinity;
  for(let i=0;i<uv.count;i+=3) {
    const area=Math.abs((uv.getX(i+1)-uv.getX(i))*(uv.getY(i+2)-uv.getY(i))-(uv.getX(i+2)-uv.getX(i))*(uv.getY(i+1)-uv.getY(i)));
    minimumArea=Math.min(minimumArea,area);
  }
  assert.ok(minimumArea>0.001,'normal maps require non-degenerate charts');
  assert.notDeepEqual(uv.array,source.attributes.uv.array);mapped.dispose();
});

test('reef top heights match independent rendered-triangle rays including footprint misses',()=> {
  const reef=new LighthouseReef(),mesh=new T.Mesh(reef.geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));
  mesh.position.set(reef.x,0,reef.z);mesh.updateMatrixWorld();let hits=0,misses=0;
  for(let x=105.13;x<=185;x+=3.4)for(let z=-171.17;z<=-98;z+=2.9) {
    const hit=new T.Raycaster(new T.Vector3(x,40,z),new T.Vector3(0,-1,0)).intersectObject(mesh)[0],height=reef.topHeight(x,z);
    if(hit){assert.ok(height!==null&&Math.abs(height-hit.point.y)<0.00000001);hits++;}
    else {assert.equal(height,null);misses++;}
  }
  assert.ok(hits>250&&misses>250);
  assert.ok(Math.abs(reef.topHeight(175,-135)!-5.540271905)<0.00001);
});

test('reef rendering retains the original scaled shape and frees air over its slopes',()=> {
  const reef=new LighthouseReef(),material=new T.MeshBasicMaterial({side:T.DoubleSide});
  const original=new T.Mesh(new T.IcosahedronGeometry(20,2),material);original.scale.set(1.8,0.65,1.35);original.position.set(145,-1,-135);original.updateMatrixWorld();
  const actual=new T.Mesh(reef.geometry,material);actual.position.set(reef.x,0,reef.z);actual.updateMatrixWorld();
  let compared=0;
  for(let x=112;x<=178;x+=3)for(let z=-159;z<=-111;z+=3) {
    const ray=new T.Raycaster(new T.Vector3(x,40,z),new T.Vector3(0,-1,0)),before=ray.intersectObject(original)[0],after=ray.intersectObject(actual)[0];
    assert.equal(!!after,!!before);
    if(!before)continue;
    assert.ok(before.point.distanceTo(after.point)<0.00001);
    assert.equal(reef.contains(after.point),true);
    assert.equal(reef.contains(after.point.clone().addScaledVector(after.face!.normal,0.6)),false);compared++;
  }
  assert.ok(compared>200);
  const top=new T.Raycaster(new T.Vector3(175,40,-135),new T.Vector3(0,-1,0)).intersectObject(actual)[0].point;
  assert.ok(Math.abs(top.y-5.540271905)<0.00001);
  assert.equal(reef.contains(new T.Vector3(175,10,-135)),false);
  assert.equal(reef.contains(new T.Vector3(145,0,-135)),true);
  for(const p of [[145,-20,-135],[185,0,-135],[145,0,-100]])assert.equal(reef.contains(new T.Vector3(...p)),false);
});

test('reef contact padding stays 25 centimetres along every actual face normal',()=> {
  const reef=new LighthouseReef(),geometry=reef.geometry,p=geometry.attributes.position,a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),normal=new T.Vector3();
  assert.equal(geometry.index,null);
  for(let i=0;i<p.count;i+=3) {
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    normal.crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();
    const centre=a.clone().add(b).add(c).multiplyScalar(1/3).add(new T.Vector3(reef.x,0,reef.z));
    assert.equal(reef.contains(centre.clone().addScaledVector(normal,-0.1)),true);
    assert.equal(reef.contains(centre.clone().addScaledVector(normal,0.2)),true);
    assert.equal(reef.contains(centre.clone().addScaledVector(normal,0.3)),false);
  }
  assert.equal(p.count/3,180);
});
