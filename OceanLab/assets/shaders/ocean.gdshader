shader_type spatial;
render_mode world_vertex_coords, unshaded, cull_disabled, fog_disabled;
#include "res://assets/shaders/atmosphere.gdshaderinc"

uniform bool use_fft = false;
uniform sampler2DArray displacements : repeat_enable, filter_linear;
uniform sampler2DArray normals : repeat_enable, filter_linear_mipmap;
uniform sampler2DArray moments : repeat_enable, filter_linear_mipmap;
uniform sampler2DArray foam0 : repeat_disable, filter_linear;
uniform sampler2DArray foam1 : repeat_disable, filter_linear;
uniform sampler2DArray wake_a : repeat_disable, filter_linear;
uniform sampler2DArray wake_b : repeat_disable, filter_linear;
uniform int foam_ping = 0;
uniform vec2 foam_origin0 = vec2(0.0);
uniform vec2 foam_origin1 = vec2(0.0);
uniform vec4 map_scales[5];
uniform vec4 analytic_waves[16];
uniform float analytic_frequencies[16];
uniform vec3 absorption = vec3(0.35,0.07,0.025);
uniform vec3 backscatter = vec3(0.0012,0.0040,0.0060);
uniform bool foam_enabled = true;
uniform bool wake_enabled = true;
uniform int debug_view = 0;
uniform sampler2D planar_reflection : repeat_disable, filter_linear;
uniform mat4 planar_matrix;
uniform bool planar_enabled = false;
uniform float base_roughness = 0.115;
uniform vec3 ship_position = vec3(0.0);
uniform vec2 ship_forward = vec2(0.0,-1.0);
uniform float ship_speed = 0.0;
varying vec3 surface_position;
varying float wave_height;

