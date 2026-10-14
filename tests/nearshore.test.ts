import test from 'node:test';
import assert from 'node:assert/strict';
import {bathymetryData,COASTS,BATHY_COASTS,BATHY_SIZE,sampleBathymetry} from '../src/bathymetry';
import {LighthouseReef,LIGHTHOUSE_COAST} from '../src/lighthouse-reef';
import {nearshoreEnvelope} from '../src/nearshore';
import {terrainSurfaceHeight} from '../src/terrain';
import {SpectralSea} from '../src/spectrum';

test('shore envelope is continuous, bounded and identical before terrain grid edges',()=> {
  for(const depth of [-60,-9,-1,0])assert.deepEqual(nearshoreEnvelope(depth),{value:0,derivative:0});
  for(const depth of [8,9,60])assert.deepEqual(nearshoreEnvelope(depth),{value:1,derivative:0});
  assert.equal(nearshoreEnvelope(2).value,1.3);
  for(let depth=0;depth<9;depth+=0.013) {
    const {value,derivative}=nearshoreEnvelope(depth),step=0.0001;
    assert.ok(value>=0&&value<=1.3);
    assert.ok(Math.abs(derivative-(nearshoreEnvelope(depth+step).value-nearshoreEnvelope(depth-step).value)/(step*2))<0.0001);
  }
});

test('uploaded coastal triangles give matching heights and independent spatial gradients',()=> {
  const data=bathymetryData(),epsilon=0.0001;
  for(const coast of COASTS)for(let i=0;i<140;i++) {
    const step=coast.size*2.4/192,x=coast.x-coast.size*1.2+(3+(i*31)%180+0.23)*step,z=coast.z-coast.size*1.2+(3+(i*17)%180+0.31)*step;
    const sample=sampleBathymetry(data,x,z),exact=terrainSurfaceHeight(x-coast.x,z-coast.z,coast.size,coast.height,coast.profile);
    assert.ok(Math.abs(sample.height-exact)<0.00002);
    assert.ok(Math.abs(sample.dx-(sampleBathymetry(data,x+epsilon,z).height-sampleBathymetry(data,x-epsilon,z).height)/(epsilon*2))<0.00001);
    assert.ok(Math.abs(sample.dz-(sampleBathymetry(data,x,z+epsilon).height-sampleBathymetry(data,x,z-epsilon).height)/(epsilon*2))<0.00001);
  }
  assert.deepEqual(sampleBathymetry(data,10000,10000),{height:-60,dx:0,dz:0});
  for(const coast of COASTS)for(const side of [-1,1])for(let i=0;i<10;i++) {
    const x=coast.x+side*(coast.size*1.2+(i-5)*0.001),z=coast.z;
    assert.deepEqual(nearshoreEnvelope(-sampleBathymetry(data,x,z).height),{value:1,derivative:0});
  }
});

test('reef depth channel follows rendered heights, grid gradients and deep outside boundaries',()=> {
  const reef=new LighthouseReef(),data=bathymetryData(reef),coast=LIGHTHOUSE_COAST,step=coast.size*2.4/(BATHY_SIZE-1),stepZ=coast.sizeZ*2.4/(BATHY_SIZE-1),epsilon=0.0001;
  assert.equal(BATHY_COASTS.length,4);
  for(let i=0;i<180;i++) {
    const ix=(i*31)%BATHY_SIZE,iz=(i*17)%BATHY_SIZE,x=coast.x-coast.size*1.2+ix*step,z=coast.z-coast.sizeZ*1.2+iz*stepZ;
    const top=reef.topHeight(x,z),uploaded=data[(iz*BATHY_SIZE+ix)*4+3];
    if(top!==null)assert.ok(Math.abs(uploaded-top)<0.000001);else assert.ok(uploaded<=-1&&uploaded>=-60);
    const px=x+step*0.23,pz=z+stepZ*0.31,sample=sampleBathymetry(data,px,pz);
    assert.ok(Math.abs(sample.dx-(sampleBathymetry(data,px+epsilon,pz).height-sampleBathymetry(data,px-epsilon,pz).height)/(2*epsilon))<0.00001);
    assert.ok(Math.abs(sample.dz-(sampleBathymetry(data,px,pz+epsilon).height-sampleBathymetry(data,px,pz-epsilon).height)/(2*epsilon))<0.00001);
  }
  assert.ok(Math.abs(sampleBathymetry(data,175,-135).height-5.540271905)<0.04);
  const edge=coast.size*1.2+0.001,edgeZ=coast.sizeZ*1.2+0.001;
  for(const [x,z]of [[coast.x-edge,coast.z],[coast.x+edge,coast.z],[coast.x,coast.z-edgeZ],[coast.x,coast.z+edgeZ]]) {
    assert.deepEqual(sampleBathymetry(data,x,z),{height:-60,dx:0,dz:0});
    assert.deepEqual(nearshoreEnvelope(-sampleBathymetry(data,x,z).height),{value:1,derivative:0});
  }
  const dryPoint=sampleBathymetry(data,140.17,-160.89);
  assert.ok(dryPoint.height>0,'deep outside samples must not turn the known dry mesh point into water');
  for(const side of [-1,1])for(let i=0;i<12;i++) {
    for(const [x,z]of [[coast.x+side*(coast.size*1.2+(i-6)*0.001),coast.z],[coast.x,coast.z+side*(coast.sizeZ*1.2+(i-6)*0.001)]]) {
      assert.deepEqual(nearshoreEnvelope(-sampleBathymetry(data,x,z).height),{value:1,derivative:0});
    }
  }
});

