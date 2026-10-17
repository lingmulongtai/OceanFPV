import * as T from 'three';

type SlopeBand={size:number;tangentX:Float32Array;tangentZ:Float32Array};
/** LEAN second moments, with one array layer per independent FFT band. */
export class SlopeMoments {
  readonly data:Uint16Array;
  readonly texture:T.DataArrayTexture;
  readonly size:number;
  constructor(private readonly bands:readonly SlopeBand[]) {
    const size=bands[0]?.size??0;
    if(size<2||(size&(size-1))||bands.length!==3||bands.some(b=>b.size!==size||b.tangentX.length!==size*size*4||b.tangentZ.length!==size*size*4))throw new Error('Slope moments require three matching power-of-two RGBA fields');
    this.size=size;this.data=new Uint16Array(size*size*4*bands.length);
    this.texture=new T.DataArrayTexture(this.data,size,size,bands.length);this.texture.type=T.HalfFloatType;this.texture.internalFormat='RGBA16F';
    this.texture.wrapS=this.texture.wrapT=T.RepeatWrapping;this.texture.magFilter=T.LinearFilter;
    this.texture.generateMipmaps=true;this.texture.minFilter=T.LinearMipmapLinearFilter;this.update();
  }
  configureMipmaps(enabled:boolean) {
    if(this.texture.generateMipmaps===enabled)return;
    this.texture.generateMipmaps=enabled;this.texture.minFilter=enabled?T.LinearMipmapLinearFilter:T.LinearFilter;this.texture.needsUpdate=true;
  }
  update() {
    for(const [band,source]of this.bands.entries()) {
      const offset=band*this.size*this.size*4;
      for(let i=0;i<source.tangentX.length;i+=4) {
        const x=source.tangentX[i+1],z=source.tangentZ[i+1];
        this.data[offset+i]=T.DataUtils.toHalfFloat(x*x);this.data[offset+i+1]=T.DataUtils.toHalfFloat(z*z);this.data[offset+i+2]=T.DataUtils.toHalfFloat(x*z);
      }
    }
    this.texture.needsUpdate=true;
  }
}

/** Explicit filtering avoids vendor-dependent half-float trilinear interpolation. */
export const slopeMomentSampleCode=`
precision highp sampler2DArray;
uniform sampler2DArray localSlopeMoments;
vec3 slopeMomentLevel(vec2 uv,int band,int level) {
  ivec2 size=textureSize(localSlopeMoments,level).xy;
  vec2 point=uv*vec2(size)-0.5,weight=fract(point);
  ivec2 base=(ivec2(floor(point))%size+size)%size,next=(base+ivec2(1))%size;
  vec3 a=texelFetch(localSlopeMoments,ivec3(base,band),level).rgb;
  vec3 b=texelFetch(localSlopeMoments,ivec3(next.x,base.y,band),level).rgb;
  vec3 c=texelFetch(localSlopeMoments,ivec3(base.x,next.y,band),level).rgb;
  vec3 d=texelFetch(localSlopeMoments,ivec3(next,band),level).rgb;
  return mix(mix(a,b,weight.x),mix(c,d,weight.x),weight.y);
}
vec3 slopeMomentSample(vec2 uv,int band,float lod) {
  int last=int(log2(float(textureSize(localSlopeMoments,0).x)));
  lod=clamp(lod,0.0,float(last));int low=int(floor(lod)),high=min(low+1,last);
  vec3 a=slopeMomentLevel(uv,band,low);if(lod==float(low))return a;
  return mix(a,slopeMomentLevel(uv,band,high),fract(lod));
}
`;
