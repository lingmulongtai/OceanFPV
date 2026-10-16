import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fromArrayBuffer} from 'geotiff';

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
  const n=500,width=193,extentMetres=600,unitMetres=.001;
  if(source.length!==n*n||source.some(h=>!Number.isFinite(h)||h===-32767))throw new Error('Missing or invalid DTM heights');
  const land=Uint8Array.from(source,h=>h>.3?1:0),seen=new Uint8Array(source.length);
  for(let seed=0;seed<land.length;seed++)if(land[seed]&&!seen[seed]) {
    const queue=[seed];seen[seed]=1;let edge=false;
    for(let k=0;k<queue.length;k++) {
      const i=queue[k],x=i%n,z=Math.floor(i/n);if(x===0||x===n-1||z===0||z===n-1)edge=true;
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++) {
        const nx=x+dx,nz=z+dz,j=nz*n+nx;
        if(nx>=0&&nx<n&&nz>=0&&nz<n&&land[j]&&!seen[j]){seen[j]=1;queue.push(j);}
      }
    }
    if(edge)for(const i of queue)land[i]=0;
  }
  const distance=Float32Array.from(land,value=>value?0:1e6);
  for(const direction of [1,-1])for(let z=direction===1?0:n-1;z>=0&&z<n;z+=direction)for(let x=direction===1?0:n-1;x>=0&&x<n;x+=direction) {
    const i=z*n+x;if(land[i])continue;
    for(const [dx,dz,cost] of [[-direction,0,1],[-direction,-direction,Math.SQRT2],[0,-direction,1],[direction,-direction,Math.SQRT2]]) {
      const nx=x+dx,nz=z+dz;if(nx>=0&&nx<n&&nz>=0&&nz<n)distance[i]=Math.min(distance[i],distance[nz*n+nx]+cost);
    }
  }
  const heights=Float32Array.from(source,(h,i)=>land[i]?h:-Math.min(9,.4*distance[i]));
  const output:number[]=[];
  for(let z=0;z<width;z++)for(let x=0;x<width;x++) {
    const gx=x/(width-1)*extentMetres-extentMetres/2+249.5,gz=z/(width-1)*extentMetres-extentMetres/2+249.5;
    let height=-9;
    if(gx>=0&&gz>=0&&gx<499&&gz<499) {
      const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,i=iz*n+ix;
      height=(heights[i]*(1-u)+heights[i+1]*u)*(1-v)+(heights[i+n]*(1-u)+heights[i+n+1]*u)*v;
    }
    const encoded=Math.round(height/unitMetres);if(encoded< -32768||encoded>32767)throw new Error('Height exceeds the declared millimetre storage range');output.push(encoded);
  }
  return {version:1,width,extentMetres,unitMetres,source:ISLET_SOURCE,underwater:'Synthetic chamfer distance ×0.4, capped at 9 m; no measured bathymetry',heights:output};
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
