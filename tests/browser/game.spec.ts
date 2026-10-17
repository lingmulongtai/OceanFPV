import { test, expect, type Page } from '@playwright/test';
import {CRUISE_OCCLUSION} from '../../src/generated/cruise-occlusion';
import {recordStartupTiming} from './startup-timing';

const SCENE_LOAD_TIMEOUT=360000;
async function loadScene(page:Page,navigate:()=>Promise<unknown>) {
  // Async boot now resolves navigation before slow software scene initialization.
  // Bound each complete load, then preserve the original budget for assertions.
  const info=test.info(),assertionBudget=info.timeout,started=Date.now();
  info.setTimeout(assertionBudget+SCENE_LOAD_TIMEOUT);
  const stopTiming=await recordStartupTiming(page,info);
  try {
    await navigate();
    await expect(page.locator('#start')).toBeEnabled({timeout:Math.max(1,SCENE_LOAD_TIMEOUT-(Date.now()-started))});
  } finally {await stopTiming?.();}
  info.setTimeout(assertionBudget+Date.now()-started);
}

async function verifyCabinVisibility(page:Page) {
  const actual=await page.evaluate(async()=>{
    const texture=(window as any).__OCEANFPV__.world.cruise.paint[0].aoMap,pixels=texture.image.data;
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),byte=>byte.toString(16).padStart(2,'0')).join('');
    return {bytes:pixels.byteLength,width:texture.image.width,height:texture.image.height,channel:texture.channel,digest};
  });
  expect(actual).toEqual({bytes:CRUISE_OCCLUSION.byteLength,width:CRUISE_OCCLUSION.width,height:CRUISE_OCCLUSION.height,channel:1,digest:CRUISE_OCCLUSION.sha256});
}

async function ready(page: Page) {
  await page.addInitScript(()=> { if(!localStorage.getItem('oceanfpv:settings')) localStorage.setItem('oceanfpv:settings',JSON.stringify({quality:'balanced',sea:'breeze'})); });
  await loadScene(page,()=>page.goto('/?test=1',{timeout:SCENE_LOAD_TIMEOUT}));
  await page.evaluate(() => {
    const quality=document.querySelector<HTMLSelectElement>('#quality')!;
    if(quality.value!=='balanced') {quality.value='balanced';quality.dispatchEvent(new Event('input',{bubbles:true}));}
  });
}
async function recordGroundPrograms(page:Page) {
  await page.addInitScript(()=> {
    const prototype=WebGL2RenderingContext.prototype,link=prototype.linkProgram;
    (window as any).__GROUND_PROGRAMS__=[];
    prototype.linkProgram=function(program) {
      link.call(this,program);if(!this.getProgramParameter(program,this.LINK_STATUS))return;
      const names:string[]=[],types:number[]=[this.SAMPLER_2D,this.SAMPLER_CUBE,this.SAMPLER_2D_SHADOW,this.SAMPLER_2D_ARRAY,this.SAMPLER_3D];let samplers=0;
      for(let i=0;i<this.getProgramParameter(program,this.ACTIVE_UNIFORMS);i++){const uniform=this.getActiveUniform(program,i)!;names.push(uniform.name);if(types.includes(uniform.type))samplers+=uniform.size;}
      (window as any).__GROUND_PROGRAMS__.push({names,samplers,limit:this.getParameter(this.MAX_TEXTURE_IMAGE_UNITS)});
    };
  });
}

async function verifyTreeBounds(page:Page) {
  const result=await page.evaluate(async()=> {
    const a=(window as any).__OCEANFPV__,w=a.world,f=w.forest,T=await import('/node_modules/three/build/three.module.js' as string);
    const matrix=new T.Matrix4(),sphere=new T.Sphere(),camera=new T.PerspectiveCamera(65,1.5,.1,5000),frustum=new T.Frustum(),violations:string[]=[];let cases=0,time=10;
    const keys=(values:any[])=>values.map(m=>m.elements.map(Math.fround).join(',')).sort();
    try {
      for(const quality of ['ultra','balanced','high','ultra'])for(const position of [f.points[0].position,f.points.at(-1).position,new T.Vector3(100000,100000,100000)]) {
        f.update(position,time++,quality,w.light);f.group.updateMatrixWorld(true);
        const limit=quality==='ultra'?8:quality==='high'?4:1,selected=f.points.map((p:any)=>({p,d:p.position.distanceToSquared(position)})).filter((p:any)=>p.d<110*110).sort((a:any,b:any)=>a.d-b.d).slice(0,limit).map((p:any)=>p.p.matrix);
        const primitives=new Map<string,any[]>();
        for(const mesh of f.near) {
          if(!primitives.has(mesh.geometry.uuid))primitives.set(mesh.geometry.uuid,[]);
          if(mesh.visible!==(mesh.count>0)||mesh.count>1||!mesh.frustumCulled||!mesh.castShadow||!mesh.receiveShadow)violations.push('visibility or camera culling');
          if(!mesh.count)continue;
          mesh.getMatrixAt(0,matrix);primitives.get(mesh.geometry.uuid)!.push(matrix.clone());mesh.geometry.computeBoundingSphere();sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(matrix);
          if(sphere.center.distanceTo(mesh.boundingSphere.center)+sphere.radius>mesh.boundingSphere.radius+1e-4)violations.push('stale bounds');
          for(const offset of [new T.Vector3(30,5,40),new T.Vector3(-30,-5,-40),new T.Vector3(0,100,0)]) {
            camera.position.copy(sphere.center).add(offset);camera.lookAt(sphere.center);camera.updateMatrixWorld();frustum.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
            if(!frustum.intersectsObject(mesh))violations.push('visible tree rejected');
          }
        }
        for(const actual of primitives.values())if(JSON.stringify(keys(actual))!==JSON.stringify(keys(selected)))violations.push('selected tree coverage');
        if(f.sprites.count+selected.length!==f.points.length)violations.push('sprite coverage');cases++;
      }
    } finally {f.update(a.camera.position,a.getState().time,w.quality,w.light);}
    return{cases,violations};
  });
  expect(result).toEqual({cases:12,violations:[]});
}

test('renders the sea, detailed scene, and usable menu without WebGL errors', async ({page})=> {
  await page.addInitScript(()=> {
    const prototype=WebGL2RenderingContext.prototype,wait=prototype.clientWaitSync,fetch=window.fetch.bind(window);
    const gate={completed:0,requests:[] as {url:string;time:number}[]};(window as any).__INITIAL_GPU_GATE__=gate;
    prototype.clientWaitSync=function(sync,flags,timeout) {
      const status=wait.call(this,sync,flags,timeout);
      if(!gate.completed&&(status===this.ALREADY_SIGNALED||status===this.CONDITION_SATISFIED))gate.completed=performance.now();
      return status;
    };
    window.fetch=(input,init)=> {
      const url=String(input);if(/\.(jpg|hdr|glb)$/.test(url))gate.requests.push({url,time:performance.now()});
      return fetch(input,init);
    };
  });
  const atlasResponses:number[]=[];page.on('response',response=>{if(response.url().endsWith('.rgba'))atlasResponses.push(response.status());});
  await recordGroundPrograms(page);const detailRequests:string[]=[];page.on('request',request=>{if(/seaside_rock_(diff|nor_gl|rough)_4k.jpg$/.test(request.url()))detailRequests.push(request.url());});
  const networkFailures:{url:string;error:string|undefined}[]=[];page.on('requestfailed',request=>networkFailures.push({url:request.url(),error:request.failure()?.errorText}));
  await page.setViewportSize({width:960,height:640});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await ready(page);
  const gate=await page.evaluate(()=>({...(window as any).__INITIAL_GPU_GATE__,ready:performance.getEntriesByName('oceanfpv:initial-gpu-ready')[0]?.startTime}));
  console.log(`Initial GPU gate: ${JSON.stringify(gate)}`);
  expect(gate.completed).toBeGreaterThan(0);expect(gate.ready).toBeGreaterThanOrEqual(gate.completed);expect(gate.requests.length).toBeGreaterThan(10);
  for(const request of gate.requests)expect(request.time).toBeGreaterThanOrEqual(gate.ready);
  // Keep this static scene audit from queuing an animated software-GPU frame
  // between every assertion and the lazy Three.js imports used for tree bounds.
  await page.evaluate(()=>document.querySelector<HTMLButtonElement>('#open-help')!.click());
  await expect(page.locator('#help-dialog')).toBeVisible();
  await verifyCabinVisibility(page);expect(atlasResponses).toEqual([200]);
  const {loading,gpu,render,forest,rocks,cliff,detailPrograms,cliffPrograms,waterPrograms,unsupportedVisible,wakeDirections}=await page.evaluate(()=> {
    const app=(window as any).__OCEANFPV__,gl=document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');
    const rocks=app.world.rocks;
    const w=app.world;
    return {loading:{failures:w.surfaceFailures,note:document.querySelector('#start-note')!.textContent,detail:[w.coastalRockDetail.map,w.coastalRockDetail.normalMap,w.coastalRockDetail.roughnessMap].map(Boolean),bed:w.ocean.material.uniforms.hasSeabedMap.value&&w.ocean.material.uniforms.seabedMap.value===w.coastalRockDetail.map,tints:w.scene.children.filter((mesh:any)=>mesh.geometry?.attributes.groundCover).map((mesh:any)=>mesh.material.vertexColors)},
      detailPrograms:(window as any).__GROUND_PROGRAMS__.filter((program:any)=>program.names.includes('groundDetailMap')),cliffPrograms:(window as any).__GROUND_PROGRAMS__.filter((program:any)=>program.names.includes('groundCliffMap')),waterPrograms:(window as any).__GROUND_PROGRAMS__.filter((program:any)=>program.names.includes('islandBathymetry')),unsupportedVisible:!!document.querySelector('#unsupported')!.getClientRects().length,
      gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',render:app.getState(),forest:w.forest?.sourceTriangles??0,cliff:w.cliff?.surface.geometry.index.count/3,
      wakeDirections:w.ocean.material.uniforms.vesselDirections.value.map((direction:any,i:number)=>({actual:direction.toArray(),heading:(i===0?w.cruise.root:w.yacht).rotation.y})),
      rocks:{triangles:rocks?.shape.geometry.index.count/3,placements:rocks?.placements.length,instances:rocks?.group.children.reduce((sum:number,mesh:any)=>sum+mesh.count,0),reef:rocks?.placements.filter((p:any)=>Math.hypot(p.matrix.elements[12]-app.world.lighthouseReef.x,p.matrix.elements[14]-app.world.lighthouseReef.z)<50).length,
        perIsland:w.islands.map((c:any)=>rocks?.placements.filter((p:any)=>Math.abs(p.matrix.elements[12]-c.x)<c.size*1.2&&Math.abs(p.matrix.elements[14]-c.z)<c.size*1.2).length)}};
  });
  console.log(`Surface delivery: ${JSON.stringify({...loading,networkFailures})}`);
  expect(loading.failures.filter((failure:any)=>!failure.recovered)).toEqual([]);expect(loading.detail).toEqual([true,true,true]);expect(loading.bed).toBe(true);expect(loading.tints).toEqual([false,false,false]);expect(loading.note).not.toContain('標準素材');
  console.log(`Renderer: ${gpu}`);
  if(process.env.OCEANFPV_NATIVE_GPU==='1') {
    expect(gpu).not.toMatch(/SwiftShader|Microsoft Basic|unavailable/i);expect(gpu).toContain('Direct3D11');
  }
  expect(unsupportedVisible).toBe(false);
  for(const direction of wakeDirections){expect(direction.actual[0]).toBeCloseTo(Math.cos(direction.heading),8);expect(direction.actual[1]).toBeCloseTo(Math.sin(direction.heading),8);}
  expect(render.triangles).toBeGreaterThan(30000);
  expect(forest).toBeGreaterThan(1000000);
  expect(rocks.triangles).toBe(14844);expect(rocks.perIsland).toEqual([69,79,79]);expect(rocks.placements).toBe(236);expect(rocks.instances).toBe(rocks.placements);expect(rocks.reef).toBe(9);expect(cliff).toBe(943284);
  expect(detailPrograms.length).toBeGreaterThan(0);for(const program of detailPrograms){expect(program.samplers).toBeLessThanOrEqual(program.limit);expect(program.names).toContain('groundDetailNormalMap');expect(program.names).toContain('groundDetailRoughnessMap');}
  expect(cliffPrograms.length).toBeGreaterThan(0);for(const program of cliffPrograms){expect(program.names).toContain('groundCliffNormalMap');expect(program.names).toContain('groundCliffRoughnessMap');expect(program.names).toContain('groundDetailMap');expect(program.samplers).toBeLessThanOrEqual(program.limit);}
  expect(waterPrograms.length).toBeGreaterThan(0);for(const program of waterPrograms){expect(program.samplers).toBe(16);expect(program.names).toContain('foamEnvironment');expect(program.names).toContain('localSlopeMoments');expect(program.samplers).toBeLessThanOrEqual(program.limit);}
  console.log(`Water production samplers: ${JSON.stringify(waterPrograms.map((program:any)=>({samplers:program.samplers,limit:program.limit,foamEnvironment:program.names.includes('foamEnvironment')})))}`);
  const recovered=loading.failures.filter((failure:any)=>failure.asset==='seaside_rock'&&failure.recovered);
  expect(detailRequests.length).toBe(3+recovered.length);expect(new Set(detailRequests).size).toBe(3);
  for(const url of new Set(detailRequests)){const map=/seaside_rock_(diff|nor_gl|rough)_4k.jpg$/.exec(url)![1];expect(detailRequests.filter(request=>request===url).length).toBe(1+recovered.filter((failure:any)=>failure.map===map).length);}
  console.log(`Ground production samplers: ${JSON.stringify(detailPrograms.map((program:any)=>({samplers:program.samplers,limit:program.limit})))}`);
  await verifyTreeBounds(page);
  const closed=await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#help-dialog [data-close="help-dialog"]')!.click();return !document.querySelector<HTMLDialogElement>('#help-dialog')!.open;});expect(closed).toBe(true);
  expect(errors).toEqual([]);
});

for(const peer of [false,true])test(peer?'expired rock response and peer both recover without refetching the completed map':'one expired rock response retries only that image and reaches full detail',async({page})=> {
  const requests:string[]=[],errors:string[]=[];page.on('request',request=>{const map=/seaside_rock_(diff|nor_gl|rough)_4k.jpg$/.exec(request.url());if(map)requests.push(map[1]);});page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({peer})=> {
    const timeout=AbortSignal.timeout,controllers=new WeakMap<AbortSignal,AbortController>(),fetch=window.fetch.bind(window),selected=new Set<string>();
    const cacheRequests:{map:string;cache:RequestCache}[]=[];(window as any).__SURFACE_FETCHES__=cacheRequests;
    AbortSignal.timeout=ms=>{const deadline=timeout.call(AbortSignal,ms),controller=new AbortController();deadline.addEventListener('abort',()=>controller.abort(deadline.reason),{once:true});controllers.set(controller.signal,controller);return controller.signal;};
    window.fetch=async(input,init)=> {
      const texture=/seaside_rock_(diff|nor_gl|rough)_4k.jpg$/.exec(String(input))?.[1];if(texture)cacheRequests.push({map:texture,cache:init?.cache??'default'});
      const map=/seaside_rock_(rough|nor_gl)_4k.jpg$/.exec(String(input))?.[1],expire=!!map&&!selected.has(map)&&(map==='rough'||peer);if(expire)selected.add(map!);
      const response=await fetch(input,init);
      if(expire){const controller=controllers.get(init!.signal as AbortSignal);if(!controller)throw new Error('Missing controlled texture deadline');controller.abort(new DOMException('Controlled response deadline','TimeoutError'));}
      return response;
    };
  },{peer});
  await ready(page);
  const state=await page.evaluate(()=>{const w=(window as any).__OCEANFPV__.world;return {failures:w.surfaceFailures,detail:[w.coastalRockDetail.map,w.coastalRockDetail.normalMap,w.coastalRockDetail.roughnessMap].map(Boolean),note:document.querySelector('#start-note')!.textContent,cacheRequests:(window as any).__SURFACE_FETCHES__ as {map:string;cache:RequestCache}[]};});
  console.log(`Recovered surface delivery: ${JSON.stringify({state,requests})}`);
  expect(state.detail).toEqual([true,true,true]);expect(state.note).not.toContain('標準素材');
  const recovered=state.failures.filter((failure:any)=>failure.asset==='seaside_rock'&&failure.recovered),controlled=recovered.filter((failure:any)=>failure.map==='rough');
  expect(controlled).toEqual([expect.objectContaining({asset:'seaside_rock',map:'rough',phase:'body',message:'Controlled response deadline',aborted:true,abortReason:'TimeoutError',attempt:1,recovered:true})]);
  expect(state.failures.filter((failure:any)=>!failure.recovered)).toEqual([]);expect(['fetch','body']).toContain(controlled[0].phase);
  expect(requests.length).toBe(3+recovered.length);
  for(const map of ['diff','nor_gl','rough']){const failures=recovered.filter((failure:any)=>failure.map===map);expect(failures.length).toBeLessThanOrEqual(1);expect(requests.filter(request=>request===map).length).toBe(1+failures.length);expect(state.cacheRequests.filter(request=>request.map===map).map(request=>request.cache)).toEqual(failures.length?['default','reload']:['default']);}
  expect(requests.filter(map=>map==='rough').length).toBe(2);
  if(peer){expect(recovered.filter((failure:any)=>failure.map==='nor_gl')).toEqual([expect.objectContaining({phase:'body',message:'Controlled response deadline',attempt:1,recovered:true})]);expect(requests.filter(map=>map==='diff').length).toBe(1);}
  expect(errors).toEqual([]);
});

