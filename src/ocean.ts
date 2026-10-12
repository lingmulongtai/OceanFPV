import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { WAVES, SEA_SCALE, type SeaState } from './sea';

function radialGeometry() {
  const segments = 160, rings = 86, positions: number[] = [], indices: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const radius = 1.3 * (Math.pow(1.10, r) - 1) / 0.10;
    for (let a = 0; a <= segments; a++) {
      const angle = a / segments * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    }
  }
  for (let r = 0; r < rings; r++) for (let a = 0; a < segments; a++) {
    const i = r * (segments + 1) + a, j = i + segments + 1;
    indices.push(i, j, i + 1, i + 1, j, j + 1);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** Deterministic periodic multi-scale noise: no remote texture dependency. */
function normalTexture() {
  const size = 256, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0, b = 0;
    for (let i = 1; i <= 7; i++) {
      const phase = (x * (i * 3 + 1) + y * (i * 2 - 7)) / size * Math.PI * 2 + i * 8.27;
      a += Math.cos(phase) / (i + 1); b += Math.sin(phase * (i % 2 ? 1 : 2)) / (i + 1);
    }
    const index = (y * size + x) * 4;
    data[index] = Math.max(0, Math.min(255, 128 + a * 43));
    data[index + 1] = Math.max(0, Math.min(255, 128 + b * 43));
    data[index + 2] = 230; data[index + 3] = 255;
  }
  const texture = new T.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter; texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
}

const waveCode = `
uniform float time;
uniform vec4 waves[12];
uniform float frequencies[12];
uniform float seaScale;
float heightAt(vec2 p) {
  float h = 0.0;
  for(int i=0;i<12;i++) h += waves[i].z * sin(dot(waves[i].xy,p) - frequencies[i]*time + waves[i].w);
  return h * seaScale;
}
vec2 slopeAt(vec2 p) {
  vec2 slope = vec2(0.0);
  for(int i=0;i<12;i++) slope += waves[i].xy * waves[i].z * cos(dot(waves[i].xy,p) - frequencies[i]*time + waves[i].w);
  return slope * seaScale;
}`;

