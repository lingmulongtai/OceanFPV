import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fromArrayBuffer} from 'geotiff';
import {prepareCoastalGrid} from './prepare-coastal-grid';

export const TRENYKEN_SOURCE={
  url:'https://nedlasting.geonorge.no/hoydedata/DTM1/33-131-170.tif',
  sha256:'4cca71e488cbab195e6e96f35227f2482d25470bd57bbc18d703c81d9d012bb6',
  tileBytes:31650748,etag:'"62c476b0-1e2f3bc"',
  cropSha256:'7ebdef04ab4c796c5248a1e3b71c26ace176864a33d57202b0ec8f46fbaa5406',
  cropEncoding:'1200 × 1200 little-endian Float32 metres, north-to-south rows',
  sourceWindow:[950,7050,2150,8250],firstPixelCentre:[366375.5,7483954.5],sourceStepMetres:1,
  credit:'©Kartverket',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  termsUrl:'https://www.kartverket.no/api-og-data/vilkar-for-bruk/',
  horizontalCrs:'ETRS89 / UTM zone 33N',verticalDatum:'unconfirmed',
  edits:'Height >0.3 retained as land; boundary-connected land removed; water replaced by synthetic depth; resampled without vertical or horizontal exaggeration.'
} as const;

export function prepareTrenykenGrid(source:Float32Array,vertices=769) {
  const {version,width,extentMetres,unitMetres,heights}=prepareCoastalGrid(source,1200,0,2147483647,vertices);
  return {version,width,extentMetres,unitMetres,storageBits:32,source:TRENYKEN_SOURCE,
    underwater:'Synthetic chamfer distance ×0.4 across the full 1200 m crop, capped at 9 m; no measured bathymetry',heights};
}

export async function decodeTrenykenTile(bytes:Uint8Array) {
  if(bytes.byteLength!==TRENYKEN_SOURCE.tileBytes||createHash('sha256').update(bytes).digest('hex')!==TRENYKEN_SOURCE.sha256)throw new Error('DTM source differs from the reviewed Trenyken tile');
  const tiff=await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer),image=await tiff.getImage();
  if(image.getWidth()!==15010||image.getHeight()!==15010||image.getSamplesPerPixel()!==1||image.getGDALNoData()!==-32767||image.getOrigin()[0]!==365425||image.getOrigin()[1]!==7491005||image.getResolution()[0]!==1||image.getResolution()[1]!==-1)throw new Error('Unexpected Trenyken DTM layout');
  const crop=await image.readRasters({window:[...TRENYKEN_SOURCE.sourceWindow],interleave:true});
  if(!(crop instanceof Float32Array)||createHash('sha256').update(new Uint8Array(crop.buffer,crop.byteOffset,crop.byteLength)).digest('hex')!==TRENYKEN_SOURCE.cropSha256)throw new Error('Trenyken extracted crop differs from the reviewed data');
  return crop;
}

async function importTrenyken(input:string,output:string) {
  const grid=prepareTrenykenGrid(await decodeTrenykenTile(await readFile(input)));
  const rows=Array.from({length:grid.width},(_,i)=>'    '+JSON.stringify(grid.heights.slice(i*grid.width,(i+1)*grid.width)).slice(1,-1));
  const formatted=JSON.stringify({...grid,heights:[]},null,2).replace('"heights": []','"heights": [\n'+rows.join(',\n')+'\n  ]')+'\n';
  await mkdir(dirname(output),{recursive:true});await writeFile(output,formatted);
  console.log(JSON.stringify({output,width:grid.width,extentMetres:grid.extentMetres,min:grid.heights.reduce((a,b)=>Math.min(a,b),Infinity)*grid.unitMetres,max:grid.heights.reduce((a,b)=>Math.max(a,b),-Infinity)*grid.unitMetres,sha256:createHash('sha256').update(formatted).digest('hex')}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const input=process.argv[2];if(!input)throw new Error('Usage: node --import tsx scripts/import-trenyken.ts <DTM1 33-131-170.tif> [output.json]');
  await importTrenyken(input,process.argv[3]??'src/data/trenyken.json');
}
