shader_type spatial;
render_mode world_vertex_coords, unshaded, blend_add, depth_draw_never, cull_disabled;
uniform bool use_fft = false;
uniform sampler2DArray displacements : repeat_enable, filter_linear;
uniform vec4 map_scales[5];
uniform vec4 analytic_waves[16];
uniform float analytic_frequencies[16];
uniform float simulation_time = 0.0;
void vertex() {
 vec2 p=VERTEX.xz;float height=0.0;
 if(use_fft) {
  for(int i=0;i<5;i++) height+=textureLod(displacements,vec3(p*map_scales[i].xy,float(i)),0.0).y*map_scales[i].z;
 } else {
  for(int i=0;i<16;i++) {
   vec4 w=analytic_waves[i];height+=w.z*sin(dot(w.xy,p)-analytic_frequencies[i]*simulation_time+w.w);
  }
 }
 VERTEX.y=height+0.10;
}
void fragment() {
 float edge=pow(max(0.0,1.0-abs(UV.x*2.0-1.0)),2.0);
 float lace=0.5+0.5*sin(UV.y*160.0+sin(UV.x*50.0)*2.0);
 ALBEDO=vec3(0.65,0.78,0.78);
 ALPHA=edge*lace*COLOR.a*0.06;
}
