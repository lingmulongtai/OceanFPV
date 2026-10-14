import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {CliffSurface} from '../src/cliff';import {CliffDepth,CLIFF_DEPTH_SIZE} from '../src/cliff-depth';

test('detailed cliff depth preserves a sloped photographed shelf and clear ground',()=> {
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,5,0,4,6,0,4,6.3,3,0,5.3,3],3));geometry.setIndex([0,2,1,0,3,2]);
  const scan=new CliffSurface(geometry),depth=new CliffDepth(scan,()=>-7);
  assert.equal(depth.data.length,CLIFF_DEPTH_SIZE**2);assert.equal(depth.data.byteLength,1048576);
  for(const [x,z]of [[1,1],[2,2],[3,1.5]]){const actual=depth.sample(x,z)!;assert.ok(Math.abs(actual.height-(5+x*.25+z*.1))<1e-6);assert.ok(Math.abs(actual.dx-.25)<.0001);assert.ok(Math.abs(actual.dz-.1)<.0001);}
  assert.equal(depth.sample(-.2,1)!.height,-7);assert.equal(depth.sample(4.2,1)!.height,-7);assert.equal(depth.sample(-1,1),null);
  const bounded=new CliffDepth(scan,()=>10);assert.equal(bounded.sample(2,2)!.height,10);
});
