/** Shift fine PBR maps together without changing their metre scale or tangent frame. */
export const groundDetailCode=`
uint groundDetailHash(uint value) {
  value=(value^(value>>16u))*0x7feb352du;
  value=(value^(value>>15u))*0x846ca68bu;
  return value^(value>>16u);
}
vec2 groundDetailOffset(vec2 cell) {
  ivec2 tile=ivec2(cell);
  uint seed=(uint(tile.x)*0x9e3779b9u)^(uint(tile.y)*0x85ebca6bu)^0x27d4eb2du;
  return vec2(groundDetailHash(seed)>>8u,groundDetailHash(seed^0x68bc21ebu)>>8u)/16777216.0;
}
vec4 groundDetailSample(sampler2D surface,vec2 uv) {
  vec2 cell=floor(uv),f=smoothstep(vec2(0.35),vec2(0.65),fract(uv));
  // Phase changes must not enter the mip footprint or rotate a normal's basis.
  vec2 dx=dFdx(uv),dy=dFdy(uv);
  // Most fragments lie outside the narrow crossfade. Skip zero-weight reads
  // while retaining the same explicit derivatives inside divergent branches.
  if(f.x==0.0||f.x==1.0) {
    vec2 edge=cell+vec2(f.x,0);
    if(f.y==0.0||f.y==1.0)return textureGrad(surface,uv+groundDetailOffset(edge+vec2(0,f.y)),dx,dy);
    return mix(textureGrad(surface,uv+groundDetailOffset(edge),dx,dy),textureGrad(surface,uv+groundDetailOffset(edge+vec2(0,1)),dx,dy),f.y);
  }
  if(f.y==0.0||f.y==1.0) {
    vec2 edge=cell+vec2(0,f.y);
    return mix(textureGrad(surface,uv+groundDetailOffset(edge),dx,dy),textureGrad(surface,uv+groundDetailOffset(edge+vec2(1,0)),dx,dy),f.x);
  }
  vec4 a=textureGrad(surface,uv+groundDetailOffset(cell),dx,dy);
  vec4 b=textureGrad(surface,uv+groundDetailOffset(cell+vec2(1,0)),dx,dy);
  vec4 c=textureGrad(surface,uv+groundDetailOffset(cell+vec2(0,1)),dx,dy);
  vec4 d=textureGrad(surface,uv+groundDetailOffset(cell+vec2(1)),dx,dy);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
`;
