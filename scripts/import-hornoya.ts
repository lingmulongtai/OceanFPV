import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareCoastalGrid} from './prepare-coastal-grid';

export const HORNOYA_SOURCE={
  url:'https://nedlasting.geonorge.no/hoydedata/DTM1/33-179-197.tif',
  tileBytes:608143984,etag:'"62d5544c-243f8a70"',
  headerSha256:'c4930750b5f3baf796662cb24891cf855ea26ff6eb69a7c91ed24c4ca83b6ba5',
  cropSha256:'ecf683cab48d07de9c99b0381963d4998ff455e01cb5aeb3c4071f4a535caf7b',
  cropEncoding:'1200 × 1200 little-endian Float32 metres, north-to-south rows; hash covers this extracted crop, not the complete TIFF',
  sourceWindow:[13070,6160,14270,7360],firstPixelCentre:[1098495.5,7889844.5],sourceStepMetres:1,
  credit:'©Kartverket',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  termsUrl:'https://www.kartverket.no/api-og-data/vilkar-for-bruk/',
  horizontalCrs:'ETRS89 / UTM zone 33N',verticalDatum:'unconfirmed',
  edits:'Height >0.3 retained as land; boundary-connected land removed; water replaced by synthetic depth; resampled without vertical or horizontal exaggeration.'
} as const;

export function decodeHornoyaCrop(bytes:Uint8Array) {
  if(bytes.byteLength!==1200*1200*4)throw new Error('Unexpected Hornøya crop length');
  if(createHash('sha256').update(bytes).digest('hex')!==HORNOYA_SOURCE.cropSha256)throw new Error('Hornøya extracted crop hash differs from the reviewed data');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),source=new Float32Array(1200*1200);
  for(let i=0;i<source.length;i++)source[i]=view.getFloat32(i*4,true);
  return source;
}

export function prepareHornoyaGrid(source:Float32Array) {
  const {version,width,extentMetres,unitMetres,heights}=prepareCoastalGrid(source,1200,0,2147483647);
  return {version,width,extentMetres,unitMetres,storageBits:32,source:HORNOYA_SOURCE,
    underwater:'Synthetic chamfer distance ×0.4 across the full 1200 m crop, capped at 9 m; no measured bathymetry',heights};
}

async function importHornoya(input:string,output:string) {
  const grid=prepareHornoyaGrid(decodeHornoyaCrop(await readFile(input))),rows=Array.from({length:grid.width},(_,i)=>'    '+JSON.stringify(grid.heights.slice(i*grid.width,(i+1)*grid.width)).slice(1,-1));
  const formatted=JSON.stringify({...grid,heights:[]},null,2).replace('"heights": []','"heights": [\n'+rows.join(',\n')+'\n  ]')+'\n';
  await mkdir(dirname(output),{recursive:true});await writeFile(output,formatted);
  console.log(JSON.stringify({output,width:grid.width,extentMetres:grid.extentMetres,min:Math.min(...grid.heights)*grid.unitMetres,max:Math.max(...grid.heights)*grid.unitMetres,sha256:createHash('sha256').update(formatted).digest('hex')}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const input=process.argv[2];if(!input)throw new Error('Usage: node --import tsx scripts/import-hornoya.ts <reviewed 1200x1200 crop.f32> [output.json]');
  await importHornoya(input,process.argv[3]??'src/data/hornoya.json');
}
