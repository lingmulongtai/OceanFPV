import test from 'node:test';
import assert from 'node:assert/strict';
import {DataUtils,HalfFloatType,LinearSRGBColorSpace,EquirectangularReflectionMapping} from 'three';
import {decodePhotographicSky} from '../src/sky';

function capturedSky(highlight=false) {
  const header=new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 30 +X 30\n'),bytes=new Uint8Array(header.length+30*30*4);
  bytes.set(header);
  for(let i=header.length;i<bytes.length;i+=4)bytes.set([128,64,32,128],i);
  if(highlight)bytes.set([255,100,20,132],header.length+(3*30+6)*4);
  return bytes.buffer;
}

test('photographed day and golden environments keep distinct authored brightness',()=> {
  for(const [preset,target] of [['day',0.7],['golden',0.25]] as const) {
    const sky=decodePhotographicSky(capturedSky(),preset),data=sky.texture.image.data as Uint16Array;
    try {
      const rgb=Array.from(data.subarray(0,3),DataUtils.fromHalfFloat),luminance=rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
      assert.ok(Math.abs(luminance-target)<0.001);assert.equal(sky.preset,preset);
      assert.deepEqual([sky.horizon.r,sky.horizon.g,sky.horizon.b],rgb);
      assert.equal(sky.texture.type,HalfFloatType);assert.equal(sky.texture.colorSpace,LinearSRGBColorSpace);
      assert.equal(sky.texture.mapping,EquirectangularReflectionMapping);assert.equal(sky.texture.flipY,true);
      assert.equal(DataUtils.fromHalfFloat(data[3]),1);
    } finally {sky.texture.dispose();}
  }
});

test('captured highlight direction and bounded HDR radiance survive exposure',()=> {
  const sky=decodePhotographicSky(capturedSky(true),'golden'),data=sky.texture.image.data as Uint16Array;
  try {
    const expected=[-0.09549150281252625,0.9510565162951535,-0.29389262614623657];
    sky.sun.toArray().forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-14));
    assert.equal(DataUtils.fromHalfFloat(data[(3*30+6)*4]),6);
    assert.ok(Array.from(data,DataUtils.fromHalfFloat).every(value=>Number.isFinite(value)&&value>=0&&value<=6));
  } finally {sky.texture.dispose();}
});

test('invalid photographed sky data rejects before allocating a texture',()=> {
  assert.throws(()=>decodePhotographicSky(new ArrayBuffer(8),'golden'));
});
