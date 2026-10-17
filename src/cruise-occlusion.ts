import {CRUISE_OCCLUSION} from './generated/cruise-occlusion';

const atlasUrl=new URL('./generated/cruise-occlusion.rgba',import.meta.url).href;

/** Invalid or unavailable data falls back to the exact CPU bake at the caller. */
export async function loadCruiseOcclusion():Promise<Uint8Array|null> {
  if(!globalThis.crypto?.subtle)return null;
  for(let attempt=0;attempt<2;attempt++) {
    try {
      const response=await fetch(atlasUrl,{signal:AbortSignal.timeout(15000),...(attempt?{cache:'reload' as const}:{})});
      if(!response.ok) {
        if(response.status>=400&&response.status<500&&response.status!==408&&response.status!==429)return null;
        continue;
      }
      const pixels=new Uint8Array(await response.arrayBuffer());
      if(pixels.byteLength!==CRUISE_OCCLUSION.byteLength)continue;
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',pixels));
      if(Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('')===CRUISE_OCCLUSION.sha256)return pixels;
    }catch {/* One bounded reload, then preserve quality through the original bake. */}
  }
  return null;
}
