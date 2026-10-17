/** Analytic slope of the centimetre-scale Kelvin detail used for reflections. */
export const wakeSurfaceCode=`
vec2 wakeSlope(vec2 local,float aft,float width,float speed,float time,vec2 direction) {
  if(aft<=0.0||speed<=0.5)return vec2(0);
  float end=max(time*speed,0.01),start=max(time*speed-2.0,0.0),span=end-start;
  float q=clamp((aft-start)/span,0.0,1.0),gate=1.0-q*q*(3.0-2.0*q);
  float envelope=exp(-aft/80.0)*smoothstep(0.5,3.0,speed),trail=envelope*gate;
  float trailDerivative=envelope*(-6.0*q*(1.0-q)/span-gate/80.0);
  float kelvin=abs(local.x)-width-aft*0.354,spread=3.0+aft*0.1;
  float crest=exp(-kelvin*kelvin/spread),phase=kelvin*1.7-aft*0.14-time*1.8;
  float wave=sin(phase),phaseSlope=cos(phase);
  // Differentiate the crest envelope and launch fade as well as the phase.
  float dx=0.035*trail*crest*sign(local.x)*(-2.0*kelvin/spread*wave+1.7*phaseSlope);
  float dz=0.035*crest*((trailDerivative+trail*(0.708*kelvin/spread+0.1*kelvin*kelvin/(spread*spread)))*wave-trail*0.7418*phaseSlope);
  return vec2(direction.x*dx+direction.y*dz,-direction.y*dx+direction.x*dz);
}
`;
