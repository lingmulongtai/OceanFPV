import test from 'node:test';import assert from 'node:assert/strict';
import {drainageCuts} from '../src/drainage';

test('catchments follow the steepest drop per distance and conserve upstream cells',()=> {
  const heights=new Float64Array([12,10,7.5,12,10,7.5,12,10,7.5]),weights=new Float64Array(9).fill(1);
  const {downstream,catchment}=drainageCuts(heights,3,weights,8);
  assert.equal(downstream[4],5,'cardinal 2.5m drop beats the same diagonal drop');
  let outlets=0;
  for(let i=0;i<9;i++)if(downstream[i]<0)outlets+=catchment[i];else assert.ok(heights[downstream[i]]<heights[i]);
  assert.equal(outlets,9);
});

test('connected valleys have a broad footprint, bounded depth and no uphill flow edges',()=> {
  const width=25,heights=Float64Array.from({length:width*width},(_,i)=>100-Math.floor(i/width)*0.4+Math.abs(i%width-12)*0.5);
  const weights=Float64Array.from(heights,(_,i)=>Math.floor(i/width)>=21?0:1),original=heights.slice();
  const {cuts,downstream,catchment}=drainageCuts(heights,width,weights,8);
  assert.deepEqual(heights,original);assert.ok(catchment[20*width+12]>100);
  assert.ok(cuts[18*width+12]>0);assert.ok(cuts[18*width+11]>0);assert.ok(cuts[18*width+13]>0);
  for(let i=0;i<cuts.length;i++) {
    assert.ok(cuts[i]>=0&&cuts[i]<=8);if(weights[i]===0)assert.equal(cuts[i],0);
    const next=downstream[i];if(next>=0)assert.ok(heights[i]-cuts[i]>heights[next]-cuts[next]);
  }
});

test('flat terrain and zero-weight protected ground remain unchanged',()=> {
  const heights=new Float64Array(81).fill(5),weights=new Float64Array(81).fill(1);
  assert.ok(drainageCuts(heights,9,weights,8).cuts.every(value=>value===0));
  for(let i=0;i<81;i++)heights[i]=81-i;
  assert.ok(drainageCuts(heights,9,new Float64Array(81),8).cuts.every(value=>value===0));
});
