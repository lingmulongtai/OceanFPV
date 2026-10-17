import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {SlopeMoments} from '../src/slope-moments';

test('slope moments retain signed cross energy and independent band layers in half floats',()=>{
  const bands=Array.from({length:3},(_,band)=>({size:4,tangentX:Float32Array.from({length:64},(_,i)=>i%4===1?(band+1)*.125:7),tangentZ:Float32Array.from({length:64},(_,i)=>i%4===1?-(band+1)*.25:9)}));
  const original=bands.map(b=>[b.tangentX.slice(),b.tangentZ.slice()]),moments=new SlopeMoments(bands);
  for(let band=0;band<3;band++)for(let pixel=0;pixel<16;pixel++){
    const x=(band+1)*.125,z=-(band+1)*.25,offset=(band*16+pixel)*4;
    assert.deepEqual([...moments.data.slice(offset,offset+4)].map(T.DataUtils.fromHalfFloat),[x*x,z*z,x*z,0]);
  }
  assert.equal(moments.texture.image.data,moments.data);assert.equal(moments.texture.image.depth,3);assert.equal(moments.texture.type,T.HalfFloatType);assert.equal(moments.texture.generateMipmaps,true);
  bands.forEach((b,i)=>{assert.deepEqual(b.tangentX,original[i][0]);assert.deepEqual(b.tangentZ,original[i][1]);});
  moments.texture.dispose();
});

test('moment updates reuse storage and the no-mipmap fallback keeps half-float linear filtering',()=>{
  const bands=Array.from({length:3},()=>({size:4,tangentX:new Float32Array(64),tangentZ:new Float32Array(64)})),moments=new SlopeMoments(bands),data=moments.data,version=moments.texture.version;
  bands[1].tangentX[1]=.5;bands[1].tangentZ[1]=-.25;moments.update();
  assert.equal(moments.data,data);assert.equal(moments.texture.version,version+1);assert.equal(T.DataUtils.fromHalfFloat(data[64]),.25);assert.equal(T.DataUtils.fromHalfFloat(data[66]),-.125);assert.ok(data.slice(0,64).every(v=>v===0));
  moments.configureMipmaps(false);assert.equal(moments.texture.generateMipmaps,false);assert.equal(moments.texture.minFilter,T.LinearFilter);assert.equal(moments.texture.magFilter,T.LinearFilter);
  moments.configureMipmaps(true);assert.equal(moments.texture.generateMipmaps,true);assert.equal(moments.texture.minFilter,T.LinearMipmapLinearFilter);moments.texture.dispose();
  assert.throws(()=>new SlopeMoments([]));assert.throws(()=>new SlopeMoments(bands.slice(0,2)));
});
