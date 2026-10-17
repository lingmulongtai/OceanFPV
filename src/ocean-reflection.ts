import * as T from 'three';

/** Capture premultiplied object radiance and coverage without baking the flat sky into it. */
export function captureReflectedGeometry<Result>(renderer:T.WebGLRenderer,scene:T.Scene,capture:()=>Result):Result {
  const background=scene.background,color=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha(),clear=renderer.clear;
  scene.background=null;
  // Keep logical clear state intact across nested transmission passes. Only the
  // actual clears use transparent black, including Three's white CSS substitute.
  renderer.clear=(colorBuffer=true,depth=true,stencil=true)=>{
    const previous=renderer.getClearColor(new T.Color()),opacity=renderer.getClearAlpha();renderer.setClearColor(0,0);
    try{clear.call(renderer,colorBuffer,depth,stencil);}finally{renderer.setClearColor(previous,opacity);}
  };
  try{return capture();}finally{renderer.clear=clear;scene.background=background;renderer.setClearColor(color,alpha);}
}

export const oceanReflectionCode=`
vec3 seaReflection(vec3 view,vec3 normal,float variance,vec3 normalFootprint,vec2 coordinate,float lod) {
  vec4 planar=textureLod(mirrorSampler,clamp(coordinate,0.001,0.999),lod);
  if(!hasFoamEnvironment)return planar.rgb;
  float roughness=pow(pow(0.12,4.0)+min(0.2,variance+0.15*dot(normalFootprint,normalFootprint)),0.25);
  vec3 direction=skyReflectionRotation*reflect(-view,normal);
  vec3 sky=textureCubeUV(foamEnvironment,direction,roughness).rgb*skyReflectionIntensity;
  float valid=step(0.001,coordinate.x)*step(coordinate.x,0.999)*step(0.001,coordinate.y)*step(coordinate.y,0.999);
  return sky*(1.0-clamp(planar.a,0.0,1.0)*valid)+planar.rgb*valid;
}
// Fade toward the visible sky along the horizon, as in web-ocean's aerial perspective.
vec3 seaAerialPerspective(vec3 color,vec3 view,float distanceToEye,float dusk) {
  float haze=1.0-exp(-distanceToEye*0.0001);
  vec3 horizonColor=mix(vec3(0.45,0.62,0.72),vec3(0.62,0.45,0.32),dusk);
  if(hasFoamEnvironment) {
    vec3 horizon=normalize(vec3(-view.x,0.002,-view.z));
    horizonColor=textureCubeUV(foamEnvironment,skyReflectionRotation*horizon,0.0).rgb*skyReflectionIntensity;
  }
  return mix(color,horizonColor,haze);
}
`;
