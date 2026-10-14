import test from 'node:test';
import assert from 'node:assert/strict';
import {SpectralSea} from '../src/spectrum';

test('frozen wave time zero skips repeated uploads while presets and rewinds still update',()=> {
  const sea=new SpectralSea();
  assert.equal(sea.update(0),false);assert.equal(sea.update(0),false);
  assert.equal(sea.update(0,2.15),true);assert.equal(sea.update(0,2.15),false);
  assert.equal(sea.update(0.1,2.15),true);assert.equal(sea.update(0,2.15),true);
  assert.equal(sea.update(0,2.15),false);assert.equal(sea.update(0,0.55),true);
});

test('a short rewind updates the sea even within its usual thirty-hertz interval',()=> {
  const sea=new SpectralSea();assert.equal(sea.update(0.05),true);
  assert.equal(sea.update(0.04),true);assert.equal(sea.time,0.04);
  assert.equal(sea.update(0.04),false);assert.equal(sea.update(0.06),false);
  assert.equal(sea.update(0),true);assert.equal(sea.time,0);
});
