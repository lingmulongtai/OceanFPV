import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

test('Trenyken derivative preserves reviewed native heights, full island and closed sea borders',()=> {
  const bytes=readFileSync(new URL('../src/data/trenyken.json',import.meta.url)),grid=JSON.parse(bytes.toString('utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'010cbc34905a47496864a3f22e5395f7c5f27e7b7c6b977907692ddb28a605ef');
  assert.equal(grid.width,769);assert.equal(grid.extentMetres,1200);assert.equal(grid.unitMetres,.001);assert.equal(grid.storageBits,32);assert.equal(grid.heights.length,769**2);
  assert.deepEqual(grid.source.sourceWindow,[950,7050,2150,8250]);assert.deepEqual(grid.source.firstPixelCentre,[366375.5,7483954.5]);
  assert.equal(grid.source.sha256,'4cca71e488cbab195e6e96f35227f2482d25470bd57bbc18d703c81d9d012bb6');
  assert.equal(grid.source.cropSha256,'7ebdef04ab4c796c5248a1e3b71c26ace176864a33d57202b0ec8f46fbaa5406');
  assert.equal(grid.source.credit,'©Kartverket');assert.equal(grid.source.license,'CC BY 4.0');assert.equal(grid.source.verticalDatum,'unconfirmed');
  const at=(x:number,z:number)=>grid.heights[z*769+x];
  // Independent source-pixel witnesses, bilinearly sampled before millimetre quantization.
  // (450,390) uses 131.9352417,131.6456451,131.3923645,131.2120361 at u=.625,v=.875.
  for(const [x,z,height]of [[260,350,100314],[320,410,34382],[450,390,131339],[580,350,17960],[385,487,9934]])assert.equal(at(x,z),height);
  for(let i=0;i<769;i++)for(const [x,z]of [[0,i],[768,i],[i,0],[i,768]])assert.equal(at(x,z),-9000);
  let maximum=-Infinity,land=0;for(const value of grid.heights){assert.ok(Number.isInteger(value)&&value>=-9000&&value<=142301);maximum=Math.max(maximum,value);if(value>300)land++;}
  assert.equal(maximum,142301);assert.ok(land>100000&&land<110000,'the complete island and surrounding water must survive classification');
});
