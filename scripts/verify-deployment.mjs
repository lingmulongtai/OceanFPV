import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const url=process.argv[2];
if(!url || !/^https?:\/\//.test(url)) throw new Error('Usage: node scripts/verify-deployment.mjs <http(s) URL>');
const quality=process.argv.find(a=>a.startsWith('--quality='))?.split('=')[1]??'balanced';
if(!['balanced','high','ultra'].includes(quality))throw new Error('Quality must be balanced, high or ultra');
const visualOnly=process.argv.includes('--visual-only');
const nativeGpu=process.argv.includes('--native-gpu');
if(nativeGpu&&process.platform!=='win32')throw new Error('Native Direct3D11 verification requires Windows');
const output=path.resolve('artifacts');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--ignore-gpu-blocklist',nativeGpu?'--use-angle=d3d11':'--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:quality==='high'?1.5:1}), errors=[], assets=[];
  page.setDefaultTimeout(120000);
  await page.addInitScript(({quality})=>localStorage.setItem('oceanfpv:settings',JSON.stringify({quality,light:'day','input-source':'keyboard',mouse:false})),{quality});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=> {if(m.type()==='error') errors.push(m.text());});
  page.on('response',r=>{if(/\/(textures|models)\//.test(r.url()))assets.push({url:r.url(),status:r.status()});});
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  if(response?.status()!==200) throw new Error(`HTTP ${response?.status()}`);
  await page.waitForFunction(()=>!document.querySelector('#start')?.disabled||!document.querySelector('#unsupported')?.classList.contains('hidden'),{},{timeout:120000});
  if(await page.locator('#unsupported').isVisible()) throw new Error(`WebGL initialization failed: ${await page.locator('#unsupported-reason').textContent()}\n${errors.join('\n')}`);
  console.log(`Ready: ${quality} ${page.url()}`);
  await page.screenshot({path:path.join(output,`oceanfpv-${quality}-day.png`),timeout:120000});
  const checks=['render','photographic assets'];
  if(!visualOnly){
    await page.locator('#open-settings').click();await page.locator('#light').selectOption('golden');await page.locator('[data-close="settings-dialog"]').last().click();
    await page.screenshot({path:path.join(output,'oceanfpv-golden.png')});
    await page.locator('#open-settings').click();await page.locator('#light').selectOption('day');await page.locator('[data-close="settings-dialog"]').last().click();
    await page.locator('#start').click();await page.keyboard.down('Space');
    await page.waitForFunction(()=>Number(document.getElementById('altitude')?.textContent)>8,{},{timeout:60000});
    await page.keyboard.up('Space');await page.screenshot({path:path.join(output,'oceanfpv-flight.png')});
    await page.keyboard.press('Escape');await page.locator('#pause-dialog[open]').waitFor();
    await page.locator('#resume').click();await page.keyboard.press('KeyR');
    if(await page.locator('#hud').isHidden()) throw new Error('Flight reset failed');
    await page.locator('#open-settings').click();await page.locator('#mouse').check();await page.locator('[data-close="settings-dialog"]').last().click();
    await page.locator('#scene').click({position:{x:480,y:400}});
    await page.waitForFunction(()=>document.pointerLockElement?.id==='scene');
    const before=await page.locator('#right-stick').getAttribute('style');await page.mouse.move(520,370);
    await page.waitForFunction(before=>document.querySelector('#right-stick').getAttribute('style')!==before,before);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.pointerLockElement);
    checks.push('light settings','keyboard climb','pause','resume','reset','real pointer lock and mouse stick');
  }
  const gpu=await page.evaluate(()=> {
    const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');
    return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';
  });
  const drawing=await page.locator('#scene').evaluate(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}));
  if(nativeGpu&&(/SwiftShader|Microsoft Basic|unavailable/i.test(gpu)||!gpu.includes('Direct3D11')))throw new Error(`Native GPU verification unavailable: ${gpu}`);
  const ratio=quality==='ultra'?2:quality==='high'?1.5:1;
  if(drawing.width!==Math.round(drawing.cssWidth*ratio)||drawing.height!==Math.round(drawing.cssHeight*ratio))throw new Error('Quality framebuffer size mismatch');
  if(assets.some(a=>a.status!==200)||!assets.some(a=>a.url.endsWith('.hdr'))||!assets.some(a=>a.url.endsWith('island_tree_02.bin')))throw new Error('Photographic asset delivery incomplete');
  if(errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({url:page.url(),status:response.status(),title:await page.title(),quality,drawing,gpu,checks,screenshots:output,assetResponses:assets.length,errors},null,2));
} finally {await browser.close();}
