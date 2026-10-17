import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createPoolWater,poolRippleTexture} from '../src/pool-materials';

test('pool ripple normals have unit length, bounded slope and filtered metre scale',()=>{
  const texture=poolRippleTexture(),pixels=texture.image.data;assert.ok(pixels);let maximum=0;
  for(let i=0;i<pixels.length;i+=4){const x=pixels[i]/255*2-1,y=pixels[i+1]/255*2-1,z=pixels[i+2]/255*2-1;assert.ok(Math.abs(Math.hypot(x,y,z)-1)<.008);assert.equal(pixels[i+3],255);maximum=Math.max(maximum,Math.hypot(x,y));}
  assert.ok(maximum>.02&&maximum<.12);assert.equal(texture.wrapS,T.RepeatWrapping);assert.equal(texture.generateMipmaps,true);assert.equal(texture.colorSpace,T.NoColorSpace);assert.equal(texture.repeat.x,7.67/2);texture.dispose();
});

test('pool water uses physical transmission and bounded seamless animation through the real material hook',()=>{
  const water=createPoolWater(),shader={uniforms:{},vertexShader:'',fragmentShader:'#include <common>\n#include <normal_fragment_maps>'} as unknown as T.WebGLProgramParametersWithUniforms;
  water.material.onBeforeCompile(shader,{} as T.WebGLRenderer);
  assert.equal(water.material.ior,1.333);assert.equal(water.material.opacity,1);assert.equal(water.material.metalness,0);assert.ok(Math.abs(water.material.thickness-1.1)<1e-12);assert.match(shader.fragmentShader,/poolA/);assert.match(shader.fragmentShader,/normal = normalize\( tbn \* mapN \)/);
  water.advance(3);const a=shader.uniforms.poolPhase.value;water.advance(103);assert.equal(shader.uniforms.poolPhase.value,a);water.advance(1000003);assert.equal(shader.uniforms.poolPhase.value,a);water.material.normalMap!.dispose();water.material.dispose();
});
