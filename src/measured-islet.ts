import grid from './data/measured-islet.json';

export const MEASURED_ISLET_SIZE=grid.extentMetres/2.4;
export const MEASURED_ISLET_HEIGHT=22;
const last=grid.width-1,half=grid.extentMetres/2,heights=Float32Array.from(grid.heights,value=>value*grid.unitMetres);

/** Source rows run south, matching positive local Z; no height or distance scaling. */
export function measuredIsletHeight(x:number,z:number) {
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>half||Math.abs(z)>half)return -9;
  const gx=(x+half)/grid.extentMetres*last,gz=(z+half)/grid.extentMetres*last,ix=Math.min(last-1,Math.floor(gx)),iz=Math.min(last-1,Math.floor(gz)),u=gx-ix,v=gz-iz,i=iz*grid.width+ix;
  return (heights[i]*(1-u)+heights[i+1]*u)*(1-v)+(heights[i+grid.width]*(1-u)+heights[i+grid.width+1]*u)*v;
}
