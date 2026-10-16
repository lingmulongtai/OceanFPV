import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareIsletGrid} from '../scripts/import-measured-islet';

test('measured crop keeps metre scale, pixel centres and north-to-south row direction',()=> {
  const input=new Float32Array(500*500).fill(.1);
  for(let z=200;z<300;z++)for(let x=200;x<300;x++)input[z*500+x]=10+.01*(x-200)+.02*(z-200);
  for(let z=0;z<5;z++)for(let x=0;x<5;x++)input[z*500+x]=31;
  const grid=prepareIsletGrid(input),at=(x:number,z:number)=>grid.heights[z*grid.width+x];
  assert.equal(grid.width,193);assert.equal(grid.extentMetres/(grid.width-1),3.125);assert.equal(grid.unitMetres,.001);
  assert.equal(at(96,96),11485);assert.equal(at(100,96),11610);assert.equal(at(96,92),11235);
  assert.equal(at(80,96),5295,'shore edge must blend physical pixels, without height exaggeration');
  assert.equal(at(17,17),-9000,'clipped boundary-connected land must not create an island wall');
  for(let i=0;i<grid.width;i++)for(const [x,z]of [[0,i],[192,i],[i,0],[i,192]])assert.equal(at(x,z),-9000);
  assert.equal(input[0],31);assert.equal(input[250*500+250],11.5,'source heights must remain unchanged');
  assert.ok(grid.heights.every(h=>Number.isInteger(h)&&h>=-9000&&h<13000));
});

test('measured import rejects missing heights and unrepresentable elevations',()=> {
  assert.throws(()=>prepareIsletGrid(new Float32Array(1)),/invalid/);
  for(const bad of [NaN,Infinity,-32767]){const input=new Float32Array(500*500);input[500]=bad;assert.throws(()=>prepareIsletGrid(input),/invalid/);}
  const high=new Float32Array(500*500);for(let z=200;z<300;z++)for(let x=200;x<300;x++)high[z*500+x]=50;
  assert.throws(()=>prepareIsletGrid(high),/storage range/);
});
