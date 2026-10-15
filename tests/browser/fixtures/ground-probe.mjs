import * as T from 'three';
import {blendGroundCover,wetCoastalSurface,loadSurfaces} from '../../../src/surfaces.ts';
window.addEventListener('error',event=>{window.__GROUND_PROBE_ERROR__=event.message;});
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
 axes.forEach(([u,v],i)=>{const sample=Array.isArray(mapNormal[0])?mapNormal[i]:mapNormal;u.addScaledVector(normal,-u.dot(normal));v.addScaledVector(normal,-v.dot(normal));const scale=Math.sqrt(Math.max(u.lengthSq(),v.lengthSq()));const n=normal.clone().multiplyScalar(sample[2]);if(scale>0)n.addScaledVector(u,sample[0]*0.65/scale).addScaledVector(v,sample[1]*0.65/scale);result.addScaledVector(n.normalize(),weights[i]/sum);});return result.normalize();
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
const detailData=[],detailVectors=[];
for(let y=0;y<8;y++)for(let x=0;x<8;x++) {
 const nx=x%2?0.28:-0.18,ny=y%3?0.16:-0.25,n=[nx,ny,Math.sqrt(1-nx*nx-ny*ny)];detailVectors.push(n);detailData.push(...n.map(v=>v*0.5+0.5),1);
}
const patternedNormal=dataTexture(detailData,8,8),detailRough=colour;
// Distinct known coarse mips prove the production shader reads the macro mean.
const macroColour=dataTexture(gradient,64,64),macroMean=[0.43,0.61,0.29];
macroColour.mipmaps=[{data:new Float32Array(gradient),width:64,height:64}];
for(let size=32;size>=1;size/=2){const data=new Float32Array(size*size*4);for(let i=0;i<data.length;i+=4)data.set([...macroMean,1],i);macroColour.mipmaps.push({data,width:size,height:size});}
macroColour.minFilter=T.NearestMipmapNearestFilter;macroColour.needsUpdate=true;
const detailSamples=[];let detailMaximum=0;
const detailFields=[{name:'flat-macro',rock:flat,fine:patternedNormal,pattern:true},{name:'flat-fine',rock:rockTilt,fine:normalTexture(flat),pattern:false},{name:'both-tilted',rock:rockTilt,fine:patternedNormal,pattern:true}];
for(const field of detailFields)for(const kind of ['colour','normal','roughness']) {
 const carrier=new T.MeshStandardMaterial();carrier.normalScale.set(0.65,0.65);
 const material=new T.MeshStandardMaterial({map:macroColour,normalMap:normalTexture(field.rock),roughnessMap:rough});material.normalScale.set(0.65,0.65);
 blendGroundCover(material,new T.MeshStandardMaterial({map:colour,normalMap:normalTexture(coverTilt),roughnessMap:rough}),carrier);wetCoastalSurface(material,{value:1.15});
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
 material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`gl_FragColor=vec4(${kind==='normal'?'normal':kind==='roughness'?'vec3(roughnessFactor)':'diffuseColor.rgb'},1.0);`);};material.customProgramCacheKey=()=>key()+kind;
 mesh.material=material;
 // Re-enter the complete state on this same material to exercise program cache changes.
 for(const state of ['complete','incomplete','missing','restored']) {
  const complete=state==='complete'||state==='restored';carrier.map=state==='missing'?null:colour;carrier.normalMap=state==='missing'?null:field.fine;carrier.roughnessMap=complete?detailRough:null;material.needsUpdate=true;
  for(const normal of axes)for(const cover of [0,0.5,1])for(const position of [[137.13,41.37,211.29],[137.57,0.1,211.67]]) {
   mesh.position.set(...position);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);coverAttribute.array.fill(cover);coverAttribute.needsUpdate=true;
   camera.up.set(...(Math.abs(normal.y)>0.99?[0,0,1]:[0,1,0]));camera.position.copy(mesh.position).addScaledVector(normal,6);camera.lookAt(mesh.position);camera.updateMatrixWorld(true);mesh.updateMatrixWorld(true);
   renderer.setRenderTarget(target);renderer.render(scene,camera);const actual=new Float32Array(4);renderer.readRenderTargetPixels(target,32,32,1,1,actual);
   const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(2*32.5/64-1,2*32.5/64-1),camera);const point=ray.ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(normal,mesh.position),new T.Vector3());
   // This fixture's low sample is below the wet-shore lower threshold; the high one is dry.
   const reach=1.15*1.5*(0.9+0.1*Math.sin(point.x*0.19+Math.sin(point.z*0.23)*2)*Math.sin(point.z*0.13));
   const t=T.MathUtils.clamp((point.y-0.15)/(reach-0.15),0,1),wet=1-t*t*(3-2*t),wetColour=1-0.38*wet,wetRoughness=1-0.55*wet;
   let expected;
   if(kind==='normal') {
    let rock=mappedNormal(normal,field.rock);
    if(complete) {
     const fineSamples=[[point.z,point.y],[point.x,point.z],[point.x,point.y]].map(uv=>{const [x,y]=uv.map(v=>Math.floor(((v/2)%1+1)%1*8));return field.pattern?detailVectors[y*8+x]:flat;});
     rock=mappedNormal(normal,fineSamples);
    }
    expected=rock.multiplyScalar(1-cover).addScaledVector(mappedNormal(normal,coverTilt),cover).normalize().transformDirection(camera.matrixWorldInverse).toArray();
   }else if(kind==='roughness')expected=Array(3).fill(((complete?0.7*0.35+sampleColour(point,2,normal)[1]*0.65:0.7)*(1-cover)+0.7*cover)*wetRoughness);
   else {const macro=sampleColour(point,90,normal),fine=sampleColour(point,2,normal),grass=sampleColour(point,15,normal);expected=macro.map((v,i)=>((complete?fine[i]*(0.65+0.35*v/macroMean[i]):v)*(1-cover)+grass[i]*cover)*wetColour);}
   const error=Math.max(...expected.map((v,i)=>Math.abs(v-actual[i])));detailMaximum=Math.max(detailMaximum,error);detailSamples.push({field:field.name,kind,state,normal:normal.toArray(),cover,position,actual:[...actual],expected,error});
   if(!Number.isFinite(error)||error>0.002)throw new Error(`Detail projection mismatch ${JSON.stringify(detailSamples.at(-1))}`);
  }
 }
}
const loadingFailures=[],originalFetch=globalThis.fetch,originalBitmap=globalThis.createImageBitmap,originalTimeout=AbortSignal.timeout;
try {
 for(const phase of ['fetch','body','decode','timeout']) {
  const material=new T.MeshStandardMaterial();
  AbortSignal.timeout=phase==='timeout'?()=>originalTimeout.call(AbortSignal,1):originalTimeout;
  globalThis.fetch=async(_url,{signal})=>{if(phase==='fetch')throw new TypeError('Probe fetch failure');return {ok:true,blob:async()=>{if(phase==='body')throw new DOMException('Probe body failure','AbortError');if(phase==='timeout')return new Promise((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});return new Blob();}};};
  globalThis.createImageBitmap=async()=>{throw new DOMException('Probe decode failure','InvalidStateError');};
  const before=loadingFailures.length,missing=await loadSurfaces([{asset:'probe',resolution:'1k',materials:[material],colour:true}],1,loadingFailures),failures=loadingFailures.slice(before);
  if(missing.length!==1||missing[0]!=='probe'||failures.length!==3||failures.some(failure=>failure.phase!==(phase==='timeout'?'body':phase)||failure.elapsedMs<failure.phaseElapsedMs||failure.aborted!==(phase==='timeout')||failure.abortReason!==(phase==='timeout'?'TimeoutError':null))||material.map||material.normalMap||material.roughnessMap)throw new Error(`Invalid ${phase} failure diagnostics`);
  material.dispose();
 }
}finally{globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalBitmap;AbortSignal.timeout=originalTimeout;}
const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');if(gl.getError()!==gl.NO_ERROR)throw new Error('Ground probe WebGL error');window.__GROUND_PROBE__={gpu:gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),samples,maximum,detailSamples,detailMaximum,loadingFailures};
