import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry,PlaneGeometry,Vector3,LinearFilter,NoColorSpace,UnsignedByteType,RGBAFormat } from 'three';
import { ContactOcclusion,roomOcclusionUV,cabinOcclusionTexture,CABIN_ATLAS_BYTES } from '../src/occlusion';

test('raw cabin visibility preserves its RGBA bytes and UV1 sampling contract',()=> {
  assert.equal(CABIN_ATLAS_BYTES,393216);
  const pixels=new Uint8Array(CABIN_ATLAS_BYTES);pixels.set([0,31,127,255]);const texture=cabinOcclusionTexture(pixels);
  assert.equal(texture.image.data,pixels);assert.equal(texture.image.width,256);assert.equal(texture.image.height,384);
  assert.equal(texture.channel,1);assert.equal(texture.format,RGBAFormat);assert.equal(texture.type,UnsignedByteType);
  assert.equal(texture.magFilter,LinearFilter);assert.equal(texture.minFilter,LinearFilter);assert.equal(texture.generateMipmaps,false);
  assert.equal(texture.colorSpace,NoColorSpace);assert.equal(texture.flipY,false);assert.equal(texture.premultiplyAlpha,false);assert.equal(texture.unpackAlignment,1);texture.dispose();
});

test('incomplete and oversized cabin visibility data cannot become a texture',()=> {
  for(const length of [0,CABIN_ATLAS_BYTES-1,CABIN_ATLAS_BYTES+1])assert.throws(()=>cabinOcclusionTexture(new Uint8Array(length)),/atlas length/);
});

test('open upward hemisphere does not self-darken its floor',()=> {
  const floor=new PlaneGeometry(4,4);floor.rotateX(-Math.PI/2);const sampler=new ContactOcclusion([floor]);
  assert.equal(sampler.visibility(new Vector3(),new Vector3(0,1,0)),1);sampler.dispose();floor.dispose();
});
test('near opaque geometry occludes ambient light and short range excludes distant blockers',()=> {
  const ceiling=new BoxGeometry(4,0.1,4);ceiling.translate(0,0.15,0);const source=[...ceiling.attributes.position.array],index=[...ceiling.index!.array];
  const sampler=new ContactOcclusion([ceiling]),point=new Vector3(),normal=new Vector3(0,1,0);
  assert.ok(sampler.visibility(point,normal)<0.2);assert.equal(sampler.visibility(point,normal,0.05),1);
  assert.deepEqual([...ceiling.attributes.position.array],source);assert.deepEqual([...ceiling.index!.array],index);sampler.dispose();ceiling.dispose();
});
test('contact UV1 preserves photographed UV0 and geometry on both ship sides',()=> {
  for(const side of [-1,1]) {
    const g=new BoxGeometry(6.22,0.06,3.42);g.translate(side*10.71,0.03,1.75);const positions=[...g.attributes.position.array],normals=[...g.attributes.normal.array],photo=[...g.attributes.uv.array];
    roomOcclusionUV(g,0,0,side,'floor');assert.deepEqual([...g.attributes.position.array],positions);assert.deepEqual([...g.attributes.normal.array],normals);assert.deepEqual([...g.attributes.uv.array],photo);
    for(let i=0;i<g.attributes.position.count;i++){const uv=g.attributes.uv1;assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);if(g.attributes.normal.getY(i)>0.9)assert.ok(uv.getX(i)<0.5);else assert.ok(uv.getX(i)>0.99);}
    g.dispose();
  }
});
