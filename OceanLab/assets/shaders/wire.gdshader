shader_type spatial;
uniform vec3 paint : source_color = vec3(0.25,0.29,0.30);
void vertex() {
 float world_radius=max(length(MODEL_MATRIX[0].xyz),0.0001);
 float distance_to_camera=max(length(MODEL_MATRIX[3].xyz-CAMERA_POSITION_WORLD),0.01);
 float focal=abs(PROJECTION_MATRIX[1][1])*VIEWPORT_SIZE.y*0.5;
 float minimum_radius=0.75*distance_to_camera/max(focal,1.0);
 VERTEX.xz*=max(1.0,minimum_radius/world_radius);
}
void fragment() { ALBEDO=paint;ROUGHNESS=0.67;METALLIC=0.4; }
