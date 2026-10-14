import test from 'node:test';
import assert from 'node:assert/strict';
import {inverseFFT} from '../src/spectrum';

test('inverse FFT plans match independent complex IDFT and Parseval across reused sizes',()=> {
  for(const n of [8,2,16,4,8,2]) {
    const count=n*n,sourceReal=Float64Array.from({length:count},(_,i)=>Math.sin(i*1.73)+Math.cos(i*0.41)),sourceImaginary=Float64Array.from({length:count},(_,i)=>Math.cos(i*2.19)-Math.sin(i*0.37));
    const real=sourceReal.slice(),imaginary=sourceImaginary.slice();inverseFFT(real,imaginary,n);
    for(let z=0;z<n;z++)for(let x=0;x<n;x++) {
      let expectedReal=0,expectedImaginary=0;
      for(let kz=0;kz<n;kz++)for(let kx=0;kx<n;kx++) {
        const i=kz*n+kx,angle=2*Math.PI*(x*kx+z*kz)/n,c=Math.cos(angle),s=Math.sin(angle);
        expectedReal+=sourceReal[i]*c-sourceImaginary[i]*s;expectedImaginary+=sourceReal[i]*s+sourceImaginary[i]*c;
      }
      assert.ok(Math.abs(real[z*n+x]-expectedReal/count)<1e-12);assert.ok(Math.abs(imaginary[z*n+x]-expectedImaginary/count)<1e-12);
    }
    const frequencyEnergy=sourceReal.reduce((sum,v,i)=>sum+v*v+sourceImaginary[i]**2,0)/count,spatialEnergy=real.reduce((sum,v,i)=>sum+v*v+imaginary[i]**2,0);
    assert.ok(Math.abs(frequencyEnergy-spatialEnergy)<1e-12);
  }
});

test('cached inverse plans keep Hermitian waves real including DC and Nyquist frequencies',()=> {
  for(const n of [2,4,8,16]) {
    const real=new Float64Array(n*n),imaginary=new Float64Array(n*n);
    for(let z=0;z<n;z++)for(let x=0;x<n;x++) {
      const i=z*n+x,j=((n-z)%n)*n+(n-x)%n;if(i>j)continue;
      real[i]=real[j]=Math.sin(i*1.31)+0.2;imaginary[i]=i===j?0:Math.cos(i*0.73);imaginary[j]=-imaginary[i];
    }
    inverseFFT(real,imaginary,n);assert.ok(imaginary.every(v=>Math.abs(v)<1e-12));assert.ok(real.every(Number.isFinite));
  }
});