for(const preset of ['day','golden'])test(`${preset} photographic sky downloads before material readiness but defers decoding`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`/tests/browser/fixtures/sky-decode-probe.html?preset=${preset}`);
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__SKY_DECODE_PROBE__);},{timeout:60000}).toBe(true);
  const probe=await page.evaluate(()=>(window as any).__SKY_DECODE_PROBE__);console.log(`Sky decode ordering: ${JSON.stringify(probe)}`);
  expect(probe.preset).toBe(preset);expect(probe.before).toEqual({parseCalls:0,settled:false});expect(probe.parseCalls).toBe(1);expect(probe.settled).toBe(true);expect([probe.width,probe.height,probe.bytes]).toEqual([4096,2048,67108864]);expect(errors).toEqual([]);
});

test('late photographed skies keep the selected preset, deduplicate and relight the forest',async({page})=> {
  test.setTimeout(600000);
  const requests:string[]=[],errors:string[]=[];
  page.on('request',request=>{if(request.url().endsWith('.hdr'))requests.push(request.url().split('/').at(-1)!);});
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=> {
    localStorage.setItem('oceanfpv:settings',JSON.stringify({quality:'balanced',light:'blue',sea:'breeze'}));
    const read=Response.prototype.arrayBuffer;(window as any).__HDR_BODIES__=[];
    Response.prototype.arrayBuffer=async function(){const buffer=await read.call(this);if(this.url.endsWith('.hdr'))(window as any).__HDR_BODIES__.push(this.url);return buffer;};
    const raf=requestAnimationFrame.bind(window),frames={frozen:false};(window as any).__SKY_PRESET_FRAMES__=frames;
    window.requestAnimationFrame=callback=>raf(time=>{if(!frames.frozen)callback(time);});
  });
  let releaseDay!:()=>void,releaseGolden!:()=>void;
  const dayGate=new Promise<void>(resolve=>releaseDay=resolve),goldenGate=new Promise<void>(resolve=>releaseGolden=resolve);
  await page.route('**/textures/*.hdr',async route=>{const response=await route.fetch();await (route.request().url().includes('kloppenheim_06')?goldenGate:dayGate);await route.fulfill({response});});
  try {
    await ready(page);expect(requests).toEqual([]);
    const timing=await page.evaluate(()=> {
      const a=(window as any).__OCEANFPV__,initial={time:a.getState().time,hidden:document.hidden,pause:document.querySelector<HTMLDialogElement>('#pause-dialog')!.open};
      document.querySelector<HTMLButtonElement>('#open-settings')!.click();
      // This verifies resource races and a nonzero sky rotation, independently
      // of software-rendered frame cadence or the flight clock's 10-second cap.
      (window as any).__SKY_PRESET_FRAMES__.frozen=true;
      a.world.scene.backgroundRotation.set(0,.2,0);a.world.scene.environmentRotation.copy(a.world.scene.backgroundRotation);
      const select=document.querySelector<HTMLSelectElement>('#light')!;select.value='day';select.dispatchEvent(new Event('input',{bubbles:true}));
      // Other controls must share the same in-flight DAY request.
      const rate=document.querySelector<HTMLInputElement>('#rate')!;for(const value of ['650','700']){rate.value=value;rate.dispatchEvent(new Event('input',{bubbles:true}));}
      select.value='golden';select.dispatchEvent(new Event('input',{bubbles:true}));
      return initial;
    });
    console.log(`Sky race initial timing: ${JSON.stringify(timing)}`);
    await expect.poll(()=>requests.length,{timeout:60000}).toBe(2);
    releaseDay();
    await page.waitForFunction(()=>(window as any).__HDR_BODIES__.some((url:string)=>url.includes('kloofendal_48d')),{},{polling:50,timeout:60000});
    const stale=await page.evaluate(()=>{const w=(window as any).__OCEANFPV__.world;return {light:w.light,photo:!!w.scene.background.isDataTexture,forest:w.forest.bakeScene.environment===w.scene.environment};});
    expect(stale).toEqual({light:'golden',photo:false,forest:true});
    releaseGolden();
    await page.waitForFunction(()=>!!(window as any).__OCEANFPV__.world.scene.background.isDataTexture,{},{polling:50,timeout:60000});
    const completed=await page.evaluate(()=> {
      const w=(window as any).__OCEANFPV__.world,background=w.scene.background,environment=w.scene.environment;
      const direction=w.sun.clone().set(0.7769250679233294,0.1391393441638262,0.6140257989188974).applyAxisAngle(w.sun.clone().set(0,1,0),w.scene.backgroundRotation.y);
      const light=w.forest.bakeScene.children.find((child:any)=>child.isDirectionalLight),atlasDirection=light.position.clone().sub(light.target.position).normalize();
      const result={rotation:w.scene.backgroundRotation.y,sun:w.sun.distanceTo(direction),atlas:atlasDirection.distanceTo(w.sun),forest:w.forest.bakeScene.environment===environment,forestRotation:w.forest.bakeScene.environmentRotation.equals(w.scene.environmentRotation)};
      const select=document.querySelector<HTMLSelectElement>('#light')!;
      for(const value of ['day','golden']){select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}));}
      return {...result,reused:w.scene.background===background&&w.scene.environment===environment};
    });
    expect(completed.rotation).toBeGreaterThan(0);expect(completed.sun).toBeLessThan(1e-12);expect(completed.atlas).toBeLessThan(1e-6);
    expect(completed.forest).toBe(true);expect(completed.forestRotation).toBe(true);expect(completed.reused).toBe(true);
    expect(requests.sort()).toEqual(['kloppenheim_06_puresky_4k.hdr','kloofendal_48d_partly_cloudy_puresky_4k.hdr'].sort());expect(errors).toEqual([]);
  } finally {releaseDay();releaseGolden();}
});

test('missing golden sky stays playable and late sky delivery respects context loss',async({page})=> {
  test.setTimeout(600000);await page.setViewportSize({width:320,height:240});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=> {
    localStorage.setItem('oceanfpv:settings',JSON.stringify({quality:'balanced',light:'golden','input-source':'keyboard',volume:'0'}));
    const prototype=WebGL2RenderingContext.prototype,read=Response.prototype.arrayBuffer;
    (window as any).__SKY_RECOVERY__={draws:0,bodies:0};
    for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'] as const) {
      const draw=prototype[name] as (...args:number[])=>void;
      (prototype[name] as (...args:number[])=>void)=function(this:WebGL2RenderingContext,...args:number[]){(window as any).__SKY_RECOVERY__.draws++;return draw.apply(this,args);};
    }
    Response.prototype.arrayBuffer=async function(){const buffer=await read.call(this);if(this.url.endsWith('.hdr'))(window as any).__SKY_RECOVERY__.bodies++;return buffer;};
  });
  await page.route('**/kloppenheim_06_puresky_4k.hdr',route=>route.fulfill({status:404,body:'Missing optional sky'}));
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let requested=false;
  await page.route('**/kloofendal_48d_partly_cloudy_puresky_4k.hdr',async route=>{const response=await route.fetch();requested=true;await gate;await route.fulfill({response});});
  try {
    await ready(page);
    expect(await page.evaluate(()=>!!(window as any).__OCEANFPV__.world.scene.background.isCubeTexture)).toBe(true);
    const takeoffDeadline=Date.now()+60000;let lifted=false,safetyRecoveries=0;
    await page.evaluate(()=>document.querySelector<HTMLButtonElement>('#start')!.click());
    while(Date.now()<takeoffDeadline) {
      await page.keyboard.down('Space');let observed;
      try {
        observed=await page.evaluate(async(budget:number)=> {
          const a=(window as any).__OCEANFPV__,deadline=performance.now()+budget;
          for(;;) {
            const state=a.getState(),lifted=a.flight.position.y>a.world.launchPose(state.time).position.y+1;
            if(state.paused||a.flight.crashed||lifted)return {paused:state.paused,crashed:a.flight.crashed,lifted,title:document.querySelector('#pause-title')!.textContent,copy:document.querySelector('#pause-copy')!.textContent};
            if(performance.now()>deadline)throw new Error('Missing-sky takeoff did not advance within 60 s');
            await new Promise<void>(finish=>requestAnimationFrame(()=>finish()));
          }
        },Math.max(0,takeoffDeadline-Date.now()));
      }finally {await page.keyboard.up('Space');}
      expect(observed.crashed).toBe(false);
      if(!observed.paused) {expect(observed.lifted).toBe(true);lifted=true;break;}
      expect(observed.title).toBe('描画が長時間止まりました');expect(observed.copy).toContain('処理の遅れが10秒を超えました');
      expect(++safetyRecoveries,'bounded missing-sky safety-pause recovery').toBeLessThanOrEqual(2);
      console.log(`Missing-sky safety-pause recovery ${safetyRecoveries}: ${JSON.stringify(observed)}`);
      expect(await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#resume')!.click();if(document.activeElement instanceof HTMLElement)document.activeElement.blur();return (window as any).__OCEANFPV__.getState().paused;})).toBe(false);
    }
    expect(lifted,'normal keyboard takeoff with missing optional sky').toBe(true);
    await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#open-settings')!.click();const select=document.querySelector<HTMLSelectElement>('#light')!;select.value='day';select.dispatchEvent(new Event('input',{bubbles:true}));});
    await expect.poll(()=>requested,{timeout:60000}).toBe(true);
    await page.evaluate(()=>{const gl=document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!;const extension=gl.getExtension('WEBGL_lose_context');if(!extension)throw new Error('Missing context-loss extension');extension.loseContext();});
    await expect(page.locator('#unsupported')).toBeVisible();
    const draws=await page.evaluate(()=>(window as any).__SKY_RECOVERY__.draws);release();
    await page.waitForFunction(()=>(window as any).__SKY_RECOVERY__.bodies===1);
    const recovered=await page.evaluate(()=>({draws:(window as any).__SKY_RECOVERY__.draws,disabled:document.querySelector<HTMLButtonElement>('#start')!.disabled,reason:document.querySelector('#unsupported-reason')!.textContent}));
    expect(recovered.draws).toBe(draws);expect(recovered.disabled).toBe(true);expect(recovered.reason).toContain('GPU');expect(errors).toEqual([]);
  } finally {release();}
});

test('optional photographed sky fence failure keeps a playable procedural fallback',async({page})=> {
  test.setTimeout(600000);await page.setViewportSize({width:320,height:240});
  const errors:string[]=[],requests:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().endsWith('.hdr'))requests.push(request.url());});
  await page.addInitScript(()=> {
    localStorage.setItem('oceanfpv:settings',JSON.stringify({quality:'balanced',light:'blue',sea:'breeze'}));
    const prototype=WebGL2RenderingContext.prototype,wait=prototype.clientWaitSync;(window as any).__SKY_FENCE_FAILURE__={requested:false,failed:false};
    prototype.clientWaitSync=function(...args){const state=(window as any).__SKY_FENCE_FAILURE__;if(state.requested){state.requested=false;state.failed=true;return this.WAIT_FAILED;}return wait.apply(this,args);};
  });
  await ready(page);
  await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#open-settings')!.click();(window as any).__SKY_FENCE_FAILURE__.requested=true;const select=document.querySelector<HTMLSelectElement>('#light')!;select.value='day';select.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>(window as any).__SKY_FENCE_FAILURE__.failed);
  expect(await page.evaluate(()=>{const w=(window as any).__OCEANFPV__.world;return {light:w.light,procedural:!!w.scene.background.isCubeTexture,enabled:!document.querySelector<HTMLButtonElement>('#start')!.disabled};})).toEqual({light:'day',procedural:true,enabled:true});
  expect(requests).toEqual([]);
  await page.evaluate(()=>{const select=document.querySelector<HTMLSelectElement>('#light')!;select.value='golden';select.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>!!(window as any).__OCEANFPV__.world.scene.background.isDataTexture,{},{timeout:60000});
  expect(requests.map(url=>url.split('/').at(-1))).toEqual(['kloppenheim_06_puresky_4k.hdr']);expect(errors).toEqual([]);
});

test('one missing rock detail map retains coherent macro terrain and grass rendering',async({page})=> {
  await recordGroundPrograms(page);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/seaside_rock_nor_gl_4k.jpg',route=>route.abort());await ready(page);
  const state=await page.evaluate(()=> {
    const world=(window as any).__OCEANFPV__.world,detail=world.coastalRockDetail;
    const islands=world.scene.children.filter((mesh:any)=>mesh.geometry?.attributes.groundCover);
    return {failures:world.surfaceFailures,detail:[detail.map,detail.normalMap,detail.roughnessMap].map(Boolean),bed:world.ocean.material.uniforms.hasSeabedMap.value,islands:islands.map((mesh:any)=>[mesh.material.map,mesh.material.normalMap,mesh.material.roughnessMap].every(Boolean)),tints:islands.map((mesh:any)=>mesh.material.vertexColors),cover:[world.groundCover.map,world.groundCover.normalMap,world.groundCover.roughnessMap].every(Boolean),programs:(window as any).__GROUND_PROGRAMS__.filter((program:any)=>program.names.includes('coverMap'))};
  });
  expect(state.detail).toEqual([false,false,false]);expect(state.bed).toBe(false);expect(state.islands).toEqual([true,true,true]);expect(state.tints).toEqual([false,false,false]);expect(state.cover).toBe(true);expect(state.programs.length).toBeGreaterThan(0);
  console.log(`Surface fallback: ${JSON.stringify(state.failures)}`);
  expect(state.failures.filter((failure:any)=>!failure.recovered)).toEqual([expect.objectContaining({asset:'seaside_rock',map:'nor_gl',phase:'fetch',aborted:false,abortReason:null,attempt:1})]);
  for(const program of state.programs){expect(program.names).not.toContain('groundDetailMap');expect(program.samplers).toBeLessThanOrEqual(program.limit);}
  await page.screenshot({path:'test-results/oceanfpv-ground-detail-fallback.png'});expect(errors).toEqual([]);
});

test('one missing large cliff map keeps the complete fine rock and grass material',async({page})=> {
  await recordGroundPrograms(page);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!(message.text()==='Failed to load resource: net::ERR_FAILED'&&message.location().url.endsWith('/marble_cliff_05_rough_4k.jpg')))errors.push(message.text());});
  await page.route('**/marble_cliff_05_rough_4k.jpg',route=>route.abort());await ready(page);
  await page.evaluate(()=>document.querySelector<HTMLButtonElement>('#open-help')!.click());await expect(page.locator('#help-dialog')).toBeVisible();
  const state=await page.evaluate(()=> {
    const w=(window as any).__OCEANFPV__.world,large=w.surfaceGroups.find((group:any)=>group.asset==='marble_cliff_05').materials[0];
    return {failures:w.surfaceFailures,large:[large.map,large.normalMap,large.roughnessMap].map(Boolean),fine:[w.coastalRockDetail.map,w.coastalRockDetail.normalMap,w.coastalRockDetail.roughnessMap].map(Boolean),cover:[w.groundCover.map,w.groundCover.normalMap,w.groundCover.roughnessMap].map(Boolean),enabled:!document.querySelector<HTMLButtonElement>('#start')!.disabled,programs:(window as any).__GROUND_PROGRAMS__.filter((program:any)=>program.names.includes('groundDetailMap'))};
  });
  expect(state.large).toEqual([false,false,false]);expect(state.fine).toEqual([true,true,true]);expect(state.cover).toEqual([true,true,true]);expect(state.enabled).toBe(true);expect(state.programs.length).toBeGreaterThan(0);
  expect(state.failures.filter((failure:any)=>!failure.recovered)).toEqual([expect.objectContaining({asset:'marble_cliff_05',map:'rough',phase:'fetch',aborted:false,attempt:1})]);
  for(const program of state.programs){expect(program.names).not.toContain('groundCliffMap');expect(program.names).toContain('groundDetailNormalMap');expect(program.names).toContain('groundDetailRoughnessMap');expect(program.samplers).toBeLessThanOrEqual(program.limit);}
  await page.screenshot({path:'test-results/oceanfpv-large-cliff-fallback.png'});expect(errors).toEqual([]);
});

