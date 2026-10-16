import * as T from 'three';
import {groundDetailCode} from '../../../src/ground-detail.ts';
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
// Independent integer arithmetic: GPU uint wrap is modelled with BigInt, not
// production code or implementation-dependent floating-point sine hashes.
const mask=0xffffffffn,offsetCache=new Map(),phaseOffset=(x,y)=>{
 const key=`${x},${y}`;if(offsetCache.has(key))return offsetCache.get(key);
 const hash=value=>{value=((value^(value>>16n))*0x7feb352dn)&mask;value=((value^(value>>15n))*0x846ca68bn)&mask;return value^(value>>16n);};
 const seed=((BigInt(x)*0x9e3779b9n)&mask)^((BigInt(y)*0x85ebca6bn)&mask)^0x27d4eb2dn;
 const offset=[Number(hash(seed)>>8n)/16777216,Number(hash(seed^0x68bc21ebn)>>8n)/16777216];offsetCache.set(key,offset);return offset;
};
const phaseSample=(uv,size,read)=>{
 const cell=uv.map(Math.floor),f=uv.map((v,i)=>{const t=Math.max(0,Math.min(1,(v-cell[i]-.35)/.30));return t*t*(3-2*t);}),value=[0,0,0];
 for(let y=0;y<2;y++)for(let x=0;x<2;x++) {
  const offset=phaseOffset(cell[0]+x,cell[1]+y),weight=(x?f[0]:1-f[0])*(y?f[1]:1-f[1]);
  const texel=uv.map((v,i)=>Math.floor((v+offset[i]-Math.floor(v+offset[i]))*size));
  read(...texel).forEach((v,i)=>value[i]+=v*weight);
 }
 return value;
};
const sampleColour=(point,metres,normal,fine=false)=>{
 const weights=normal.toArray().map(v=>Math.abs(v)**4),sum=weights.reduce((a,b)=>a+b),pairs=[[point.z,point.y],[point.x,point.z],[point.x,point.y]],colour=[0,0,0];
 pairs.forEach((uv,i)=>{const values=fine?phaseSample(uv.map(v=>v/metres),64,(x,y)=>[(x+.5)/64,(y+.5)/64,.25]):[...uv.map(v=>(Math.floor(((v/metres)%1+1)%1*64)+0.5)/64),.25];values.forEach((v,j)=>colour[j]+=v*weights[i]/sum);});return colour;
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
const detailAxes=[...axes,new T.Vector3(.8,.6,0),new T.Vector3(-.8,-.6,0),new T.Vector3(Math.sqrt(1-.45**2),.45,0),new T.Vector3(Math.sqrt(1-.75**2),.75,0)];
const detailFields=[{name:'flat-macro',rock:flat,fine:patternedNormal,pattern:true},{name:'flat-fine',rock:rockTilt,fine:normalTexture(flat),pattern:false},{name:'both-tilted',rock:rockTilt,fine:patternedNormal,pattern:true}];
for(const field of detailFields)for(const kind of ['colour','normal','roughness']) {
 const carrier=new T.MeshStandardMaterial();carrier.normalScale.set(0.65,0.65);
 const material=new T.MeshStandardMaterial({map:macroColour,normalMap:normalTexture(field.rock),roughnessMap:rough});material.normalScale.set(0.65,0.65);
 blendGroundCover(material,new T.MeshStandardMaterial({map:colour,normalMap:normalTexture(coverTilt),roughnessMap:rough}),carrier);wetCoastalSurface(material,{value:1.15});
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
 material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`gl_FragColor=vec4(${kind==='normal'?'normal':kind==='roughness'?'vec3(roughnessFactor)':'diffuseColor.rgb'},1.0);`);};material.customProgramCacheKey=()=>key()+kind;
 mesh.material=material;const completeOutputs=new Map();
 // Re-enter the complete state on this same material to exercise program cache changes.
 for(const state of ['complete','incomplete','missing','restored']) {
  const complete=state==='complete'||state==='restored';carrier.map=state==='missing'?null:colour;carrier.normalMap=state==='missing'?null:field.fine;carrier.roughnessMap=complete?detailRough:null;material.needsUpdate=true;
  for(const normal of detailAxes)for(const cover of [0,0.5,1])for(const position of [[137.13,41.37,211.29],[137.57,0.1,211.67]]) {
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
     const fineSamples=[[point.z,point.y],[point.x,point.z],[point.x,point.y]].map(uv=>phaseSample(uv.map(v=>v/2),8,(x,y)=>field.pattern?detailVectors[y*8+x]:flat));
     rock=mappedNormal(normal,fineSamples);
    }
    expected=rock.multiplyScalar(1-cover).addScaledVector(mappedNormal(normal,coverTilt),cover).normalize().transformDirection(camera.matrixWorldInverse).toArray();
   }else if(kind==='roughness')expected=Array(3).fill(((complete?0.7*0.35+sampleColour(point,2,normal,true)[1]*0.65:0.7)*(1-cover)+0.7*cover)*wetRoughness);
   else {const macro=sampleColour(point,90,normal),fine=sampleColour(point,2,normal,true),grass=sampleColour(point,15,normal),t=Math.max(0,Math.min(1,(Math.abs(normal.y)-.45)/.3)),weight=.35*t*t*(3-2*t);expected=macro.map((v,i)=>((complete?fine[i]*(1-weight+weight*v/macroMean[i]):v)*(1-cover)+grass[i]*cover)*wetColour);}
   const error=Math.max(...expected.map((v,i)=>Math.abs(v-actual[i])));detailMaximum=Math.max(detailMaximum,error);detailSamples.push({field:field.name,kind,state,normal:normal.toArray(),cover,position,actual:[...actual],expected,error});
   if(!Number.isFinite(error)||error>0.002)throw new Error(`Detail projection mismatch ${JSON.stringify(detailSamples.at(-1))}`);
   const key=JSON.stringify({normal:normal.toArray(),cover,position});
   if(state==='complete')completeOutputs.set(key,[...actual]);
   if(state==='restored'&&Math.max(...completeOutputs.get(key).map((v,i)=>Math.abs(v-actual[i])))>0.000002)throw new Error('Restored fine material changed its complete output');
  }
 }
}
// Direct production-helper reads cover signed cells and both sides of tile
// boundaries without relying on a projected mesh's floating-point ray position.
const phasePoints=[[2.2,3.7],[-1.2,-2.7],[-1.5,2.5],[-1.0001,.41],[-.9999,.41],[.41,1.9999],[.41,2.0001]],stochasticSamples=[];
const phaseUniforms={phasePoint:{value:new T.Vector2()},phaseStep:{value:new T.Vector2()},phaseMap:{value:colour},phaseMode:{value:0}};
const phaseMaterial=new T.ShaderMaterial({uniforms:phaseUniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:`
 uniform vec2 phasePoint,phaseStep;uniform sampler2D phaseMap;uniform int phaseMode;
 ${groundDetailCode}
 void main(){vec2 uv=phasePoint+(gl_FragCoord.xy-vec2(32.5))*phaseStep;gl_FragColor=phaseMode==1?vec4(groundDetailOffset(phasePoint),0,1):groundDetailSample(phaseMap,uv);}`});
