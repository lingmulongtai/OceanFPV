import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.addInitScript(()=> { if(!localStorage.getItem('oceanfpv:settings')) localStorage.setItem('oceanfpv:settings',JSON.stringify({quality:'balanced'})); });
  await page.goto('/?test=1');
  await expect(page.locator('#start')).toBeEnabled({timeout:90000});
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

test('renders the sea, detailed scene, and usable menu without WebGL errors', async ({page})=> {
  await recordGroundPrograms(page);const detailRequests:string[]=[];page.on('request',request=>{if(/seaside_rock_(diff|nor_gl|rough)_4k.jpg$/.test(request.url()))detailRequests.push(request.url());});
  const networkFailures:{url:string;error:string|undefined}[]=[];page.on('requestfailed',request=>networkFailures.push({url:request.url(),error:request.failure()?.errorText}));
  await page.setViewportSize({width:960,height:640});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await ready(page);
  const {loading,gpu,render,forest,rocks,cliff,detailPrograms,unsupportedVisible}=await page.evaluate(()=> {
    const app=(window as any).__OCEANFPV__,gl=document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');
    const rocks=app.world.rocks;
    const w=app.world;
    return {loading:{failures:w.surfaceFailures,note:document.querySelector('#start-note')!.textContent,detail:[w.coastalRockDetail.map,w.coastalRockDetail.normalMap,w.coastalRockDetail.roughnessMap].map(Boolean)},
      detailPrograms:(window as any).__GROUND_PROGRAMS__.filter((program:any)=>program.names.includes('groundDetailMap')),unsupportedVisible:!!document.querySelector('#unsupported')!.getClientRects().length,
      gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',render:app.getState(),forest:w.forest?.sourceTriangles??0,cliff:w.cliff?.surface.geometry.index.count/3,
      rocks:{triangles:rocks?.shape.geometry.index.count/3,placements:rocks?.placements.length,instances:rocks?.group.children.reduce((sum:number,mesh:any)=>sum+mesh.count,0),reef:rocks?.placements.filter((p:any)=>Math.hypot(p.matrix.elements[12]-app.world.lighthouseReef.x,p.matrix.elements[14]-app.world.lighthouseReef.z)<50).length,
        perIsland:w.islands.map((c:any)=>rocks?.placements.filter((p:any)=>Math.abs(p.matrix.elements[12]-c.x)<c.size*1.2&&Math.abs(p.matrix.elements[14]-c.z)<c.size*1.2).length)}};
  });
  console.log(`Surface delivery: ${JSON.stringify({...loading,networkFailures})}`);
  expect(loading.failures.filter((failure:any)=>!failure.recovered)).toEqual([]);expect(loading.detail).toEqual([true,true,true]);expect(loading.note).not.toContain('標準素材');
  console.log(`Renderer: ${gpu}`);
  if(process.env.OCEANFPV_NATIVE_GPU==='1') {
    expect(gpu).not.toMatch(/SwiftShader|Microsoft Basic|unavailable/i);expect(gpu).toContain('Direct3D11');
  }
  expect(unsupportedVisible).toBe(false);
  expect(render.triangles).toBeGreaterThan(30000);
  expect(forest).toBeGreaterThan(1000000);
  expect(rocks.triangles).toBe(14844);expect(rocks.perIsland).toEqual([51,66,79]);expect(rocks.placements).toBe(205);expect(rocks.instances).toBe(rocks.placements);expect(rocks.reef).toBe(9);expect(cliff).toBe(943284);
  expect(detailPrograms.length).toBeGreaterThan(0);for(const program of detailPrograms){expect(program.samplers).toBeLessThanOrEqual(program.limit);expect(program.names).toContain('groundDetailNormalMap');expect(program.names).toContain('groundDetailRoughnessMap');}
  const recovered=loading.failures.filter((failure:any)=>failure.asset==='seaside_rock'&&failure.recovered);
  expect(detailRequests.length).toBe(3+recovered.length);expect(new Set(detailRequests).size).toBe(3);
  for(const url of new Set(detailRequests)){const map=/seaside_rock_(diff|nor_gl|rough)_4k.jpg$/.exec(url)![1];expect(detailRequests.filter(request=>request===url).length).toBe(1+recovered.filter((failure:any)=>failure.map===map).length);}
  console.log(`Ground production samplers: ${JSON.stringify(detailPrograms.map((program:any)=>({samplers:program.samplers,limit:program.limit})))}`);
  await page.screenshot({path:'test-results/oceanfpv-menu.png'});
  expect(errors).toEqual([]);
});

