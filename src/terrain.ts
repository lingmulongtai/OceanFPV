function hash(x:number,z:number) {let h=Math.imul(x,374761393)+Math.imul(z,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
function noise(x:number,z:number) {
  const ix=Math.floor(x),iz=Math.floor(z),u=x-ix,v=z-iz,fx=u*u*(3-2*u),fz=v*v*(3-2*v);
  return (hash(ix,iz)*(1-fx)+hash(ix+1,iz)*fx)*(1-fz)+(hash(ix,iz+1)*(1-fx)+hash(ix+1,iz+1)*fx)*fz;
}
export const TERRAIN_SEGMENTS=192;
export function terrainHeight(x:number,z:number,size:number,height:number) {
  const coast=1+(noise(x*0.013+3,z*0.013-7)-0.5)*0.35;
  const r=Math.hypot(x,z*1.06)/size*coast;
  const mask=Math.pow(Math.max(0,1-r*r),1.65);
  let ridges=0,weight=0.56,frequency=0.009;
  for(let octave=0;octave<5;octave++){ridges+=(1-Math.abs(noise(x*frequency+12,z*frequency-5)*2-1))*weight;frequency*=2.13;weight*=0.48;}
  const cliffs= Math.pow(Math.max(0,noise(x*0.021-8,z*0.018+4)-0.25),1.3)*height*0.25;
  return Math.max(-9,mask*(height*(0.3+ridges*0.85)+cliffs)-9);
}
/** The same diagonal interpolation as the 192×192 rendered terrain grid. */
export function terrainSurfaceHeight(x:number,z:number,size:number,height:number) {
  const extent=size*1.2,step=extent*2/TERRAIN_SEGMENTS;if(Math.abs(x)>extent||Math.abs(z)>extent)return -9;
  const gx=(x+extent)/step,gz=(z+extent)/step,ix=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gx)),iz=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gz)),u=gx-ix,v=gz-iz;
  const px=-extent+ix*step,pz=-extent+iz*step,a=terrainHeight(px,pz,size,height),b=terrainHeight(px,pz+step,size,height),d=terrainHeight(px+step,pz,size,height);
  if(u+v<=1)return a+(b-a)*v+(d-a)*u;
  const c=terrainHeight(px+step,pz+step,size,height);return c+(b-c)*(1-u)+(d-c)*(1-v);
}

/** Slope of the rendered triangle, used for ground cover and rooted vegetation. */
export function terrainSlope(x:number,z:number,size:number,height:number) {
  const extent=size*1.2,step=extent*2/TERRAIN_SEGMENTS;if(Math.abs(x)>extent||Math.abs(z)>extent)return Math.PI/2;
  const gx=(x+extent)/step,gz=(z+extent)/step,ix=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gx)),iz=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gz)),u=gx-ix,v=gz-iz;
  const px=-extent+ix*step,pz=-extent+iz*step,a=terrainHeight(px,pz,size,height),b=terrainHeight(px,pz+step,size,height),d=terrainHeight(px+step,pz,size,height);
  if(u+v<=1)return Math.atan(Math.hypot(d-a,b-a)/step);
  const c=terrainHeight(px+step,pz+step,size,height);return Math.atan(Math.hypot(c-b,c-d)/step);
}
function fade(a:number,b:number,x:number) {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
export function terrainCover(x:number,z:number,size:number,height:number) {
  const y=terrainSurfaceHeight(x,z,size,height),slope=terrainSlope(x,z,size,height);
  return fade(5,15,y)*(1-fade(0.35,0.75,slope))*(1-fade(height*0.65,height*0.95,y));
}
export function coastalTreeSites(x:number,z:number,size:number,height:number) {
  const sites:{x:number;z:number;y:number;scale:number;yaw:number}[]=[];
  for(let i=0;i<1020&&sites.length<170;i++) {
    const angle=i*2.399963,r=Math.sqrt((i+0.5)/1020)*size*0.91,tx=Math.cos(angle)*r,tz=Math.sin(angle)*r;
    const cover=terrainCover(tx,tz,size,height),density=0.35+0.65*noise((x+tx)*0.018+7,(z+tz)*0.018-3);
    if(cover<0.3||hash(i+Math.floor(x),Math.floor(z))>cover*density)continue;
    sites.push({x:x+tx,z:z+tz,y:terrainSurfaceHeight(tx,tz,size,height),scale:0.65+hash(i,Math.floor(x+z))*0.7,yaw:angle});
  }
  return sites;
}