test('contact heights sample the coastal envelope after inverse lateral displacement',()=> {
  const data=bathymetryData(),sea=new SpectralSea(),envelope=(x:number,z:number)=>nearshoreEnvelope(-sampleBathymetry(data,x,z).height).value;
  for(const scale of [0.55,1.15,2.15]) {
    sea.update(6,scale);
    for(const [index,c]of sea.cascades.entries())for(let i=0;i<c.displacement.length;i+=4){c.displacement[i]=2;c.displacement[i+1]=(index+1)*0.25;c.displacement[i+2]=-1;}
    let changed=0;
    for(const coast of BATHY_COASTS)for(let i=0;i<80;i++) {
      const x=coast.x-coast.size+(i*17.31)%(coast.size*2),z=coast.z-coast.size+(i*41.73)%(coast.size*2);
      const expected=1.5*scale*envelope(x-6*sea.horizontalScale,z+3*sea.horizontalScale);
      assert.ok(Math.abs(sea.heightAt(x,z,scale,envelope)-expected)<1e-10);
      assert.ok(Number.isFinite(expected));
      if(Math.abs(expected-1.5*scale*envelope(x,z))>0.001)changed++;
    }
    assert.ok(changed>0,'world-coordinate envelope would give a different contact height');
    assert.equal(sea.heightAt(10000,10000,scale,envelope),sea.heightAt(10000,10000,scale));
  }
});

test('natural shoreline world points reconstruct contact heights within four millimetres',()=> {
  const data=bathymetryData(),sea=new SpectralSea(),envelope=(x:number,z:number)=>nearshoreEnvelope(-sampleBathymetry(data,x,z).height).value;
  for(const scale of [0.55,1.15,2.15])for(const time of [6,12]) {
    sea.update(time,scale);let count=0;
    for(const coast of BATHY_COASTS)for(let i=0;i<2200;i++) {
      const x=coast.x-coast.size+(i*17.31)%(coast.size*2),z=coast.z-coast.size+(i*41.73)%(coast.size*2),depth=-sampleBathymetry(data,x,z).height;
      if(depth<0||depth>=8)continue;
      const px=x+sea.cascades.reduce((sum,c)=>sum+c.sample(x,z,0),0)*sea.horizontalScale,pz=z+sea.cascades.reduce((sum,c)=>sum+c.sample(x,z,2),0)*sea.horizontalScale;
      const expected=sea.cascades.reduce((sum,c)=>sum+c.sample(x,z),0)*scale*envelope(x,z);
      assert.ok(Math.abs(sea.heightAt(px,pz,scale,envelope)-expected)<0.004);count++;
    }
    assert.ok(count>600);
  }
});

test('wave height energy used for unresolved coastal gradients follows actual fields',()=> {
  const sea=new SpectralSea();
  for(const time of [0,6,12]) {
    sea.update(time);
    for(const c of sea.cascades) {
      let measured=0;for(let i=1;i<c.displacement.length;i+=4)measured+=c.displacement[i]**2;
      assert.ok(Math.abs(c.heightVariance-measured/(c.size*c.size))<0.000001);
    }
  }
});
