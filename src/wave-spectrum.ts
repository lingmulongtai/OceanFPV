/** Fetch-limited wind sea and crossing swell, adapted from web-ocean (MIT). */
const GRAVITY=9.81;
export function jonswapDensity(omega:number,peak:number,alpha:number,gamma:number) {
  if(omega<=0)return 0;
  const sigma=omega<=peak ? .07 : .09,r=(omega-peak)/(sigma*peak),ratio=peak/omega;
  return alpha*GRAVITY**2/omega**5*Math.exp(-1.25*ratio**4)*gamma**Math.exp(-.5*r*r);
}
export function donelanSpreading(theta:number,ratio:number) {
  const beta=ratio<.95?2.61*ratio**1.3:ratio<1.6?2.28*ratio**-1.3:10**(-.4+.8393*Math.exp(-.567*Math.log(ratio*ratio)));
  const angle=Math.atan2(Math.sin(theta),Math.cos(theta));
  return beta/(2*Math.tanh(beta*Math.PI))/Math.cosh(beta*angle)**2;
}
export type WaveSpectrumParameters={windSpeed:number;fetch:number;windDirection:number;swellHeight:number;swellLength:number;swellDirection:number};
export const DEFAULT_WAVE_SPECTRUM:Readonly<WaveSpectrumParameters>=Object.freeze({windSpeed:11,fetch:150000,windDirection:.7,swellHeight:2.5,swellLength:120,swellDirection:-.45});
export function createWaveSpectrum(parameters:Readonly<WaveSpectrumParameters>=DEFAULT_WAVE_SPECTRUM) {
  const p=parameters,alpha=p.windSpeed>0 ? .076*(p.windSpeed*p.windSpeed/(p.fetch*GRAVITY))**.22 : 0;
  const peak=p.windSpeed>0?22*(GRAVITY**2/(p.windSpeed*p.fetch))**(1/3):1;
  const swellPeak=Math.sqrt(GRAVITY*2*Math.PI/p.swellLength),swellGamma=6;
  const swellAlpha=(p.swellHeight/4)**2*5*swellPeak**4/GRAVITY**2*(1-.287*Math.log(swellGamma));
  return (kx:number,kz:number)=> {
    const k=Math.hypot(kx,kz);if(!k)return 0;
    const omega=Math.sqrt(GRAVITY*k),theta=Math.atan2(kz,kx);
    const wind=alpha?jonswapDensity(omega,peak,alpha,3.3)*donelanSpreading(theta-p.windDirection,omega/peak):0;
    // A broader swell avoids locking a 120 m peak to a few 433 m tile modes.
    // cos^8(theta/2) has exact normalization 128/(70*pi).
    const swell=jonswapDensity(omega,swellPeak,swellAlpha,swellGamma)*128/(70*Math.PI)*Math.cos((theta-p.swellDirection)/2)**8;
    return (wind+swell)*Math.exp(-k*k*.0012**2)*(.5*GRAVITY/omega)/k;
  };
}