test('photographed cliff contacts, joined ground and shared water depth agree',async({page})=> {
  await ready(page);
  const result=await page.evaluate(()=>{
    const w=(window as any).__OCEANFPV__.world,scan=w.cliff.surface,ground=w.cliffGround,Vector=w.cruise.root.position.constructor,Ray=w.lighthouseReef.topRay.constructor;
    const ray=new Ray(new Vector(-350,2,-450),new Vector(-1,0,0)),hit=scan.tree.raycastFirst(ray,2);if(!hit)throw new Error('Missing photographed front face');
    const front=hit.point.clone().add(new Vector(2,0,0)),back=hit.point.clone().add(new Vector(-2,0,0));
    const contacts=[w.collision(back,0,'breeze',front),w.collision(front,0,'breeze',back)];
    const position=ground.geometry.attributes.position,data=w.ocean.bottomData,texture=w.ocean.material.uniforms.bathymetry.value,packed=w.ocean.material.uniforms.islandBathymetry.value.image.data,coast=w.islands[0];
    let error=0,scanVertices=0;
    for(let i=0;i<position.count;i++) {const top=scan.topHeight(position.getX(i)+coast.x,position.getZ(i)+coast.z);if(top!==null)scanVertices++;error=Math.max(error,Math.abs(packed[i*2+1]-position.getY(i)),Math.abs(packed[i*2]-w.ocean.islandDepth.data[i]));}
    for(let z=0;z<193;z++)for(let x=0;x<193;x++)error=Math.max(error,Math.abs(data[(z*193+x)*4]-position.getY(z*4*769+x*4)));
    const trees=w.treeSites.flatMap((site:any)=>site.matrices).filter((m:any)=>{const e=m.elements;return ground.excludes(e[12],e[14],5*Math.hypot(e[0],e[1],e[2]));}).length;
    const rocks=w.rocks.placements.filter((p:any)=>ground.excludes(p.matrix.elements[12],p.matrix.elements[14])).length;
    const depth=w.ocean.cliffDepth,detail=w.ocean.material.uniforms.cliffBathymetry.value;
    return {contacts,error,scanVertices,sameDepth:data===texture.image.data,detailSame:detail.image.data===depth.data,detailSize:[detail.image.width,detail.image.height],shelf:depth.sample(-390,-441).height,clear:depth.sample(-391.5,-442.5).height,clearGround:ground.heightAt(-391.5,-442.5),ground:ground.heightAt(-380,-450),backGround:ground.heightAt(-400,-450),trees,rocks};
  });
  expect(result.contacts).toEqual(['海岸の崖に接触しました','海岸の崖に接触しました']);expect(result.error).toBe(0);expect(result.scanVertices).toBeGreaterThan(0);expect(result.sameDepth).toBe(true);expect(result.ground).toBe(-7);expect(result.trees).toBe(0);expect(result.rocks).toBe(0);
  expect(result.detailSame).toBe(true);expect(result.detailSize).toEqual([512,512]);expect(result.shelf).toBeGreaterThan(4);expect(result.clear).toBeCloseTo(result.clearGround,2);expect(result.backGround).toBeGreaterThan(0);
});

test('missing cliff leaves the original headland and its placements intact',async({page})=> {
  await page.route('**/models/coastal_cliff_02/**',route=>route.abort());await ready(page);
  const state=await page.evaluate(()=>{const w=(window as any).__OCEANFPV__.world;return {cliff:!!w.cliff,ground:!!w.cliffGround,rocks:w.rocks.placements.length,instances:w.rocks.group.children.reduce((n:number,mesh:any)=>n+mesh.count,0)};});
  expect(state).toEqual({cliff:false,ground:false,rocks:237,instances:237});await expect(page.locator('#start-note')).toContainText('標準素材');
});

test('cliff join keeps fallback rock rendering and collision records together',async({page})=> {
  await page.route('**/models/rock_07/**',route=>route.abort());await ready(page);
  const state=await page.evaluate(async()=>{
    const w=(window as any).__OCEANFPV__.world,ground=w.cliffGround,matrices=w.rockPatches.filter((p:any)=>p.fallback).map((p:any)=>p.fallback.count);
    const T=await import('/node_modules/three/build/three.module.js' as string),coast=w.islands[0],mesh=w.rockPatches[0].fallback,matrix=new T.Matrix4();mesh.geometry.computeBoundingBox();let lowShelf=0,aboveWater=0;
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const e=matrix.elements,y=ground.heightAt(e[12],e[14]);if(y>=-2&&y<=14)lowShelf++;if(mesh.geometry.boundingBox.clone().applyMatrix4(matrix).max.y>0)aboveWater++;}
    return {cliff:!!w.cliff,rocks:!!w.rocks,visible:matrices.reduce((n:number,count:number)=>n+count,0),contacts:w.fallbackRockObstacles.length,inside:w.fallbackRockObstacles.filter((p:any)=>ground.excludes(p.x,p.z,p.radius)).length,northwest:{profile:coast.profile,count:mesh.count,lowShelf,aboveWater}};
  });
  expect(state.cliff).toBe(true);expect(state.rocks).toBe(false);expect(state.contacts).toBeLessThan(270);expect(state.visible).toBe(state.contacts);expect(state.inside).toBe(0);
  expect(state.northwest.profile).toBe('trenyken');expect(state.northwest.count).toBeGreaterThan(60);expect(state.northwest.lowShelf).toBe(state.northwest.count);expect(state.northwest.aboveWater).toBe(state.northwest.count);
});

test('detailed cliff water height gradient and attenuation agree on the GPU',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/cliff-depth-probe.html');
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__CLIFF_DEPTH_PROBE__);},{timeout:60000}).toBe(true);
  const result=await page.evaluate(()=>{const p=(window as any).__CLIFF_DEPTH_PROBE__;return {gpu:p.gpu,count:p.samples.length,heightError:p.heightError,gradientError:p.gradientError,envelopeError:p.envelopeError,opticalCount:p.opticalSamples.length,opticalMaximum:p.opticalMaximum,radianceCount:p.radianceSamples.length,radianceMaximum:p.radianceMaximum,irradianceCount:p.irradianceSamples.length,irradianceMaximum:p.irradianceMaximum};});
  console.log(`Cliff depth probe: ${JSON.stringify(result)}`);expect(result.count).toBe(77);expect(result.heightError).toBeLessThan(.003);expect(result.gradientError).toBeLessThan(.003);expect(result.envelopeError).toBeLessThan(.003);expect(result.opticalCount).toBe(616);expect(result.opticalMaximum).toBeLessThan(.003);expect(result.radianceCount).toBe(324);expect(result.radianceMaximum).toBeLessThan(.0001);expect(result.irradianceCount).toBe(20);expect(result.irradianceMaximum).toBeLessThan(.0001);expect(errors).toEqual([]);
});

test('production hull water masks agree on the GPU for cruise and yacht',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/hull-mask-probe.html');
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__HULL_MASK_PROBE__);},{timeout:60000}).toBe(true);
  const result=await page.evaluate(()=>(window as any).__HULL_MASK_PROBE__);console.log(`Hull mask probe: ${JSON.stringify(result)}`);expect(result.count).toBe(8872);expect(result.cruiseCount).toBe(8304);expect(result.poseCount).toBe(5);
  // Retain the tighter untransformed aft bound; 15 km matrix translations use floats.
  // SwiftShader's existing sin/pow bow profile differs by up to 1.36 mm.
  expect(result.widthError).toBeLessThan(.002);expect(result.aftWidthError).toBeLessThan(.0005);expect(result.posedWidthError).toBeLessThan(.002);expect(result.maskErrors).toBe(0);expect(errors).toEqual([]);
});

test('cruise hull surfaces have matching flight contacts and clear surrounding air',async({page})=> {
  await ready(page);
  const samples=await page.evaluate(async()=>{
    const a=(window as any).__OCEANFPV__,w=a.world,T=await import('/node_modules/three/build/three.module.js' as string),hull=w.cruise.root.children.find((mesh:any)=>mesh.material===w.cruise.paint[1]),samples=[];
    for(const side of [-1,1])for(const z of [-123.5,-110,80,100,110,120,125,129])for(const y of [4.2,7.6]) {
      const origin=w.cruise.root.localToWorld(new T.Vector3(side*30,y,z)),direction=new T.Vector3(-side,0,0).transformDirection(w.cruise.root.matrixWorld),hit=new T.Raycaster(origin,direction).intersectObject(hull)[0];if(!hit)throw new Error('Missing cruise hull');
      const outward=hit.face!.normal.clone().transformDirection(hull.matrixWorld),outside=hit.point.clone().addScaledVector(outward,.3);samples.push({z,y,width:Math.abs(w.cruise.root.worldToLocal(hit.point.clone()).x),contact:w.collision(hit.point,a.getState().time,'breeze'),clear:w.collision(outside,a.getState().time,'breeze')});
    }
    return samples;
  });
  expect(samples).toHaveLength(32);for(const sample of samples){expect(sample.contact).toContain('船体');expect(sample.clear).toBeNull();if(sample.z>=80&&sample.z<=120)expect(sample.width).toBeGreaterThan(15);}
});

test('aft lounge windows reveal real room depth and retain closed flight contacts',async({page})=> {
  await ready(page);
  const result=await page.evaluate(async()=>{
    const a=(window as any).__OCEANFPV__,w=a.world,T=await import('/node_modules/three/build/three.module.js' as string),glass=w.cruise.root.children.filter((m:any)=>m.material===w.cruise.glazing),opaque=w.cruise.root.children.filter((m:any)=>m.isMesh&&m.material!==w.cruise.glazing&&!m.material.transparent),samples=[];
    for(let deck=0;deck<8;deck++){
      const y=10.6+deck*2.85,length=deck<5?196:178-(deck-5)*18,z=deck<5?3:9+(deck-5)*3;
      const origin=w.cruise.root.localToWorld(new T.Vector3(0,y+.02,z+length/2+.7)),direction=new T.Vector3(0,0,-1).transformDirection(w.cruise.root.matrixWorld),ray=new T.Raycaster(origin,direction),pane=ray.intersectObjects(glass)[0],walls=ray.intersectObjects(opaque),wall=walls[0];if(!pane||!wall)throw new Error(`Missing lounge ${deck}`);
      const local=w.cruise.root.worldToLocal(pane.point.clone()),air=local.clone().add(new T.Vector3(0,0,.5));samples.push({depth:pane.point.distanceTo(wall.point),coplanar:walls.filter((hit:any)=>Math.abs(hit.distance-wall.distance)<.00001).length,zError:Math.abs(local.z-z-length/2-.07),contact:w.collision(pane.point,a.getState().time,'breeze'),clear:w.collision(w.cruise.root.localToWorld(air),a.getState().time,'breeze')});
    }
    const data=w.cruise.teak.aoMap.image.data,chartFloor=data.slice(256*256*4,320*256*4);return {samples,aoHeight:w.cruise.teak.aoMap.image.height,minimum:Math.min(...chartFloor.filter((_:number,i:number)=>i%4===0))};
  });
  expect(result.aoHeight).toBe(384);expect(result.minimum).toBeLessThan(100);expect(result.samples).toHaveLength(8);for(const sample of result.samples){expect(sample.coplanar).toBe(1);expect(sample.depth).toBeGreaterThan(6);expect(sample.depth).toBeLessThan(6.1);expect(sample.zError).toBeLessThan(.00002);expect(sample.contact).toContain('構造物');expect(sample.clear).toBeNull();}
});

test('bow lounge windows expose supported room depth and preserve closed flight contacts',async({page})=> {
  await ready(page);
  const result=await page.evaluate(async()=>{
    const a=(window as any).__OCEANFPV__,w=a.world,T=await import('/node_modules/three/build/three.module.js' as string),root=w.cruise.root;
    const glass=root.children.filter((m:any)=>m.material===w.cruise.glazing),opaque=root.children.filter((m:any)=>m.isMesh&&m.material!==w.cruise.glazing&&!m.material.transparent),samples=[];
    for(let deck=1;deck<8;deck++) {
      const y=10.6+deck*2.85,length=deck<5?196:178-(deck-5)*18,z=deck<5?3:9+(deck-5)*3,floor=y-1.27;
      const origin=root.localToWorld(new T.Vector3(4,y+.02,z-length/2-.7)),direction=new T.Vector3(0,0,1).transformDirection(root.matrixWorld),ray=new T.Raycaster(origin,direction),pane=ray.intersectObjects(glass)[0],wall=ray.intersectObjects(opaque)[0];
      if(!pane||!wall)throw new Error(`Missing bow lounge ${deck}`);
      const local=root.worldToLocal(pane.point.clone()),air=root.localToWorld(local.clone().add(new T.Vector3(0,0,-.5))),inside=root.localToWorld(new T.Vector3(4,y+.02,z-length/2+2));
      const down=new T.Vector3(0,-1,0).transformDirection(root.matrixWorld),up=down.clone().negate(),bottom=new T.Raycaster(inside,down).intersectObjects(opaque)[0],top=new T.Raycaster(inside,up).intersectObjects(opaque)[0];if(!bottom||!top)throw new Error('Missing bow floor or ceiling');
      samples.push({depth:pane.point.distanceTo(wall.point),zError:Math.abs(local.z-z+length/2+.07),contact:w.collision(pane.point,a.getState().time,'breeze'),air:w.collision(air,a.getState().time,'breeze'),floorError:Math.abs(root.worldToLocal(bottom.point.clone()).y-floor-.06),ceilingError:Math.abs(root.worldToLocal(top.point.clone()).y-floor-2.55)});
    }
    const origin=root.localToWorld(new T.Vector3(4,10.62,-99)),direction=new T.Vector3(0,0,1).transformDirection(root.matrixWorld),plinth=new T.Raycaster(origin,direction).intersectObjects(root.children)[0];
    if(!plinth)throw new Error('Missing lower bow wall');return {samples,opaquePlinth:plinth.object.material===w.cruise.paint[0],plinthContact:w.collision(plinth.point,a.getState().time,'breeze')};
  });
  expect(result.opaquePlinth).toBe(true);expect(result.plinthContact).toContain('客船');expect(result.samples).toHaveLength(7);for(const sample of result.samples){expect(sample.depth).toBeGreaterThan(6);expect(sample.zError).toBeLessThan(.00002);expect(sample.contact).toContain('客船');expect(sample.air).toBeNull();expect(sample.floorError).toBeLessThan(.00002);expect(sample.ceilingError).toBeLessThan(.00002);}
});

test('bridge foundation connects to the deck and matches flight contacts',async({page})=> {
  await ready(page);
  const result=await page.evaluate(async()=>{
    const a=(window as any).__OCEANFPV__,w=a.world,T=await import('/node_modules/three/build/three.module.js' as string),root=w.cruise.root;
    const samples=[];
    for(const x of [-12.6,0,12.6]){
      const origin=root.localToWorld(new T.Vector3(x,30,-77)),direction=new T.Vector3(0,0,1).transformDirection(root.matrixWorld),hit=new T.Raycaster(origin,direction).intersectObject(root,true)[0];
      if(!hit)throw new Error('Missing bridge support');
      // Start inside the support, above the deck cap; back faces do not mask its foundation.
      const local=root.worldToLocal(hit.point.clone()),under=root.localToWorld(new T.Vector3(x,29.4,-64)),down=new T.Vector3(0,-1,0).transformDirection(root.matrixWorld),foundation=new T.Raycaster(under,down).intersectObject(root,true)[0];
      if(!foundation)throw new Error('Missing bridge support foundation');
      samples.push({paint:hit.object.material===w.cruise.paint[0],faceError:Math.abs(local.z+74.5),contact:w.collision(hit.point,a.getState().time,'breeze'),deckError:Math.abs(root.worldToLocal(foundation.point.clone()).y-29.28)});
    }
    return {samples,air:w.collision(root.localToWorld(new T.Vector3(14.5,30,-73)),a.getState().time,'breeze')};
  });
  expect(result.samples).toHaveLength(3);expect(result.air).toBeNull();
  for(const sample of result.samples){expect(sample.paint).toBe(true);expect(sample.faceError).toBeLessThan(.00001);expect(sample.contact).toContain('客船');expect(sample.deckError).toBeLessThan(.00001);}
});

