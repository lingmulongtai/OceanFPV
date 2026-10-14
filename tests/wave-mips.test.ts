import test from 'node:test';
import assert from 'node:assert/strict';
import {WaveMipmaps,sampleWaveMip} from '../src/wave-mips';

test('wave mip levels reuse full-resolution data and update without replacing storage',()=> {
  const data=new Float32Array(8*8*4);for(let i=0;i<data.length;i++)data[i]=i;
  const mips=new WaveMipmaps(data,8),references=mips.levels.map(level=>level.data);
  assert.deepEqual(mips.levels.map(level=>level.width),[8,4,2,1]);assert.equal(mips.levels[0].data,data);
  for(let channel=0;channel<4;channel++)assert.equal(mips.levels[1].data[channel],(data[channel]+data[4+channel]+data[32+channel]+data[36+channel])/4);
  data.fill(3.5);mips.update();for(const [i,level]of mips.levels.entries()){assert.equal(level.data,references[i]);assert.ok(level.data.every(value=>value===3.5));}
  assert.throws(()=>new WaveMipmaps(new Float32Array(6*6*4),6));
});

test('pixel averaging removes a subpixel wave while keeping a long wave in the same field',()=> {
  const n=128,data=new Float32Array(n*n*4);
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){data[(z*n+x)*4+1]=Math.sin(x*Math.PI/32);data[(z*n+x)*4+2]=x%2?1:-1;}
  const mips=new WaveMipmaps(data,n);
  // Four base texels per pixel: the 64-texel wave remains sixteen pixels long.
  for(let x=0;x<n;x++) {
    const u=(x+0.5)/n,actual=sampleWaveMip(mips,u,0.37,2,1);
    assert.ok(Math.abs(actual-Math.sin(x*Math.PI/32))<0.04);
    assert.equal(sampleWaveMip(mips,u,0.37,2,2),0);
    assert.ok(Math.abs(sampleWaveMip(mips,u+1,1.37,2,1)-actual)<1e-12);
  }
});

test('fractional mip levels interpolate continuously without shifting UV phase',()=> {
  const data=new Float32Array(16*16*4);for(let z=0;z<16;z++)for(let x=0;x<16;x++)data[(z*16+x)*4+1]=Math.sin(x*Math.PI/8)+Math.cos(z*Math.PI/8);
  const mips=new WaveMipmaps(data,16);
  for(const u of [0,0.023,0.5,0.99])for(const v of [0.011,0.43,0.97])for(const level of [1,2,3]) {
    const centre=sampleWaveMip(mips,u,v,level,1),before=sampleWaveMip(mips,u,v,level-1e-6,1),after=sampleWaveMip(mips,u,v,level+1e-6,1);
    assert.ok(Math.abs(before-centre)<0.000003&&Math.abs(after-centre)<0.000003);
    assert.ok(Math.abs(sampleWaveMip(mips,u,v,level-0.25,1)-(sampleWaveMip(mips,u,v,level-1,1)*0.25+centre*0.75))<1e-12);
  }
});
