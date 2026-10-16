import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

test('prepared islet retains reviewed raw height witnesses, extent, provenance and continuous borders',()=> {
  const bytes=readFileSync(new URL('../src/data/measured-islet.json',import.meta.url)),grid=JSON.parse(bytes.toString('utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'dd196170ef1743d43c4e38cc1a06d34a49489169c4a9fb81eab4b5f4ccf8ee23');
  assert.equal(grid.version,1);assert.equal(grid.width,193);assert.equal(grid.extentMetres,600);assert.equal(grid.unitMetres,.001);assert.equal(grid.heights.length,193**2);
  assert.equal(grid.source.sha256,'9d29a9bd0411f20b4e53bc7834f42ff829f7ba1f4822affa3b8b949e90e02d2b');
  assert.equal(grid.source.credit,'©Kartverket');assert.equal(grid.source.license,'CC BY 4.0');assert.equal(grid.source.verticalDatum,'unconfirmed');
  assert.deepEqual(grid.source.sourceWindow,[12380,1000,12880,1500]);assert.deepEqual(grid.source.firstPixelCentre,[32805.5,6455004.5]);
  const at=(x:number,z:number)=>grid.heights[z*193+x];
  // Independent witnesses from the source's four neighbouring Float32 pixels.
  for(const [x,z,height]of [[96,80,15791],[96,96,1117],[100,80,13761],[94,74,21912]])assert.equal(at(x,z),height);
  for(let i=0;i<193;i++)for(const [x,z]of [[0,i],[192,i],[i,0],[i,192]])assert.equal(at(x,z),-9000);
  assert.deepEqual([at(94,15),at(94,16),at(94,17)],[-1891,-641,-582]);
  assert.ok(grid.heights.every((h:number)=>Number.isInteger(h)&&h>=-9000&&h<=21912));
});
