shader_type sky;
#include "res://assets/shaders/atmosphere.gdshaderinc"
void sky() {
 vec3 d=EYEDIR;
 if(d.y>=0.0) {
  COLOR=sky_radiance(d);
 } else {
  // Ocean-painted lower hemisphere supplies believable ship reflections.
  vec3 mirror=vec3(d.x,-d.y,d.z);
  float f=0.02+0.98*pow(1.0-clamp(-d.y,0.0,1.0),5.0);
  COLOR=mix(vec3(0.004,0.025,0.044),sky_radiance(mirror),f);
 }
}
