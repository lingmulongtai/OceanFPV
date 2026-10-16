import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeHornoyaCrop,prepareHornoyaGrid} from '../scripts/import-hornoya';

test('large measured coast preserves 67 m heights, metre scale and north-to-south pixel centres',()=> {
  const source=new Float32Array(1200**2);
  for(let z=400;z<800;z++)for(let x=400;x<800;x++)source[z*1200+x]=60+.01*(x-400)+.02*(z-400);
  for(let z=0;z<8;z++)for(let x=0;x<8;x++)source[z*1200+x]=100;
  const grid=prepareHornoyaGrid(source),at=(x:number,z:number)=>grid.heights[z*193+x];
  assert.equal(grid.extentMetres,1200);assert.equal(grid.extentMetres/(grid.width-1),6.25);assert.equal(grid.storageBits,32);
  assert.equal(at(96,96),65985);assert.equal(at(100,96),66235);assert.equal(at(96,100),66485);
  assert.equal(at(104,104),67485,'height must not clip at 32767 millimetres');
  assert.equal(at(1,1),-9000,'boundary-connected land must be removed');
  for(let i=0;i<193;i++)for(const [x,z]of [[0,i],[192,i],[i,0],[i,192]])assert.equal(at(x,z),-9000);
  assert.equal(source[0],100);assert.equal(source[600*1200+600],66);
});

test('new measured coast rejects missing heights and unreviewed source bytes',()=> {
  assert.throws(()=>prepareHornoyaGrid(new Float32Array(1)),/invalid/);
  for(const bad of [NaN,Infinity,-32767]){const source=new Float32Array(1200**2);source[600]=bad;assert.throws(()=>prepareHornoyaGrid(source),/invalid/);}
  assert.throws(()=>decodeHornoyaCrop(new Uint8Array(4)),/length/);
  assert.throws(()=>decodeHornoyaCrop(new Uint8Array(1200**2*4)),/hash differs/);
});
