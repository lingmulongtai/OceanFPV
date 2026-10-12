// Shared radiance for the visible sky, ocean reflection and lower-hemisphere probe.
// Every division and normalization is guarded; a zenith NaN would poison the probe.
uniform sampler3D cloud_noise : repeat_enable, filter_linear;
uniform vec3 sun_direction = vec3(-0.45,0.42,-0.72);
uniform vec3 sun_color : source_color = vec3(1.0,0.91,0.75);
uniform float sun_energy = 4.0;
uniform float simulation_time = 0.0;
uniform float cloud_cover = 0.52;
uniform float dusk = 0.0;
uniform bool clouds_enabled = true;

float cloud_field(vec3 p) {
 float n=texture(cloud_noise,p*0.00062).r;
 float detail=texture(cloud_noise,p*0.0021+vec3(0.1)).r;
 float height=clamp((p.y-1200.0)/700.0,0.0,1.0);
 float profile=smoothstep(0.0,0.20,height)*(1.0-smoothstep(0.68,1.0,height));
 return max(n*0.80+detail*0.20-(1.0-cloud_cover),0.0)*profile*0.006;
}
vec3 sky_radiance(vec3 ray) {
 vec3 d=ray/max(length(ray),0.0001);
 float horizon=pow(1.0-clamp(d.y,0.0,1.0),3.0);
 vec3 zenith=mix(vec3(0.19,0.36,0.58),vec3(0.06,0.10,0.22),dusk);
 vec3 horizon_color=mix(vec3(0.64,0.76,0.84),vec3(0.88,0.38,0.15),dusk);
 vec3 sky=mix(zenith,horizon_color,horizon);
 float mu=clamp(dot(d,sun_direction),-1.0,1.0);
 sky+=sun_color*(pow(max(mu,0.0),32.0)*0.17+pow(max(mu,0.0),800.0)*0.8);
 sky+=sun_color*sun_energy*12.0*smoothstep(cos(0.006),cos(0.0038),mu);
 if(clouds_enabled && d.y>0.012) {
  // Volumetric slab, 8 samples. Lighting approximates scattering rather than a painted dome.
  float start=1200.0/max(d.y,0.02),step_length=700.0/max(d.y,0.035)/8.0;
  float transmittance=1.0;vec3 radiance=vec3(0.0);
  for(int i=0;i<8;i++) {
   vec3 p=d*(start+(float(i)+0.5)*step_length)+vec3(simulation_time*5.0,0.0,simulation_time*1.5);
   float density=cloud_field(p);
   float optical=exp(-density*step_length);
   float light=exp(-cloud_field(p+sun_direction*180.0)*150.0);
   vec3 lit=mix(vec3(0.27,0.34,0.41),sun_color*1.05,light);
   lit=mix(lit,lit*vec3(1.1,0.72,0.55),dusk*0.55);
   radiance+=transmittance*(1.0-optical)*lit;
   transmittance*=optical;
  }
  sky=sky*transmittance+radiance;
 }
 return max(sky,vec3(0.0));
}
