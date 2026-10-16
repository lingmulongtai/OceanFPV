export type VesselKind='explorer'|'cruise'|'yacht';
/** Metres and seconds; the passenger ship holds a steady northbound course. */
export function vesselPose(kind:VesselKind,time:number) {
  const omega=kind==='explorer'?0.025:kind==='cruise'?0.018:0.027;
  const a=time*omega;
  let x:number,z:number,vx:number,vz:number;
  if(kind==='explorer') {x=-135*(1-Math.cos(a));z=-180*Math.sin(a);vx=-135*omega*Math.sin(a);vz=-180*omega*Math.cos(a);}
  else if(kind==='cruise') {x=0;z=220-4.2*time;vx=0;vz=-4.2;}
  else {x=78+85*(1-Math.cos(a));z=75-100*Math.sin(a);vx=85*omega*Math.sin(a);vz=-100*omega*Math.cos(a);}
  return {x,z,vx,vz,heading:Math.atan2(-vx,-vz),speed:Math.hypot(vx,vz)};
}

export const WAKE_SAMPLES=13,WAKE_STEP=8;
/** Water-plane stern positions; repeated start points cannot emit an older wake. */
export function vesselWakeTrail(kind:VesselKind,time:number,length:number) {
  const elapsed=Math.max(0,time);
  return Array.from({length:WAKE_SAMPLES},(_,i)=> {
    const age=Math.min(i*WAKE_STEP,elapsed),pose=vesselPose(kind,elapsed-age);
    return {x:pose.x+Math.sin(pose.heading)*length/2,z:pose.z+Math.cos(pose.heading)*length/2,age,speed:pose.speed};
  });
}