test('stern terrace walking surfaces and supports have matching flight contacts',async({page})=> {
  await ready(page);
  const result=await page.evaluate(async()=>{
    // Freeze unrelated menu redraws through the normal fixed-scene dialog cache.
    document.querySelector<HTMLButtonElement>('#open-help')!.click();
    const a=(window as any).__OCEANFPV__,w=a.world,T=await import('/node_modules/three/build/three.module.js' as string),model=await import('/src/stern-terraces.ts' as string),samples=[];
    for(const deck of model.STERN_TERRACES) {
      const local=new T.Vector3(deck.width/2-.3,deck.y+.8,deck.z+3.6),origin=w.cruise.root.localToWorld(local),direction=new T.Vector3(0,-1,0).transformDirection(w.cruise.root.matrixWorld),hit=new T.Raycaster(origin,direction).intersectObject(w.cruise.root,true)[0];
      if(!hit)throw new Error('Missing terrace surface');const point=w.cruise.root.worldToLocal(hit.point.clone()),clear=point.clone().add(new T.Vector3(-1,.55,0));
      const aft=deck.z+deck.depth/2-.14,railOrigin=w.cruise.root.localToWorld(new T.Vector3(0,deck.y+1.25,aft+1)),railDirection=new T.Vector3(0,0,-1).transformDirection(w.cruise.root.matrixWorld),rail=new T.Raycaster(railOrigin,railDirection).intersectObject(w.cruise.root,true)[0];
      if(!rail)throw new Error('Missing aft guardrail');const railPoint=w.cruise.root.worldToLocal(rail.point.clone());
      samples.push({teak:hit.object.material===w.cruise.teak,error:Math.abs(point.y-(deck.y+.2)),contact:w.collision(hit.point,a.getState().time,'breeze'),clear:w.collision(w.cruise.root.localToWorld(clear),a.getState().time,'breeze'),railError:Math.abs(railPoint.z-aft-.032),railContact:w.collision(rail.point,a.getState().time,'breeze'),aboveRail:w.collision(w.cruise.root.localToWorld(railPoint.clone().add(new T.Vector3(0,.4,0))),a.getState().time,'breeze')});
    }
    const proxies=w.cruise.root.children.filter((mesh:any)=>mesh.isMesh&&mesh.material===w.cruise.teak).map((mesh:any)=>{const proxy=new T.Mesh(mesh.geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(mesh.matrixWorld);return proxy;});
    const supports=model.buildSternTerraces().solids.slice(2,4),foundations=supports.map((support:any)=>{const centre=support.getCenter(new T.Vector3()),origin=w.cruise.root.localToWorld(new T.Vector3(centre.x,9.279,centre.z)),direction=new T.Vector3(0,-1,0).transformDirection(w.cruise.root.matrixWorld),hit=new T.Raycaster(origin,direction).intersectObjects(proxies)[0];return hit?w.cruise.root.worldToLocal(hit.point.clone()).y:null;});
    proxies.forEach((mesh:any)=>mesh.material.dispose());document.querySelector<HTMLButtonElement>('[data-close="help-dialog"]')!.click();return {samples,foundations};
  });
  expect(result.samples).toHaveLength(3);for(const sample of result.samples){expect(sample.teak).toBe(true);expect(sample.error).toBeLessThan(.00001);expect(sample.contact).toBeTruthy();expect(sample.clear).toBeNull();expect(sample.railError).toBeLessThan(.00001);expect(sample.railContact).toBeTruthy();expect(sample.aboveRail).toBeNull();}
  for(const y of result.foundations){expect(y).not.toBeNull();expect(y).toBeGreaterThan(9.1);expect(y).toBeLessThan(9.28);}
});
test('sun-deck guard surfaces stop fast crossings while open air stays clear',async({page})=> {
  await ready(page);
  const result=await page.evaluate(async()=>{
    const a=(window as any).__OCEANFPV__,w=a.world,root=w.cruise.root,T=await import('/node_modules/three/build/three.module.js' as string),floor=10.6+7*2.85+1.58;
    const world=(point:number[])=>root.localToWorld(new T.Vector3(...point)),samples=[];
    for(const [eye,direction]of [
      [[0,floor+.55,-54],[0,0,1]],[[0,floor+.55,81],[0,0,-1]],
      [[15,floor+1.05,0],[-1,0,0]],[[-15,floor+1.05,0],[1,0,0]]
    ]) {
      const ray=new T.Raycaster(world(eye),new T.Vector3(...direction).transformDirection(root.matrixWorld),0,2),hit=ray.intersectObject(root,true)[0];
      if(!hit)throw new Error('Missing rendered sun-deck guard');
      const previous=world(eye),current=world(eye.map((v:number,i:number)=>v+direction[i]*2));
      samples.push({surface:w.collision(hit.point,a.getState().time,'breeze'),sweep:w.collision(current,a.getState().time,'breeze',previous),before:w.collision(previous,a.getState().time,'breeze'),after:w.collision(current,a.getState().time,'breeze')});
    }
    const clear=[[0,floor+1.5,-53],[0,floor+.8,-53],[10,floor+.8,0]].map(point=>w.collision(world(point),a.getState().time,'breeze'));
    return {samples,clear};
  });
  expect(result.samples).toHaveLength(4);expect(result.clear).toEqual([null,null,null]);
  for(const sample of result.samples){expect(sample.surface).toBe('客船の手すりに接触しました');expect(sample.sweep).toBe('客船の手すりに接触しました');expect(sample.before).toBeNull();expect(sample.after).toBeNull();}
});
test('pool cabanas have supported real surfaces, clear ocean openings and swept column contacts',async({page})=>{
  await ready(page);
  const result=await page.evaluate(async()=>{
    const a=(window as any).__OCEANFPV__,w=a.world,root=w.cruise.root,T=await import('/node_modules/three/build/three.module.js' as string),floor=10.6+7*2.85+1.58+.18,samples=[];
    const world=(p:number[])=>root.localToWorld(new T.Vector3(...p)),contact=(p:number[],from=p)=>w.collision(world(p),a.getState().time,'breeze',world(from));
    for(const side of [-1,1])for(const z of [0,22,46]){
      const ray=new T.Raycaster(world([side*10.4,floor+4,z+1]),new T.Vector3(0,-1,0).transformDirection(root.matrixWorld)),roof=ray.intersectObject(root,true)[0];
      if(!roof)throw new Error('Missing cabana roof');
      const furniture=root.children.filter((mesh:any)=>mesh.material?.name==='Pool cabana upholstery'),seat=new T.Raycaster(world([side*9.4,floor+1.5,z]),new T.Vector3(0,-1,0).transformDirection(root.matrixWorld)).intersectObjects(furniture)[0];
      if(!seat)throw new Error('Missing outdoor upholstery');
      samples.push({roofError:Math.abs(root.worldToLocal(roof.point.clone()).y-floor-3.2),roof:w.collision(roof.point,a.getState().time,'breeze'),seat:w.collision(seat.point,a.getState().time,'breeze'),opening:contact([side*8.1,floor+1.5,z],[side*13,floor+1.5,z]),column:contact([side*12.2+.8,floor+1.5,z+2.8],[side*12.2-.8,floor+1.5,z+2.8]),aisle:contact([side*13.1,floor+1.5,z])});
    }
    return samples;
  });
  expect(result).toHaveLength(6);
  for(const sample of result){expect(sample.roofError).toBeLessThan(.00001);expect(sample.roof).toBe('客船のプール甲板の設備に接触しました');expect(sample.seat).toBe('客船のプール甲板の設備に接触しました');expect(sample.column).toBe('客船のプール甲板の設備に接触しました');expect(sample.opening).toBeNull();expect(sample.aisle).toBeNull();}
});
test('raised pools retain real depth, physical water and matching contacts without blocking the air above',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await ready(page);
  const result=await page.evaluate(async()=>{
    const a=(window as any).__OCEANFPV__,w=a.world,root=w.cruise.root,T=await import('/node_modules/three/build/three.module.js' as string),floor=10.6+7*2.85+1.58+.18,samples=[];
    const world=(p:number[])=>root.localToWorld(new T.Vector3(...p)),direction=new T.Vector3(0,-1,0).transformDirection(root.matrixWorld),water=root.children.find((mesh:any)=>mesh.material?.name==='Cruise pool water'),tiles=root.children.filter((mesh:any)=>mesh.material?.name==='Cruise pool tiles');
    for(const z of [7,37]){
      const surface=new T.Raycaster(world([0,floor+2,z]),direction).intersectObject(water)[0],bottom=new T.Raycaster(world([0,floor+1,z]),direction).intersectObjects(tiles)[0];if(!surface||!bottom)throw new Error('Missing water or real tiled bottom');
      samples.push({depth:root.worldToLocal(surface.point.clone()).y-root.worldToLocal(bottom.point.clone()).y,surface:w.collision(surface.point,a.getState().time,'breeze'),bottom:w.collision(bottom.point,a.getState().time,'breeze'),air:w.collision(world([5,floor+1.65,z]),a.getState().time,'breeze',world([-5,floor+1.65,z])),aisle:w.collision(world([5.2,floor+1,z]),a.getState().time,'breeze'),stair:w.collision(world([2,floor+.4,z+9.55]),a.getState().time,'breeze',world([-2,floor+.4,z+9.55]))});
    }
    const gl=document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {samples,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',material:{ior:water.material.ior,transmission:water.material.transmission,thickness:water.material.thickness,castShadow:water.castShadow,normal:!!water.material.normalMap}};
  });
  console.log(`Pool renderer: ${result.gpu}`);if(process.env.OCEANFPV_NATIVE_GPU==='1')expect(result.gpu).toContain('Direct3D11');
  expect(result.material).toEqual({ior:1.333,transmission:.96,thickness:1.1,castShadow:false,normal:true});expect(result.samples).toHaveLength(2);
  for(const sample of result.samples){expect(sample.depth).toBeCloseTo(1.1,4);expect(sample.surface).toBe('プールの水面に接触しました');expect(sample.bottom).toContain('客船');expect(sample.air).toBeNull();expect(sample.aisle).toBeNull();expect(sample.stair).toBe('客船のプールに接触しました');}expect(errors).toEqual([]);
});
test('vessels really travel, launch follows the moving deck and unavailable surfaces recover',async({page})=> {
  await page.route('**/*.rgba',route=>route.fulfill({status:404,body:''}));
  await page.route('**/textures/*.jpg',route=>route.abort());await ready(page);
  await verifyCabinVisibility(page);
  await expect(page.locator('#start-note')).toContainText('標準素材');
  expect(await page.evaluate(()=>{const w=(window as any).__OCEANFPV__.world;return {detailed:!!w.rocks,contacts:w.fallbackRockObstacles.length,visible:w.rockPatches.filter((patch:any)=>patch.fallback).every((patch:any)=>patch.fallback.parent===w.scene),meshPatches:w.rockPatches.filter((patch:any)=>!patch.fallback).length,tints:w.scene.children.filter((mesh:any)=>mesh.geometry?.attributes.groundCover).map((mesh:any)=>mesh.material.vertexColors)};})).toEqual({detailed:false,contacts:270,visible:true,meshPatches:1,tints:[true,true,true]});
  // Observe real menu motion in the browser: CI traced a 21 m move whose result
  // reached expect.poll after its deadline because software frames blocked transport.
  const menuMotion=await page.evaluate(()=>new Promise<{first:number[];last:number[]}>((resolve,reject)=> {
    const root=(window as any).__OCEANFPV__.world.cruise.root,first=root.position.toArray();let frame=0,done=false;
    const sample=(expired=false)=> {
      if(done)return;const last=root.position.toArray();
      if(last[2]!==first[2]||expired) {
        done=true;clearTimeout(timer);cancelAnimationFrame(frame);
        if(last[2]!==first[2])resolve({first,last});else reject(new Error('The liner did not move during the 20 s browser observation'));
      }else frame=requestAnimationFrame(()=>sample());
    };
    const timer=setTimeout(()=>sample(true),20000);frame=requestAnimationFrame(()=>sample());
  }));
  expect(menuMotion.last[2]).not.toBe(menuMotion.first[2]);
  const app=await page.evaluate(()=> {
    const a=(window as any).__OCEANFPV__;
    document.querySelector<HTMLButtonElement>('#start')!.click();
    const expected=a.world.launchPose(0),local=a.world.cruise.root.worldToLocal(a.flight.position.clone());
    return {local:local.toArray(),time:a.getState().time,positionError:a.flight.position.distanceTo(expected.position),velocityError:a.flight.velocity.distanceTo(expected.velocity)};
  });
  expect(Math.abs(app.local[0])).toBeLessThan(1e-6);expect(Math.abs(app.local[2]+112)).toBeLessThan(1e-6);
  expect(app.positionError).toBeLessThan(1e-6);expect(app.velocityError).toBeLessThan(1e-6);
  expect(app.time).toBe(0);
  await page.keyboard.press('Escape');await expect(page.locator('#pause-dialog')).toBeVisible();
  const stopped=await page.evaluate(()=> {const w=(window as any).__OCEANFPV__.world;return {position:w.cruise.root.position.toArray(),wake:w.ocean.material.uniforms.wakePoints.value.map((p:any)=>p.toArray())};});await page.waitForTimeout(300);
  expect(await page.evaluate(()=> {const w=(window as any).__OCEANFPV__.world;return {position:w.cruise.root.position.toArray(),wake:w.ocean.material.uniforms.wakePoints.value.map((p:any)=>p.toArray())};})).toEqual(stopped);
  const motion=await page.evaluate(()=> {
    const w=(window as any).__OCEANFPV__.world;
    w.ocean.advance(0,'breeze');w.advanceVessels(0);
    let error=0,held=0,refreshes=0;
    for(let i=1;i<=24;i++) {
      const previous=w.launchSample,velocity=w.launchVelocity?.clone(),t=i/120;
      w.ocean.advance(t,'breeze');w.advanceVessels(t);const pose=w.launchPose(t);
      if(w.launchSample.time!==previous.time) {
        refreshes++;error=Math.max(error,pose.position.clone().sub(previous.position).divideScalar(t-previous.time).distanceTo(pose.velocity));
      } else if(velocity) {held++;error=Math.max(error,velocity.distanceTo(pose.velocity));}
    }
    w.ocean.advance(0,'breeze');w.advanceVessels(0);
    const rewindCleared=w.launchVelocity===null&&w.launchSample.time===0;
    w.ocean.advance(0.05,'breeze');w.advanceVessels(0.05);
    w.ocean.advance(0.05,'swell');w.advanceVessels(0.05);
    const presetCleared=w.launchVelocity===null&&w.launchSample.time===0.05;
    w.ocean.advance(.1,'swell');w.advanceVessels(.1);const hadVelocity=w.launchVelocity!==null;
    w.ocean.simulation.update(.1,[2.15,2.15,.75]);w.advanceVessels(.1);
    const profileCleared=hadVelocity&&w.launchVelocity===null&&w.launchSample.time===.1;
    w.ocean.advance(.1,'swell');w.advanceVessels(.1);
    return {error,held,refreshes,rewindCleared,presetCleared,profileCleared,floatError:Math.abs(w.cruise.root.position.y-w.ocean.heightAt(w.cruise.root.position.x,w.cruise.root.position.z)*0.2)};
  });
  expect(motion.error).toBeLessThan(1e-6);expect(motion.held).toBeGreaterThan(10);expect(motion.refreshes).toBeGreaterThanOrEqual(5);
  expect(motion.rewindCleared).toBe(true);expect(motion.presetCleared).toBe(true);expect(motion.profileCleared).toBe(true);expect(motion.floatError).toBeLessThan(1e-6);
  const reset=await page.evaluate(()=> {
    const w=(window as any).__OCEANFPV__.world;w.advanceVessels(100);
    const old=w.ocean.material.uniforms.wakePoints.value.map((p:any)=>p.toArray());w.advanceVessels(0);
    return {old,points:w.ocean.material.uniforms.wakePoints.value.map((p:any)=>p.toArray())};
  });
  expect(reset.old).toHaveLength(26);expect(reset.old.some((p:number[])=>p[2]>0)).toBe(true);
  for(let i=0;i<2;i++) {
    const points=reset.points.slice(i*13,(i+1)*13);
    expect(points.every((p:number[])=>p[2]===0&&p[0]===points[0][0]&&p[1]===points[0][1])).toBe(true);
  }
});
test('cruise departure and lighting remain valid far along the straight route',async({page})=> {
  await ready(page);
  const result=await page.evaluate(()=> {
    const a=(window as any).__OCEANFPV__,w=a.world,samples=[];
    for(const time of [0,600,1800,3600]) {
      w.ocean.advance(time,'breeze');const launch=w.launchPose(time),camera=launch.position.clone();
      w.update(time,camera,'breeze',camera,a.flight.orientation,0);
      const below=camera.clone();below.y-=1.2;
      for(const light of ['golden','blue','day']) {
        const select=document.querySelector<HTMLSelectElement>('#light')!;select.value=light;select.dispatchEvent(new Event('input',{bubbles:true}));
        const atlasLight=w.forest.bakeScene.children.find((child:any)=>child.isDirectionalLight),atlasDirection=atlasLight.position.clone().sub(atlasLight.target.getWorldPosition(camera.clone())).normalize();
        const maskTransform=Math.max(...w.ocean.material.uniforms.cruiseInverse.value.clone().multiply(w.cruise.root.matrixWorld).elements.map((n:number,i:number)=>Math.abs(n-(i%5===0?1:0))));
        const origin=w.ocean.material.uniforms.vessels.value[0],maskOrigin=camera.clone().set(origin.x,origin.y,origin.z).distanceTo(w.cruise.root.position);
        samples.push({time,preset:light,position:camera.toArray(),clear:w.collision(camera,time,'breeze'),deck:w.collision(below,time,'breeze'),sky:w.sky.position.length(),target:Math.hypot(w.sunlight.target.position.x-camera.x,w.sunlight.target.position.z-camera.z),light:w.sunlight.position.clone().sub(w.sunlight.target.position).distanceTo(w.sun.clone().multiplyScalar(280)),atlas:atlasDirection.distanceTo(w.sun),maskTransform,maskOrigin});
      }
    }
    return samples;
  });
  for(const sample of result){expect(sample.clear).toBeNull();expect(sample.deck).toContain('客船');expect(sample.sky).toBeLessThan(1e-6);expect(sample.target).toBeLessThan(1e-6);expect(sample.light).toBeLessThan(1e-6);expect(sample.atlas).toBeLessThan(1e-6);expect(sample.maskTransform).toBeLessThan(1e-8);expect(sample.maskOrigin).toBeLessThan(1e-8);}
  expect(result.at(-1)!.position[2]).toBeLessThan(-14000);
});

test('keyboard flight climbs, pitches, pauses without drift and resets after collision', async ({page})=> {
  // CI startup reached 278 s and the complete scenario 428 s; keep the 60 s flight-phase deadlines.
  test.setTimeout(600000);
  // Input/physics use a small buffer; separate scene and ULTRA checks cover image quality.
  await page.setViewportSize({width:320,height:240});
  await ready(page);let safetyRecoveries=0,forcedRecoveries=0;
  // Compile the first FPV draw while normally paused, as in the radio/Xbox fixtures.
  const {rendering,...warmup}=await page.evaluate(async(isolateRendering)=> {
    const a=(window as any).__OCEANFPV__;
    document.querySelector<HTMLButtonElement>('#start')!.click();document.querySelector<HTMLButtonElement>('#home')!.click();
    for(let i=0;i<2;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    const gl=document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!;gl.finish();
    const fullTriangles=a.getState().triangles,debug=gl.getExtension('WEBGL_debug_renderer_info'),renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    // Software rasterization delayed a single protocol call by 91 s in CI.
    // Keep real input/physics/RAF; image tests and native mode draw the full scene.
    if(isolateRendering){a.world.scene.visible=false;a.invalidate();for(let i=0;i<2;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));gl.finish();}
    return {paused:a.getState().paused,time:a.getState().time,flightTime:a.getState().flightTime,cameraError:a.camera.position.distanceTo(a.flight.position),rendering:{isolated:isolateRendering,visible:a.world.scene.visible,fullTriangles,controlTriangles:a.getState().triangles,renderer,glError:gl.getError()}};
  },process.env.OCEANFPV_NATIVE_GPU!=='1');
  expect(rendering.fullTriangles).toBeGreaterThan(1e6);expect(rendering.visible).toBe(!rendering.isolated);
  expect(rendering.glError).toBe(0);
  if(rendering.isolated)expect(rendering.controlTriangles).toBeLessThan(100);else expect(rendering.controlTriangles).toBeGreaterThan(1e6);
  console.log(`Keyboard control rendering: ${JSON.stringify(rendering)}`);
  expect(warmup).toEqual({paused:true,time:0,flightTime:0,cameraError:0});console.log(`Keyboard first flight draw: ${JSON.stringify(warmup)}`);
  // Observe elapsed time and the supported launch pose in one browser task; slow
  // software-renderer protocol responses must not consume a separate poll budget.
  const waiting=await (async()=>{
    const deadline=Date.now()+60000;
    for(let attempt=0;Date.now()<deadline;attempt++) {
      const observed=await page.evaluate(async({resume,deadline})=>{
        const a=(window as any).__OCEANFPV__;
        if(Date.now()>deadline)throw new Error('Departure entered after the 60 s phase deadline');
        if(resume)document.querySelector<HTMLButtonElement>('#resume')!.click();
        while(a.getState().time<=9) {
          const state=a.getState();
          if(a.flight.crashed||Date.now()>deadline)throw new Error(`Departure did not advance: ${JSON.stringify(state)}`);
          if(state.paused)break;
          await new Promise<void>(finish=>requestAnimationFrame(()=>finish()));
        }
        const launch=a.world.launchPose(a.getState().time);
        return {altitude:a.flight.position.y,error:a.flight.position.distanceTo(launch.position),worldTime:a.getState().time,flightTime:a.getState().flightTime,crashed:a.flight.crashed,armed:a.flight.armed,paused:a.getState().paused,observedAt:Date.now()};
      },{resume:attempt===0,deadline});
      expect(observed.observedAt,'departure observed within its original browser deadline').toBeLessThanOrEqual(deadline);
      expect(Date.now(),'departure completed within the 60 s phase deadline').toBeLessThanOrEqual(deadline);
      if(!observed.paused)return observed;
      await recoverRenderPause(deadline);
    }
    throw new Error('Departure exceeded the 60 s phase deadline');
  })();
  expect(waiting.worldTime).toBeGreaterThan(9);expect(waiting.error).toBeLessThan(1e-6);expect(waiting.flightTime).toBeCloseTo(waiting.worldTime,6);expect(waiting.crashed).toBe(false);expect(waiting.armed).toBe(true);expect(waiting.paused).toBe(false);
  async function recoverRenderPause(deadline:number,forced=false) {
    const state=await page.evaluate(()=>{const a=(window as any).__OCEANFPV__;return {...a.getState(),crashed:a.flight.crashed,title:document.querySelector('#pause-title')!.textContent,copy:document.querySelector('#pause-copy')!.textContent,open:document.querySelector<HTMLDialogElement>('#pause-dialog')!.open};});
    expect(Date.now(),'resume within the current 60 s phase deadline').toBeLessThanOrEqual(deadline);
    expect(state.crashed).toBe(false);if(!state.paused){expect(forced,'injected stall must pause').toBe(false);return;}
    expect(state.open).toBe(true);expect(state.title).toBe('描画が長時間止まりました');expect(state.copy).toContain('処理の遅れが10秒を超えました');
    expect(state.flightTime).toBeCloseTo(state.time,6);
    if(forced)expect(++forcedRecoveries,'recover the deliberate stall once').toBe(1);
    else safetyRecoveries++;
    console.log(`Keyboard ${forced?'forced-stall':'safety-pause'} recovery ${forced?forcedRecoveries:safetyRecoveries}: ${JSON.stringify(state)}`);
    const paused=await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#resume')!.click();if(document.activeElement instanceof HTMLElement)document.activeElement.blur();return (window as any).__OCEANFPV__.getState().paused;});
    expect(Date.now(),'resumed within the current 60 s phase deadline').toBeLessThanOrEqual(deadline);
    expect(paused).toBe(false);
  }
  async function holdUntil(key:string,kind:'altitude'|'speed',threshold:number,forward:number[]=[0,0,-1]) {
    const deadline=Date.now()+60000;
    while(Date.now()<deadline){
      await recoverRenderPause(deadline);await page.keyboard.down(key);
      let result,pauseDeadline:number|undefined;
      try {
        result=await page.evaluate(async({kind,threshold,forward,deadline})=>{
          const a=(window as any).__OCEANFPV__;
          for(;;){
            const state=a.getState(),flight=a.flight,value=kind==='altitude'?flight.position.y:flight.velocity.x*forward[0]+flight.velocity.z*forward[2];
            if(Date.now()>deadline)throw new Error(`Keyboard ${kind} did not advance: ${JSON.stringify({...state,value,threshold,observedAt:Date.now(),deadline})}`);
            if(flight.crashed||state.paused||value>threshold) {
              // Space-up must not activate a Resume button focused by the safety dialog.
              if(state.paused&&document.activeElement instanceof HTMLElement)document.activeElement.blur();
              return {value,paused:state.paused,crashed:flight.crashed,observedAt:Date.now()};
            }
            await new Promise<void>(finish=>requestAnimationFrame(()=>finish()));
          }
        },{kind,threshold,forward,deadline});
        console.log(`Keyboard ${kind} observation: ${JSON.stringify({...result,threshold,deadline,receivedAt:Date.now()})}`);
        expect(result.observedAt,`Keyboard ${kind} observed within its original browser deadline`).toBeLessThanOrEqual(deadline);
        // Accept progress within its original budget, before slow key cleanup.
        expect(Date.now(),`Keyboard ${kind} completed within the 60 s phase deadline`).toBeLessThanOrEqual(deadline);
        expect(result.crashed).toBe(false);
        if(!result.paused) {
          expect(result.value).toBeGreaterThan(threshold);
          if(kind==='speed'){pauseDeadline=Date.now()+60000;await pauseWithEscape(pauseDeadline);}
        }
      }finally {await page.keyboard.up(key);}
      if(kind==='altitude')expect(Date.now(),'Keyboard altitude completed within the 60 s phase deadline').toBeLessThanOrEqual(deadline);
      if(pauseDeadline!==undefined)expect(Date.now(),'Escape and key release completed within the 60 s pause deadline').toBeLessThanOrEqual(pauseDeadline);
      if(!result.paused)return;
    }
    throw new Error(`Keyboard ${kind} exceeded the 60 s phase deadline`);
  }
  async function pauseWithEscape(deadline:number) {
    await page.evaluate(()=> {
      const a=(window as any).__OCEANFPV__,witness={trusted:false,recovered:false,error:'',after:null as unknown};
      (window as any).__KEYBOARD_ESCAPE_WITNESS__=witness;
      // A safety pause can open while the native key travels to the browser.
      // Recover it in capture, then let the real Escape handler pause normally.
      const onEscape=(event:KeyboardEvent)=> {
        if(event.code!=='Escape')return;
        window.removeEventListener('keydown',onEscape,true);witness.trusted=event.isTrusted;
        const state=a.getState(),title=document.querySelector('#pause-title')!.textContent,copy=document.querySelector('#pause-copy')!.textContent,open=document.querySelector<HTMLDialogElement>('#pause-dialog')!.open;
        if(a.flight.crashed)witness.error='Flight crashed before Escape';
        else if(state.paused) {
          if(!open||title!=='描画が長時間止まりました'||!copy!.includes('処理の遅れが10秒を超えました')||Math.abs(state.time-state.flightTime)>1e-6)witness.error=`Unexpected pause before Escape: ${JSON.stringify({...state,title,copy,open})}`;
          else {
            document.querySelector<HTMLButtonElement>('#resume')!.click();
            if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
            witness.recovered=true;if(a.getState().paused)witness.error='Safety resume before Escape was rejected';
            console.log(`Keyboard Escape safety-pause recovery: ${JSON.stringify(state)}`);
          }
        }
      };
      const afterEscape=(event:KeyboardEvent)=> {
        if(event.code!=='Escape')return;
        window.removeEventListener('keydown',afterEscape);
        witness.after={paused:a.getState().paused,title:document.querySelector('#pause-title')!.textContent,open:document.querySelector<HTMLDialogElement>('#pause-dialog')!.open,crashed:a.flight.crashed};
      };
      window.addEventListener('keydown',onEscape,true);
      window.addEventListener('keydown',afterEscape);
    });
    // Keep real pitch held until the native Escape pauses; no neutral coast.
    await page.keyboard.press('Escape');
    const witness=await page.evaluate(()=>{const witness=(window as any).__KEYBOARD_ESCAPE_WITNESS__;delete (window as any).__KEYBOARD_ESCAPE_WITNESS__;return witness as {trusted:boolean;recovered:boolean;error:string;after:unknown};});
    expect(Date.now(),'Escape completed within the 60 s pause deadline').toBeLessThanOrEqual(deadline);
    expect(witness.error).toBe('');expect(witness.trusted).toBe(true);
    expect(witness.after).toEqual({paused:true,title:'フライトを一時停止',open:true,crashed:false});
    if(witness.recovered)safetyRecoveries++;
    console.log(`Keyboard native Escape pause: ${JSON.stringify(witness)}`);
  }
  const launchAltitude=waiting.altitude;
  await holdUntil('Space','altitude',launchAltitude+3);
  const beforePitch=await page.evaluate(()=> {
    const flight=(window as any).__OCEANFPV__.flight,forward=flight.position.clone().set(0,0,-1).applyQuaternion(flight.orientation).setY(0).normalize();
    return {altitude:flight.position.y,forward:forward.toArray(),speed:flight.velocity.dot(forward)};
  });
  expect(beforePitch.altitude).toBeGreaterThan(launchAltitude+2);
  // A slow key-up may already have paused flight. Recover it as incidental first;
  // the deliberate witness must begin in active flight in the same browser task.
  let injected=false;const stallDeadline=Date.now()+60000;
  while(!injected&&Date.now()<stallDeadline) {
    injected=await page.evaluate(async()=> {
      const a=(window as any).__OCEANFPV__;if(a.getState().paused)return false;
      if(a.flight.crashed)throw new Error('Controlled keyboard stall began after a crash');
      const start=performance.now();while(performance.now()-start<10100){/* Actual main-thread stall. */}
      await new Promise<void>(finish=>requestAnimationFrame(()=>finish()));return true;
    });
    expect(Date.now(),'controlled stall completed within the 60 s phase deadline').toBeLessThanOrEqual(stallDeadline);
    if(!injected)await recoverRenderPause(stallDeadline);
  }
  expect(injected,'controlled keyboard stall began in active flight').toBe(true);
  await expect(page.locator('#pause-title')).toHaveText('描画が長時間止まりました');
  // This required witness is separate from incidental software-renderer stalls.
  await recoverRenderPause(stallDeadline,true);
  await holdUntil('KeyW','speed',Math.max(0.8,beforePitch.speed+0.8),beforePitch.forward);
  expect(forcedRecoveries).toBe(1);
  await expect(page.locator('#pause-dialog')).toBeVisible();await expect(page.locator('#pause-title')).toHaveText('フライトを一時停止');
  const paused=await page.evaluate((forward:number[])=>{const flight=(window as any).__OCEANFPV__.flight;return {position:flight.position.toArray(),speed:flight.velocity.x*forward[0]+flight.velocity.z*forward[2]};},beforePitch.forward);
  expect(paused.speed).toBeGreaterThan(.5);
  await page.waitForTimeout(300);expect(await page.evaluate(()=> (window as any).__OCEANFPV__.flight.position.toArray())).toEqual(paused.position);
  await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#resume')!.click();(window as any).__OCEANFPV__.flight.position.y=-4;});
  await expect(page.locator('#pause-title')).toHaveText('フライト終了');
  await page.keyboard.press('KeyR');
  const reset=await page.evaluate(()=> {
    const flight=(window as any).__OCEANFPV__.flight,reset={visible:document.querySelector<HTMLDialogElement>('#pause-dialog')!.getClientRects().length>0,crashed:flight.crashed,armed:flight.armed};
    document.querySelector<HTMLButtonElement>('#open-settings')!.click();const select=document.querySelector<HTMLSelectElement>('#mode')!;select.value='acro';select.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelectorAll<HTMLButtonElement>('[data-close="settings-dialog"]').item(1).click();return {...reset,mode:flight.mode,armedAfterMode:flight.armed};
  });
  expect(reset).toEqual({visible:false,crashed:false,armed:true,mode:'acro',armedAfterMode:true});
});
test('render delays keep world and flight coupled and unsafe gaps pause without a jump',async({page})=> {
  test.setTimeout(300000);
  await ready(page);
  const result=await page.evaluate(async()=> {
    // Start and the controlled stall share one task, excluding slow click replies.
    document.querySelector<HTMLButtonElement>('#start')!.click();
    const app=(window as any).__OCEANFPV__,world=app.world,flight=app.flight;
    flight.position.set(400,100,400);flight.previous.copy(flight.position);flight.velocity.set(0,0,0);
    let ticks=0,mismatches=0;const original=flight.step;
    flight.step=function(...args:any[]) {
      const time=app.getState().time;
      if(world.vesselTime!==time||world.ocean.material.uniforms.time.value!==time)mismatches++;
      ticks++;return original.apply(this,args);
    };
    const waitFrame=()=>new Promise<void>(finish=>requestAnimationFrame(()=>finish()));
    const block=(milliseconds:number)=> {const start=performance.now();while(performance.now()-start<milliseconds){/* Actual main-thread stall. */}};
    try {
      const before=app.getState();block(350);await waitFrame();const after=app.getState();
      const delayed={ticks,mismatches,worldElapsed:after.time-before.time,flightElapsed:after.flightTime-before.flightTime};
      const stopped={time:after.time,flightTime:after.flightTime,position:flight.position.toArray(),ship:world.cruise.root.position.toArray()};
      block(10100);await waitFrame();const state=app.getState();
      return {delayed,stopped,afterGap:{time:state.time,flightTime:state.flightTime,position:flight.position.toArray(),ship:world.cruise.root.position.toArray()},paused:state.paused};
    }finally {flight.step=original;}
  });
  expect(result.delayed.ticks).toBeGreaterThanOrEqual(42);
  expect(result.delayed.mismatches).toBe(0);
  expect(result.delayed.worldElapsed).toBeGreaterThanOrEqual(0.349);
  expect(result.delayed.flightElapsed).toBeCloseTo(result.delayed.worldElapsed,8);
  expect(result.paused).toBe(true);expect(result.afterGap).toEqual(result.stopped);
  await expect(page.locator('#pause-copy')).toContainText('処理の遅れが10秒を超えました');
  await page.locator('#resume').click();expect(await page.evaluate(()=> (window as any).__OCEANFPV__.getState().paused)).toBe(false);
});

test('fixed dialog views stop GPU draws and redraw changed settings',async({page})=> {
  test.setTimeout(300000);
  await page.addInitScript(()=> {
    (window as any).__glDraws=0;
    const prototype=WebGL2RenderingContext.prototype as any;
    for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
      const draw=prototype[name];prototype[name]=function(...args:any[]){(window as any).__glDraws++;return draw.apply(this,args);};
    }
  });
  const snapshot=()=>page.evaluate(async()=> {
    await new Promise<void>(finish=>{const step=(n:number)=>n?requestAnimationFrame(()=>step(n-1)):finish();step(3);});
    const app=(window as any).__OCEANFPV__;
    return {draws:(window as any).__glDraws,time:app.getState().time,fov:app.camera.fov,quality:app.world.quality,reflection:app.world.ocean.mesh.getRenderTarget().width};
  });
  await ready(page);
  // Reach the fixed-view handler in one task before software menu frames delay actionability probes.
  await page.evaluate(()=>document.querySelector<HTMLButtonElement>('#open-help')!.click());
  await expect(page.locator('#help-dialog')).toBeVisible();
  const help=await snapshot();expect(await snapshot()).toEqual(help);
  await page.locator('[data-close="help-dialog"]').last().click();
  const moving=await snapshot();expect(moving.time).toBeGreaterThan(help.time);expect(moving.draws).toBeGreaterThan(help.draws);
  // Open the fixed view before a slow Start reply can trigger a render pause.
  await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#start')!.click();document.querySelector<HTMLButtonElement>('#open-settings')!.click();});
  const stopped=await snapshot();expect(await snapshot()).toEqual(stopped);
  await page.locator('#fov').fill('65');await page.locator('#fov').dispatchEvent('input');
  const changed=await snapshot();expect(changed.time).toBe(stopped.time);expect(changed.fov).toBe(65);expect(changed.draws).toBeGreaterThan(stopped.draws);expect(await snapshot()).toEqual(changed);
  if(process.env.OCEANFPV_NATIVE_GPU==='1') {
    await page.locator('#quality').selectOption('high');
    const high=await snapshot();expect(high.time).toBe(stopped.time);expect(high.draws).toBeGreaterThan(changed.draws);expect(high.quality).toBe('high');expect(high.reflection).toBe(1536);expect(await snapshot()).toEqual(high);
    await page.locator('#quality').selectOption('balanced');const balanced=await snapshot();expect(balanced.quality).toBe('balanced');expect(balanced.reflection).toBe(512);expect(balanced.time).toBe(stopped.time);
  }
  await page.locator('[data-close="settings-dialog"]').last().click();
  const resumed=await snapshot();expect(resumed.time).toBeGreaterThan(stopped.time);expect(resumed.draws).toBeGreaterThan(changed.draws);
  // Use an explicit pause request; a delayed Escape can resume a safety pause
  // that opens between the active snapshot and the key's browser dispatch.
  const stoppedByButton=await page.evaluate(()=> {
    const app=(window as any).__OCEANFPV__,state=app.getState();
    if(app.flight.crashed)throw new Error('Fixed-view flight crashed');
    if(state.paused) {
      const reason={title:document.querySelector('#pause-title')!.textContent,copy:document.querySelector('#pause-copy')!.textContent,open:document.querySelector<HTMLDialogElement>('#pause-dialog')!.open};
      if(!reason.open||reason.title!=='描画が長時間止まりました'||!reason.copy!.includes('処理の遅れが10秒を超えました'))throw new Error(`Unexpected fixed-view pause: ${JSON.stringify(reason)}`);
      console.log(`Fixed-view safety-pause recovery: ${JSON.stringify(state)}`);
      document.querySelector<HTMLButtonElement>('#resume')!.click();
      if(app.getState().paused)throw new Error('Fixed-view render-pause resume was rejected');
    }
    document.querySelector<HTMLButtonElement>('#home')!.click();
    return {paused:app.getState().paused,title:document.querySelector('#pause-title')!.textContent,open:document.querySelector<HTMLDialogElement>('#pause-dialog')!.open};
  });
  expect(stoppedByButton).toEqual({paused:true,title:'フライトを一時停止',open:true});
  const paused=await snapshot();expect(await snapshot()).toEqual(paused);
});

