import {BATHY_SIZE} from './bathymetry';

/** Bounded artistic shelf amplification and waterline attenuation; not wave refraction. */
export function nearshoreEnvelope(depth:number) {
  const wet=Math.max(0,Math.min(1,depth/2)),shelf=Math.max(0,Math.min(1,(depth-3)/5));
  const w=wet*wet*(3-2*wet),s=1-shelf*shelf*(3-2*shelf);
  return {value:w*(1+0.3*s),derivative:3*wet*(1-wet)*(1+0.3*s)-w*0.36*shelf*(1-shelf)};
}

export const nearshoreCode=`
uniform sampler2D bathymetry;
uniform vec4 islands[4];
vec4 bottomAt(vec2 uv) {
  vec2 pixel=uv*${BATHY_SIZE-1}.0,base=min(floor(pixel),vec2(${BATHY_SIZE-2}.0)),f=pixel-base,a=(base+0.5)/${BATHY_SIZE}.0;
  vec4 h=texture2D(bathymetry,a),b=texture2D(bathymetry,a+vec2(0,1.0/${BATHY_SIZE}.0)),d=texture2D(bathymetry,a+vec2(1.0/${BATHY_SIZE}.0,0));
  if(f.x+f.y<=1.0)return h+(b-h)*f.y+(d-h)*f.x;
  vec4 c=texture2D(bathymetry,a+vec2(1.0/${BATHY_SIZE}.0));return c+(b-c)*(1.0-f.x)+(d-c)*(1.0-f.y);
}
vec3 coastalBottom(vec2 p) {
  vec3 result=vec3(-60.0,0,0);
  for(int i=0;i<3;i++) {
    vec2 uv=(p-islands[i].xy)/(islands[i].z*2.4)+0.5;
    if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))continue;
    vec2 pixel=uv*${BATHY_SIZE-1}.0,base=min(floor(pixel),vec2(${BATHY_SIZE-2}.0)),f=pixel-base,a=(base+0.5)/${BATHY_SIZE}.0;
    float h=texture2D(bathymetry,a)[i],b=texture2D(bathymetry,a+vec2(0,1.0/${BATHY_SIZE}.0))[i],d=texture2D(bathymetry,a+vec2(1.0/${BATHY_SIZE}.0,0))[i];
    float height;vec2 gradient;
    if(f.x+f.y<=1.0){height=h+(b-h)*f.y+(d-h)*f.x;gradient=vec2(d-h,b-h);}
    else {float c=texture2D(bathymetry,a+vec2(1.0/${BATHY_SIZE}.0))[i];height=c+(b-c)*(1.0-f.x)+(d-c)*(1.0-f.y);gradient=vec2(c-b,c-d);}
    if(height>result.x)result=vec3(height,gradient*${BATHY_SIZE-1}.0/(islands[i].z*2.4));
  }
  return result;
}
// Source coordinates match the CPU's inverse-displacement contact sampling.
vec3 nearshoreAt(vec2 p) {
  vec3 bottom=coastalBottom(p);float depth=-bottom.x;
  float wet=clamp(depth/2.0,0.0,1.0),shelf=clamp((depth-3.0)/5.0,0.0,1.0);
  float w=wet*wet*(3.0-2.0*wet),s=1.0-shelf*shelf*(3.0-2.0*shelf);
  float derivative=3.0*wet*(1.0-wet)*(1.0+0.3*s)-w*0.36*shelf*(1.0-shelf);
  return vec3(w*(1.0+0.3*s),-derivative*bottom.yz);
}
`;
