shader_type particles;
render_mode disable_force, disable_velocity;
uniform vec3 wind = vec3(4.0,0.0,1.0);
uniform float ship_speed = 12.0;
uniform float impact = 0.0;
uniform float side = 1.0;
uint hash(uint x) { x^=x>>16u;x*=0x7feb352du;x^=x>>15u;x*=0x846ca68bu;return x^(x>>16u); }
float rand(inout uint x) { x=hash(x);return float(x&0x00ffffffu)/16777216.0; }
void start() {
 uint seed=hash(NUMBER^RANDOM_SEED); // Persistent particle number; NEVER INSTANCE_ID.
 float a=rand(seed),b=rand(seed),c=rand(seed);
 TRANSFORM=EMISSION_TRANSFORM;
 TRANSFORM[3].xyz+=mat3(EMISSION_TRANSFORM)*vec3(side*(0.6+a),b*0.4,c*1.8);
 VELOCITY=mat3(EMISSION_TRANSFORM)*vec3(side*(1.2+a*3.2),2.0+b*(4.0+impact*3.0),ship_speed*0.22+c*3.0);
 CUSTOM=vec4(0.0,0.025+c*0.045,a,float(seed&0x00ffffffu)/16777216.0);
 COLOR=vec4(1.0);
}
void process() {
 CUSTOM.x+=DELTA;
 float drag=0.60*0.05/max(CUSTOM.y,0.005);
 VELOCITY+=(vec3(0.0,-9.81,0.0)+(wind-VELOCITY)*drag)*DELTA;
 TRANSFORM[3].xyz+=VELOCITY*DELTA;
 COLOR.a=pow(max(0.0,1.0-CUSTOM.x/max(LIFETIME,0.01)),1.5);
}
