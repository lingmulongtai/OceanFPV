import * as T from 'three';
import {blendGroundCover,wetCoastalSurface} from '../../../src/surfaces.ts';
const renderer=new T.WebGLRenderer();renderer.setSize(64,64);renderer.toneMapping=T.NoToneMapping;document.body.append(renderer.domElement);
if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('Float target unavailable');
const target=new T.WebGLRenderTarget(64,64,{type:T.FloatType}),camera=new T.OrthographicCamera(-2,2,2,-2,0.1,20),scene=new T.Scene();
const dataTexture=(data,width=1,height=1)=>{const texture=new T.DataTexture(new Float32Array(data),width,height,T.RGBAFormat,T.FloatType);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.needsUpdate=true;return texture;};
const gradient=[];for(let y=0;y<64;y++)for(let x=0;x<64;x++)gradient.push((x+0.5)/64,(y+0.5)/64,0.25,1);
const colour=dataTexture(gradient,64,64),rough=dataTexture([0.7,0.7,0.7,1]),flat=[0,0,1],rockTilt=[0.35,0.22,Math.sqrt(1-0.35**2-0.22**2)],coverTilt=[-0.14,0.3,Math.sqrt(1-0.14**2-0.3**2)];
const normalTexture=n=>dataTexture([...n.map(v=>v*0.5+0.5),1]);
const fields=[{name:'flat',rock:flat,cover:flat},{name:'tilted',rock:rockTilt,cover:coverTilt}];
const geometry=new T.PlaneGeometry(4,4),coverAttribute=new T.Float32BufferAttribute(new Float32Array(4),1);geometry.setAttribute('groundCover',coverAttribute);
const materials=fields.flatMap(field=> {
 const rock=normalTexture(field.rock),cover=normalTexture(field.cover);return ['colour','normal'].map(kind=> {
  const material=new T.MeshStandardMaterial({map:colour,normalMap:rock,roughnessMap:rough});material.normalScale.set(0.65,0.65);
  blendGroundCover(material,new T.MeshStandardMaterial({map:colour,normalMap:cover,roughnessMap:rough}));wetCoastalSurface(material,{value:1.15});
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`gl_FragColor=vec4(${kind==='normal'?'normal':'diffuseColor.rgb'},1.0);`);};material.customProgramCacheKey=()=>key()+kind;
  return {field,kind,material};
 });
});
const mesh=new T.Mesh(geometry,materials[0].material);mesh.position.set(137.13,41.37,211.29);scene.add(mesh);
const axes=[new T.Vector3(1,0,0),new T.Vector3(-1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,-1,0),new T.Vector3(0,0,1),new T.Vector3(0,0,-1),new T.Vector3(0.6,0.4,0.7).normalize(),new T.Vector3(-0.8,0.3,-0.4).normalize()];
const sampleColour=(point,metres,normal)=>{
 const weights=normal.toArray().map(v=>Math.abs(v)**4),sum=weights.reduce((a,b)=>a+b),pairs=[[point.z,point.y],[point.x,point.z],[point.x,point.y]],colour=[0,0,0];
 pairs.forEach((uv,i)=>{const values=uv.map(v=>(Math.floor(((v/metres)%1+1)%1*64)+0.5)/64);values.push(0.25);values.forEach((v,j)=>colour[j]+=v*weights[i]/sum);});return colour;
};
// Analytical gradients of planar coordinate fields, independent of screen derivatives.
const mappedNormal=(normal,mapNormal)=>{
 const axes=[[new T.Vector3(0,0,1),new T.Vector3(0,1,0)],[new T.Vector3(1,0,0),new T.Vector3(0,0,1)],[new T.Vector3(1,0,0),new T.Vector3(0,1,0)]],weights=normal.toArray().map(v=>Math.abs(v)**4),sum=weights.reduce((a,b)=>a+b),result=new T.Vector3();
 axes.forEach(([u,v],i)=>{u.addScaledVector(normal,-u.dot(normal));v.addScaledVector(normal,-v.dot(normal));const scale=Math.sqrt(Math.max(u.lengthSq(),v.lengthSq()));const n=normal.clone().multiplyScalar(mapNormal[2]);if(scale>0)n.addScaledVector(u,mapNormal[0]*0.65/scale).addScaledVector(v,mapNormal[1]*0.65/scale);result.addScaledVector(n.normalize(),weights[i]/sum);});return result.normalize();
};
const samples=[];let maximum=0;
for(const {field,kind,material}of materials)for(const normal of axes)for(const cover of [0,0.5,1]) {
 mesh.material=material;mesh.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);coverAttribute.array.fill(cover);coverAttribute.needsUpdate=true;
 camera.up.set(...(Math.abs(normal.y)>0.99?[0,0,1]:[0,1,0]));camera.position.copy(mesh.position).addScaledVector(normal,6);camera.lookAt(mesh.position);camera.updateMatrixWorld(true);mesh.updateMatrixWorld(true);
 renderer.setRenderTarget(target);renderer.render(scene,camera);const actual=new Float32Array(4);renderer.readRenderTargetPixels(target,32,32,1,1,actual);
 let expected;if(kind==='normal'){expected=mappedNormal(normal,field.rock).multiplyScalar(1-cover).addScaledVector(mappedNormal(normal,field.cover),cover).normalize().transformDirection(camera.matrixWorldInverse).toArray();}
 else {const raycaster=new T.Raycaster();raycaster.setFromCamera(new T.Vector2(2*32.5/64-1,2*32.5/64-1),camera);const point=raycaster.ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(normal,mesh.position),new T.Vector3());const rock=sampleColour(point,90,normal),grass=sampleColour(point,15,normal);expected=rock.map((v,i)=>v*(1-cover)+grass[i]*cover);}
 const error=Math.max(...expected.map((v,i)=>Math.abs(v-actual[i])));maximum=Math.max(maximum,error);samples.push({field:field.name,kind,normal:normal.toArray(),cover,actual:[...actual],expected,error});
 if(!Number.isFinite(error)||error>(kind==='normal'?0.002:0.02))throw new Error(`Projection mismatch ${JSON.stringify(samples.at(-1))}`);
}
const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');window.__GROUND_PROBE__={gpu:gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),samples,maximum};
