import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

test('Hornoya derivative retains reviewed source witnesses, metre scale and closed sea borders',()=> {
  const bytes=readFileSync(new URL('../src/data/hornoya.json',import.meta.url)),grid=JSON.parse(bytes.toString('utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'fbcf57b97a6ed7bb3400b0858d689ded1d056d6ee062d11d93fe24a8d9494b90');
  assert.equal(grid.version,1);assert.equal(grid.width,769);assert.equal(grid.extentMetres,1200);assert.equal(grid.unitMetres,.001);assert.equal(grid.storageBits,32);assert.equal(grid.heights.length,769**2);
  assert.deepEqual(grid.source.sourceWindow,[13070,6160,14270,7360]);assert.deepEqual(grid.source.firstPixelCentre,[1098495.5,7889844.5]);
  assert.equal(grid.source.cropSha256,'ecf683cab48d07de9c99b0381963d4998ff455e01cb5aeb3c4071f4a535caf7b');
  assert.equal(grid.source.credit,'©Kartverket');assert.equal(grid.source.license,'CC BY 4.0');assert.equal(grid.source.verticalDatum,'unconfirmed');
  const at=(x:number,z:number)=>grid.heights[z*769+x];
  // At (80,64), source pixels are 55.7882118,55.3667412,55.6939240,55.3050117 m.
  // Their mean is 55.5384722 m. Other witnesses were read independently from the pinned 1 m crop.
  for(const [x,z,height]of [[96,64,14466],[80,64,55538],[80,80,47280],[96,96,14690],[100,120,5382],[62,106,66984]])assert.equal(at(x*4,z*4),height);
  // Native neighbours at (338.5625,760.4375): 44.0242043,44.3310394,34.9923325,43.4774132 m.
  assert.equal(at(217,487),42258);assert.equal(at(251,419),67045);
  for(let i=0;i<769;i++)for(const [x,z]of [[0,i],[768,i],[i,0],[i,768]])assert.equal(at(x,z),-9000);
  assert.ok(grid.heights.every((h:number)=>Number.isInteger(h)&&h>=-9000&&h<=67045));
});
