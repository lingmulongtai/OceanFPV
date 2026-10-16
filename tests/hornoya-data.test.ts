import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

test('Hornoya derivative retains reviewed source witnesses, metre scale and closed sea borders',()=> {
  const bytes=readFileSync(new URL('../src/data/hornoya.json',import.meta.url)),grid=JSON.parse(bytes.toString('utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'fc0673a084737f853bc341fc11a6d7a6b51f1acb4bfbe3f9d8a3607913e92650');
  assert.equal(grid.version,1);assert.equal(grid.width,193);assert.equal(grid.extentMetres,1200);assert.equal(grid.unitMetres,.001);assert.equal(grid.storageBits,32);assert.equal(grid.heights.length,193**2);
  assert.deepEqual(grid.source.sourceWindow,[13070,6160,14270,7360]);assert.deepEqual(grid.source.firstPixelCentre,[1098495.5,7889844.5]);
  assert.equal(grid.source.cropSha256,'ecf683cab48d07de9c99b0381963d4998ff455e01cb5aeb3c4071f4a535caf7b');
  assert.equal(grid.source.credit,'©Kartverket');assert.equal(grid.source.license,'CC BY 4.0');assert.equal(grid.source.verticalDatum,'unconfirmed');
  const at=(x:number,z:number)=>grid.heights[z*193+x];
  // At (80,64), source pixels are 55.7882118,55.3667412,55.6939240,55.3050117 m.
  // Their mean is 55.5384722 m. Other witnesses were read independently from the pinned 1 m crop.
  for(const [x,z,height]of [[96,64,14466],[80,64,55538],[80,80,47280],[96,96,14690],[100,120,5382],[62,106,66984]])assert.equal(at(x,z),height);
  for(let i=0;i<193;i++)for(const [x,z]of [[0,i],[192,i],[i,0],[i,192]])assert.equal(at(x,z),-9000);
  assert.ok(grid.heights.every((h:number)=>Number.isInteger(h)&&h>=-9000&&h<=66984));
});