for(const peer of [false,true])test(peer?'expired rock response and peer both recover without refetching the completed map':'one expired rock response retries only that image and reaches full detail',async({page})=> {
  const requests:string[]=[],errors:string[]=[];page.on('request',request=>{const map=/seaside_rock_(diff|nor_gl|rough)_4k.jpg$/.exec(request.url());if(map)requests.push(map[1]);});page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({peer})=> {
    const timeout=AbortSignal.timeout,controllers=new WeakMap<AbortSignal,AbortController>(),fetch=window.fetch.bind(window),selected=new Set<string>();
    AbortSignal.timeout=ms=>{const deadline=timeout.call(AbortSignal,ms),controller=new AbortController();deadline.addEventListener('abort',()=>controller.abort(deadline.reason),{once:true});controllers.set(controller.signal,controller);return controller.signal;};
    window.fetch=async(input,init)=> {
      const map=/seaside_rock_(rough|nor_gl)_4k.jpg$/.exec(String(input))?.[1],expire=!!map&&!selected.has(map)&&(map==='rough'||peer);if(expire)selected.add(map!);
      const response=await fetch(input,init);
      if(expire){const controller=controllers.get(init!.signal as AbortSignal);if(!controller)throw new Error('Missing controlled texture deadline');controller.abort(new DOMException('Controlled response deadline','TimeoutError'));}
      return response;
    };
  },{peer});
  await ready(page);
  const state=await page.evaluate(()=>{const w=(window as any).__OCEANFPV__.world;return {failures:w.surfaceFailures,detail:[w.coastalRockDetail.map,w.coastalRockDetail.normalMap,w.coastalRockDetail.roughnessMap].map(Boolean),note:document.querySelector('#start-note')!.textContent};});
  console.log(`Recovered surface delivery: ${JSON.stringify({state,requests})}`);
  expect(state.detail).toEqual([true,true,true]);expect(state.note).not.toContain('標準素材');
  const recovered=state.failures.filter((failure:any)=>failure.asset==='seaside_rock'&&failure.recovered),controlled=recovered.filter((failure:any)=>failure.map==='rough');
  expect(controlled).toEqual([expect.objectContaining({asset:'seaside_rock',map:'rough',phase:'body',message:'Controlled response deadline',aborted:true,abortReason:'TimeoutError',attempt:1,recovered:true})]);
  expect(state.failures.filter((failure:any)=>!failure.recovered)).toEqual([]);expect(['fetch','body']).toContain(controlled[0].phase);
  expect(requests.length).toBe(3+recovered.length);
  for(const map of ['diff','nor_gl','rough']){const failures=recovered.filter((failure:any)=>failure.map===map);expect(failures.length).toBeLessThanOrEqual(1);expect(requests.filter(request=>request===map).length).toBe(1+failures.length);}
  expect(requests.filter(map=>map==='rough').length).toBe(2);
  if(peer){expect(recovered.filter((failure:any)=>failure.map==='nor_gl')).toEqual([expect.objectContaining({phase:'body',message:'Controlled response deadline',attempt:1,recovered:true})]);expect(requests.filter(map=>map==='diff').length).toBe(1);}
  expect(errors).toEqual([]);
});

test('one missing rock detail map retains coherent macro terrain and grass rendering',async({page})=> {
  await recordGroundPrograms(page);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/seaside_rock_nor_gl_4k.jpg',route=>route.abort());await ready(page);
  const state=await page.evaluate(()=> {
    const world=(window as any).__OCEANFPV__.world,detail=world.coastalRockDetail;
    const islands=world.scene.children.filter((mesh:any)=>mesh.geometry?.attributes.groundCover);
    return {failures:world.surfaceFailures,detail:[detail.map,detail.normalMap,detail.roughnessMap].map(Boolean),islands:islands.map((mesh:any)=>[mesh.material.map,mesh.material.normalMap,mesh.material.roughnessMap].every(Boolean)),cover:[world.groundCover.map,world.groundCover.normalMap,world.groundCover.roughnessMap].every(Boolean),programs:(window as any).__GROUND_PROGRAMS__.filter((program:any)=>program.names.includes('coverMap'))};
  });
  expect(state.detail).toEqual([false,false,false]);expect(state.islands).toEqual([true,true,true]);expect(state.cover).toBe(true);expect(state.programs.length).toBeGreaterThan(0);
  console.log(`Surface fallback: ${JSON.stringify(state.failures)}`);
  expect(state.failures.filter((failure:any)=>!failure.recovered)).toEqual([expect.objectContaining({asset:'seaside_rock',map:'nor_gl',phase:'fetch',aborted:false,abortReason:null,attempt:1})]);
  for(const program of state.programs){expect(program.names).not.toContain('groundDetailMap');expect(program.samplers).toBeLessThanOrEqual(program.limit);}
  await page.screenshot({path:'test-results/oceanfpv-ground-detail-fallback.png'});expect(errors).toEqual([]);
});

