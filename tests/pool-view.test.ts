import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {buildCruiseGeometry} from '../src/cruise';
import {cabinOcclusionTexture,CABIN_ATLAS_BYTES} from '../src/occlusion';

test('pool views cull only real backfaces and restore visibility across reflected cameras',()=>{
  const model=buildCruiseGeometry(()=>cabinOcclusionTexture(new Uint8Array(CABIN_ATLAS_BYTES)));
  try{
    const water=model.root.children.find(object=>object instanceof T.Mesh&&(object.material as T.Material).name==='Cruise pool water') as T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>;
    assert.ok(water);assert.equal(water.material.side,T.FrontSide);
    const p=water.geometry.attributes.position,n=water.geometry.attributes.normal,y=p.getY(0);
    assert.equal(p.count,12);for(let i=0;i<p.count;i++){assert.ok(Math.abs(p.getY(i)-y)<.00001);assert.ok(n.getY(i)>.99999);}
    model.root.position.set(100000,5,-200000);model.root.rotation.set(.17,1.2,-.09);model.root.updateMatrixWorld(true);
    const camera=(height:number)=>{const c=new T.PerspectiveCamera();c.position.copy(model.root.localToWorld(new T.Vector3(0,y+height,7)));c.lookAt(model.root.localToWorld(new T.Vector3(0,y,7)));c.updateMatrixWorld(true);return c;};
    const above=camera(2),below=camera(-2),hits=(c:T.Camera)=>new T.Raycaster(c.position.clone(),model.root.localToWorld(new T.Vector3(0,y,7)).sub(c.position).normalize()).intersectObject(water);
    assert.ok(hits(above).length>0);assert.equal(hits(below).length,0);
    model.beginPoolView(above);assert.equal(water.visible,true);
    model.beginPoolView(below);assert.equal(water.visible,false);
    model.beginPoolView(above);assert.equal(water.visible,true);
    model.endPoolView();assert.equal(water.visible,false);model.endPoolView();assert.equal(water.visible,true);model.endPoolView();assert.equal(water.visible,true);
    model.beginPoolView(camera(-.000001));assert.equal(water.visible,true);model.endPoolView();
    const unknown=new T.Camera();unknown.position.copy(below.position);model.beginPoolView(unknown);assert.equal(water.visible,true);model.endPoolView();
    water.material.side=T.DoubleSide;model.beginPoolView(below);assert.equal(water.visible,true);model.endPoolView();water.material.side=T.FrontSide;
    water.visible=false;model.beginPoolView(above);model.beginPoolView(below);model.endPoolView();model.endPoolView();assert.equal(water.visible,false);
    assert.equal(water.material.transmission,.96);assert.equal(water.material.opacity,1);assert.equal(water.castShadow,false);
  }finally{model.root.traverse(object=>{if(object instanceof T.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});}
});
