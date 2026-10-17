import*as T from'three';import{Ocean}from'../../../src/ocean.ts';import{whitecapReference}from'./whitecap-reference.mjs';
const renderer=new T.WebGLRenderer();renderer.setSize(1,1);document.body.append(renderer.domElement);const gl=renderer.getContext();if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('Float target required');
const ocean=new Ocean(new T.Vector3(0,1,0));ocean.configureFiltering(false);ocean.advance(0,'swell');ocean.advance(120,'swell');ocean.refreshFields();
const oracle=whitecapReference(ocean.simulation),source=ocean.material.fragmentShader,header=source.split('void main()')[0],start=source.indexOf('float breaking='),end=source.indexOf(',foam=',start);if(start<0||end<start)throw new Error('Missing production whitecap expression');
const connected=source.slice(start+'float breaking='.length,end).replaceAll('waveCoordinate','probeQ').replace(/\bp\b/g,'probeP').replaceAll('foamQDx','probeQDx').replaceAll('foamQDy','probeQDy').replaceAll('foamPDx','probePDx').replaceAll('foamPDy','probePDy');
const legacy='smoothstep(0.12,0.8,displacementAt(probeQ).w)*smoothstep(0.42,0.76,n)';
const uniforms={...ocean.material.uniforms,probeQ:{value:new T.Vector2()},probeP:{value:new T.Vector2()},probeQDx:{value:new T.Vector2()},probeQDy:{value:new T.Vector2()},probePDx:{value:new T.Vector2()},probePDy:{value:new T.Vector2()},rasterSize:{value:4}};uniforms.centerQ=uniforms.probeQ;uniforms.centerP=uniforms.probeP;
const vertexShader='void main(){gl_Position=vec4(position.xy,0,1);}',material=new T.ShaderMaterial({uniforms,defines:ocean.material.defines,vertexShader,fragmentShader:`${header}
uniform vec2 probeQ,probeP,probeQDx,probeQDy,probePDx,probePDy;
void main(){float n=foamNoise(probeP*.53+vec2(time*.12,-time*.09));float original=${legacy},filtered=${connected};gl_FragColor=vec4(original,filtered,0,1);}`});
// Each raster fragment evaluates the former production point formula. Averaging
// the readback independently tests the new shader's footprint integration.
const rasterMaterial=new T.ShaderMaterial({uniforms,defines:ocean.material.defines,vertexShader,fragmentShader:`${header}
uniform vec2 centerQ,centerP,probeQDx,probeQDy,probePDx,probePDy;uniform float rasterSize;
void main(){vec2 offset=gl_FragCoord.xy/rasterSize-.5,probeQ=centerQ+probeQDx*offset.x+probeQDy*offset.y,probeP=centerP+probePDx*offset.x+probePDy*offset.y;float n=foamNoise(probeP*.53+vec2(time*.12,-time*.09));gl_FragColor=vec4(${legacy},0,0,1);}`});
const camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;const scene=new T.Scene(),rasterScene=new T.Scene();scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));rasterScene.add(new T.Mesh(new T.PlaneGeometry(2,2),rasterMaterial));
const target=new T.WebGLRenderTarget(1,1,{type:T.FloatType}),pixel=new Float32Array(4),rasters=[4,64].map(size=>({size,target:new T.WebGLRenderTarget(size,size,{type:T.FloatType}),data:new Float32Array(size*size*4)}));
function average(raster){uniforms.rasterSize.value=raster.size;renderer.setRenderTarget(raster.target);renderer.render(rasterScene,camera);renderer.readRenderTargetPixels(raster.target,0,0,raster.size,raster.size,raster.data);let sum=0;for(let i=0;i<raster.data.length;i+=4)sum+=raster.data[i];return sum/(raster.size*raster.size);}
const floatLinearSupported=!!gl.getExtension('OES_texture_float_linear'),samples=[],qualityStates={};let quadratureError=0,denseError=0,manualError=0,unfilteredError=0,originalSquared=0,filteredSquared=0,averagedCases=0;
for(const quality of['balanced','high','ultra']){
 ocean.setQuality(quality);qualityStates[quality]=ocean.material.uniforms.whitecapFiltering.value;
 for(const floatLinear of[false,...(floatLinearSupported?[true]:[])]){
  ocean.configureFiltering(floatLinear);uniforms.manualInterpolation=ocean.material.uniforms.manualInterpolation;
  for(const c of oracle.cases){
   for(const[name,value]of[['probeQ',c.q],['probeP',c.p],['probeQDx',c.qdx],['probeQDy',c.qdy],['probePDx',c.pdx],['probePDy',c.pdy]])uniforms[name].value.set(...value);
   renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);if(!pixel.every(Number.isFinite))throw new Error('Non-finite whitecap coverage');const actual=[...pixel].slice(0,2),a4=average(rasters[0]),a64=average(rasters[1]);
   const footprint=Math.max(Math.hypot(...c.qdx),Math.hypot(...c.qdy)),t=quality==='balanced'?0:Math.max(0,Math.min(1,(footprint-23.3/256)/(23.3/256))),weight=t*t*(3-2*t),expected=actual[0]*(1-weight)+a4*weight,eq=Math.abs(actual[1]-expected),ed=Math.abs(a64-c.reference64);
   quadratureError=Math.max(quadratureError,eq);denseError=Math.max(denseError,ed);if(quality==='balanced'||c.family==='resolved')unfilteredError=Math.max(unfilteredError,Math.abs(actual[0]-actual[1]));
   if(!floatLinear)manualError=Math.max(manualError,Math.abs(actual[0]-c.original),Math.abs(actual[1]-(quality==='balanced'?c.original:c.candidate)));
   if(quality!=='balanced'&&c.family!=='resolved'&&c.family!=='transition'){originalSquared+=(actual[0]-a64)**2;filteredSquared+=(actual[1]-a64)**2;averagedCases++;}
   samples.push({quality,floatLinear,family:c.family,anchor:c.anchor,actual,reference64:a64,quadratureError:eq,denseError:ed});
  }
 }
}
const ext=gl.getExtension('WEBGL_debug_renderer_info');window.__WHITECAP_FOOTPRINT_PROBE__={gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',floatLinearSupported,count:samples.length,quadratureError,denseError,manualError,unfilteredError,qualityStates,oracleConvergence:oracle.maximumConvergence,inactive:oracle.inactive,originalRMSE:Math.sqrt(originalSquared/averagedCases),filteredRMSE:Math.sqrt(filteredSquared/averagedCases),derivativesBeforeDiscard:source.indexOf('foamQDx=dFdx')<source.indexOf('if(hullCutout)discard'),error:gl.getError(),samples};