test('lost WebGL context closes modal layers and leaves recovery reachable',async({page})=> {
  await ready(page);await page.evaluate(()=>document.querySelector<HTMLButtonElement>('#start')!.click());await page.keyboard.press('Escape');
  await expect(page.locator('#pause-dialog')).toBeVisible();
  await page.evaluate(()=> {
    const gl=document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!,extension=gl.getExtension('WEBGL_lose_context');
    if(!extension)throw new Error('Context-loss extension unavailable');extension.loseContext();
  });
  await expect(page.locator('#unsupported')).toBeVisible();await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#unsupported button')).toBeVisible();await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#unsupported button')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await page.evaluate(()=> (window as any).__OCEANFPV__.flight.armed)).toBe(false);
});
test('race registers actual ordered gate crossing and saves a completed run', async ({page})=> {
  // Reserve the existing 18 × 20 s crossings and 60 s warmup without relaxing either phase.
  test.setTimeout(600000);
  page.on('console',message=>{if(message.text().startsWith('Race progress: '))console.log(message.text());});
  await page.setViewportSize({width:320,height:240});
  // Use a supported FPV lens for this physics case; native ULTRA captures cover wide scenery.
  await page.addInitScript(()=>localStorage.setItem('oceanfpv:settings',JSON.stringify({quality:'balanced',sea:'breeze',fov:'65',tilt:'0'})));
  await ready(page);
  // CI protocol polls held each menu frame for >10 s, correctly discarding its
  // unsafe clock gap. Warm a normal flight in one task and retain the safeguard.
  const warmup=await page.evaluate(async()=>{
    document.querySelector<HTMLButtonElement>('#start')!.click();
    const app=(window as any).__OCEANFPV__,deadline=performance.now()+60000;let stallResumes=0;
    while(app.getState().time<=2){
      const state=app.getState();if(app.flight.crashed||performance.now()>deadline)throw new Error(`Race warmup did not advance: ${JSON.stringify(state)}`);
      if(state.paused){
        const title=document.querySelector('#pause-title')!.textContent;
        if(title!=='描画が長時間止まりました'||!document.querySelector<HTMLDialogElement>('#pause-dialog')!.open||++stallResumes>2)throw new Error(`Race warmup paused: ${JSON.stringify({title,stallResumes,state})}`);
        document.querySelector<HTMLButtonElement>('#resume')!.click();
        if(app.getState().paused)throw new Error('Race warmup resume was rejected');
      }
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    return {time:app.getState().time,flightTime:app.getState().flightTime,stallResumes,fov:app.camera.fov,quality:app.world.quality};
  });
  expect(warmup.time).toBeGreaterThan(2);expect(warmup.flightTime).toBeCloseTo(warmup.time,6);expect(warmup.fov).toBe(65);expect(warmup.quality).toBe('balanced');console.log(`Race warmup: ${JSON.stringify(warmup)}`);
  const resetTime=await page.evaluate(()=> {
    document.querySelector<HTMLButtonElement>('#home')!.click();document.querySelector<HTMLButtonElement>('#back-menu')!.click();
    document.querySelector<HTMLButtonElement>('#race-mode')!.click();
    document.querySelector<HTMLButtonElement>('#start')!.click();
    return (window as any).__OCEANFPV__.getState().time;
  });
  expect(resetTime).toBe(0);
  const run=await page.evaluate(async()=> {
    const app=(window as any).__OCEANFPV__,crossings:{progress:number;waited:number;stallResumes:number}[]=[];
    const waitingStarted=performance.now();
    do {await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}while(app.getState().time<0.5&&performance.now()-waitingStarted<20000);
    const waiting={time:app.getState().time,flightTime:app.getState().flightTime,raceTime:app.race.elapsed,next:app.race.next};
    for(let index=0;index<18;index++) {
      const g=app.world.gateMeshes[index%6];
      // Use the mesh orientation to put flight just before the real plane.
      const normal=app.flight.position.clone().set(0,0,1).applyQuaternion(g.quaternion);
      // A catch-up frame must not carry this unattended approach into the ship after crossing.
      const approach=()=>{app.flight.position.copy(g.position).addScaledVector(normal,-0.08);app.flight.velocity.copy(normal).multiplyScalar(2);app.flight.orientation.identity();};
      approach();let start=performance.now(),stallResumes=0;console.log(`Race progress: ${JSON.stringify({approach:index+1,...app.getState()})}`);
      const progress=()=>app.race.laps.length*6+app.race.next;
      if(index===3)while(performance.now()-start<10100){/* Exercise real render-stall pause and UI recovery mid-race. */}
      // Let real animation/physics frames cross the plane without a protocol poll per frame.
      do {
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        if(progress()<18&&app.getState().paused) {
          const title=document.querySelector('#pause-title')!.textContent;
          if(title!=='描画が長時間止まりました'||++stallResumes>2)throw new Error(`Gate ${index+1} paused: ${JSON.stringify({title,progress:progress(),position:app.flight.position.toArray(),crashed:app.flight.crashed,stallResumes})}`);
          // Keep the stall safeguard: resume through the same button as a player,
          // then retry an uncrossed approach without changing race progress or physics.
          document.querySelector<HTMLButtonElement>('#resume')!.click();if(progress()<index+1)approach();start=performance.now();
        }
      }
      while(progress()<index+1&&performance.now()-start<20000);
      const crossed={progress:progress(),waited:performance.now()-start,stallResumes};crossings.push(crossed);console.log(`Race progress: ${JSON.stringify({gate:index+1,...crossed})}`);
      if(crossed.progress!==index+1||crossed.waited>20000)break;
    }
    return {waiting,crossings};
  });
  const {waiting,crossings}=run;expect(waiting.time).toBeGreaterThan(0);expect(waiting.flightTime).toBeCloseTo(waiting.time,6);expect(waiting.raceTime).toBeCloseTo(waiting.time,6);expect(waiting.next).toBe(0);
  console.log(`Race gate crossings: ${JSON.stringify(crossings)}`);
  expect(crossings).toHaveLength(18);
  expect(crossings[3].stallResumes).toBeGreaterThanOrEqual(1);
  for(const [index,crossed]of crossings.entries()) {
    expect(crossed.progress).toBe(index+1);expect(crossed.waited).toBeLessThanOrEqual(20000);
  }
  await expect(page.locator('#pause-title')).toHaveText('コース完走！');
  await expect(page.locator('#results')).toContainText('TOTAL');
  expect(await page.evaluate(()=>Number(localStorage.getItem('oceanfpv:best')))).toBeGreaterThan(0);
});
test('Xbox mapping, armed flight and disconnect pause work through Gamepad API', async ({page})=> {
  await page.setViewportSize({width:320,height:240});
  await page.addInitScript(()=> {
    (window as any).__pad={id:'Xbox test controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false})),timestamp:0};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[(window as any).__pad]});
  });
  await ready(page);
  // Batch setup events so software rendering cannot add a full frame wait to every protocol round trip.
  const setup=await page.evaluate(()=> {
    document.querySelector<HTMLButtonElement>('#open-settings')!.click();
    const dialog=document.querySelector<HTMLDialogElement>('#settings-dialog')!,opened=dialog.open;
    const tab=document.querySelector<HTMLButtonElement>('[data-tab="controller"]')!;tab.click();
    const selected=tab.getAttribute('aria-pressed');
    const source=document.querySelector<HTMLSelectElement>('#input-source')!;source.value='xbox';source.dispatchEvent(new Event('input',{bubbles:true}));
    const sea=document.querySelector<HTMLSelectElement>('#sea')!;sea.value='swell';sea.dispatchEvent(new Event('input',{bubbles:true}));
    const applied=(window as any).__OCEANFPV__.input.source;
    document.querySelectorAll<HTMLButtonElement>('[data-close="settings-dialog"]').item(1).click();
    return {opened,selected,source:applied,closed:!dialog.open};
  });
  expect(setup).toEqual({opened:true,selected:'true',source:'xbox',closed:true});
  const climbed=await page.evaluate(async()=> {
    const app=(window as any).__OCEANFPV__;
    document.querySelector<HTMLButtonElement>('#start')!.click();
    // As in the radio fixture, compile the first FPV draw while normally paused.
    document.querySelector<HTMLButtonElement>('#home')!.click();
    for(let i=0;i<2;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!.finish();
    const warmup={paused:app.getState().paused,time:app.getState().time,flightTime:app.getState().flightTime,cameraError:app.camera.position.distanceTo(app.flight.position)};
    if(!warmup.paused||warmup.time!==0||warmup.flightTime!==0||warmup.cameraError>1e-6)throw new Error(`Xbox first draw drifted: ${JSON.stringify(warmup)}`);
    console.log(`Xbox first flight draw: ${JSON.stringify(warmup)}`);
    document.querySelector<HTMLButtonElement>('#resume')!.click();
    if(app.getState().paused)throw new Error('Xbox neutral-stick resume was rejected');
    const initial=app.flight.position.y,start=performance.now();let safetyRecoveries=0;
    (window as any).__pad.axes=[0,-1,0,-0.5];
    do {
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const state=app.getState();if(app.flight.crashed)throw new Error('Xbox takeoff crashed');
      if(state.paused) {
        const reason={title:document.querySelector('#pause-title')!.textContent,copy:document.querySelector('#pause-copy')!.textContent,open:document.querySelector<HTMLDialogElement>('#pause-dialog')!.open};
        if(!reason.open||reason.title!=='描画が長時間止まりました'||!reason.copy!.includes('処理の遅れが10秒を超えました')||++safetyRecoveries>2)throw new Error(`Unexpected Xbox pause: ${JSON.stringify({...state,...reason,safetyRecoveries})}`);
        console.log(`Xbox safety-pause recovery ${safetyRecoveries}: ${JSON.stringify(state)}`);
        document.querySelector<HTMLButtonElement>('#resume')!.click();
        if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
        if(app.getState().paused)throw new Error('Xbox render-pause resume was rejected');
      }
    }
    while((app.flight.position.y<=7||app.flight.position.y<=initial+1)&&performance.now()-start<20000);
    const climbed={initial,altitude:app.flight.position.y,armed:app.flight.armed,source:app.input.source,sticks:app.input.sticks(),seaScale:app.world.ocean.material.uniforms.seaScale.value,warmup,paused:app.getState().paused,crashed:app.flight.crashed,waited:performance.now()-start,safetyRecoveries};
    if(climbed.paused||climbed.crashed)throw new Error(`Xbox flight was not active before disconnect: ${JSON.stringify(climbed)}`);
    // Disconnect before another protocol round trip can queue a slow sea draw
    // and make the independent render-stall safeguard win this input test.
    (window as any).__pad=null;const disconnectedAt=performance.now();
    do {await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
    while(!app.getState().paused&&performance.now()-disconnectedAt<20000);
    return {...climbed,disconnect:{title:document.querySelector('#pause-title')!.textContent,waited:performance.now()-disconnectedAt}};
  });
  expect(climbed.altitude).toBeGreaterThan(7);expect(climbed.altitude-climbed.initial).toBeGreaterThan(1);
  expect(climbed.warmup).toEqual({paused:true,time:0,flightTime:0,cameraError:0});expect(climbed.paused).toBe(false);expect(climbed.crashed).toBe(false);expect(climbed.waited).toBeLessThanOrEqual(20000);expect(climbed.safetyRecoveries).toBeLessThanOrEqual(2);
  expect(climbed.armed).toBe(true);expect(climbed.source).toBe('xbox');
  expect(climbed.seaScale).toBe(2.15);
  expect(climbed.sticks.throttle).toBe(1);expect(climbed.sticks.pitch).toBeLessThan(0);expect(climbed.sticks.absoluteThrottle).toBe(false);
  expect(climbed.disconnect.title).toBe('コントローラー接続が切れました');expect(climbed.disconnect.waited).toBeLessThanOrEqual(20000);
  await expect(page.locator('#pause-title')).toHaveText('コントローラー接続が切れました');
  await page.locator('#resume').click();await expect(page.locator('#pause-dialog')).toBeVisible();
  expect(await page.evaluate(()=> (window as any).__OCEANFPV__.getState().paused)).toBe(true);
});
test('radio calibration, axis assignment and low-throttle arming', async ({page})=> {
  test.setTimeout(300000);
  await page.setViewportSize({width:320,height:240});
  await page.addInitScript(()=> {
    (window as any).__pad={id:'USB radio test',index:0,connected:true,mapping:'',axes:[0,0,0,0],buttons:[],timestamp:0};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[(window as any).__pad]});
  });
  await ready(page);
  // Preserve real DOM handlers and RAF input polling while avoiding a rendered
  // actionability wait for every calibration step on software-rendered CI.
  const result=await page.evaluate(async()=> {
    const app=(window as any).__OCEANFPV__,pad=(window as any).__pad;
    const click=(selector:string)=>document.querySelector<HTMLButtonElement>(selector)!.click();
    const until=async(check:()=>boolean,label:string)=> {
      const start=performance.now();
      do {await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(check())return;}while(performance.now()-start<20000);
      throw new Error(`Radio UI did not reach ${label}`);
    };
    click('#open-settings');click('[data-tab="controller"]');
    const source=document.querySelector<HTMLSelectElement>('#input-source')!;source.value='radio';source.dispatchEvent(new Event('input',{bubbles:true}));
    const sea=document.querySelector<HTMLSelectElement>('#sea')!;sea.value='swell';sea.dispatchEvent(new Event('input',{bubbles:true}));
    const dialog=document.querySelector<HTMLDialogElement>('#settings-dialog')!,opened=dialog.open;
    await until(()=>app.input.pad?.id===pad.id,'device');click('#calibrate');
    pad.axes=[-0.8,-0.8,-0.8,-0.8];await until(()=>app.input.profile.calibration[0].min===-0.8,'minimum');
    pad.axes=[0.9,0.9,0.9,0.9];await until(()=>app.input.profile.calibration[0].max===0.9,'maximum');
    const min=app.input.profile.calibration[0].min,max=app.input.profile.calibration[0].max;click('#save-calibration');
    const saved=JSON.parse(localStorage.getItem('oceanfpv:radio:USB radio test')!);click('[data-close="settings-dialog"]:last-of-type');
    pad.axes=[0,0,0,-0.8];await until(()=>app.input.sticks().throttle>0.12,'high throttle');click('#start');
    const rejected={dialog:dialog.open,toast:document.querySelector('#toast')!.textContent,playing:app.getState().playing};
    pad.axes=[0,0,0,0.9];await until(()=>document.querySelector('#device-status')!.textContent!.includes('THROTTLE 0%'),'low throttle');
    click('[data-close="settings-dialog"]:last-of-type');click('#start');
    // Complete the first real flight draw while normally paused; its shader/GPU
    // startup must not consume the radio movement phase's unchanged 20 s budget.
    click('#home');for(let i=0;i<2;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!.finish();
    const warmup={paused:app.getState().paused,time:app.getState().time,flightTime:app.getState().flightTime,cameraError:app.camera.position.distanceTo(app.flight.position)};
    if(!warmup.paused||warmup.time!==0||warmup.flightTime!==0||warmup.cameraError>1e-6)throw new Error(`Radio first draw drifted: ${JSON.stringify(warmup)}`);
    console.log(`Radio first flight draw: ${JSON.stringify(warmup)}`);click('#resume');
    if(app.getState().paused)throw new Error('Radio low-throttle resume was rejected');
    const startTime=app.getState().time;await until(()=>app.getState().time>startTime+1,'zero-throttle deck wait');
    const launch=app.world.launchPose(app.getState().time),waiting={crashed:app.flight.crashed,armed:app.flight.armed,flightTime:app.getState().flightTime,error:app.flight.position.distanceTo(launch.position)},altitude=app.flight.position.y;
    pad.axes=[0,0,0,-0.8];await until(()=>app.flight.position.y>altitude+1,'radio takeoff');
    return {opened,source:app.input.source,min,max,saved:saved.calibration[0].min,rejected,warmup,waiting,climb:app.flight.position.y-altitude,seaScale:app.world.ocean.material.uniforms.seaScale.value,started:document.querySelector('#intro')!.classList.contains('hidden')};
  });
  expect(result.opened).toBe(true);expect(result.source).toBe('radio');expect(result.min).toBe(-0.8);expect(result.max).toBe(0.9);expect(result.saved).toBe(-0.8);
  expect(result.rejected.dialog).toBe(true);expect(result.rejected.toast).toContain('スロットルを下げ');expect(result.rejected.playing).toBe(false);expect(result.started).toBe(true);
  expect(result.warmup).toEqual({paused:true,time:0,flightTime:0,cameraError:0});
  expect(result.seaScale).toBe(2.15);
  expect(result.waiting.crashed).toBe(false);expect(result.waiting.armed).toBe(true);expect(result.waiting.flightTime).toBeGreaterThan(1);expect(result.waiting.error).toBeLessThan(1e-6);expect(result.climb).toBeGreaterThan(1);
});
for(const light of ['blue','golden'])test(`${light} lighting and sea settings persist across a full reload`, async ({page})=> {
  test.setTimeout(300000);
  await page.setViewportSize({width:480,height:320});
  await ready(page);
  // This test covers persistence; ordinary pointer interactions are checked in
  // the scene tests. Batch DOM events to avoid animation-frame actionability
  // waits consuming the two full software-rendered initializations.
  const chosen=await page.evaluate(light=> {
    document.querySelector<HTMLButtonElement>('#open-settings')!.click();
    for(const [id,value]of [['light',light],['sea','calm']]){const select=document.getElementById(id) as HTMLSelectElement;select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}));}
    const saved=JSON.parse(localStorage.getItem('oceanfpv:settings')!);
    return {open:document.querySelector<HTMLDialogElement>('#settings-dialog')!.open,light:saved.light,sea:saved.sea};
  },light);
  expect(chosen).toEqual({open:true,light,sea:'calm'});
  // Reload from the fixed dialog view, avoiding unrelated resumed sea draws.
  // Count application fetches; browser cache Range retries are not duplicate
  // preset loads. Install in the new document so the first visit is excluded.
  await page.addInitScript(()=> {
    const fetch=window.fetch.bind(window),requests:string[]=[];(window as any).__PERSISTED_HDR_FETCHES__=requests;
    window.fetch=(resource,options)=>{const url=resource instanceof Request?resource.url:String(resource);if(url.endsWith('.hdr'))requests.push(url);return fetch(resource,options);};
  });
  await loadScene(page,()=>page.reload({timeout:SCENE_LOAD_TIMEOUT}));
  const persisted=await page.evaluate(()=>{const w=(window as any).__OCEANFPV__.world;return {light:document.querySelector<HTMLSelectElement>('#light')!.value,sea:document.querySelector<HTMLSelectElement>('#sea')!.value,photo:!!w.scene.background.isDataTexture,forestEnvironment:w.forest.bakeScene.environment===w.scene.environment};});
  expect(persisted).toEqual({light,sea:'calm',photo:light==='golden',forestEnvironment:true});
  const hdrFetches=await page.evaluate(()=>(window as any).__PERSISTED_HDR_FETCHES__ as string[]);
  expect(hdrFetches.map(url=>url.split('/').at(-1))).toEqual(light==='golden'?['kloppenheim_06_puresky_4k.hdr']:[]);
});

