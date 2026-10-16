/** Tessendorf spectral sea. CPU IFFT output is shared by rendering and contacts.
 * Unshifted frequency indexing; inverse transforms include 1/N² normalization.
 * See docs/OCEAN_RESEARCH.md and OceanLab's MIT spectrum compute reference. */
type FFTPlan={swaps:Uint32Array;stages:{length:number;real:Float64Array;imaginary:Float64Array}[]};
const fftPlans=new Map<number,FFTPlan>();
function fftPlan(size:number) {
  let plan=fftPlans.get(size);if(plan)return plan;
  const swaps:number[]=[],stages:FFTPlan['stages']=[];
  for(let i=1,j=0;i<size;i++) {
    let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
    if(i<j)swaps.push(i,j);
  }
  for(let length=2;length<=size;length*=2) {
    const real=new Float64Array(length/2),imaginary=new Float64Array(length/2);
    for(let j=0;j<length/2;j++){const angle=2*Math.PI*j/length;real[j]=Math.cos(angle);imaginary[j]=Math.sin(angle);}
    stages.push({length,real,imaginary});
  }
  plan={swaps:Uint32Array.from(swaps),stages};fftPlans.set(size,plan);return plan;
}
export function inverseFFT(real: Float64Array, imaginary: Float64Array, size: number) {
  if (size < 2 || (size & (size - 1)) || real.length !== size * size || imaginary.length !== real.length) throw new Error('FFT requires a square power-of-two field');
  const plan=fftPlan(size);
  const transform = (offset: number, stride: number) => {
    for(let i=0;i<plan.swaps.length;i+=2) {
      const a=offset+plan.swaps[i]*stride,b=offset+plan.swaps[i+1]*stride,ar=real[a],ai=imaginary[a];
      real[a]=real[b];imaginary[a]=imaginary[b];real[b]=ar;imaginary[b]=ai;
    }
    for(const {length,real:wr,imaginary:wi}of plan.stages) {
      for(let start=0;start<size;start+=length) {
        for(let j=0;j<length/2;j++) {
          const a=offset+(start+j)*stride,b=a+length/2*stride;
          const br=real[b]*wr[j]-imaginary[b]*wi[j],bi=real[b]*wi[j]+imaginary[b]*wr[j];
          real[b]=real[a]-br;imaginary[b]=imaginary[a]-bi;real[a]+=br;imaginary[a]+=bi;
        }
      }
    }
  };
  for(let y=0;y<size;y++) transform(y*size,1);
  for(let x=0;x<size;x++) transform(x,size);
  const normalization=1/(size*size);
  for(let i=0;i<real.length;i++) {real[i]*=normalization;imaginary[i]*=normalization;}
}

export class WaveCascade {
  readonly displacement: Float32Array;
  readonly tangentX: Float32Array;
  readonly tangentZ: Float32Array;
  heightVariance=0;
  private readonly h0: Float64Array;
  private readonly omega: Float64Array;
  private readonly directionX: Float64Array;
  private readonly directionZ: Float64Array;
  private readonly fields: {real: Float64Array; imaginary: Float64Array}[];
  private lastTime=NaN;
  private foamTime=NaN;
  private foamScale=NaN;
  compressionBound=0;
  slopeVariance=0;

