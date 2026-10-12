import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.addInitScript(()=> { if(!localStorage.getItem('oceanfpv:settings')) localStorage.setItem('oceanfpv:settings',JSON.stringify({quality:'balanced'})); });
  await page.goto('/?test=1');
  await expect(page.locator('#start')).toBeEnabled({timeout:90000});
  await page.evaluate(() => document.querySelector<HTMLSelectElement>('#quality')!.value='balanced');
  await page.locator('#quality').dispatchEvent('input');
}
test('renders the sea, detailed scene, and usable menu without WebGL errors', async ({page})=> {
  await page.setViewportSize({width:960,height:640});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await ready(page);
  await expect(page.locator('#unsupported')).toBeHidden();
  const render=await page.evaluate(()=> (window as any).__OCEANFPV__.getState());
  expect(render.triangles).toBeGreaterThan(30000);
  const forest=await page.evaluate(()=> (window as any).__OCEANFPV__.world.forest?.sourceTriangles??0);
  expect(forest).toBeGreaterThan(1000000);
  await page.screenshot({path:'test-results/oceanfpv-menu.png'});
  expect(errors).toEqual([]);
});
test('vessels really travel, launch follows the moving deck and unavailable surfaces recover',async({page})=> {
  await page.route('**/textures/*.jpg',route=>route.abort());await ready(page);
  await expect(page.locator('#start-note')).toContainText('標準素材');
  const first=await page.evaluate(()=> (window as any).__OCEANFPV__.world.cruise.root.position.toArray());
  await expect.poll(()=>page.evaluate(()=> (window as any).__OCEANFPV__.world.cruise.root.position.x)).not.toBe(first[0]);
  await page.locator('#start').click();await page.keyboard.press('Escape');
  await expect(page.locator('#pause-dialog')).toBeVisible();
  const app=await page.evaluate(()=> {const a=(window as any).__OCEANFPV__,local=a.world.ship.worldToLocal(a.flight.position.clone());return {local:local.toArray(),time:a.getState().time};});
  expect(Math.abs(app.local[0])).toBeLessThan(1);expect(Math.abs(app.local[2]-38)).toBeLessThan(2);
  const stopped=await page.evaluate(()=> (window as any).__OCEANFPV__.world.cruise.root.position.toArray());await page.waitForTimeout(300);
  expect(await page.evaluate(()=> (window as any).__OCEANFPV__.world.cruise.root.position.toArray())).toEqual(stopped);
  const mismatch=await page.evaluate(()=> {
    const a=(window as any).__OCEANFPV__,t=a.getState().time,before=a.world.launchPose(t).position;
    a.world.ocean.advance(t+0.05,'breeze');a.world.advanceVessels(t+0.05);
    const after=a.world.launchPose(t+0.05);return after.position.clone().sub(before).divideScalar(0.05).distanceTo(after.velocity);
  });
  expect(mismatch).toBeLessThan(1e-6);
});
test('keyboard flight climbs, pitches, pauses without drift and resets after collision', async ({page})=> {
  await ready(page);await page.locator('#start').click();
  await page.keyboard.down('Space');await expect.poll(()=>page.evaluate(()=> (window as any).__OCEANFPV__.flight.position.y)).toBeGreaterThan(8);await page.keyboard.up('Space');
  const altitude=await page.evaluate(()=> (window as any).__OCEANFPV__.flight.position.y);
  expect(altitude).toBeGreaterThan(6);
  await page.keyboard.down('KeyW');await expect.poll(()=>page.evaluate(()=> (window as any).__OCEANFPV__.flight.velocity.z)).toBeLessThan(-0.8);await page.keyboard.up('KeyW');
  expect(await page.evaluate(()=> (window as any).__OCEANFPV__.flight.velocity.z)).toBeLessThan(-0.5);
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
  await ready(page);
  await expect.poll(()=>page.evaluate(()=> (window as any).__OCEANFPV__.getState().time),{timeout:60000}).toBeGreaterThan(2);
  await page.locator('#race-mode').click();await page.locator('#start').click();
  expect(await page.evaluate(()=> (window as any).__OCEANFPV__.getState().time)).toBeLessThan(1);
  for(let i=0;i<18;i++) {
    await page.evaluate((index)=> {
      const app=(window as any).__OCEANFPV__,g=app.world.gateMeshes[index%6];
      // Use the mesh orientation to put flight one step before the real plane.
      const normal=app.flight.position.clone().set(0,0,1).applyQuaternion(g.quaternion);
      app.flight.position.copy(g.position).addScaledVector(normal,-0.08);
      app.flight.velocity.copy(normal).multiplyScalar(24);app.flight.orientation.identity();
    },i);
    if(i<17) await expect.poll(async()=>page.evaluate(()=> (window as any).__OCEANFPV__.race.laps.length*6+(window as any).__OCEANFPV__.race.next)).toBe(i+1);
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
  await page.locator('#input-source').selectOption('xbox');await page.locator('[data-close="settings-dialog"]').last().click();await page.locator('#start').click();
  await page.evaluate(()=> {(window as any).__pad.axes=[0,-1,0,-0.5];});await expect.poll(()=>page.evaluate(()=> (window as any).__OCEANFPV__.flight.position.y)).toBeGreaterThan(7);
  expect(await page.evaluate(()=> (window as any).__OCEANFPV__.flight.position.y)).toBeGreaterThan(6);
  await page.evaluate(()=> {(window as any).__pad=null;});await expect(page.locator('#pause-title')).toHaveText('コントローラー接続が切れました');
  await page.locator('#resume').click();await expect(page.locator('#pause-dialog')).toBeVisible();
  expect(await page.evaluate(()=> (window as any).__OCEANFPV__.getState().paused)).toBe(true);
});
test('radio calibration, axis assignment and low-throttle arming', async ({page})=> {
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
