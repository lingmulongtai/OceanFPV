import test from 'node:test';
import assert from 'node:assert/strict';
import {WaveCascade} from '../src/spectrum';

test('packed spectral displacement agrees with an independent Fourier reconstruction of height',()=> {
  for(const n of [8,16])for(const direction of [0.7,-0.45]) {
    const count=n*n,chop=0.7,cascade=new WaveCascade(n,n,173,0.8,1,n,chop,direction);
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

test('legacy RMS profiles preserve their numeric defaults and crossing directions',()=> {
  const swell=new WaveCascade(128,433,173,0.85,36,433,1.8,-.45),legacyLong=new WaveCascade(128,433,173,0.85,36,433,1.8),explicitLong=new WaveCascade(128,433,173,0.85,36,433,1.8,0.7);
  const wind=[new WaveCascade(128,97,519,0.34,4,36,1.3),new WaveCascade(128,23.3,831,0.085,0.45,4,0.85)];
  const direction=(c:WaveCascade)=> {
    let xx=0,xz=0,zz=0;
    for(let z=0;z<c.size;z++)for(let x=0;x<c.size;x++) {
      const dx=c.sample((x+1)*c.length/c.size,z*c.length/c.size)-c.sample((x-1)*c.length/c.size,z*c.length/c.size);
      const dz=c.sample(x*c.length/c.size,(z+1)*c.length/c.size)-c.sample(x*c.length/c.size,(z-1)*c.length/c.size);
      xx+=dx*dx;xz+=dx*dz;zz+=dz*dz;
    }
    return Math.atan2(2*xz,xx-zz)/2;
  };
  for(const time of [0,6,120]) {
    swell.update(time);legacyLong.update(time);explicitLong.update(time);wind.forEach(c=>c.update(time));
    for(const field of ['displacement','tangentX','tangentZ'] as const) {
      // Foam is stateful and may react to the shared lateral compression cap.
      const xyz=(c:WaveCascade)=>c[field].filter((_,i)=>i%4!==3);
      assert.deepEqual(xyz(legacyLong),xyz(explicitLong));
    }
    const delta=Math.abs(direction(swell)-direction(wind[0])),crossing=Math.min(delta,Math.PI-delta);
    assert.ok(crossing>0.6,`Crossing direction at ${time}: ${crossing}`);
    const ratio=swell.heightVariance/legacyLong.heightVariance;
    assert.ok(ratio>0.75&&ratio<1.25,`Realized long-wave energy at ${time}: ${ratio}`);
  }
});
