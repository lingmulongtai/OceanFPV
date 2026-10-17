import test from 'node:test';
import assert from 'node:assert/strict';
import {SpectralSea,type WaveBandScales} from '../src/spectrum';
import {nearshoreEnvelope} from '../src/nearshore';

test('uniform band profiles retain scalar fields, compression and contact heights exactly',()=>{
  const scalar=new SpectralSea(),bands=new SpectralSea();
  for(const [time,gain]of [[0,.55],[.05,1.15],[6,2.15],[6.01,2.15],[0,2.15]]){
    assert.equal(bands.update(time,[gain,gain,gain]),scalar.update(time,gain));
    assert.deepEqual(bands.horizontalScales,scalar.horizontalScales);
    for(let i=0;i<3;i++)assert.deepEqual(bands.cascades[i].displacement,scalar.cascades[i].displacement);
    for(const [x,z]of [[-713.4,39.7],[150.23,-411.9],[10000,10000]])assert.equal(bands.heightAt(x,z,[gain,gain,gain]),scalar.heightAt(x,z,gain));
  }
});

test('unequal band gains share one compression bound and reconstruct coastal contact heights',()=>{
  const sea=new SpectralSea(),gains:WaveBandScales=[2.15,2.15,1.15],envelope=(x:number,z:number)=>nearshoreEnvelope(3+.012*x+.007*z).value;
  for(const time of [0,6,12]){
    sea.update(time,gains);
    const factor=Math.min(1,.82/sea.cascades.reduce((sum,c,i)=>sum+gains[i]*c.compressionBound,0));
    assert.deepEqual(sea.horizontalScales,gains.map(g=>g*factor));
    for(let i=0;i<600;i++){
      const x=-200+(i*31.731)%400,z=-200+(i*83.973)%400;
      const sum=(channel:number,field:'displacement'|'tangentX'|'tangentZ',scales:WaveBandScales)=>sea.cascades.reduce((sum,c,i)=>sum+scales[i]*c.sample(x,z,channel,c[field]),0);
      const jacobian=(1+sum(0,'tangentX',sea.horizontalScales))*(1+sum(2,'tangentZ',sea.horizontalScales))-sum(2,'tangentX',sea.horizontalScales)*sum(0,'tangentZ',sea.horizontalScales);
      assert.ok(jacobian>.03);
      const px=x+sum(0,'displacement',sea.horizontalScales),pz=z+sum(2,'displacement',sea.horizontalScales),expected=sum(1,'displacement',gains)*envelope(x,z);
      assert.ok(Math.abs(sea.heightAt(px,pz,gains,envelope)-expected)<.004);
    }
  }
});

test('a short-band profile change invalidates cadence and clears foam in every coupled band',()=>{
  const sea=new SpectralSea(),initial:[number,number,number]=[2.15,2.15,2.15],changed:[number,number,number]=[2.15,2.15,1.15];
  sea.update(6,initial);const revision=sea.profileVersion;
  for(const c of sea.cascades)for(let i=3;i<c.displacement.length;i+=4)c.displacement[i]=1;
  assert.equal(sea.update(6,changed),true);assert.equal(sea.profileVersion,revision+1);
  const fresh=new SpectralSea();fresh.update(6,changed);
  for(let i=0;i<3;i++)assert.deepEqual(sea.cascades[i].displacement,fresh.cascades[i].displacement);
  assert.equal(sea.update(6,[...changed]),false);
  changed[2]=.75;assert.deepEqual(sea.heightScales,[2.15,2.15,1.15]);assert.equal(sea.update(6,changed),true);
  const next=sea.profileVersion;assert.equal(sea.update(6.05,changed),true);assert.equal(sea.profileVersion,next);
  assert.equal(sea.update(6.04,changed),true);const rewound=new SpectralSea();rewound.update(6.04,changed);
  for(let i=0;i<3;i++)assert.deepEqual(sea.cascades[i].displacement,rewound.cascades[i].displacement);
});
