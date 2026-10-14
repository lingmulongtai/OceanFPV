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
