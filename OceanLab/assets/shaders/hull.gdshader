shader_type spatial;
uniform vec3 paint : source_color = vec3(0.22,0.26,0.27);
varying vec3 local_position;
void vertex() { local_position=VERTEX; }
void fragment() {
 float wet=1.0-smoothstep(-0.1,0.8,local_position.y);
 float streak=fract(sin(floor(local_position.z*3.0)*127.1)*43758.5);
 float rust=pow(streak,13.0)*(1.0-smoothstep(0.0,2.8,local_position.y));
 vec3 color=mix(paint,vec3(0.21,0.055,0.035),1.0-smoothstep(-0.45,-0.20,local_position.y));
 color=mix(color,vec3(0.17,0.07,0.025),rust*0.34);
 ALBEDO=color*mix(1.0,0.60,wet);
 ROUGHNESS=mix(0.76,0.19,wet);
 METALLIC=0.25;
}
