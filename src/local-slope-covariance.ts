/** First-order LEAN statistics; independent bands omit cross-band correlations. */
export const slopeCovarianceMathCode=`
vec3 boundedSlopeCovariance(vec3 moment,vec2 mean) {
  vec2 variance=max(moment.xy-mean*mean,vec2(0.0));
  float bound=sqrt(variance.x*variance.y);
  return vec3(variance,clamp(moment.z-mean.x*mean.y,-bound,bound));
}
vec3 deformedSlopeCovariance(vec3 covariance,mat2 deformation) {
  float det=max(determinant(deformation),0.0001);
  mat2 inverseTranspose=mat2(deformation[1][1],-deformation[1][0],-deformation[0][1],deformation[0][0])/det;
  mat2 source=mat2(covariance.x,covariance.z,covariance.z,covariance.y);
  mat2 result=inverseTranspose*source*transpose(inverseTranspose);
  return vec3(max(result[0][0],0.0),max(result[1][1],0.0),result[0][1]);
}
`;

export const localSlopeCovarianceCode=`
uniform bool localSlopeMomentsEnabled;
${slopeCovarianceMathCode}
vec3 localSlopeCovarianceAt(vec2 p,vec3 lod) {
  vec2 a=cascadeUV(p,433.0),b=cascadeUV(p,97.0),c=cascadeUV(p,23.3);
  // Use the same explicit interpolation for the means and their second moments.
  vec3 ax=fieldSampleLod(tangentX0,a,lod.x,true).xyz,az=fieldSampleLod(tangentZ0,a,lod.x,true).xyz;
  vec3 bx=fieldSampleLod(tangentX1,b,lod.y,true).xyz,bz=fieldSampleLod(tangentZ1,b,lod.y,true).xyz;
  vec3 cx=fieldSampleLod(tangentX2,c,lod.z,true).xyz,cz=fieldSampleLod(tangentZ2,c,lod.z,true).xyz;
  vec3 covariance=boundedSlopeCovariance(slopeMomentSample(a,0,lod.x),vec2(ax.y,az.y))*heightScales.x*heightScales.x
    +boundedSlopeCovariance(slopeMomentSample(b,1,lod.y),vec2(bx.y,bz.y))*heightScales.y*heightScales.y
    +boundedSlopeCovariance(slopeMomentSample(c,2,lod.z),vec2(cx.y,cz.y))*heightScales.z*heightScales.z;
  vec3 tx=vec3(1,0,0)+scaleBands(ax,bx,cx,1.0),tz=vec3(0,0,1)+scaleBands(az,bz,cz,1.0);
  return deformedSlopeCovariance(covariance,mat2(tx.xz,tz.xz));
}
vec3 localSpectralCovarianceAt(vec2 p,vec3 lod) {
  float variance=spectralVarianceAt(p,lod);vec3 fallback=vec3(variance,variance,0.0);if(!localSlopeMomentsEnabled)return fallback;
  vec3 coast=nearshoreAt(p);
  // Preserve the coastal height/gradient approximation, with a continuous return offshore.
  float blend=(1.0-smoothstep(0.0,0.03,abs(coast.x-1.0)))*(1.0-smoothstep(0.0,0.002,length(coast.yz)));
  if(blend<=0.0)return fallback;
  vec3 covariance=localSlopeCovarianceAt(p,lod);
  return mix(fallback,covariance*coast.x*coast.x,blend);
}
float localSpectralVarianceAt(vec2 p,vec3 lod) {
  vec3 covariance=localSpectralCovarianceAt(p,lod);return 0.5*(covariance.x+covariance.y);
}
`;
