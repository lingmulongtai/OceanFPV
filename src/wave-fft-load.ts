const kernelUrl=new URL('./generated/wave-fft.wasm?no-inline',import.meta.url).href;

/** Acceleration is optional; network, CSP and compilation failures preserve JS. */
export async function loadWaveFFT():Promise<WebAssembly.Exports|null> {
  if(typeof WebAssembly==='undefined')return null;
  try {
    const response=await fetch(kernelUrl,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)return null;
    return(await WebAssembly.instantiate(await response.arrayBuffer(),{})).instance.exports;
  }catch {return null;}
}