test('photographed cliff contacts, joined ground and shared water depth agree',async({page})=> {
  await ready(page);
  const result=await page.evaluate(()=>{
    const w=(window as any).__OCEANFPV__.world,scan=w.cliff.surface,ground=w.cliffGround,Vector=w.ship.position.constructor,Ray=w.lighthouseReef.topRay.constructor;
    const ray=new Ray(new Vector(-350,2,-450),new Vector(-1,0,0)),hit=scan.tree.raycastFirst(ray,2);if(!hit)throw new Error('Missing photographed front face');
    const front=hit.point.clone().add(new Vector(2,0,0)),back=hit.point.clone().add(new Vector(-2,0,0));
    const contacts=[w.collision(back,0,'breeze',front),w.collision(front,0,'breeze',back)];
    const position=ground.geometry.attributes.position,data=w.ocean.bottomData,texture=w.ocean.material.uniforms.bathymetry.value;
    let error=0,scanVertices=0;
    for(let i=0;i<position.count;i++) {const top=scan.topHeight(position.getX(i)-580,position.getZ(i)-420);if(top!==null)scanVertices++;error=Math.max(error,Math.abs(data[i*4]-position.getY(i)));}
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
  expect(state).toEqual({cliff:false,ground:false,rocks:213,instances:213});await expect(page.locator('#start-note')).toContainText('標準素材');
});

test('cliff join keeps fallback rock rendering and collision records together',async({page})=> {
  await page.route('**/models/rock_07/**',route=>route.abort());await ready(page);
  const state=await page.evaluate(()=>{
    const w=(window as any).__OCEANFPV__.world,ground=w.cliffGround,matrices=w.rockPatches.filter((p:any)=>p.fallback).map((p:any)=>p.fallback.count);
    return {cliff:!!w.cliff,rocks:!!w.rocks,visible:matrices.reduce((n:number,count:number)=>n+count,0),contacts:w.fallbackRockObstacles.length,inside:w.fallbackRockObstacles.filter((p:any)=>ground.excludes(p.x,p.z,p.radius)).length};
  });
  expect(state.cliff).toBe(true);expect(state.rocks).toBe(false);expect(state.contacts).toBeLessThan(270);expect(state.visible).toBe(state.contacts);expect(state.inside).toBe(0);
});

test('detailed cliff water height gradient and attenuation agree on the GPU',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/cliff-depth-probe.html');
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__CLIFF_DEPTH_PROBE__);},{timeout:60000}).toBe(true);
  const result=await page.evaluate(()=>{const p=(window as any).__CLIFF_DEPTH_PROBE__;return {gpu:p.gpu,count:p.samples.length,heightError:p.heightError,gradientError:p.gradientError,envelopeError:p.envelopeError};});
  console.log(`Cliff depth probe: ${JSON.stringify(result)}`);expect(result.count).toBe(77);expect(result.heightError).toBeLessThan(.003);expect(result.gradientError).toBeLessThan(.003);expect(result.envelopeError).toBeLessThan(.003);expect(errors).toEqual([]);
});

test('production hull water masks agree on the GPU for cruise explorer and yacht',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/hull-mask-probe.html');
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__HULL_MASK_PROBE__);},{timeout:60000}).toBe(true);
  const result=await page.evaluate(()=>(window as any).__HULL_MASK_PROBE__);console.log(`Hull mask probe: ${JSON.stringify(result)}`);expect(result.count).toBe(1704);
  // SwiftShader's existing sin/pow bow profile differs by up to 1.36 mm; the new aft profile stays tighter.
  expect(result.widthError).toBeLessThan(.002);expect(result.aftWidthError).toBeLessThan(.0005);expect(result.maskErrors).toBe(0);expect(errors).toEqual([]);
});