float hash2(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float foam_detail(vec2 p) {
 vec2 q=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(hash2(q),hash2(q+vec2(1,0)),f.x),mix(hash2(q+vec2(0,1)),hash2(q+vec2(1,1)),f.x),f.y);
}
vec4 clip_sample(sampler2DArray tex,vec2 world) {
 vec2 near_uv=(world-foam_origin0)/420.0+0.5;
 vec2 far_uv=(world-foam_origin1)/3200.0+0.5;
 float edge=max(abs(near_uv.x-0.5),abs(near_uv.y-0.5))*2.0;
 float near_weight=1.0-smoothstep(0.73,0.96,edge);
 vec4 a=vec4(0.0),b=vec4(0.0);
 if(all(greaterThanEqual(near_uv,vec2(0)))&&all(lessThanEqual(near_uv,vec2(1)))) a=texture(tex,vec3(near_uv,0));
 if(all(greaterThanEqual(far_uv,vec2(0)))&&all(lessThanEqual(far_uv,vec2(1)))) b=texture(tex,vec3(far_uv,1));
 return mix(b,a,near_weight);
}
void vertex() {
 UV=VERTEX.xz;
 vec3 d=vec3(0.0);
 if(use_fft) {
  for(int i=0;i<5;i++) d+=textureLod(displacements,vec3(UV*map_scales[i].xy,float(i)),0.0).xyz*map_scales[i].z;
  if(wake_enabled) d.y+=clip_sample(wake_a,UV).r;
 } else {
  for(int i=0;i<16;i++) {
   vec4 w=analytic_waves[i];float phase=dot(w.xy,UV)-analytic_frequencies[i]*simulation_time+w.w;
   d.y+=w.z*sin(phase);
  }
 }
 VERTEX+=d;
 surface_position=VERTEX;
 wave_height=d.y;
}
void fragment() {
 vec2 slope=vec2(0.0);float variance=0.0,breaking=0.0;
 if(use_fft) {
  for(int i=0;i<5;i++) {
   vec3 coords=vec3(UV*map_scales[i].xy,float(i));
   vec4 n=texture(normals,coords),m=texture(moments,coords);
   slope+=n.xy*map_scales[i].w;
   // LEADR-inspired slope moment filtering: E[s²]-E[s]² survives every mip.
   variance+=dot(max(m.zw-m.xy*m.xy,vec2(0.0)),vec2(1.0))*map_scales[i].w*map_scales[i].w;
   breaking+=n.a;
  }
 } else {
  for(int i=0;i<16;i++) {
   vec4 w=analytic_waves[i];float phase=dot(w.xy,UV)-analytic_frequencies[i]*simulation_time+w.w;
   slope+=w.xy*w.z*cos(phase);
  }
  breaking=smoothstep(0.22,0.50,length(slope));
 }
 vec3 normal=normalize(vec3(-slope.x,1.0,-slope.y));
 vec3 view=normalize(CAMERA_POSITION_WORLD-surface_position);
 vec3 reflection=reflect(-view,normal);
 reflection.y=abs(reflection.y);
 float nv=max(dot(normal,view),0.001);
 float fresnel=0.02+0.98*pow(1.0-nv,5.0); // Air/water F0=0.02, Schlick.
 vec4 foam_state=vec4(0.0),wake=vec4(0.0);
 if(use_fft) {
  if(foam_ping==0) foam_state=clip_sample(foam0,surface_position.xz);
  else foam_state=clip_sample(foam1,surface_position.xz);
  wake=clip_sample(wake_b,surface_position.xz);
 } else {
  foam_state.r=breaking*0.32;
  vec2 p=surface_position.xz-ship_position.xz;
  float behind=-dot(p,ship_forward),side=abs(p.x*ship_forward.y-p.y*ship_forward.x);
  float trail=smoothstep(1.0,8.0,behind)*exp(-max(behind,0.0)/250.0)*smoothstep(0.5,4.0,ship_speed);
  float kelvin=exp(-pow((side-max(behind,0.0)*0.35355339)/(1.3+behind*0.018),2.0));
  float core=exp(-pow(side/(3.5+behind*0.035),2.0));
  wake=vec4((kelvin*0.45+core)*trail,core*trail,core*trail*0.45,0);
  foam_state.r+=wake.r;
 }
 float detail=foam_detail(surface_position.xz*0.48)*0.6+foam_detail(surface_position.xz*1.5)*0.4;
 float foam=smoothstep(0.09,0.82,foam_state.r*(0.50+detail*1.25));
 foam*=float(foam_enabled);
 vec3 sky=sky_radiance(reflection);
 if(planar_enabled) {
  vec4 q=planar_matrix*vec4(surface_position,1.0);
  vec2 uv=q.xy/max(q.w,0.001)*0.5+0.5;uv.y=1.0-uv.y;
  uv+=normal.xz*0.015;
  if(all(greaterThan(uv,vec2(0)))&&all(lessThan(uv,vec2(1)))) {
   vec4 planar=texture(planar_reflection,uv);sky=mix(sky,planar.rgb,planar.a*0.45);
  }
 }
 // Semi-infinite water: body radiance from absorption + backscattering coefficients.
 vec3 body=backscatter/max(absorption+backscatter,vec3(0.00001));
 body*=mix(vec3(0.52,0.64,0.76),sun_color*0.5,dusk);
 float back_light=pow(max(dot(-view,sun_direction),0.0),4.0);
 body+=backscatter*max(wave_height+1.0,0.0)*back_light*sun_color*4.0;
 float shadow=1.0;
 if(clouds_enabled) {
  vec3 cloud_point=vec3(surface_position.x+simulation_time*5.0,1450.0,surface_position.z+simulation_time*1.5);
  cloud_point.xz+=sun_direction.xz*1450.0/max(sun_direction.y,0.05);
  shadow=exp(-cloud_field(cloud_point)*450.0);
 }
 float alpha=clamp(sqrt(base_roughness*base_roughness+variance*0.45),0.045,0.6);
 alpha=mix(alpha,0.045,wake.g*0.55);
 vec3 half_vector=normalize(view+sun_direction);
 float nh=max(dot(normal,half_vector),0.0),nl=max(dot(normal,sun_direction),0.001);
 float a2=alpha*alpha,denom=nh*nh*(a2-1.0)+1.0;
 float distribution=a2/max(PI*denom*denom,0.00001);
 float masking=(2.0*nv)/(nv+sqrt(a2+(1.0-a2)*nv*nv));
 masking*=(2.0*nl)/(nl+sqrt(a2+(1.0-a2)*nl*nl));
 vec3 sun_glint=sun_color*sun_energy*0.11*fresnel*distribution*masking/(4.0*nv)*shadow;
 vec3 water=(body*(1.0-fresnel)+sky*fresnel+sun_glint)*(1.0-foam*0.90);
 vec3 foam_color=mix(vec3(0.57,0.66,0.71),vec3(0.90,0.93,0.90),shadow);
 water+=foam_color*foam;
 water+=vec3(0.015,0.05,0.055)*wake.b;
 float distance_to_camera=length(CAMERA_POSITION_WORLD-surface_position);
 float mist=1.0-exp(-distance_to_camera*0.00014);
 water=mix(water,sky_radiance(normalize(vec3(view.x,0.015,view.z))),mist);
 if(debug_view==1) water=normal*0.5+0.5;
 if(debug_view==2) water=foam_state.rgb;
 if(debug_view==3) water=vec3(fract(UV.x/97.0),fract(UV.y/433.0),fract(UV.x/2003.0));
 if(debug_view==4) water=vec3(breaking,variance*4.0,0.0);
 if(debug_view==5) water=wake.rgb;
 ALBEDO=max(water,vec3(0.0));
}
