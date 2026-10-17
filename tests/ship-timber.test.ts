import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,Vector3} from 'three';
import {buildCruiseGeometry} from '../src/cruise';
import {buildMotorYacht} from '../src/yacht';
import {cabinOcclusionTexture,CABIN_ATLAS_BYTES} from '../src/occlusion';

for(const name of ['cruise','yacht'] as const)test(`${name} timber covers vertical faces at metre scale and preserves horizontal deck charts`,()=>{
  const model=name==='cruise'?buildCruiseGeometry(()=>cabinOcclusionTexture(new Uint8Array(CABIN_ATLAS_BYTES))):buildMotorYacht();
  try {
    const timber=model.root.children.find(object=>object instanceof Mesh&&object.material===model.teak) as Mesh|undefined;assert.ok(timber);
    const p=timber.geometry.attributes.position,uv=timber.geometry.attributes.uv,a=new Vector3(),b=new Vector3(),c=new Vector3();let triangles=0,horizontal=0;
    for(let i=0;i<p.count;i+=3){
      a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);const normal=b.cross(c),area=normal.length();if(area<1e-10)continue;triangles++;
      const textureArea=Math.abs((uv.getX(i+1)-uv.getX(i))*(uv.getY(i+2)-uv.getY(i))-(uv.getX(i+2)-uv.getX(i))*(uv.getY(i+1)-uv.getY(i)));
      // An orthogonal chart must retain at least 1/sqrt(3) of surface area.
      assert.ok(textureArea/area>=.99/(Math.sqrt(3)*1.8**2),`Collapsed or underscaled timber triangle ${i/3}`);
      if(Math.abs(normal.y)/area>.999){horizontal++;for(let j=i;j<i+3;j++){assert.ok(Math.abs(uv.getX(j)*1.8-p.getX(j))<.00002);assert.ok(Math.abs(uv.getY(j)*1.8-p.getZ(j))<.00002);}}
    }
    assert.ok(triangles>1000);assert.ok(horizontal>100);assert.ok(triangles>horizontal);
  }finally{model.root.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});}
});
