import * as T from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export type PhotographicSkyPreset='day'|'golden';
const profiles={
  day:{file:'kloofendal_48d_partly_cloudy_puresky_4k.hdr',median:0.7},
  golden:{file:'kloppenheim_06_puresky_4k.hdr',median:0.25},
};

/** A self-hosted CC0 captured sky; optional, with procedural atmosphere fallback. */
export async function loadPhotographicSky(decodeReady:Promise<unknown>=Promise.resolve(),preset:PhotographicSkyPreset='day') {
  try {
    const url=new URL(`${import.meta.env.BASE_URL}textures/${profiles[preset].file}`,document.baseURI);
    performance.mark(`oceanfpv:photo-${preset}-download-start`);
    const response=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!response.ok)return null;
    const buffer=await response.arrayBuffer();
    performance.mark(`oceanfpv:photo-${preset}-download-ready`);
    // Keep the network transfer parallel without blocking other texture deadlines
    // with HDR conversion and the subsequent lighting bake.
    await decodeReady;
    performance.mark(`oceanfpv:photo-${preset}-decode-start`);
    const sky=decodePhotographicSky(buffer,preset);
    performance.mark(`oceanfpv:photo-${preset}-decode-ready`);
    return sky;
  } catch {return null;}
}

/** Authored exposure, not photometric calibration of the captured environment. */
export function decodePhotographicSky(buffer:ArrayBuffer,preset:PhotographicSkyPreset='day') {
    const parsed=new HDRLoader().parse(buffer);
    const {data,width,height}=parsed;
    const samples:number[]=[];let brightest=0,sunX=0,sunY=0;
    for(let y=0;y<height/2;y+=3)for(let x=0;x<width;x+=3) {
      const i=(y*width+x)*4,lum=T.DataUtils.fromHalfFloat(data[i])*0.2126+T.DataUtils.fromHalfFloat(data[i+1])*0.7152+T.DataUtils.fromHalfFloat(data[i+2])*0.0722;
      if(lum>brightest){brightest=lum;sunX=x;sunY=y;}if(x%15===0&&y%15===0)samples.push(lum);
    }
    samples.sort((a,b)=>a-b);const gain=profiles[preset].median/Math.max(samples[Math.floor(samples.length/2)]??1,0.001);
    for(let i=0;i<data.length;i++)if(i%4!==3)data[i]=T.DataUtils.toHalfFloat(Math.min(6,T.DataUtils.fromHalfFloat(data[i])*gain));
    const texture=new T.DataTexture(data,width,height,T.RGBAFormat,T.HalfFloatType);texture.mapping=T.EquirectangularReflectionMapping;
    texture.flipY=true;texture.minFilter=texture.magFilter=T.LinearFilter;texture.colorSpace=T.LinearSRGBColorSpace;texture.needsUpdate=true;
    const longitude=(sunX/width-0.5)*Math.PI*2,latitude=(0.5-sunY/height)*Math.PI;
    const sun=new T.Vector3(Math.cos(longitude)*Math.cos(latitude),Math.sin(latitude),Math.sin(longitude)*Math.cos(latitude));
    const horizon=new T.Color(0,0,0),row=Math.floor(height*0.49);
    for(let x=0;x<width;x++) {const i=(row*width+x)*4;horizon.r+=T.DataUtils.fromHalfFloat(data[i]);horizon.g+=T.DataUtils.fromHalfFloat(data[i+1]);horizon.b+=T.DataUtils.fromHalfFloat(data[i+2]);}
    horizon.multiplyScalar(1/width);
    return {preset,texture,sun,horizon};
}
