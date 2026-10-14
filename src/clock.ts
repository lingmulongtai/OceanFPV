export const SIMULATION_STEP=1/120;
const MAX_TICKS_PER_FRAME=600,MAX_BACKLOG_SECONDS=10;

/** Retain ordinary render delays; explicitly stop instead of skipping an unsafe gap. */
export class SimulationClock {
  private last=0;
  private pending=0;

  reset(now:number) {this.last=now;this.pending=0;}

  advance(now:number,tick:(step:number)=>boolean|void) {
    const elapsed=Math.max(0,(now-this.last)/1000);
    this.last=Math.max(this.last,now);
    if(!Number.isFinite(elapsed)||this.pending+elapsed>MAX_BACKLOG_SECONDS) {
      this.pending=0;return false;
    }
    this.pending+=elapsed;
    const count=Math.min(MAX_TICKS_PER_FRAME,Math.floor((this.pending+1e-9)/SIMULATION_STEP));
    for(let i=0;i<count;i++) {
      this.pending=Math.max(0,this.pending-SIMULATION_STEP);
      if(tick(SIMULATION_STEP)===false) {this.pending=0;break;}
    }
    return true;
  }
}