  constructor(readonly size: number, readonly length: number, seed: number, rms: number, minWave: number, maxWave: number, readonly chop=1.6,windDirection=0.7) {
    const count=size*size;this.displacement=new Float32Array(count*4);this.tangentX=new Float32Array(count*4);this.tangentZ=new Float32Array(count*4);
    this.h0=new Float64Array(count*2);this.omega=new Float64Array(count);this.directionX=new Float64Array(count);this.directionZ=new Float64Array(count);
    this.fields=Array.from({length:2},()=>({real:new Float64Array(count),imaginary:new Float64Array(count)}));
    const random=()=> {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+1)/4294967297;};
    const gaussian=()=>Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
    const windX=Math.cos(windDirection),windZ=Math.sin(windDirection),windLength=11*11/9.81;
    let energy=0;
    for(let z=0;z<size;z++) for(let x=0;x<size;x++) {
      const i=z*size+x,kx=2*Math.PI*(x<size/2?x:x-size)/length,kz=2*Math.PI*(z<size/2?z:z-size)/length,k=Math.hypot(kx,kz);
      const dx=x===size/2?0:kx,dz=z===size/2?0:kz,directionK=Math.hypot(dx,dz);
      this.directionX[i]=directionK?dx/directionK*this.chop:0;this.directionZ[i]=directionK?dz/directionK*this.chop:0;
      this.omega[i]=Math.sqrt(9.81*k);
      const wavelength=k?2*Math.PI/k:Infinity,alignment=k?(kx*windX+kz*windZ)/k:0;
      // Phillips wind spectrum, disjoint bands and Gaussian phases avoid stripes.
      const density=wavelength>=minWave&&wavelength<=maxWave ? Math.exp(-1/Math.pow(k*windLength,2))*alignment*alignment*Math.exp(-k*k*0.025)/(k*k*k*k)*(alignment<0?0.15:1) : 0;
      const amplitude=Math.sqrt(density/2);this.h0[i*2]=gaussian()*amplitude;this.h0[i*2+1]=gaussian()*amplitude;energy+=density;
    }
    const factor=energy? rms*count/Math.sqrt(2*energy):0;
    for(let i=0;i<this.h0.length;i++) this.h0[i]*=factor;
    this.update(0);
  }
  update(time: number) {
    if(time===this.lastTime) return;
    this.lastTime=time;this.compressionBound=0;
    const n=this.size,count=n*n;
    for(let z=0;z<n;z++) for(let x=0;x<n;x++) {
      const i=z*n+x,opposite=((n-z)%n)*n+(n-x)%n,c=Math.cos(this.omega[i]*time),s=Math.sin(this.omega[i]*time);
      const ar=this.h0[i*2],ai=this.h0[i*2+1],br=this.h0[opposite*2],bi=this.h0[opposite*2+1];
      const hr=(ar+br)*c-(ai+bi)*s,hi=(ar-br)*s+(ai-bi)*c;
      // H + i*Dx packs two real spatial fields into one complex transform.
      const packed=1-this.directionX[i];this.fields[0].real[i]=hr*packed;this.fields[0].imaginary[i]=hi*packed;
      const direction=this.directionZ[i];this.fields[1].real[i]=-hi*direction;this.fields[1].imaginary[i]=hr*direction;
    }
    this.fields.forEach(f=>inverseFFT(f.real,f.imaginary,n));
    const h=this.fields[0].real,dx=this.fields[0].imaginary,dz=this.fields[1].real;
    const derivative= n/(2*this.length);let slopeEnergy=0,heightEnergy=0;
    for(let z=0;z<n;z++) for(let x=0;x<n;x++) {
      const i=z*n+x,l=z*n+(x+n-1)%n,r=z*n+(x+1)%n,b=((z+n-1)%n)*n+x,t=((z+1)%n)*n+x;
      const hx=(h[r]-h[l])*derivative,hz=(h[t]-h[b])*derivative;
      slopeEnergy+=hx*hx+hz*hz;
      heightEnergy+=h[i]*h[i];
      const dxx=(dx[r]-dx[l])*derivative,dxz=(dx[t]-dx[b])*derivative,dzx=(dz[r]-dz[l])*derivative,dzz=(dz[t]-dz[b])*derivative;
      this.displacement[i*4]=dx[i];this.displacement[i*4+1]=h[i];this.displacement[i*4+2]=dz[i];
      this.tangentX[i*4]=dxx;this.tangentX[i*4+1]=hx;this.tangentX[i*4+2]=dzx;
      this.tangentZ[i*4]=dxz;this.tangentZ[i*4+1]=hz;this.tangentZ[i*4+2]=dzz;
      const cross=(dxz+dzx)*0.5;
      this.compressionBound=Math.max(this.compressionBound,(Math.hypot(dxx-dzz,2*cross)-dxx-dzz)*0.5);
    }
    this.slopeVariance=slopeEnergy/count;
    this.heightVariance=heightEnergy/count;
    // Height and Dx occupy the real/imaginary outputs; Dz remains Hermitian.
    if(count!==this.fields[0].real.length) throw new Error('Invalid ocean field');
  }
  updateFoam(time:number,heightScale:number,horizontalScale:number) {
    const reset=heightScale!==this.foamScale||time<this.foamTime,dt=Number.isFinite(this.foamTime)?Math.min(Math.abs(time-this.foamTime),0.1):0;
    this.foamTime=time;this.foamScale=heightScale;
    for(let i=0;i<this.displacement.length;i+=4) {
      const xx=1+horizontalScale*this.tangentX[i],xz=horizontalScale*this.tangentZ[i],zx=horizontalScale*this.tangentX[i+2],zz=1+horizontalScale*this.tangentZ[i+2];
      const hx=heightScale*this.tangentX[i+1],hz=heightScale*this.tangentZ[i+1],jacobian=xx*zz-xz*zx;
      const slope=Math.hypot(hz*zx-zz*hx,xz*hx-hz*xx)/Math.max(jacobian,0.2);
      const breaking=Math.max((0.55-jacobian)*3.6,(slope-0.6)*2.2);
      this.displacement[i+3]=Math.max(reset?0:this.displacement[i+3]*Math.exp(-dt*0.85),Math.max(0,Math.min(1,breaking)));
    }
  }
  sample(x:number,z:number,channel=1,data=this.displacement) {
    const n=this.size,fx=((x/this.length*n)%n+n)%n,fz=((z/this.length*n)%n+n)%n,ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz;
    const a=data[(iz*n+ix)*4+channel],b=data[(iz*n+(ix+1)%n)*4+channel];
    const c=data[(((iz+1)%n)*n+ix)*4+channel],d=data[(((iz+1)%n)*n+(ix+1)%n)*4+channel];
    return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v;
  }
}