test('wake reflections follow the surface gradient on both sides and rotated headings',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/wake-slope-probe.html');
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__WAKE_SLOPE_PROBE__);},{timeout:60000}).toBe(true);
  const probe=await page.evaluate(()=>(window as any).__WAKE_SLOPE_PROBE__);console.log(`Wake slope probe: ${JSON.stringify(probe)}`);
  expect(probe.count).toBe(4035);expect(probe.maximum).toBeLessThan(.00005);expect(probe.symmetryError).toBeLessThan(.00001);expect(probe.rotationError).toBeLessThan(.00001);expect(errors).toEqual([]);
});

test('ocean sky reflection follows the normal and preserves premultiplied object coverage',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/tests/browser/fixtures/sky-reflection-probe.html');
 await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__SKY_REFLECTION_PROBE__);},{timeout:60000}).toBe(true);
 const probe=await page.evaluate(()=>{const {samples,...summary}=(window as any).__SKY_REFLECTION_PROBE__;return summary;});
 console.log(`Sky reflection probe: ${JSON.stringify(probe)}`);if(process.env.OCEANFPV_NATIVE_GPU==='1')expect(probe.gpu).toContain('Direct3D11');
 expect(probe.count).toBe(165);expect(probe.maximum).toBeLessThan(.000003);expect(probe.alphaError).toBeLessThan(.000001);expect(probe.compositeError).toBeLessThan(.000001);
 // Three.js transmission alpha omits the Fresnel term: bound its known neutral-glass approximation.
 expect(probe.glassObjects[3]).toBeGreaterThan(0);expect(probe.glassObjects[3]).toBeLessThan(1);expect(probe.glassError).toBeLessThan(.03);expect(probe.nestedStateError).toBe(0);expect(probe.nestedRestored).toBe(true);expect(errors).toEqual([]);
});

