/** Gaussian slope glints and anisotropic Smith approximation adapted from web-ocean (MIT). */
export const anisotropicGlintCode=`
mat3 slopeNormalFrame(vec3 normal) {
  vec3 tangent=normalize(vec3(normal.y,-normal.x,0.0));
  return mat3(tangent,normal,cross(tangent,normal));
}
vec3 slopeFrameDirection(mat3 frame,vec3 direction) {
  return vec3(dot(frame[0],direction),dot(frame[1],direction),dot(frame[2],direction));
}
vec3 slopeFrameCovariance(mat3 frame,vec3 covariance) {
  // Linearize world height slopes about the resolved normal. At X tilt theta,
  // the two slope axes scale by cos(theta)^2 and cos(theta), respectively.
  vec2 x=frame[0].xz*frame[1].y,z=frame[2].xz*frame[1].y;
  vec2 cx=vec2(covariance.x*x.x+covariance.z*x.y,covariance.z*x.x+covariance.y*x.y);
  vec2 cz=vec2(covariance.x*z.x+covariance.z*z.y,covariance.z*z.x+covariance.y*z.y);
  return vec3(dot(x,cx),dot(z,cz),dot(x,cz));
}
float gaussianSlopeDistribution(vec3 halfVector,vec3 covariance) {
  if(halfVector.y<=0.0)return 0.0;
  vec2 delta=-halfVector.xz/halfVector.y;
  float det=max(covariance.x*covariance.y-covariance.z*covariance.z,0.0000000001);
  float exponent=(delta.x*delta.x*covariance.y+delta.y*delta.y*covariance.x-2.0*delta.x*delta.y*covariance.z)/det;
  float density=exp(-0.5*exponent)/(6.28318530718*sqrt(det));
  float h2=halfVector.y*halfVector.y;return density/max(h2*h2,0.000000000001);
}
float gaussianSlopeLambda(vec3 direction,vec3 covariance) {
  float horizontal=max(dot(direction.xz,direction.xz),0.00000001),inverseLength=inversesqrt(horizontal);
  vec2 azimuth=direction.xz*inverseLength;
  float variance=azimuth.x*azimuth.x*covariance.x+azimuth.y*azimuth.y*covariance.y+2.0*azimuth.x*azimuth.y*covariance.z;
  float a=direction.y*inverseLength/sqrt(2.0*max(variance,0.0000001));
  if(a>=1.6)return 0.0;
  return max(0.0,(1.0-1.259*a+0.396*a*a)/(3.535*a+2.181*a*a));
}
float gaussianSlopeMasking(vec3 view,vec3 light,vec3 covariance) {
  if(view.y<=0.0||light.y<=0.0)return 0.0;
  return 1.0/(1.0+gaussianSlopeLambda(view,covariance)+gaussianSlopeLambda(light,covariance));
}
`;
