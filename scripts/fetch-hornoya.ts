import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fromCustomClient} from 'geotiff';
import {HORNOYA_SOURCE,decodeHornoyaCrop} from './import-hornoya';

/** Request only the reviewed TIFF version and reject full-file or oversized responses. */
export function hornoyaRangeClient(fetcher:typeof fetch=fetch) {
  let reserved=0,requests=0;
  const evidence:{range:string;bytes:number;sha256:string}[]=[];
  return {url:HORNOYA_SOURCE.url,evidence,async request(options:RequestInit={}) {
    const headers=new Headers(options.headers),range=headers.get('Range'),parts=/^bytes=(\d+)-(\d+)$/.exec(range??'');
    if(!parts||++requests>64)throw new Error('Expected a bounded single TIFF range');
    const start=Number(parts[1]),end=Number(parts[2]),length=end-start+1;
    if(length<=0||length>4*1024*1024||reserved+length>16*1024*1024)throw new Error('TIFF range budget exceeded');
    reserved+=length;headers.set('If-Match',HORNOYA_SOURCE.etag);
    const response=await fetcher(HORNOYA_SOURCE.url,{...options,headers,signal:AbortSignal.any([options.signal??new AbortController().signal,AbortSignal.timeout(20000)])});
    if(response.status!==206||response.headers.get('Content-Range')!==`bytes ${start}-${end}/${HORNOYA_SOURCE.tileBytes}`||Number(response.headers.get('Content-Length'))!==length||response.headers.get('ETag')!==HORNOYA_SOURCE.etag) {
      await response.body?.cancel();throw new Error('TIFF range response or source version differs');
    }
    const reader=response.body?.getReader();if(!reader)throw new Error('Missing TIFF response body');
    const bytes=new Uint8Array(length);let offset=0;
    try {
      while(true){const {done,value}=await reader.read();if(done)break;if(offset+value.length>length)throw new Error('Oversized TIFF body');bytes.set(value,offset);offset+=value.length;}
      if(offset!==length)throw new Error('Truncated TIFF body');
    } catch(error) {await reader.cancel();throw error;} finally {reader.releaseLock();}
    const sha256=createHash('sha256').update(bytes).digest('hex');
    if(start===0&&(length!==65536||sha256!==HORNOYA_SOURCE.headerSha256))throw new Error('TIFF header hash differs');
    evidence.push({range:range!,bytes:length,sha256});
    return {ok:true,status:206,getHeader:(name:string)=>response.headers.get(name)??undefined,getData:async()=>bytes.buffer};
  }};
}

async function fetchHornoya(output:string) {
  const client=hornoyaRangeClient(),options={blockSize:65536,cacheSize:100,allowFullFile:false};
  const tiff=await fromCustomClient(client,options),image=await tiff.getImage();
  const origin=image.getOrigin(),resolution=image.getResolution(),keys=image.getGeoKeys();
  if(image.getWidth()!==15010||image.getHeight()!==15010||image.getSamplesPerPixel()!==1||image.getGDALNoData()!==-32767||keys?.GTCitationGeoKey!=='PCS Name = ETRS_1989_UTM_Zone_33N'||keys.GTRasterTypeGeoKey!==1||keys.ProjectionGeoKey!==16033||keys.ProjLinearUnitsGeoKey!==9001||origin[0]!==1085425||origin[1]!==7896005||resolution[0]!==1||resolution[1]!==-1)throw new Error('Unexpected Hornøya DTM layout');
  const raster=await image.readRasters({window:[...HORNOYA_SOURCE.sourceWindow],interleave:true});
  if(!(raster instanceof Float32Array)||raster.length!==1200**2)throw new Error('Unexpected Hornøya raster');
  const bytes=new Uint8Array(raster.length*4),view=new DataView(bytes.buffer);
  for(let i=0;i<raster.length;i++)view.setFloat32(i*4,raster[i],true);
  decodeHornoyaCrop(bytes);
  await mkdir(dirname(output),{recursive:true});await writeFile(output,bytes);
  const evidence={source:HORNOYA_SOURCE,receivedBytes:client.evidence.reduce((sum,range)=>sum+range.bytes,0),ranges:client.evidence};
  await writeFile(output+'.ranges.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({output,receivedBytes:evidence.receivedBytes,ranges:evidence.ranges.length,cropSha256:HORNOYA_SOURCE.cropSha256}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await fetchHornoya(process.argv[2]??'artifacts/hornoya-source.f32');
