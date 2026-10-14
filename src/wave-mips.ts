/** Averaged displacement/tangent fields; level zero remains the contact field. */
export class WaveMipmaps {
  readonly levels:{data:Float32Array;width:number;height:number}[];
  constructor(data:Float32Array,size:number) {
    if(size<2||(size&(size-1))||data.length!==size*size*4)throw new Error('Wave mipmaps require a square power-of-two RGBA field');
    this.levels=[{data,width:size,height:size}];
    for(let width=size/2;width>=1;width/=2)this.levels.push({data:new Float32Array(width*width*4),width,height:width});
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
  }
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