test('cruise aft hull surfaces have matching flight contacts and clear surrounding air',async({page})=> {
  await ready(page);
  const samples=await page.evaluate(async()=>{
    const a=(window as any).__OCEANFPV__,w=a.world,T=await import('/node_modules/three/build/three.module.js' as string),hull=w.cruise.root.children.find((mesh:any)=>mesh.material===w.cruise.paint[1]),samples=[];
    for(const side of [-1,1])for(const z of [80,100,110,120,125,129])for(const y of [4.2,7.6]) {
      const origin=w.cruise.root.localToWorld(new T.Vector3(side*30,y,z)),direction=new T.Vector3(-side,0,0).transformDirection(w.cruise.root.matrixWorld),hit=new T.Raycaster(origin,direction).intersectObject(hull)[0];if(!hit)throw new Error('Missing aft hull');
      const outside=hit.point.clone().addScaledVector(direction,-.3);samples.push({z,y,width:Math.abs(w.cruise.root.worldToLocal(hit.point.clone()).x),contact:w.collision(hit.point,a.getState().time,'breeze'),clear:w.collision(outside,a.getState().time,'breeze')});
    }
    return samples;
  });
  expect(samples).toHaveLength(24);for(const sample of samples){expect(sample.contact).toContain('船体');expect(sample.clear).toBeNull();if(sample.z<=120)expect(sample.width).toBeGreaterThan(15);}
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

test('stern terrace walking surfaces and supports have matching flight contacts',async({page})=> {
  await ready(page);
  const result=await page.evaluate(async()=>{
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
    proxies.forEach((mesh:any)=>mesh.material.dispose());return {samples,foundations};
  });
  expect(result.samples).toHaveLength(3);for(const sample of result.samples){expect(sample.teak).toBe(true);expect(sample.error).toBeLessThan(.00001);expect(sample.contact).toBeTruthy();expect(sample.clear).toBeNull();expect(sample.railError).toBeLessThan(.00001);expect(sample.railContact).toBeTruthy();expect(sample.aboveRail).toBeNull();}
  for(const y of result.foundations){expect(y).not.toBeNull();expect(y).toBeGreaterThan(9.1);expect(y).toBeLessThan(9.28);}
});
test('vessels really travel, launch follows the moving deck and unavailable surfaces recover',async({page})=> {
  await page.route('**/textures/*.jpg',route=>route.abort());await ready(page);
  await expect(page.locator('#start-note')).toContainText('標準素材');
  expect(await page.evaluate(()=>{const w=(window as any).__OCEANFPV__.world;return {detailed:!!w.rocks,contacts:w.fallbackRockObstacles.length,visible:w.rockPatches.filter((patch:any)=>patch.fallback).every((patch:any)=>patch.fallback.parent===w.scene),meshPatches:w.rockPatches.filter((patch:any)=>!patch.fallback).length};})).toEqual({detailed:false,contacts:270,visible:true,meshPatches:1});
  const first=await page.evaluate(()=> (window as any).__OCEANFPV__.world.cruise.root.position.toArray());
  await expect.poll(()=>page.evaluate(()=> (window as any).__OCEANFPV__.world.cruise.root.position.x)).not.toBe(first[0]);
  const app=await page.evaluate(()=> {
    const a=(window as any).__OCEANFPV__,expected=a.world.launchPose(a.getState().time);
    document.querySelector<HTMLButtonElement>('#start')!.click();
    const local=a.world.ship.worldToLocal(a.flight.position.clone());
    return {local:local.toArray(),positionError:a.flight.position.distanceTo(expected.position),velocityError:a.flight.velocity.distanceTo(expected.velocity)};
  });
  expect(Math.abs(app.local[0])).toBeLessThan(1);expect(Math.abs(app.local[2]-38)).toBeLessThan(2);
  expect(app.positionError).toBeLessThan(1e-6);expect(app.velocityError).toBeLessThan(1e-6);
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
    return {error,held,refreshes,rewindCleared,presetCleared,floatError:Math.abs(w.ship.position.y-w.ocean.heightAt(w.ship.position.x,w.ship.position.z)*0.45)};
  });
  expect(motion.error).toBeLessThan(1e-6);expect(motion.held).toBeGreaterThan(10);expect(motion.refreshes).toBeGreaterThanOrEqual(5);
  expect(motion.rewindCleared).toBe(true);expect(motion.presetCleared).toBe(true);expect(motion.floatError).toBeLessThan(1e-6);
  const reset=await page.evaluate(()=> {
    const w=(window as any).__OCEANFPV__.world;w.advanceVessels(100);
    const old=w.ocean.material.uniforms.wakePoints.value.map((p:any)=>p.toArray());w.advanceVessels(0);
    return {old,points:w.ocean.material.uniforms.wakePoints.value.map((p:any)=>p.toArray())};
  });
  expect(reset.old).toHaveLength(39);expect(reset.old.some((p:number[])=>p[2]>0)).toBe(true);
  for(let i=0;i<3;i++) {
    const points=reset.points.slice(i*13,(i+1)*13);
    expect(points.every((p:number[])=>p[2]===0&&p[0]===points[0][0]&&p[1]===points[0][1])).toBe(true);
  }
});
test('keyboard flight climbs, pitches, pauses without drift and resets after collision', async ({page})=> {
  test.setTimeout(300000);
  await ready(page);await page.locator('#start').click();
  await page.keyboard.down('Space');await expect.poll(()=>page.evaluate(()=> (window as any).__OCEANFPV__.flight.position.y)).toBeGreaterThan(8);await page.keyboard.up('Space');
  const beforePitch=await page.evaluate(()=> {
    const flight=(window as any).__OCEANFPV__.flight,forward=flight.position.clone().set(0,0,-1).applyQuaternion(flight.orientation).setY(0).normalize();
    return {altitude:flight.position.y,forward:forward.toArray(),speed:flight.velocity.dot(forward)};
  });
  expect(beforePitch.altitude).toBeGreaterThan(6);
  const forwardSpeed=()=>page.evaluate((forward:number[])=> {const v=(window as any).__OCEANFPV__.flight.velocity;return v.x*forward[0]+v.z*forward[2];},beforePitch.forward);
  await page.keyboard.down('KeyW');await expect.poll(forwardSpeed).toBeGreaterThan(Math.max(0.8,beforePitch.speed+0.8));await page.keyboard.up('KeyW');
  expect(await forwardSpeed()).toBeGreaterThan(0.5);
  await page.keyboard.press('Escape');await expect(page.locator('#pause-dialog')).toBeVisible();
  const paused=await page.evaluate(()=> (window as any).__OCEANFPV__.flight.position.toArray());
  await page.waitForTimeout(300);expect(await page.evaluate(()=> (window as any).__OCEANFPV__.flight.position.toArray())).toEqual(paused);
  await page.locator('#resume').click();
  await page.evaluate(()=> (window as any).__OCEANFPV__.flight.position.y=-4);
  await expect(page.locator('#pause-title')).toHaveText('フライト終了');
  await page.keyboard.press('KeyR');await expect(page.locator('#pause-dialog')).toBeHidden();
  expect(await page.evaluate(()=> (window as any).__OCEANFPV__.flight.crashed)).toBe(false);
  await page.locator('#open-settings').click();await page.locator('#mode').selectOption('acro');
  await page.locator('[data-close="settings-dialog"]').last().click();
  expect(await page.evaluate(()=> (window as any).__OCEANFPV__.flight.armed)).toBe(true);
});
test('render delays keep world and flight coupled and unsafe gaps pause without a jump',async({page})=> {
  test.setTimeout(300000);
  await ready(page);await page.locator('#start').click();
  const result=await page.evaluate(async()=> {
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
  await ready(page);await page.locator('#open-help').click();
  const help=await snapshot();expect(await snapshot()).toEqual(help);
  await page.locator('[data-close="help-dialog"]').last().click();
  const moving=await snapshot();expect(moving.time).toBeGreaterThan(help.time);expect(moving.draws).toBeGreaterThan(help.draws);
  await page.locator('#start').click();await page.locator('#open-settings').click();
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
  await page.keyboard.press('Escape');const paused=await snapshot();expect(await snapshot()).toEqual(paused);
});

test('lost WebGL context closes modal layers and leaves recovery reachable',async({page})=> {
  await ready(page);await page.locator('#start').click();await page.keyboard.press('Escape');
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
  test.setTimeout(300000);
  await ready(page);
  await expect.poll(()=>page.evaluate(()=> (window as any).__OCEANFPV__.getState().time),{timeout:60000}).toBeGreaterThan(2);
  await page.locator('#race-mode').click();
  const resetTime=await page.evaluate(()=> {
    document.querySelector<HTMLButtonElement>('#start')!.click();
    return (window as any).__OCEANFPV__.getState().time;
  });
  expect(resetTime).toBe(0);
  const crossings=await page.evaluate(async()=> {
    const app=(window as any).__OCEANFPV__,crossings:{progress:number;waited:number}[]=[];
    for(let index=0;index<18;index++) {
      const g=app.world.gateMeshes[index%6];
      // Use the mesh orientation to put flight one step before the real plane.
      const normal=app.flight.position.clone().set(0,0,1).applyQuaternion(g.quaternion);
      app.flight.position.copy(g.position).addScaledVector(normal,-0.08);
      app.flight.velocity.copy(normal).multiplyScalar(24);app.flight.orientation.identity();
      const start=performance.now(),progress=()=>app.race.laps.length*6+app.race.next;
      // Let real animation/physics frames cross the plane without a protocol poll per frame.
      do {await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
      while(progress()<index+1&&performance.now()-start<20000);
      const crossed={progress:progress(),waited:performance.now()-start};crossings.push(crossed);
      if(crossed.progress!==index+1||crossed.waited>20000)break;
    }
    return crossings;
  });
  expect(crossings).toHaveLength(18);
  for(const [index,crossed]of crossings.entries()) {
    expect(crossed.progress).toBe(index+1);expect(crossed.waited).toBeLessThanOrEqual(20000);
  }
  await expect(page.locator('#pause-title')).toHaveText('コース完走！');
  await expect(page.locator('#results')).toContainText('TOTAL');
  expect(await page.evaluate(()=>Number(localStorage.getItem('oceanfpv:best')))).toBeGreaterThan(0);
});
test('Xbox mapping, arm safety and disconnect pause work through Gamepad API', async ({page})=> {
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
    const applied=(window as any).__OCEANFPV__.input.source;
    document.querySelectorAll<HTMLButtonElement>('[data-close="settings-dialog"]').item(1).click();
    return {opened,selected,source:applied,closed:!dialog.open};
  });
  expect(setup).toEqual({opened:true,selected:'true',source:'xbox',closed:true});
  const climbed=await page.evaluate(async()=> {
    const app=(window as any).__OCEANFPV__;
    document.querySelector<HTMLButtonElement>('#start')!.click();
    const initial=app.flight.position.y,start=performance.now();
    (window as any).__pad.axes=[0,-1,0,-0.5];
    do {await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
    while((app.flight.position.y<=7||app.flight.position.y<=initial+1)&&performance.now()-start<20000);
    return {initial,altitude:app.flight.position.y,armed:app.flight.armed,source:app.input.source,sticks:app.input.sticks()};
  });
  expect(climbed.altitude).toBeGreaterThan(7);expect(climbed.altitude-climbed.initial).toBeGreaterThan(1);
  expect(climbed.armed).toBe(true);expect(climbed.source).toBe('xbox');
  expect(climbed.sticks.throttle).toBe(1);expect(climbed.sticks.pitch).toBeLessThan(0);expect(climbed.sticks.absoluteThrottle).toBe(false);
  await page.evaluate(()=> {(window as any).__pad=null;});await expect(page.locator('#pause-title')).toHaveText('コントローラー接続が切れました');
  await page.locator('#resume').click();await expect(page.locator('#pause-dialog')).toBeVisible();
  expect(await page.evaluate(()=> (window as any).__OCEANFPV__.getState().paused)).toBe(true);
});
test('radio calibration, axis assignment and low-throttle arming', async ({page})=> {
  test.setTimeout(300000);
  await page.addInitScript(()=> {
    (window as any).__pad={id:'USB radio test',index:0,connected:true,mapping:'',axes:[0,0,0,0],buttons:[],timestamp:0};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[(window as any).__pad]});
  });
  await ready(page);await page.locator('#open-settings').click();await page.locator('[data-tab="controller"]').click();await page.locator('#input-source').selectOption('radio');
  await page.locator('#calibrate').click();
  await page.evaluate(()=> {(window as any).__pad.axes=[-0.8,-0.8,-0.8,-0.8];});
  await expect.poll(()=>page.evaluate(()=> (window as any).__OCEANFPV__.input.profile.calibration[0].min)).toBe(-0.8);
  await page.evaluate(()=> {(window as any).__pad.axes=[0.9,0.9,0.9,0.9];});
  await expect.poll(()=>page.evaluate(()=> (window as any).__OCEANFPV__.input.profile.calibration[0].max)).toBe(0.9);
  await page.locator('#save-calibration').click();
  expect(await page.evaluate(()=> JSON.parse(localStorage.getItem('oceanfpv:radio:USB radio test')!).calibration[0].min)).toBe(-0.8);
  await page.locator('[data-close="settings-dialog"]').last().click();
  await page.evaluate(()=> {(window as any).__pad.axes=[0,0,0,-0.8];});await page.waitForTimeout(150);await page.locator('#start').click();
  await expect(page.locator('#toast')).toContainText('スロットルを下げ');await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.evaluate(()=> {(window as any).__pad.axes=[0,0,0,0.9];});await page.waitForTimeout(150);
  await expect(page.locator('#device-status')).toContainText('THROTTLE 0%');
  await page.locator('[data-close="settings-dialog"]').last().click();await page.locator('#start').click();await expect(page.locator('#intro')).toBeHidden();
});
test('lighting and sea settings persist across a full reload', async ({page})=> {
  test.setTimeout(300000);
  await ready(page);await page.locator('#open-settings').click();await page.locator('#light').selectOption('day');await page.locator('#sea').selectOption('calm');
  await page.keyboard.press('Escape');await page.reload();await expect(page.locator('#start')).toBeEnabled({timeout:90000});
  const persisted=await page.evaluate(()=>({light:document.querySelector<HTMLSelectElement>('#light')!.value,sea:document.querySelector<HTMLSelectElement>('#sea')!.value}));
  expect(persisted).toEqual({light:'day',sea:'calm'});
});

