import test from 'node:test';
import assert from 'node:assert/strict';
import {createWaveSpectrum,DEFAULT_WAVE_SPECTRUM,donelanSpreading,jonswapDensity} from '../src/wave-spectrum';
import {WaveCascade} from '../src/spectrum';

function integrateLog(f:(value:number)=>number,low:number,high:number,steps=8192) {
  const a=Math.log(low),h=Math.log(high/low)/steps;let sum=0;
  for(let i=0;i<=steps;i++){const x=Math.exp(a+h*i);sum+=(i===0||i===steps?1:i%2?4:2)*f(x)*x;}
  return sum*h/3;
}

test('Donelan spreading integrates to unity across peak and tail frequencies',()=> {
  for(const ratio of[.1,.5,.94,.95,1,1.6,3,10]) {
    const count=8192,step=2*Math.PI/count;let sum=0;
    for(let i=0;i<count;i++)sum+=donelanSpreading(-Math.PI+(i+.5)*step,ratio)*step;
    assert.ok(Math.abs(sum-1)<1e-7,`angular integral at ${ratio}: ${sum}`);
    assert.ok(Math.abs(donelanSpreading(.7,ratio)-donelanSpreading(.7+2*Math.PI,ratio))<1e-12);
  }
});

test('JONSWAP recovers the analytic Pierson-Moskowitz variance without peak enhancement',()=> {
  for(const peak of[.6,1.2,2.4]) {
    const alpha=.012,expected=alpha*9.81**2/(5*peak**4),actual=integrateLog(w=>jonswapDensity(w,peak,alpha,1),peak/30,peak*100);
    assert.ok(Math.abs(actual/expected-1)<1e-6);
    assert.equal(jonswapDensity(peak,peak,alpha,3.3)/jonswapDensity(peak,peak,alpha,1),3.3);
  }
  assert.equal(jonswapDensity(0,1,.01,3.3),0);
});

test('wave-vector density retains swell height through the polar frequency Jacobian',()=> {
  const height=2.5,density=createWaveSpectrum({...DEFAULT_WAVE_SPECTRUM,windSpeed:0,swellHeight:height}),angles=32;
  const actual=integrateLog(k=>{let angular=0;for(let i=0;i<angles;i++){const theta=(i+.5)*2*Math.PI/angles;angular+=density(k*Math.cos(theta),k*Math.sin(theta))*2*Math.PI/angles;}return angular*k;},.0001,100);
  // The reference's fitted gamma=6 height correction has a 0.69% integral error.
  assert.ok(Math.abs(actual/(height/4)**2-1)<.01,`swell variance ${actual}`);
  const shared=createWaveSpectrum();assert.equal(shared(0,0),0);
  for(const wavelength of[4,36])for(const angle of[.7,-.45]) {
    const k=2*Math.PI/wavelength,at=(factor:number)=>shared(k*factor*Math.cos(angle),k*factor*Math.sin(angle));
    assert.ok(Math.abs(at(1-1e-7)/at(1+1e-7)-1)<1e-5);
  }
});

test('physical spectral directions propagate forward under the existing inverse FFT convention',()=> {
  const wave=new WaveCascade(32,40,173,(kx,kz)=>kx>0&&kx<1&&Math.abs(kz)<1e-10?1:0,5,40),delta=.001,time=.5;
  wave.update(time-delta);const before=wave.displacement.slice();wave.update(time+delta);const after=wave.displacement.slice();wave.update(time);
  let correlation=0,timeEnergy=0,slopeEnergy=0;
  for(let i=0;i<before.length;i+=4){const dt=(after[i+1]-before[i+1])/(2*delta),dx=wave.tangentX[i+1];correlation+=dt*dx;timeEnergy+=dt*dt;slopeEnergy+=dx*dx;}
  assert.ok(wave.heightVariance>0);assert.ok(correlation/Math.sqrt(timeEnergy*slopeEnergy)<-.8);
});

test('a single traveling Fourier pair retains absolute PSD energy across FFT sizes and tile lengths',()=> {
  // Independent seed173 Box-Muller energies at indices N-1, then Parseval:
  // variance = PSD * dk^2 * (xiReal^2 + xiImaginary^2) / 2.
  const seedEnergy=[[8,.9494309922264202],[16,5.942653555331473],[32,8.492236799324417]];
  for(const [size,energy]of seedEnergy)for(const length of[40,80]) {
    const dk=2*Math.PI/length,density=(kx:number,kz:number)=>Math.abs(kx-dk)<1e-12&&Math.abs(kz)<1e-12?3.5:0;
    const wave=new WaveCascade(size,length,173,density,length*.5,length*1.01),expected=3.5*dk*dk*energy/2;
    for(const time of[0,3,12]){wave.update(time);assert.ok(Math.abs(wave.heightVariance/expected-1)<1e-6);}
  }
});