export class SpectralSea {
  readonly cascades=[new WaveCascade(128,433,173,0.85,36,433,1.8,-0.45),new WaveCascade(128,97,519,0.34,4,36,1.3),new WaveCascade(128,23.3,831,0.085,0.45,4,0.85)];
  time=0;
  private scale=1;
  private chopLimit=1;
  private initialized=false;
  horizontalScale=1;
  constructor(){this.update(0);}
  update(time:number,scale=1) {
    if(this.initialized&&time>=this.time&&time-this.time<1/30&&scale===this.scale)return false;
    this.initialized=true;
    this.time=time;this.scale=scale;this.cascades.forEach(c=>c.update(time));
    // Bound the summed symmetric compression before it inverts the surface.
    this.chopLimit=0.82/Math.max(this.cascades.reduce((sum,c)=>sum+c.compressionBound,0),0.001);
    this.horizontalScale=Math.min(scale,this.chopLimit);
    this.cascades.forEach(c=>c.updateFoam(time,scale,this.horizontalScale));return true;
  }
  heightAt(x:number,z:number,scale=1,envelope?:(x:number,z:number)=>number) {
    let qx=x,qz=z;const horizontal=Math.min(scale,this.chopLimit);
    // Shore gradients amplify inverse-map error; refine before sampling their envelope.
    for(let i=0;i<(envelope?12:3);i++) {
      let dx=0,dz=0;for(const c of this.cascades){dx+=c.sample(qx,qz,0);dz+=c.sample(qx,qz,2);}
      const nextX=x-dx*horizontal,nextZ=z-dz*horizontal,converged=Math.hypot(nextX-qx,nextZ-qz)<.000001;qx=nextX;qz=nextZ;if(envelope&&converged)break;
    }
    return this.cascades.reduce((h,c)=>h+c.sample(qx,qz),0)*scale*(envelope?.(qx,qz)??1);
  }
}
