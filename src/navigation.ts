export type VesselKind='cruise'|'yacht';
/** Metres and seconds; the passenger ship holds a steady northbound course. */
export function vesselPose(kind:VesselKind,time:number) {
  const omega=0.027;
  const a=time*omega;
  let x:number,z:number,vx:number,vz:number;
  if(kind==='cruise') {x=0;z=220-4.2*time;vx=0;vz=-4.2;}
  else {x=-500+45*(1-Math.cos(a));z=420-65*Math.sin(a);vx=45*omega*Math.sin(a);vz=-65*omega*Math.cos(a);}
  return {x,z,vx,vz,heading:Math.atan2(-vx,-vz),speed:Math.hypot(vx,vz)};
}

export const WAKE_SAMPLES=13,WAKE_STEP=8;
/** Keep the islands and the sailed corridor reachable as the ship travels. */
export function withinFlightArea(x:number,z:number,time:number) {
  if(Math.hypot(x,z)<=1900)return true;
  const ship=vesselPose('cruise',Math.max(0,time)),nearestZ=Math.max(ship.z,Math.min(220,z));
  return Math.hypot(x,z-nearestZ)<=1200;
}
/** Water-plane stern positions; repeated start points cannot emit an older wake. */
export function vesselWakeTrail(kind:VesselKind,time:number,length:number) {
  const elapsed=Math.max(0,time);
  return Array.from({length:WAKE_SAMPLES},(_,i)=> {
    const age=Math.min(i*WAKE_STEP,elapsed),pose=vesselPose(kind,elapsed-age);
    return {x:pose.x+Math.sin(pose.heading)*length/2,z:pose.z+Math.cos(pose.heading)*length/2,age,speed:pose.speed};
  });
}
