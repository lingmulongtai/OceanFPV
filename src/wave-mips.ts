/** Averaged displacement/tangent fields; level zero remains the contact field. */
export class WaveMipmaps {
  readonly levels:{data:Float32Array;width:number;height:number}[];
  readonly energy:Float64Array;
  readonly crossEnergy:Float64Array;
  constructor(data:Float32Array,size:number) {
    if(size<2||(size&(size-1))||data.length!==size*size*4)throw new Error('Wave mipmaps require a square power-of-two RGBA field');
    this.levels=[{data,width:size,height:size}];
    for(let width=size/2;width>=1;width/=2)this.levels.push({data:new Float32Array(width*width*4),width,height:width});
    this.energy=new Float64Array(this.levels.length);this.crossEnergy=new Float64Array(this.levels.length);
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
      const coarse=this.levels[level+1],m=coarse.width;let cross=0;
      for(let z=0;z<m;z++)for(let x=0;x<m;x++) {
        const a=coarse.data[(z*m+x)*4+1],b=coarse.data[(z*m+(x+1)%m)*4+1],c=coarse.data[(((z+1)%m)*m+x)*4+1],d=coarse.data[(((z+1)%m)*m+(x+1)%m)*4+1];
        for(let dz=0;dz<4;dz++)for(let dx=0;dx<4;dx++) {
          const i=dz*4+dx,fine=data[(((z*2+dz)%n)*n+(x*2+dx)%n)*4+1];
          cross+=fine*(a*CROSS_WEIGHTS[0][i]+b*CROSS_WEIGHTS[1][i]+c*CROSS_WEIGHTS[2][i]+d*CROSS_WEIGHTS[3][i]);
        }
      }
      this.crossEnergy[level]=cross/(4*m*m);
    }
  }
}

// Integrals of fine interpolation hats against the coarse left/right hats.
// Coarse centres are halfway between fine centres after the 2x2 average.
const LEFT=[11/96,59/96,25/96,1/96],RIGHT=[1/96,25/96,59/96,11/96];
const CROSS_WEIGHTS=Array.from({length:4},(_,corner)=>Float64Array.from({length:16},(_,i)=>(corner%2?RIGHT:LEFT)[i%4]*(corner<2?LEFT:RIGHT)[Math.floor(i/4)]));

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
