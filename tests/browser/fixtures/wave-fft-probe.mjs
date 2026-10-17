import {SpectralSea,installWaveFFT,waveFFTActive} from '../../../src/spectrum.ts';
import {loadWaveFFT} from '../../../src/wave-fft-load.ts';
import {SEA_BANDS} from '../../../src/sea.ts';

installWaveFFT(null);const expected=new SpectralSea(),started=performance.now(),kernel=await loadWaveFFT(),loadMs=performance.now()-started;
const installed=installWaveFFT(kernel),actual=new SpectralSea();let fields=0,contacts=0;
function compare() {
  if(expected.time!==actual.time||expected.profileVersion!==actual.profileVersion)throw new Error('Wave history differs');
  for(let band=0;band<3;band++) {
    const a=expected.cascades[band],b=actual.cascades[band];
    for(const field of ['displacement','tangentX','tangentZ']) {
      const left=new Uint32Array(a[field].buffer,a[field].byteOffset,a[field].length),right=new Uint32Array(b[field].buffer,b[field].byteOffset,b[field].length);
      for(let i=0;i<left.length;i++)if(left[i]!==right[i])throw new Error(`Wave bits differ: ${band}/${field}/${i}`);
      fields+=left.length;
    }
    for(const scalar of ['heightVariance','slopeVariance','compressionBound'])if(a[scalar]!==b[scalar])throw new Error(`Wave scalar differs: ${band}/${scalar}`);
  }
  for(const field of ['heightScales','horizontalScales'])if(expected[field].some((value,i)=>value!==actual[field][i]))throw new Error(`Wave gain differs: ${field}`);
  for(const [x,z]of [[0,0],[-390,-450],[73.125,-810.5],[432.99,97.01],[-5000.25,1900.5]]) {
    if(expected.heightAt(x,z,expected.heightScales)!==actual.heightAt(x,z,actual.heightScales))throw new Error(`Wave contact differs: ${x}/${z}`);
    contacts++;
  }
}
compare();
for(const [time,profile]of [[0,'calm'],[.04,'calm'],[.2,'breeze'],[3,'swell'],[10,'swell'],[100,'swell'],[-3,'breeze'],[0,'calm']]) {
  installWaveFFT(null);expected.update(time,SEA_BANDS[profile]);installWaveFFT(kernel);actual.update(time,SEA_BANDS[profile]);compare();
}
window.__WAVE_FFT_PROBE__={loaded:kernel!==null,installed,active:waveFFTActive(),loadMs,fields,contacts};
