import test from 'node:test';
import assert from 'node:assert/strict';
import {WaveCascade} from '../src/spectrum';

test('packed spectral displacement agrees with an independent Fourier reconstruction of height',()=> {
  for(const n of [8,16]) {
    const count=n*n,chop=0.7,cascade=new WaveCascade(n,n,173,0.8,1,n,chop);
    for(const time of [0,6,120]) {
      cascade.update(time);const real=new Float64Array(count),imaginary=new Float64Array(count);
      // Direct forward DFT of the public height field, without FFT plan internals.
      for(let kz=0;kz<n;kz++)for(let kx=0;kx<n;kx++)for(let z=0;z<n;z++)for(let x=0;x<n;x++) {
        const i=kz*n+kx,angle=-2*Math.PI*(x*kx+z*kz)/n,h=cascade.displacement[(z*n+x)*4+1];
        real[i]+=h*Math.cos(angle);imaginary[i]+=h*Math.sin(angle);
      }
      for(let z=0;z<n;z++)for(let x=0;x<n;x++) {
        let dx=0,dz=0;
        for(let kz=0;kz<n;kz++)for(let kx=0;kx<n;kx++) {
          const i=kz*n+kx,kxx=kx===n/2?0:kx<n/2?kx:kx-n,kzz=kz===n/2?0:kz<n/2?kz:kz-n,k=Math.hypot(kxx,kzz);
          if(!k)continue;
          const angle=2*Math.PI*(x*kx+z*kz)/n,value=(-imaginary[i]*Math.cos(angle)-real[i]*Math.sin(angle))*chop/k/count;
          dx+=value*kxx;dz+=value*kzz;
        }
        assert.ok(Math.abs(cascade.displacement[(z*n+x)*4]-dx)<0.000001,`Dx at ${n}/${time}/${x}/${z}`);
        assert.ok(Math.abs(cascade.displacement[(z*n+x)*4+2]-dz)<0.000001,`Dz at ${n}/${time}/${x}/${z}`);
      }
    }
  }
});
