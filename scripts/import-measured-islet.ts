import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fromArrayBuffer} from 'geotiff';
import {prepareCoastalGrid} from './prepare-coastal-grid';

export const ISLET_SOURCE={
  url:'https://nedlasting.geonorge.no/hoydedata/DTM1/33-108-101.tif',
  sha256:'9d29a9bd0411f20b4e53bc7834f42ff829f7ba1f4822affa3b8b949e90e02d2b',
  credit:'©Kartverket',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  termsUrl:'https://www.kartverket.no/api-og-data/vilkar-for-bruk/',
  horizontalCrs:'ETRS89 / UTM zone 33N',verticalDatum:'unconfirmed',
  sourceWindow:[12380,1000,12880,1500],firstPixelCentre:[32805.5,6455004.5],sourceStepMetres:1,
  edits:'Height >0.3 retained as land; boundary-connected land removed; water replaced by synthetic depth; resampled without vertical or horizontal exaggeration.'
} as const;

/** Convert one checked 500 m crop to the game's 193-vertex, 600 m square. */
export function prepareIsletGrid(source:Float32Array) {
  const {version,width,extentMetres,unitMetres,heights}=prepareCoastalGrid(source,500,50,32767);
  return {version,width,extentMetres,unitMetres,source:ISLET_SOURCE,underwater:'Synthetic chamfer distance ×0.4 over the crop and 50 m outer border, capped at 9 m; no measured bathymetry',heights};
}

async function importIslet(input:string,output:string) {
  const bytes=await readFile(input);
  if(createHash('sha256').update(bytes).digest('hex')!==ISLET_SOURCE.sha256)throw new Error('DTM source hash differs from the reviewed tile');
  const tiff=await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),image=await tiff.getImage();
  if(image.getWidth()!==15010||image.getHeight()!==15010||image.getSamplesPerPixel()!==1||image.getGDALNoData()!==-32767)throw new Error('Unexpected DTM layout');
  const raster=await image.readRasters({window:[...ISLET_SOURCE.sourceWindow],interleave:true});
  if(!(raster instanceof Float32Array))throw new Error('Expected Float32 DTM');
  const grid=prepareIsletGrid(raster),rows=Array.from({length:grid.width},(_,i)=>'    '+JSON.stringify(grid.heights.slice(i*grid.width,(i+1)*grid.width)).slice(1,-1));
  const formatted=JSON.stringify({...grid,heights:[]},null,2).replace('"heights": []','"heights": [\n'+rows.join(',\n')+'\n  ]');
  await mkdir(dirname(output),{recursive:true});await writeFile(output,formatted+'\n');
  console.log(JSON.stringify({output,width:grid.width,extentMetres:grid.extentMetres,min:Math.min(...grid.heights)*grid.unitMetres,max:Math.max(...grid.heights)*grid.unitMetres,sha256:createHash('sha256').update(formatted+'\n').digest('hex')}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const input=process.argv[2];if(!input)throw new Error('Usage: node --import tsx scripts/import-measured-islet.ts <DTM1 33-108-101.tif> [output.json]');
  await importIslet(input,process.argv[3]??'src/data/measured-islet.json');
}
