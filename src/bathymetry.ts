import { terrainHeight, TERRAIN_SEGMENTS } from './terrain';

export const COASTS=[{x:-580,z:-420,size:260,height:130},{x:610,z:-800,size:320,height:190},{x:-850,z:420,size:190,height:85}] as const;
export const BATHY_SIZE=TERRAIN_SEGMENTS+1;
/** Each RGB channel contains one island's exact rendered terrain vertices. */
export function bathymetryData() {
  const data=new Float32Array(BATHY_SIZE*BATHY_SIZE*4);
  for(let z=0;z<BATHY_SIZE;z++)for(let x=0;x<BATHY_SIZE;x++)for(let i=0;i<COASTS.length;i++) {
    const coast=COASTS[i],extent=coast.size*1.2;
    data[(z*BATHY_SIZE+x)*4+i]=terrainHeight((x/TERRAIN_SEGMENTS*2-1)*extent,(z/TERRAIN_SEGMENTS*2-1)*extent,coast.size,coast.height);
  }
  return data;
}
