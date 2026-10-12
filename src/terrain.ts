function hash(x:number,z:number) {let h=Math.imul(x,374761393)+Math.imul(z,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
function noise(x:number,z:number) {
  const ix=Math.floor(x),iz=Math.floor(z),u=x-ix,v=z-iz,fx=u*u*(3-2*u),fz=v*v*(3-2*v);
  return (hash(ix,iz)*(1-fx)+hash(ix+1,iz)*fx)*(1-fz)+(hash(ix,iz+1)*(1-fx)+hash(ix+1,iz+1)*fx)*fz;
}
export function terrainHeight(x:number,z:number,size:number,height:number) {
  const coast=1+(noise(x*0.013+3,z*0.013-7)-0.5)*0.35;
  const r=Math.hypot(x,z*1.06)/size*coast;
  const mask=Math.pow(Math.max(0,1-r*r),1.65);
  let ridges=0,weight=0.56,frequency=0.009;
  for(let octave=0;octave<5;octave++){ridges+=(1-Math.abs(noise(x*frequency+12,z*frequency-5)*2-1))*weight;frequency*=2.13;weight*=0.48;}
  const cliffs= Math.pow(Math.max(0,noise(x*0.021-8,z*0.018+4)-0.25),1.3)*height*0.25;
  return Math.max(-9,mask*(height*(0.3+ridges*0.85)+cliffs)-9);
}