test('half-float array slope moments retain signed layers and filtered mip levels',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/tests/browser/fixtures/slope-moments-probe.html');
 await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__SLOPE_MOMENTS_PROBE__);},{timeout:60000}).toBe(true);
 const probe=await page.evaluate(()=>{const{samples,covarianceSamples,integrationSamples,...summary}=(window as any).__SLOPE_MOMENTS_PROBE__;return summary;});console.log(`Slope moments probe: ${JSON.stringify(probe)}`);
 if(process.env.OCEANFPV_NATIVE_GPU==='1')expect(probe.gpu).toContain('Direct3D11');expect(probe.count).toBe(126);expect(probe.maximum).toBeLessThan(.0003);expect(probe.fallbackError).toBe(0);expect(probe.covarianceCount).toBe(12);expect(probe.covarianceMaximum).toBeLessThan(.000001);expect(errors).toEqual([]);
 expect(probe.integrationCount).toBe(9);expect(probe.integrationMaximum).toBeLessThan(.000001);expect(probe.scalarMaximum).toBeLessThan(.000001);expect(probe.disabledMaximum).toBe(0);expect(probe.mipFallbackError).toBe(0);expect(probe.mipFallbackValue).toBeCloseTo(.3,6);
});

test('sun glint uses its microfacet angle while sky reflection keeps the surface angle',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/tests/browser/fixtures/sun-glint-probe.html');
 await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__SUN_GLINT_PROBE__);},{timeout:60000}).toBe(true);
 const probe=await page.evaluate(()=>{const p=(window as any).__SUN_GLINT_PROBE__;return {gpu:p.gpu,count:p.count,sunError:p.sunError,skyError:p.skyError,normalSpread:p.normalSpread,peakError:p.peakError,radianceError:p.radianceError,changed:p.changed};});
 console.log(`Sun glint probe: ${JSON.stringify(probe)}`);if(process.env.OCEANFPV_NATIVE_GPU==='1')expect(probe.gpu).toContain('Direct3D11');
 expect(probe.count).toBe(54);expect(probe.changed).toBeGreaterThan(6);expect(probe.sunError).toBeLessThan(.000002);expect(probe.skyError).toBeLessThan(.000002);expect(probe.normalSpread).toBeLessThan(.000002);expect(probe.peakError).toBeLessThan(.000002);expect(probe.radianceError).toBeLessThan(.000002);expect(errors).toEqual([]);
});

test('Gaussian glints normalize in the wave frame and retain anisotropic masking',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/tests/browser/fixtures/gaussian-glint-probe.html');
 await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__GAUSSIAN_GLINT_PROBE__);},{timeout:60000}).toBe(true);
 const p=await page.evaluate(()=>(window as any).__GAUSSIAN_GLINT_PROBE__);console.log(`Gaussian glint probe: ${JSON.stringify(p)}`);
 if(process.env.OCEANFPV_NATIVE_GPU==='1')expect(p.gpu).toContain('Direct3D11');
 expect(p.covarianceCount).toBe(15);expect(p.covarianceError).toBeLessThan(.000001);expect(p.normalizationCount).toBe(15);expect(p.normalizationError).toBeLessThan(.002);
 expect(p.invarianceCount).toBe(15);expect(p.invarianceError).toBeLessThan(.00001);expect(p.smithCount).toBe(54);expect(p.smithError).toBeLessThan(.000002);expect(p.smithModelError).toBeLessThan(.006);
 expect(p.backfaceCount).toBe(3);expect(p.backfaceError).toBe(0);expect(p.glError).toBe(0);expect(errors).toEqual([]);
});

