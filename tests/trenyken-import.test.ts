import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTrenykenGrid,decodeTrenykenTile} from '../scripts/import-trenyken';

test('northwest measured terrain retains metre gradients and elevations above 130 m',()=> {
  const source=new Float32Array(1200**2);
  for(let z=400;z<800;z++)for(let x=400;x<800;x++)source[z*1200+x]=140+.01*(x-400)+.02*(z-400);
  for(let z=0;z<10;z++)for(let x=0;x<10;x++)source[z*1200+x]=200;
  const grid=prepareTrenykenGrid(source),at=(x:number,z:number)=>grid.heights[z*769+x];
  assert.equal(grid.width,769);assert.equal(grid.extentMetres,1200);assert.equal(grid.extentMetres/(grid.width-1),1.5625);assert.equal(grid.storageBits,32);
  assert.equal(at(384,384),145985);assert.equal(at(385,384),146001);assert.equal(at(384,385),146016);
  for(let i=0;i<769;i++)for(const [x,z]of [[0,i],[768,i],[i,0],[i,768]])assert.equal(at(x,z),-9000);
  assert.equal(source[0],200,'preparation must preserve the source');
});

test('northwest importer rejects unreviewed source bytes and invalid height samples',async()=> {
  await assert.rejects(decodeTrenykenTile(new Uint8Array(4)),/reviewed Trenyken/);
  for(const bad of [NaN,Infinity,-32767]){const source=new Float32Array(1200**2);source[500]=bad;assert.throws(()=>prepareTrenykenGrid(source),/invalid/);}
});
