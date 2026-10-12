export class FlightAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private rotor: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private ambience = new Audio(`${import.meta.env.BASE_URL}ocean_ambience.wav`);
  volume = 0.35;
  muted = false;
  constructor() { this.ambience.loop = true; this.ambience.preload = 'none'; }
  async start() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();this.master.connect(this.context.destination);
        this.rotor = this.context.createGain();this.rotor.gain.value=0;
        const filter = this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1800;
        this.rotor.connect(filter);filter.connect(this.master);
        for(let i=0;i<4;i++) {
          const oscillator=this.context.createOscillator();oscillator.type='sawtooth';oscillator.frequency.value=110+i*3;
          oscillator.connect(this.rotor);oscillator.start();this.oscillators.push(oscillator);
        }
      }
      await this.context.resume();this.applyVolume();
      if (!this.muted) await this.ambience.play().catch(()=>{});
    } catch { /* Audio is optional; browsers can reject playback. */ }
  }
  applyVolume() {
    this.ambience.volume=this.muted?0:this.volume*0.38;
    if(this.master&&this.context) this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.context.currentTime,0.05);
  }
  update(motor:number,running:boolean) {
    if(!this.context||!this.rotor) return;
    const time=this.context.currentTime;
    this.rotor.gain.setTargetAtTime(running?0.007+motor*0.022:0,time,0.08);
    this.oscillators.forEach((o,i)=>o.frequency.setTargetAtTime(90+motor*420+i*3.5,time,0.07));
  }
  suspend() { this.ambience.pause();void this.context?.suspend().catch(()=>{}); }
}
