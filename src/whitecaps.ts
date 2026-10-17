/** Integrate the final whitecap coverage, retaining cascade max and noise correlation. */
export const whitecapCode=`
uniform bool whitecapFiltering;
float whitecapPoint(vec2 q,vec2 p) {
  float a=fieldSample(displacement0,cascadeUV(q,433.0)).w,b=fieldSample(displacement1,cascadeUV(q,97.0)).w,c=fieldSample(displacement2,cascadeUV(q,23.3)).w;
  float modulation=foamNoise(p*0.53+vec2(time*0.12,-time*0.09));
  return smoothstep(0.12,0.8,max(max(a,b),c))*smoothstep(0.42,0.76,modulation);
}
float whitecapFootprint(vec2 q,vec2 p,vec2 qdx,vec2 qdy,vec2 pdx,vec2 pdy) {
  float footprint=max(length(qdx),length(qdy)),point=whitecapPoint(q,p);
  const float cell=23.3/128.0;
  if(!whitecapFiltering||footprint<=cell*0.5)return point;
  float sum=0.0;
  for(int y=0;y<4;y++)for(int x=0;x<4;x++) {
    vec2 offset=(vec2(float(x),float(y))+0.5)/4.0-0.5;
    sum+=whitecapPoint(q+qdx*offset.x+qdy*offset.y,p+pdx*offset.x+pdy*offset.y);
  }
  return mix(point,sum/16.0,smoothstep(cell*0.5,cell,footprint));
}
`;