const phaseScene=new T.Scene(),phaseMesh=new T.Mesh(new T.PlaneGeometry(2,2),phaseMaterial);phaseMesh.frustumCulled=false;phaseScene.add(phaseMesh);
let stochasticMaximum=0;
const phaseRead=(kind,point,expected)=>{
 phaseUniforms.phasePoint.value.set(...point);renderer.setRenderTarget(target);renderer.render(phaseScene,camera);const actual=new Float32Array(4);renderer.readRenderTargetPixels(target,32,32,1,1,actual);
 const error=Math.max(...expected.map((v,i)=>Math.abs(v-actual[i])));stochasticMaximum=Math.max(stochasticMaximum,error);stochasticSamples.push({kind,point,actual:[...actual],expected,error});
 if(!Number.isFinite(error)||error>0.002)throw new Error(`Fine sampling mismatch ${JSON.stringify(stochasticSamples.at(-1))}`);return [...actual];
};
const boundarySamples=phasePoints.map(point=>phaseRead('signed-cell',point,phaseSample(point,64,(x,y)=>[(x+.5)/64,(y+.5)/64,.25])));
const continuityMaximum=Math.max(...[[3,4],[5,6]].flatMap(([a,b])=>boundarySamples[a].map((value,i)=>Math.abs(value-boundarySamples[b][i]))));
if(continuityMaximum>0.002)throw new Error('Fine texture changes phase at a cell boundary');
phaseUniforms.phaseMode.value=1;
for(const [x,y,u,v]of [[0,0,8638947,14766835],[1,0,1319066,365975],[-1,0,14482133,7034157],[-2,-3,14197482,1258665],[69,105,8889556,8640783],[-68,-106,11313054,10269873]]) {
 const expected=[u/16777216,v/16777216,0],actual=phaseRead('hash-witness',[x,y],expected);
 if(expected.some((value,i)=>value!==actual[i]))throw new Error('GPU integer phase differs from its exact 24-bit witness');
 if(expected.slice(0,2).some((value,i)=>value!==phaseOffset(x,y)[i]))throw new Error('Independent hash reference disagrees with its golden witness');
}
// Original UV derivatives give LOD1 (two base texels/pixel), even across a
// phase boundary. Differently coloured levels expose accidental offset LODs.
const mipTexture=dataTexture(new Float32Array(64*64*4),64,64);mipTexture.mipmaps=[];
for(let size=64,level=0;size>=1;size/=2,level++) {
 const value=level===0?[1,0,0,1]:level===1?[0,.5,0,1]:[0,0,.75,1],data=new Float32Array(size*size*4);
 for(let i=0;i<data.length;i+=4)data.set(value,i);mipTexture.mipmaps.push({data,width:size,height:size});
}
mipTexture.minFilter=T.NearestMipmapNearestFilter;mipTexture.needsUpdate=true;
phaseUniforms.phaseMode.value=0;phaseUniforms.phaseMap.value=mipTexture;phaseUniforms.phaseStep.value.set(1/32,1/32);
for(const point of phasePoints)phaseRead('original-gradient-mip',point,[0,.5,0]);
const loadingFailures=[],originalFetch=globalThis.fetch,originalBitmap=globalThis.createImageBitmap,originalTimeout=AbortSignal.timeout;
try {
 for(const phase of ['fetch','body','decode','timeout']) {
  const material=new T.MeshStandardMaterial();
  AbortSignal.timeout=phase==='timeout'?()=>originalTimeout.call(AbortSignal,1):originalTimeout;
  globalThis.fetch=async(_url,{signal})=>{if(phase==='fetch')throw new TypeError('Probe fetch failure');return {ok:true,blob:async()=>{if(phase==='body')throw new DOMException('Probe body failure','AbortError');if(phase==='timeout')return new Promise((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});return new Blob();}};};
  globalThis.createImageBitmap=async()=>{throw new DOMException('Probe decode failure','InvalidStateError');};
  const before=loadingFailures.length,missing=await loadSurfaces([{asset:'probe',resolution:'1k',materials:[material],colour:true}],1,loadingFailures),failures=loadingFailures.slice(before);
  if(missing.length!==1||missing[0]!=='probe'||failures.length!==(phase==='timeout'?6:3)||failures.some(failure=>failure.phase!==(phase==='timeout'?'body':phase)||failure.elapsedMs<failure.phaseElapsedMs||failure.aborted!==(phase==='timeout')||failure.abortReason!==(phase==='timeout'?'TimeoutError':null)||failure.recovered)||material.map||material.normalMap||material.roughnessMap)throw new Error(`Invalid ${phase} failure diagnostics`);
  for(const map of ['diff','nor_gl','rough'])if(failures.filter(failure=>failure.map===map).map(failure=>failure.attempt).join(',')!==(phase==='timeout'?'1,2':'1'))throw new Error(`Unexpected ${phase} retry count`);
  material.dispose();
 }
 const requests=new Map(),recoveryFailures=[],material=new T.MeshStandardMaterial();
 globalThis.fetch=async(url,{signal})=>{
  const map=/probe_(diff|nor_gl|rough)_1k/.exec(url.href)[1],attempt=(requests.get(map)??0)+1;requests.set(map,attempt);
  return {ok:true,blob:async()=>map==='rough'&&attempt===1?new Promise((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});}):new Blob()};
 };
 globalThis.createImageBitmap=async()=>{const canvas=new OffscreenCanvas(1,1);canvas.getContext('2d').fillRect(0,0,1,1);return canvas.transferToImageBitmap();};
 const missing=await loadSurfaces([{asset:'probe',resolution:'1k',materials:[material],colour:true}],1,recoveryFailures);
 if(missing.length||!material.map||!material.normalMap||!material.roughnessMap||requests.get('diff')!==1||requests.get('nor_gl')!==1||requests.get('rough')!==2||recoveryFailures.length!==1||!recoveryFailures[0].recovered||recoveryFailures[0].attempt!==1)throw new Error(`Timeout recovery did not retain successful maps: ${JSON.stringify({missing,requests:[...requests],recoveryFailures})}`);
 for(const texture of [material.map,material.normalMap,material.roughnessMap]){texture.dispose();texture.image.close();}material.dispose();
}finally{globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalBitmap;AbortSignal.timeout=originalTimeout;}
const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');if(gl.getError()!==gl.NO_ERROR)throw new Error('Ground probe WebGL error');window.__GROUND_PROBE__={gpu:gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),samples,maximum,detailSamples,detailMaximum,stochasticSamples,stochasticMaximum,continuityMaximum,loadingFailures};