export class Ocean {
  mesh: Reflector;
  material: T.ShaderMaterial;
  constructor(sun: T.Vector3) {
    this.mesh = new Reflector(radialGeometry(), { textureWidth: 1024, textureHeight: 1024, multisample: 0, clipBias: 0.003 });
    this.mesh.rotation.x = -Math.PI / 2; this.mesh.frustumCulled = false;
    this.material = this.mesh.material as T.ShaderMaterial;
    this.material.lights = false;
    this.material.side = T.DoubleSide;
    Object.assign(this.material.uniforms, {
      mirrorSampler: { value: this.mesh.getRenderTarget().texture }, normalSampler: { value: normalTexture() },
      time: { value: 0 }, sunDirection: { value: sun }, sunColor: { value: new T.Color(0xffe7bf) }, eye: { value: new T.Vector3() },
      waves: { value: WAVES.map(w => new T.Vector4(w.x, w.z, w.amplitude, w.phase)) },
      frequencies: { value: WAVES.map(w => w.frequency) }, seaScale: { value: SEA_SCALE.breeze },
      dusk: { value: 0.4 }, foamEnabled: { value: true }, vessel: { value: new T.Vector3() },
    });
    this.material.vertexShader = `${waveCode}
      uniform mat4 textureMatrix;
      varying vec3 worldPosition;
      varying vec4 mirrorCoord;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        float waveHeight = heightAt(world.xz);
        world.y += waveHeight;
        worldPosition = world.xyz;
        // Reflector's matrix includes modelMatrix; feed displaced LOCAL coords.
        mirrorCoord = textureMatrix * vec4(position.xy, position.z + waveHeight, 1.0);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`;
    this.material.fragmentShader = `${waveCode}
      uniform sampler2D mirrorSampler;
      uniform sampler2D normalSampler;
      uniform vec3 eye;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform float dusk;
      uniform bool foamEnabled;
      uniform vec3 vessel;
      varying vec3 worldPosition;
      varying vec4 mirrorCoord;
      float detail(vec2 p) { return texture2D(normalSampler, p).r; }
      void main() {
        vec3 view = normalize(eye - worldPosition);
        float distanceToEye = length(eye - worldPosition);
        vec2 p = worldPosition.xz;
        vec2 ripple = texture2D(normalSampler, p/11.0 + vec2(time*0.015,-time*0.007)).rg - 0.5;
        ripple += (texture2D(normalSampler, p/3.7 - time*0.013).rg - 0.5) * 0.5;
        ripple *= 0.35 * (0.5 + seaScale*0.4) * (1.0 - smoothstep(100.0,1400.0,distanceToEye));
        vec2 slope = slopeAt(p) + ripple;
        vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
        float nv = max(0.03, dot(normal, view));
        float fresnel = 0.02 + 0.98*pow(1.0 - nv, 5.0);
        vec2 reflectionUV = mirrorCoord.xy / max(mirrorCoord.w,0.001);
        reflectionUV += normal.xz * (0.009 + 0.15/max(distanceToEye,2.0));
        vec3 reflected = texture2D(mirrorSampler, clamp(reflectionUV,0.002,0.998)).rgb;
        vec3 body = mix(vec3(0.008,0.10,0.12), vec3(0.006,0.044,0.068),dusk*0.5);
        body += vec3(0.002,0.014,0.012)*max(worldPosition.y+0.6,0.0);
        vec3 halfV = normalize(view + sunDirection);
        float rough = 0.095 + smoothstep(70.0,900.0,distanceToEye)*0.15;
        float a2 = pow(rough,4.0);
        float nh = max(dot(normal,halfV),0.0), nl = max(dot(normal,sunDirection),0.001);
        float den = nh*nh*(a2-1.0)+1.0;
        float distribution = a2/(3.14159*den*den+0.000001);
        float masking = 2.0*nv/(nv+sqrt(a2+(1.0-a2)*nv*nv));
        masking *= 2.0*nl/(nl+sqrt(a2+(1.0-a2)*nl*nl));
        vec3 glint = sunColor * distribution * masking * fresnel * 0.12 / max(4.0*nv,0.1);
        float micro = detail(p*0.061 + vec2(time*0.007,0.0));
        float breaking = smoothstep(0.31,0.51,length(slopeAt(p))) * smoothstep(0.45,0.66,micro);
        vec2 relative = p - vessel.xz;
        float width = 4.4*pow(max(sin(clamp((relative.y+46.0)/92.0,0.0,1.0)*3.14159),0.01),0.42);
        float hullFoam = exp(-pow((abs(relative.x)-width)/0.9,2.0)) * (1.0-smoothstep(43.0,48.0,abs(relative.y))) * smoothstep(0.32,0.7,micro);
        float foam = foamEnabled ? clamp(breaking*0.55 + hullFoam*0.48,0.0,0.8) : 0.0;
        vec3 color = mix(body*(1.0-fresnel) + reflected*fresnel + min(glint,vec3(7.0)), mix(vec3(0.54,0.65,0.65),vec3(0.82,0.81,0.71),dusk),foam);
        float haze = 1.0-exp(-distanceToEye*0.00013);
        color = mix(color,mix(vec3(0.45,0.62,0.72),vec3(0.62,0.45,0.32),dusk),haze);
        gl_FragColor = vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
  }
  update(time: number, camera: T.Vector3, state: SeaState) {
    this.material.uniforms.time.value = time;
    this.material.uniforms.seaScale.value = SEA_SCALE[state];
    this.material.uniforms.eye.value.copy(camera);
    this.mesh.position.x = Math.round(camera.x / 8) * 8;
    this.mesh.position.z = Math.round(camera.z / 8) * 8;
  }
  setQuality(quality: string) {
    const size = quality === 'ultra' ? 1536 : quality === 'high' ? 1024 : 384;
    const target = this.mesh.getRenderTarget();
    if (target.width !== size) target.setSize(size, size);
  }
}
