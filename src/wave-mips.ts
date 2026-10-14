/** Averaged displacement/tangent fields; level zero remains the contact field. */
export class WaveMipmaps {
  readonly levels:{data:Float32Array;width:number;height:number}[];
  readonly energy:Float64Array;
  readonly crossEnergy:Float64Array;
  private readonly crossScratch:Float64Array;
  constructor(data:Float32Array,size:number) {
    if(size<2||(size&(size-1))||data.length!==size*size*4)throw new Error('Wave mipmaps require a square power-of-two RGBA field');
    this.levels=[{data,width:size,height:size}];
    for(let width=size/2;width>=1;width/=2)this.levels.push({data:new Float32Array(width*width*4),width,height:width});
    this.energy=new Float64Array(this.levels.length);this.crossEnergy=new Float64Array(this.levels.length);
    this.crossScratch=new Float64Array(size*size/2);
    this.update();
  }
  update() {
    for(let level=1;level<this.levels.length;level++) {
      const source=this.levels[level-1],target=this.levels[level],n=target.width;
      for(let z=0;z<n;z++)for(let x=0;x<n;x++) {
        const a=(z*2*source.width+x*2)*4,b=a+4,c=a+source.width*4,d=c+4,out=(z*n+x)*4;
        for(let channel=0;channel<4;channel++)target.data[out+channel]=(source.data[a+channel]+source.data[b+channel]+source.data[c+channel]+source.data[d+channel])*0.25;
      }
    }
    for(const [level,{data,width:n}]of this.levels.entries()) {
      let energy=0;
      for(let z=0;z<n;z++)for(let x=0;x<n;x++) {
        const nextZ=(z+1)%n,nextX=(x+1)%n,a=data[(z*n+x)*4+1],b=data[(z*n+nextX)*4+1],c=data[(nextZ*n+x)*4+1],d=data[(nextZ*n+nextX)*4+1];
        // Exact integral of the squared bilinear field over this periodic cell.
        energy+=a*a+b*b+c*c+d*d+a*b+a*c+b*d+c*d+0.5*(a*d+b*c);
      }
      this.energy[level]=energy/(9*n*n);
      if(level===this.levels.length-1){this.crossEnergy[level]=this.energy[level];continue;}
      const coarse=this.levels[level+1],m=coarse.width,mask=n-1;let cross=0;
      // Fold neighbouring cell integrals into a separable, phase-centred kernel.
      for(let z=0;z<n;z++)for(let x=0;x<m;x++) {
        let filtered=0;
        for(let tap=0;tap<6;tap++)filtered+=data[(z*n+((2*x+tap-2)&mask))*4+1]*CROSS_KERNEL[tap];
        this.crossScratch[z*m+x]=filtered;
      }
      for(let z=0;z<m;z++)for(let x=0;x<m;x++) {
        let filtered=0;
        for(let tap=0;tap<6;tap++)filtered+=this.crossScratch[((2*z+tap-2)&mask)*m+x]*CROSS_KERNEL[tap];
        cross+=coarse.data[(z*m+x)*4+1]*filtered;
      }
      this.crossEnergy[level]=cross/(m*m);
    }
  }
}

// Fine/coarse bilinear covariance: integral hats folded around the half-texel centre.
const CROSS_KERNEL=Float64Array.from([1,25,70,70,25,1],value=>value/192);

export function retainedWaveEnergy(mips:WaveMipmaps,lod:number) {
  lod=Math.max(0,Math.min(mips.levels.length-1,lod));const low=Math.floor(lod),high=Math.min(low+1,mips.levels.length-1),f=lod-low;
  return (1-f)**2*mips.energy[low]+2*f*(1-f)*mips.crossEnergy[low]+f*f*mips.energy[high];
}

/** Match repeat-wrapped texture sampling, including the common base-level UV offset. */
export function sampleWaveMip(mips:WaveMipmaps,u:number,v:number,lod:number,channel:number) {
  const sample=(level:number)=> {
    const {data,width:n}=mips.levels[level],px=u*n-0.5,pz=v*n-0.5,x=Math.floor(px),z=Math.floor(pz),fx=px-x,fz=pz-z;
    const read=(dx:number,dz:number)=>data[((((z+dz)%n+n)%n)*n+((x+dx)%n+n)%n)*4+channel];
    return (read(0,0)*(1-fx)+read(1,0)*fx)*(1-fz)+(read(0,1)*(1-fx)+read(1,1)*fx)*fz;
  };
  lod=Math.max(0,Math.min(mips.levels.length-1,lod));const low=Math.floor(lod),high=Math.min(low+1,mips.levels.length-1),blend=lod-low;
  return sample(low)*(1-blend)+sample(high)*blend;
}
