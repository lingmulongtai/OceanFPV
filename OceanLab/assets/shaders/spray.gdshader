shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
uniform vec3 sun_direction = vec3(-0.45,0.42,-0.72);
uniform vec3 sun_color : source_color = vec3(1.0,0.91,0.75);
varying float energy_scale;
void vertex() {
 vec3 centre=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 float distance_to_camera=max(length(centre-CAMERA_POSITION_WORLD),0.01);
 float focal=abs(PROJECTION_MATRIX[1][1])*VIEWPORT_SIZE.y*0.5;
 float diameter=max(0.005,INSTANCE_CUSTOM.y*2.0);
 float pixels=diameter*focal/distance_to_camera;
 float scale=max(1.0,1.5/max(pixels,0.001));
 energy_scale=1.0/(scale*scale); // conserve integrated energy after the 1.5px floor.
 MODELVIEW_MATRIX=VIEW_MATRIX*mat4(INV_VIEW_MATRIX[0],INV_VIEW_MATRIX[1],INV_VIEW_MATRIX[2],MODEL_MATRIX[3]);
 VERTEX.xy*=scale*diameter/0.09;
}
float hg(float mu,float g) { return (1.0-g*g)/(4.0*PI*pow(max(1.0+g*g-2.0*g*mu,0.001),1.5)); }
void fragment() {
 float radius=length(UV-0.5)*2.0;
 float mask=pow(max(0.0,1.0-radius*radius),2.0);
 vec3 world_view=normalize((INV_VIEW_MATRIX*vec4(VIEW,0.0)).xyz);
 float mu=dot(world_view,sun_direction);
 float phase=0.83*hg(mu,0.78)+0.17*hg(mu,-0.25);
 ALBEDO=sun_color*(0.35+phase*1.2);
 ALPHA=mask*COLOR.a*energy_scale*0.28;
}
