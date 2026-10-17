import test from 'node:test';
import assert from 'node:assert/strict';
import {waveVectorLength} from '../src/spectrum';

test('wave vector lengths retain double precision across normal squared magnitudes',()=>{
  for(let i=0;i<4096;i++) {
    const scale=2**(-500+i%1000),x=Math.sin(i*31.731)*scale,y=Math.cos(i*83.973)*scale;
    const expected=Math.hypot(x,y),actual=waveVectorLength(x,y);
    assert.ok(Math.abs(actual-expected)<=4*Number.EPSILON*expected,`length at ${i}: ${actual} / ${expected}`);
  }
});

test('wave vector lengths preserve hypot through square underflow, overflow and nonfinite values',()=>{
  for(const [x,y]of [[0,0],[-0,-0],[Number.MIN_VALUE,Number.MIN_VALUE],[1e-300,-2e-300],[1e-160,2e-160],[1e200,-2e200],[Number.MAX_VALUE,Number.MIN_VALUE],[Infinity,NaN],[NaN,-Infinity],[NaN,1],[-Infinity,0]]) {
    const expected=Math.hypot(x,y),actual=waveVectorLength(x,y);
    if(Number.isNaN(expected))assert.ok(Number.isNaN(actual));else assert.equal(actual,expected,`${x}, ${y}`);
  }
});
