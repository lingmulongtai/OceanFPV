type FFTPlan={swaps:Uint32Array;stages:{length:number;real:Float64Array;imaginary:Float64Array}[]};
export type WaveFFT=(real:Float64Array,imaginary:Float64Array,size:number)=>boolean;

/** Optional fixed128 kernel. False leaves caller inputs available for the JS FFT. */
export function createWaveFFT(exports:WebAssembly.Exports,plan:FFTPlan):WaveFFT|null {
  try {
    const {memory,buffer_ptr:ptr,inverse_fft:fft}=exports;
    if(!(memory instanceof WebAssembly.Memory)||typeof ptr!=='function'||typeof fft!=='function')return null;
    const buffer=memory.buffer,count=128*128;
    if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==2097152)return null;
    const lengths=[count*8,count*8,127*8,127*8,128*4],offsets=lengths.map((_,i)=>Number(ptr(i)));
    if(offsets.some((offset,i)=>!Number.isSafeInteger(offset)||offset<0||offset%(i===4?4:8)||offset+lengths[i]>buffer.byteLength))return null;
    const ranges=offsets.map((start,i)=>({start,end:start+lengths[i]})).sort((a,b)=>a.start-b.start);
    if(ranges.some((range,i)=>i>0&&range.start<ranges[i-1].end))return null;
    // Rust's raw-pointer swap loop requires every index to be inside the field.
    if(plan.swaps.length>128||plan.swaps.length%2||plan.swaps.some(index=>index>=128)||plan.stages.length!==7)return null;
    for(let i=0;i<plan.stages.length;i++) {
      const stage=plan.stages[i],half=1<<i;
      if(stage.length!==half*2||stage.real.length!==half||stage.imaginary.length!==half||!stage.real.every(Number.isFinite)||!stage.imaginary.every(Number.isFinite))return null;
    }
    const real=new Float64Array(buffer,offsets[0],count),imaginary=new Float64Array(buffer,offsets[1],count);
    const wr=new Float64Array(buffer,offsets[2],127),wi=new Float64Array(buffer,offsets[3],127),swaps=new Uint32Array(buffer,offsets[4],128);
    const swapCount=plan.swaps.length;swaps.set(plan.swaps);let offset=0;
    for(const stage of plan.stages) {
      const half=stage.length/2;
      wr.set(stage.real,offset);wi.set(stage.imaginary,offset);offset+=half;
    }
    let enabled=true;
    return(inputReal,inputImaginary,size)=> {
      if(!enabled||size!==128||!(inputReal instanceof Float64Array)||!(inputImaginary instanceof Float64Array)||inputReal.length!==count||inputImaginary.length!==count)return false;
      if(memory.buffer!==buffer){enabled=false;return false;}
      if(!(inputReal.buffer instanceof ArrayBuffer)||!(inputImaginary.buffer instanceof ArrayBuffer)||inputReal.buffer===buffer||inputImaginary.buffer===buffer)return false;
      const overlap=inputReal.buffer===inputImaginary.buffer&&inputReal.byteOffset<inputImaginary.byteOffset+inputImaginary.byteLength&&inputImaginary.byteOffset<inputReal.byteOffset+inputReal.byteLength;
      if(overlap)return false;
      try {
        real.set(inputReal);imaginary.set(inputImaginary);
        if(fft(128,swapCount)!==1){enabled=false;return false;}
        // The kernel cannot alter the caller's fields before it returns normally.
        inputReal.set(real);inputImaginary.set(imaginary);return true;
      }catch {enabled=false;return false;}
    };
  }catch {return null;}
}
