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
test('renders the sea, detailed scene, and usable menu without WebGL errors', async ({page})=> {
  await page.setViewportSize({width:960,height:640});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await ready(page);
  const {gpu,render,forest,rocks}=await page.evaluate(()=> {
    const app=(window as any).__OCEANFPV__,gl=document.querySelector<HTMLCanvasElement>('#scene')!.getContext('webgl2')!,ext=gl.getExtension('WEBGL_debug_renderer_info');
    const rocks=app.world.rocks;
    return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',render:app.getState(),forest:app.world.forest?.sourceTriangles??0,
      rocks:{triangles:rocks?.shape.geometry.index.count/3,placements:rocks?.placements.length,instances:rocks?.group.children.reduce((sum:number,mesh:any)=>sum+mesh.count,0)}};
  });
  console.log(`Renderer: ${gpu}`);
  if(process.env.OCEANFPV_NATIVE_GPU==='1') {
    expect(gpu).not.toMatch(/SwiftShader|Microsoft Basic|unavailable/i);expect(gpu).toContain('Direct3D11');
  }
  await expect(page.locator('#unsupported')).toBeHidden();
  expect(render.triangles).toBeGreaterThan(30000);
  expect(forest).toBeGreaterThan(1000000);
  expect(rocks.triangles).toBe(14844);expect(rocks.placements).toBe(270);expect(rocks.instances).toBe(270);
  await page.screenshot({path:'test-results/oceanfpv-menu.png'});
  expect(errors).toEqual([]);
});
test('vessels really travel, launch follows the moving deck and unavailable surfaces recover',async({page})=> {
  await page.route('**/textures/*.jpg',route=>route.abort());await ready(page);
  await expect(page.locator('#start-note')).toContainText('標準素材');
  expect(await page.evaluate(()=>{const w=(window as any).__OCEANFPV__.world;return {detailed:!!w.rocks,contacts:w.fallbackRockObstacles.length,visible:w.rockPatches.every((patch:any)=>patch.fallback.parent===w.scene)};})).toEqual({detailed:false,contacts:270,visible:true});
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
  await ready(page);await page.locator('#open-settings').click();await page.locator('[data-tab="controller"]').click();
  await page.locator('#input-source').selectOption('xbox');await page.locator('[data-close="settings-dialog"]').last().click();
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
test('settings persist, help is keyboard accessible and mobile panels fit', async ({page})=> {
  test.setTimeout(300000);
  await ready(page);await page.locator('#open-settings').click();await page.locator('#light').selectOption('day');await page.locator('#sea').selectOption('calm');
  await page.keyboard.press('Escape');await page.reload();await expect(page.locator('#start')).toBeEnabled({timeout:90000});
  expect(await page.locator('#light').inputValue()).toBe('day');expect(await page.locator('#sea').inputValue()).toBe('calm');
  await page.setViewportSize({width:390,height:844});await page.locator('#open-help').click();await expect(page.locator('#help-dialog')).toBeVisible();
  const box=await page.locator('#help-dialog').boundingBox();expect(box!.width).toBeLessThan(390);
  await page.keyboard.press('Escape');await expect(page.locator('#help-dialog')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'test-results/oceanfpv-mobile-menu.png'});
});
test('terrain projections preserve physical periods and normal direction on the GPU',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/ground-probe.html');
  await page.waitForFunction(()=>!!(window as any).__GROUND_PROBE__,{},{timeout:60000});
  const probe=await page.evaluate(()=>{const p=(window as any).__GROUND_PROBE__;return {gpu:p.gpu,count:p.samples.length,maximum:p.maximum};});
  expect(probe.count).toBe(96);expect(probe.maximum).toBeLessThan(0.002);expect(errors).toEqual([]);
});
test('headland bay matches rendered terrain, water depths and flight contacts',async({page})=> {
  await ready(page);
  const coast=await page.evaluate(()=> {
    const app=(window as any).__OCEANFPV__,world=app.world,island=world.islands[0];
    const mesh=world.scene.children.find((m:any)=>m.geometry?.attributes.groundCover&&m.position.x===island.x&&m.position.z===island.z),p=mesh.geometry.attributes.position;
    const bottom=world.ocean.material.uniforms.bathymetry.value.image.data;let depthError=0;
    for(let i=0;i<p.count;i+=137)depthError=Math.max(depthError,Math.abs(p.getY(i)-bottom[i*4]));
    const Vector=app.flight.position.constructor,bay=new Vector(island.x+island.size*0.38,15,island.z+island.size*0.4),ridge=new Vector(island.x-island.size*0.28,20,island.z-island.size*0.18);
    return {profile:island.profile,depthError,bayContact:world.collision(bay,app.getState().time,'breeze'),ridgeContact:world.collision(ridge,app.getState().time,'breeze')};
  });
  expect(coast.profile).toBe('headland');expect(coast.depthError).toBeLessThan(0.0001);
  expect(coast.bayContact).toBeNull();expect(coast.ridgeContact).toBe('島に接触しました');
});
test('nearshore displacement and geometric normals match CPU sampling on the GPU',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/browser/fixtures/nearshore-probe.html');
  await page.waitForFunction(()=>!!(window as any).__NEARSHORE_PROBE__,{},{timeout:60000});
  const probe=await page.evaluate(()=>{const p=(window as any).__NEARSHORE_PROBE__;return {gpu:p.gpu,count:p.samples.length,heightError:p.heightError,normalError:p.normalError,varianceError:p.varianceError,contactError:p.contactError};});
  console.log(`Nearshore probe: ${JSON.stringify(probe)}`);
  expect(probe.count).toBeGreaterThanOrEqual(1554);expect(probe.heightError).toBeLessThan(0.003);expect(probe.normalError).toBeLessThan(0.003);expect(probe.varianceError).toBeLessThan(0.003);expect(probe.contactError).toBeLessThan(0.01);expect(errors).toEqual([]);
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
