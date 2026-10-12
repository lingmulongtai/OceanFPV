export type VesselKind='explorer'|'cruise'|'yacht';
/** Smooth closed traffic routes in metres; orientation follows actual velocity. */
export function vesselPose(kind:VesselKind,time:number) {
  const omega=kind==='explorer'?0.025:kind==='cruise'?0.018:0.027;
  const a=time*omega;
  let x:number,z:number,vx:number,vz:number;
  if(kind==='explorer') {x=-135*(1-Math.cos(a));z=-180*Math.sin(a);vx=-135*omega*Math.sin(a);vz=-180*omega*Math.cos(a);}
  else if(kind==='cruise') {x=230*Math.sin(a);z=-470+150*Math.cos(a);vx=230*omega*Math.cos(a);vz=-150*omega*Math.sin(a);}
  else {x=78+85*(1-Math.cos(a));z=75-100*Math.sin(a);vx=85*omega*Math.sin(a);vz=-100*omega*Math.cos(a);}
  return {x,z,vx,vz,heading:Math.atan2(-vx,-vz),speed:Math.hypot(vx,vz)};
}
