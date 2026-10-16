import grid from './data/hornoya.json';

export const HORNOYA_SIZE=grid.extentMetres/2.4;
export const HORNOYA_HEIGHT=67;
export const HORNOYA_SEGMENTS=grid.width-1;
const last=grid.width-1,half=grid.extentMetres/2,heights=Float32Array.from(grid.heights,value=>value*grid.unitMetres);
export function hornoyaDepthData(){return heights.slice();}

/** Metres and southward source rows map directly to local X/Z. */
export function hornoyaHeight(x:number,z:number) {
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>half||Math.abs(z)>half)return -9;
  const gx=(x+half)/grid.extentMetres*last,gz=(z+half)/grid.extentMetres*last,ix=Math.min(last-1,Math.floor(gx)),iz=Math.min(last-1,Math.floor(gz)),u=gx-ix,v=gz-iz,i=iz*grid.width+ix;
  return (heights[i]*(1-u)+heights[i+1]*u)*(1-v)+(heights[i+grid.width]*(1-u)+heights[i+grid.width+1]*u)*v;
}