test('mobile help fits the viewport and closes with the keyboard', async ({page})=> {
  await page.setViewportSize({width:390,height:844});await ready(page);
  await page.locator('#open-help').click();await expect(page.locator('#help-dialog')).toBeVisible();
  const box=await page.locator('#help-dialog').boundingBox();expect(box!.width).toBeLessThan(390);
  await page.screenshot({path:'test-results/oceanfpv-mobile-help.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#help-dialog')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
test('terrain projections preserve physical periods and normal direction on the GPU',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/ground-probe.html');
  await page.waitForFunction(()=>!!((window as any).__GROUND_PROBE__||(window as any).__GROUND_PROBE_ERROR__),{},{timeout:60000});
  expect(await page.evaluate(()=>(window as any).__GROUND_PROBE_ERROR__)).toBeUndefined();
  const probe=await page.evaluate(()=>{const p=(window as any).__GROUND_PROBE__;return {gpu:p.gpu,count:p.samples.length,maximum:p.maximum,detailCount:p.detailSamples.length,detailMaximum:p.detailMaximum,loadingFailures:p.loadingFailures};});
  console.log(`Ground material probe: ${JSON.stringify(probe)}`);
  expect(probe.count).toBe(96);expect(probe.maximum).toBeLessThan(0.002);expect(probe.detailCount).toBe(2592);expect(probe.detailMaximum).toBeLessThan(0.002);expect(errors).toEqual([]);
  expect(probe.loadingFailures.map((failure:any)=>failure.phase)).toEqual(['fetch','fetch','fetch','body','body','body','decode','decode','decode',...Array(6).fill('body')]);
  for(const failure of probe.loadingFailures.slice(-6))expect(failure).toMatchObject({name:'TimeoutError',aborted:true,abortReason:'TimeoutError',recovered:false});
});
test('headland bay and lighthouse reef match rendered flight contacts',async({page})=> {
  await ready(page);
  const coast=await page.evaluate(async()=> {
    const app=(window as any).__OCEANFPV__,world=app.world,island=world.islands[0],T=await import('/node_modules/three/build/three.module.js' as string);
    const mesh=world.scene.children.find((m:any)=>m.geometry?.attributes.groundCover&&m.position.x===island.x&&m.position.z===island.z),p=mesh.geometry.attributes.position;
    const bottom=world.ocean.material.uniforms.bathymetry.value.image.data;let depthError=0;
    for(let i=0;i<p.count;i+=137)depthError=Math.max(depthError,Math.abs(p.getY(i)-bottom[i*4]));
    const Vector=app.flight.position.constructor,bay=new Vector(island.x+island.size*0.38,15,island.z+island.size*0.4),ridge=new Vector(island.x-island.size*0.28,20,island.z-island.size*0.18);
    const reef=world.scene.children.find((m:any)=>m.position.x===145&&m.position.z===-135),hit=new T.Raycaster(new T.Vector3(175,40,-135),new T.Vector3(0,-1,0)).intersectObject(reef,true)[0];
    if(!hit)throw new Error('Lighthouse reef has no rendered surface');
    const placement=world.rocks.placements.find((p:any)=>Math.hypot(p.matrix.elements[12]-145,p.matrix.elements[14]+135)<50);
    const rockHit=new T.Raycaster(new T.Vector3(placement.matrix.elements[12],40,placement.matrix.elements[14]),new T.Vector3(0,-1,0)).intersectObject(world.rocks.group,true)[0];
    if(!rockHit||rockHit.instanceId===undefined)throw new Error('Scanned reef rock has no rendered surface');
    const instanceMatrix=new T.Matrix4();(rockHit.object as any).getMatrixAt(rockHit.instanceId,instanceMatrix);instanceMatrix.premultiply(rockHit.object.matrixWorld);
    const rockNormal=rockHit.face!.normal.clone().applyMatrix3(new T.Matrix3().getNormalMatrix(instanceMatrix)).normalize();
    const measured=world.islands[2],islet=world.scene.children.find((m:any)=>m.geometry?.attributes.groundCover&&m.position.x===measured.x&&m.position.z===measured.z),ip=islet.geometry.attributes.position;
    let measuredDepthError=0;for(let i=0;i<ip.count;i++)measuredDepthError=Math.max(measuredDepthError,Math.abs(ip.getY(i)-bottom[i*4+2]));
    const measuredContacts=[];
    for(let z=1;z<191&&measuredContacts.length<12;z+=3)for(let x=1;x<191&&measuredContacts.length<12;x+=3)for(const [u,v]of [[.2,.3],[.7,.8]]) {
      if(measuredContacts.length>=12)break;
      const px=measured.x-300+(x+u)*3.125,pz=measured.z-300+(z+v)*3.125;
      if(world.naturalObstacles.some((o:any)=>Math.hypot(px-o.x,pz-o.z)<o.radius+1)||world.rocks.placements.some((p:any)=>px>p.bounds.min.x-1&&px<p.bounds.max.x+1&&pz>p.bounds.min.z-1&&pz<p.bounds.max.z+1))continue;
      const surface=new T.Raycaster(new T.Vector3(px,60,pz),new T.Vector3(0,-1,0)).intersectObject(islet)[0];if(!surface||surface.point.y<8)continue;
      measuredContacts.push({half:u+v>1,surface:world.collision(surface.point,app.getState().time,'breeze'),air:world.collision(surface.point.clone().add(new T.Vector3(0,.6,0)),app.getState().time,'breeze')});
    }
    const openPoint=new T.Vector3(-850,10,550),openBottom=new T.Raycaster(openPoint,new T.Vector3(0,-1,0)).intersectObject(islet)[0];if(!openBottom)throw new Error('Missing measured sea floor');
    return {profile:island.profile,depthError,bayContact:world.collision(bay,app.getState().time,'breeze'),ridgeContact:world.collision(ridge,app.getState().time,'breeze'),
      measured:{profile:measured.profile,size:measured.size,vertices:ip.count,depthError:measuredDepthError,contacts:measuredContacts,openBottom:openBottom.point.y,openAir:world.collision(openPoint,app.getState().time,'breeze')},
      reefHeight:hit.point.y,reefSurface:world.collision(hit.point,app.getState().time,'breeze'),reefAir:world.collision(hit.point.clone().add(new T.Vector3(0,0.6,0)),app.getState().time,'breeze'),previousGhost:world.collision(new T.Vector3(175,10,-135),app.getState().time,'breeze'),scannedSurface:world.collision(rockHit.point,app.getState().time,'breeze'),scannedAir:world.collision(rockHit.point.clone().addScaledVector(rockNormal,0.6),app.getState().time,'breeze'),reefTextures:['map','normalMap','roughnessMap'].map(key=>(hit.object as any).material[key]?.image.width)};
  });
  expect(coast.profile).toBe('headland');expect(coast.depthError).toBeLessThan(0.0001);
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
  const probe=await page.evaluate(()=>{const p=(window as any).__NEARSHORE_PROBE__;return {gpu:p.gpu,count:p.samples.length,measuredDepths:p.points.filter((point:any)=>point.coastIndex===2).map((point:any)=>({target:point.targetDepth,actual:point.bottomDepth})),heightError:p.heightError,normalError:p.normalError,varianceError:p.varianceError,varianceRelativeError:p.varianceRelativeError,shadingVarianceError:p.shadingVarianceError,contactError:p.contactError,mipCount:p.mipSamples.length,mipError:p.mipError,manualMipError:p.manualMipError,longWaveError:p.longWaveError,subpixelMaximum:p.subpixelMaximum};});
  console.log(`Nearshore probe: ${JSON.stringify(probe)}`);
  expect(probe.measuredDepths.map((point:any)=>point.target)).toEqual([-5,0,.2,.8,1.5,2,2.5,3,4,6,8,8.2]);for(const point of probe.measuredDepths)expect(Math.abs(point.target-point.actual)).toBeLessThan(.05);
  expect(probe.count).toBeGreaterThanOrEqual(2058);expect(probe.heightError).toBeLessThan(0.003);expect(probe.normalError).toBeLessThan(0.003);expect(probe.varianceRelativeError).toBeLessThan(0.0001);expect(probe.shadingVarianceError).toBeLessThan(0.0001);expect(probe.contactError).toBeLessThan(0.01);expect(errors).toEqual([]);
  expect(probe.mipCount).toBeGreaterThanOrEqual(448);expect(probe.mipError).toBeLessThan(0.001);expect(probe.manualMipError).toBeLessThan(0.000003);expect(probe.longWaveError).toBeLessThan(0.005);expect(probe.subpixelMaximum).toBeLessThan(0.000001);
});
test('all passenger tenders have real surface contacts and free space around their bows',async({page})=> {
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
