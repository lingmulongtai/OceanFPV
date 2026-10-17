/** A bounded photographed shelf contribution, not a refracted scene pass or measured water calibration. */
export const waterOpticsCode=`
uniform sampler2D seabedMap;
uniform bool hasSeabedMap;
vec3 coastalWaterRadiance(vec2 p,vec3 bottom,float depth,vec3 view,vec3 sun,vec3 sunlight,vec3 diffuseLight) {
  // Upwelling follows smooth incident illumination, rather than emitting a fixed colour.
  // web-ocean's coastal chromaticity, normalized to this scene's original albedo luminance.
  vec3 deep=vec3(0.00933,0.04665,0.05598)*diffuseLight;
  // The synthetic island skirts stop at 9m: fade this proxy before its square boundary.
  float confidence=1.0-smoothstep(4.0,8.0,depth);
  if(confidence<=0.0)return deep;
  vec3 bedNormal=normalize(vec3(-bottom.y,1.0,-bottom.z)),bed=vec3(0.12,0.13,0.12);
  if(hasSeabedMap) {
    vec3 point=vec3(p.x,bottom.x,p.y),w=pow(abs(bedNormal),vec3(4.0));w/=dot(w,vec3(1.0));
    bed=texture2D(seabedMap,point.zy/2.0).rgb*w.x+texture2D(seabedMap,point.xz/2.0).rgb*w.y+texture2D(seabedMap,point.xy/2.0).rgb*w.z;
  }
  float viewCos=sqrt(1.0-clamp(1.0-view.y*view.y,0.0,1.0)/(1.333*1.333));
  float sunCos=sqrt(1.0-clamp(1.0-sun.y*sun.y,0.0,1.0)/(1.333*1.333));
  vec3 transmission=exp(-vec3(0.45,0.12,0.07)*depth*(1.0/viewCos+1.0/sunCos))*confidence;
  vec3 bedRadiance=bed*sunlight*(0.18+0.42*max(dot(bedNormal,sun),0.0));
  return mix(deep,bedRadiance,transmission);
}
`;