for(const manualFallback of[false,true])test(`whitecap coverage integrates the coupled wave and noise footprint${manualFallback?' without float-linear support':''}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(manualFallback)await page.addInitScript(()=>{
    WebGL2RenderingContext.prototype.getExtension=new Proxy(WebGL2RenderingContext.prototype.getExtension,{
      apply(target,context,args){return args[0]==='OES_texture_float_linear'?null:Reflect.apply(target,context,args);}
    });
  });
  await page.goto('/tests/browser/fixtures/whitecap-footprint-probe.html');
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__WHITECAP_FOOTPRINT_PROBE__);},{timeout:60000}).toBe(true);
  const probe=await page.evaluate(()=>{const{samples,...summary}=(window as any).__WHITECAP_FOOTPRINT_PROBE__;return summary;});
  console.log(`Whitecap footprint probe: ${JSON.stringify(probe)}`);if(process.env.OCEANFPV_NATIVE_GPU==='1')expect(probe.gpu).toContain('Direct3D11');
  expect(typeof probe.floatLinearSupported).toBe('boolean');if(manualFallback)expect(probe.floatLinearSupported).toBe(false);
  expect(probe.count).toBe(probe.floatLinearSupported?576:288);expect(probe.agedTexels).toBeGreaterThan(100);expect(probe.quadratureError).toBeLessThan(.0001);expect(probe.denseError).toBeLessThan(.001);expect(probe.manualError).toBeLessThan(.001);
  expect(probe.unfilteredError).toBe(0);expect(probe.qualityStates).toEqual({balanced:false,high:true,ultra:true});expect(probe.oracleConvergence).toBeLessThan(.001);expect(probe.inactive).toBeGreaterThan(0);
  expect(probe.filteredRMSE).toBeLessThan(probe.originalRMSE*.35);expect(probe.derivativesBeforeDiscard).toBe(true);expect(probe.error).toBe(0);expect(errors).toEqual([]);
});

test('sea foam follows scene lighting and the rotated diffuse environment',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/foam-lighting-probe.html');
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__FOAM_LIGHTING_PROBE__);},{timeout:60000}).toBe(true);
  const probe=await page.evaluate(()=>{const p=(window as any).__FOAM_LIGHTING_PROBE__;return {gpu:p.gpu,count:p.count,maximum:p.maximum,rotationError:p.rotationError,environmentSpread:p.environmentSpread};});
  console.log(`Foam lighting probe: ${JSON.stringify(probe)}`);if(process.env.OCEANFPV_NATIVE_GPU==='1')expect(probe.gpu).toContain('Direct3D11');
  expect(probe.count).toBe(70);expect(probe.maximum).toBeLessThan(.003);expect(probe.rotationError).toBeLessThan(.00001);expect(probe.environmentSpread).toBeGreaterThan(.05);expect(errors).toEqual([]);
});

test('mobile help fits the viewport and closes with the keyboard', async ({page})=> {
  await page.setViewportSize({width:390,height:844});await ready(page);
  await page.locator('#open-help').focus();await page.keyboard.press('Enter');await expect(page.locator('#help-dialog')).toBeVisible();
  const box=await page.locator('#help-dialog').boundingBox();expect(box!.width).toBeLessThan(390);
  await page.screenshot({path:'test-results/oceanfpv-mobile-help.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#help-dialog')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
test('terrain projections retain metre scale and coherent detail maps on the GPU',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/ground-probe.html');
  await page.waitForFunction(()=>!!((window as any).__GROUND_PROBE__||(window as any).__GROUND_PROBE_ERROR__),{},{timeout:60000});
  expect(await page.evaluate(()=>(window as any).__GROUND_PROBE_ERROR__)).toBeUndefined();
  const probe=await page.evaluate(()=>{const p=(window as any).__GROUND_PROBE__;return {gpu:p.gpu,count:p.samples.length,maximum:p.maximum,detailCount:p.detailSamples.length,detailMaximum:p.detailMaximum,cliffCount:p.cliffSamples.length,cliffMaximum:p.cliffMaximum,stochasticCount:p.stochasticSamples.length,stochasticMaximum:p.stochasticMaximum,continuityMaximum:p.continuityMaximum,loadingFailures:p.loadingFailures};});
  console.log(`Ground material probe: ${JSON.stringify(probe)}`);
  expect(probe.count).toBe(96);expect(probe.maximum).toBeLessThan(0.002);expect(probe.detailCount).toBe(2592);expect(probe.detailMaximum).toBeLessThan(0.002);expect(errors).toEqual([]);
  expect(probe.cliffCount).toBe(408);expect(probe.cliffMaximum).toBeLessThan(.002);
  expect(probe.stochasticCount).toBe(20);expect(probe.stochasticMaximum).toBeLessThan(.002);expect(probe.continuityMaximum).toBeLessThan(.002);
  expect(probe.loadingFailures.map((failure:any)=>failure.phase)).toEqual(['fetch','fetch','fetch','body','body','body','decode','decode','decode',...Array(6).fill('body')]);
  for(const failure of probe.loadingFailures.slice(-6))expect(failure).toMatchObject({name:'TimeoutError',aborted:true,abortReason:'TimeoutError',recovered:false});
});
test('headland bay and lighthouse reef match rendered flight contacts',async({page})=> {
  await ready(page);
  const coast=await page.evaluate(async()=> {
    const app=(window as any).__OCEANFPV__,world=app.world,island=world.islands[0],T=await import('/node_modules/three/build/three.module.js' as string);
    const mesh=world.scene.children.find((m:any)=>m.geometry?.attributes.groundCover&&m.position.x===island.x&&m.position.z===island.z),p=mesh.geometry.attributes.position;
    const bottom=world.ocean.material.uniforms.bathymetry.value.image.data,packed=world.ocean.material.uniforms.islandBathymetry.value.image.data;let depthError=0;
    for(let i=0;i<p.count;i+=137)depthError=Math.max(depthError,Math.abs(p.getY(i)-packed[i*2+1]));
    const Vector=app.flight.position.constructor,bay=new Vector(island.x+island.size*0.38,15,island.z+island.size*0.4),ridge=new Vector(island.x-island.size*0.28,20,island.z-island.size*0.18);
    const reef=world.scene.children.find((m:any)=>m.position.x===145&&m.position.z===-135),hit=new T.Raycaster(new T.Vector3(175,40,-135),new T.Vector3(0,-1,0)).intersectObject(reef,true)[0];
    if(!hit)throw new Error('Lighthouse reef has no rendered surface');
    const placement=world.rocks.placements.find((p:any)=>Math.hypot(p.matrix.elements[12]-145,p.matrix.elements[14]+135)<50);
    const rockHit=new T.Raycaster(new T.Vector3(placement.matrix.elements[12],40,placement.matrix.elements[14]),new T.Vector3(0,-1,0)).intersectObject(world.rocks.group,true)[0];
    if(!rockHit||rockHit.instanceId===undefined)throw new Error('Scanned reef rock has no rendered surface');
    const instanceMatrix=new T.Matrix4();(rockHit.object as any).getMatrixAt(rockHit.instanceId,instanceMatrix);instanceMatrix.premultiply(rockHit.object.matrixWorld);
    const rockNormal=rockHit.face!.normal.clone().applyMatrix3(new T.Matrix3().getNormalMatrix(instanceMatrix)).normalize();
    const measuredCoasts=[1,2].map(index=> {
      const measured=world.islands[index],islet=world.scene.children.find((m:any)=>m.geometry?.attributes.groundCover&&m.position.x===measured.x&&m.position.z===measured.z),ip=islet.geometry.attributes.position,width=Math.round(Math.sqrt(ip.count)),extent=measured.size*1.2,step=extent*2/(width-1),stride=Math.max(3,Math.floor((width-1)/64)),fineDepth=world.ocean.material.uniforms.islandBathymetry.value.image.data;
      let measuredDepthError=0;for(let i=0;i<ip.count;i++)measuredDepthError=Math.max(measuredDepthError,Math.abs(ip.getY(i)-(index===1?fineDepth[i*2]:bottom[i*4+index])));
      const contacts=[];
      for(let z=1;z<width-2&&contacts.length<12;z+=stride)for(let x=1;x<width-2&&contacts.length<12;x+=stride)for(const [u,v]of [[.2,.3],[.7,.8]]) {
        if(contacts.length>=12)break;if(ip.getY(z*width+x)<8)continue;
        const px=measured.x-extent+(x+u)*step,pz=measured.z-extent+(z+v)*step;
        if(world.naturalObstacles.some((o:any)=>Math.hypot(px-o.x,pz-o.z)<o.radius+1)||world.rocks.placements.some((p:any)=>px>p.bounds.min.x-1&&px<p.bounds.max.x+1&&pz>p.bounds.min.z-1&&pz<p.bounds.max.z+1))continue;
        const surface=new T.Raycaster(new T.Vector3(px,100,pz),new T.Vector3(0,-1,0)).intersectObject(islet)[0];if(!surface||surface.point.y<8)continue;
        contacts.push({half:u+v>1,surface:world.collision(surface.point,app.getState().time,'breeze'),air:world.collision(surface.point.clone().add(new T.Vector3(0,.6,0)),app.getState().time,'breeze')});
      }
      return {profile:measured.profile,size:measured.size,vertices:ip.count,depthError:measuredDepthError,contacts};
    });
    const measured=world.islands[2],islet=world.scene.children.find((m:any)=>m.geometry?.attributes.groundCover&&m.position.x===measured.x&&m.position.z===measured.z);
    const openPoint=new T.Vector3(-850,10,550),openBottom=new T.Raycaster(openPoint,new T.Vector3(0,-1,0)).intersectObject(islet)[0];if(!openBottom)throw new Error('Missing measured sea floor');
    return {profile:island.profile,depthError,bayContact:world.collision(bay,app.getState().time,'breeze'),ridgeContact:world.collision(ridge,app.getState().time,'breeze'),
      northeastern:measuredCoasts[0],measured:{...measuredCoasts[1],openBottom:openBottom.point.y,openAir:world.collision(openPoint,app.getState().time,'breeze')},
      reefHeight:hit.point.y,reefSurface:world.collision(hit.point,app.getState().time,'breeze'),reefAir:world.collision(hit.point.clone().add(new T.Vector3(0,0.6,0)),app.getState().time,'breeze'),previousGhost:world.collision(new T.Vector3(175,10,-135),app.getState().time,'breeze'),scannedSurface:world.collision(rockHit.point,app.getState().time,'breeze'),scannedAir:world.collision(rockHit.point.clone().addScaledVector(rockNormal,0.6),app.getState().time,'breeze'),reefTextures:['map','normalMap','roughnessMap'].map(key=>(hit.object as any).material[key]?.image.width)};
  });
  expect(coast.profile).toBe('trenyken');expect(coast.depthError).toBeLessThan(0.0001);
  expect(coast.northeastern.profile).toBe('hornoya');expect(coast.northeastern.size).toBe(500);expect(coast.northeastern.vertices).toBe(769**2);expect(coast.northeastern.depthError).toBeLessThan(.0001);
  expect(coast.northeastern.contacts).toHaveLength(12);expect(new Set(coast.northeastern.contacts.map((p:any)=>p.half)).size).toBe(2);
  for(const point of coast.northeastern.contacts){expect(point.surface).toBe('島に接触しました');expect(point.air).toBeNull();}
  expect(coast.measured.profile).toBe('measured-islet');expect(coast.measured.size).toBe(250);expect(coast.measured.vertices).toBe(193**2);expect(coast.measured.depthError).toBeLessThan(.0001);
  expect(coast.measured.contacts).toHaveLength(12);expect(new Set(coast.measured.contacts.map((p:any)=>p.half)).size).toBe(2);
  for(const point of coast.measured.contacts){expect(point.surface).toBe('島に接触しました');expect(point.air).toBeNull();}
  expect(coast.measured.openBottom).toBe(-9);expect(coast.measured.openAir).toBeNull();
  expect(coast.bayContact).toBeNull();expect(coast.ridgeContact).toBe('島に接触しました');
  expect(coast.reefHeight).toBeCloseTo(5.540271905,5);expect(coast.reefSurface).toBe('岩礁に接触しました');expect(coast.reefAir).toBeNull();expect(coast.previousGhost).toBeNull();
  expect(coast.scannedSurface).toBe('岩に接触しました');expect(coast.scannedAir).toBeNull();
  expect(coast.reefTextures).toEqual([4096,4096,4096]);
});
test('nearshore displacement and geometric normals match CPU sampling on the GPU',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/nearshore-probe.html');
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__NEARSHORE_PROBE__);},{timeout:60000}).toBe(true);
  const probe=await page.evaluate(()=>{const p=(window as any).__NEARSHORE_PROBE__;return {gpu:p.gpu,count:p.samples.length,unequalCount:p.samples.filter((s:any)=>s.gains[0]===1.8&&s.gains[1]===.9&&s.gains[2]===.5).length,bottomCount:p.bottomSamples.length,bottomError:p.bottomError,northwesternDepths:p.points.filter((point:any)=>point.coastIndex===0).map((point:any)=>({target:point.targetDepth,actual:point.bottomDepth,upper:point.upper})),northeasternDepths:p.points.filter((point:any)=>point.coastIndex===1).map((point:any)=>({target:point.targetDepth,actual:point.bottomDepth,upper:point.upper})),measuredDepths:p.points.filter((point:any)=>point.coastIndex===2).map((point:any)=>({target:point.targetDepth,actual:point.bottomDepth})),heightError:p.heightError,normalError:p.normalError,varianceError:p.varianceError,varianceRelativeError:p.varianceRelativeError,shadingVarianceError:p.shadingVarianceError,contactError:p.contactError,mipCount:p.mipSamples.length,mipError:p.mipError,manualMipError:p.manualMipError,longWaveError:p.longWaveError,subpixelMaximum:p.subpixelMaximum};});
  console.log(`Nearshore probe: ${JSON.stringify(probe)}`);
  expect(probe.measuredDepths.map((point:any)=>point.target)).toEqual([-5,0,.2,.8,1.5,2,2.5,3,4,6,8,8.2]);for(const point of probe.measuredDepths)expect(Math.abs(point.target-point.actual)).toBeLessThan(.05);
  for(const island of [probe.northwesternDepths,probe.northeasternDepths])for(const upper of [false,true]){const depths=island.filter((point:any)=>point.upper===upper);expect(depths.map((point:any)=>point.target)).toEqual([-5,0,.2,.8,1.5,2,2.5,3,4,6,8,8.2]);for(const point of depths)expect(Math.abs(point.target-point.actual)).toBeLessThan(.05);}
  expect(probe.bottomCount).toBe(24);expect(probe.bottomError).toBeLessThan(0.003);expect(probe.count).toBeGreaterThanOrEqual(2744);expect(probe.unequalCount).toBeGreaterThanOrEqual(686);expect(probe.heightError).toBeLessThan(0.003);expect(probe.normalError).toBeLessThan(0.003);expect(probe.varianceRelativeError).toBeLessThan(0.0001);expect(probe.shadingVarianceError).toBeLessThan(0.0001);expect(probe.contactError).toBeLessThan(0.01);expect(errors).toEqual([]);
  expect(probe.mipCount).toBeGreaterThanOrEqual(448);expect(probe.mipError).toBeLessThan(0.001);expect(probe.manualMipError).toBeLessThan(0.000003);expect(probe.longWaveError).toBeLessThan(0.005);expect(probe.subpixelMaximum).toBeLessThan(0.000001);
});
test('all passenger tenders have real surface contacts and free space around their bows',async({page})=> {
  // The full-scene CI contact probe completed correctly at 184 s, beyond the default 180 s.
  test.setTimeout(300000);
  await ready(page);
  const evidence=await page.evaluate(async()=> {
    const app=(window as any).__OCEANFPV__,world=app.world,T=await import('/node_modules/three/build/three.module.js' as string),model=await import('/src/tender.ts' as string),root=world.cruise.root;
    const contact=(point:any)=>world.collision(root.localToWorld(point),app.getState().time,'breeze'),hits=[];
    for(const mount of model.TENDER_MOUNTS) {
      const origin=root.localToWorld(new T.Vector3(Math.sign(mount.x)*23,11.4,mount.z)),direction=new T.Vector3(-Math.sign(mount.x),0,0).transformDirection(root.matrixWorld),hit=new T.Raycaster(origin,direction).intersectObject(root,true)[0];
      if(!hit)throw new Error('Tender side has no rendered surface');hits.push(world.collision(hit.point,app.getState().time,'breeze'));
    }
    let glazingHits=0;const template=model.buildTenderModel(),panes=template.parts.filter((p:any)=>p.finish==='glass');
    for(const mount of model.TENDER_MOUNTS) {
      const pane=panes[mount.x<0?0:6].geometry,p=pane.attributes.position,normal=new T.Vector3().fromBufferAttribute(pane.attributes.normal,0),centre=new T.Vector3();
      for(let i=0;i<p.count;i++)centre.add(new T.Vector3().fromBufferAttribute(p,i));centre.divideScalar(p.count).add(mount);
      const origin=root.localToWorld(centre.addScaledVector(normal,0.5)),direction=normal.negate().transformDirection(root.matrixWorld),hit=new T.Raycaster(origin,direction).intersectObject(root,true)[0];
      if(hit?.object.material===world.cruise.glazing)glazingHits++;
    }
    let furnitureHits=0;
    for(const mount of [model.TENDER_MOUNTS[0],model.TENDER_MOUNTS[9]]) {
      const side=Math.sign(mount.x),eye=root.localToWorld(new T.Vector3(side*2.4,2.2,0.44).add(mount)),target=root.localToWorld(new T.Vector3(side*1.39,1.4,0.44).add(mount)),hit=new T.Raycaster(eye,target.sub(eye).normalize()).intersectObjects(root.children.filter((m:any)=>m.material!==world.cruise.glazing))[0];
      if(hit?.object.material.name==='Tender upholstery')furnitureHits++;
    }
    let supported=0,floorError=0;
    for(const {line}of world.cruise.hoistSegments)if(line.start.y===12.2) {
      const origin=root.localToWorld(new T.Vector3(line.start.x,12.205,line.start.z)),direction=new T.Vector3(0,-1,0).transformDirection(root.matrixWorld),hit=new T.Raycaster(origin,direction).intersectObject(root,true)[0];
      if(!hit)throw new Error('Davit foot has no rendered deck');floorError=Math.max(floorError,Math.abs(root.worldToLocal(hit.point).y-12.18));supported++;
    }
    const glass=world.cruise.glazing;
    return {hits,supported,floorError,glazingHits,furnitureHits,glazing:{transparent:glass.transparent,opacity:glass.opacity,transmission:glass.transmission,depthWrite:glass.depthWrite},ghost:contact(new T.Vector3(19.6,10.6,-72.8)),outside:contact(new T.Vector3(23,11.4,-68)),hook:contact(model.TENDER_MOUNTS[9].clone().add(model.TENDER_HOOKS[0]))};
  });
  expect(evidence.hits).toHaveLength(18);expect(evidence.hits.every((hit:string)=>hit==='客船の救命艇・吊り機構に接触しました')).toBe(true);
  expect(evidence.ghost).toBeNull();expect(evidence.outside).toBeNull();expect(evidence.hook).toBe('客船の救命艇・吊り機構に接触しました');
  expect(evidence.supported).toBe(72);expect(evidence.floorError).toBeLessThan(0.00001);
  expect(evidence.glazingHits).toBe(18);expect(evidence.glazing).toEqual({transparent:true,opacity:0.18,transmission:0,depthWrite:false});
  expect(evidence.furnitureHits).toBe(2);
});
test('WebGL-unavailable browser gets a clear recovery screen', async ({page})=> {
  await page.addInitScript(()=> {
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:any[]) {
      if(type==='webgl2'||type==='webgl'||type==='experimental-webgl') return null;
      return (original as any).call(this,type,...args);
    } as any;
  });
  await page.goto('/');await expect(page.locator('#unsupported')).toBeVisible();
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#unsupported-reason')).toContainText('WebGL2');
});
