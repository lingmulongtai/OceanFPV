import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const url=process.argv[2];
if(!url || !/^https?:\/\//.test(url)) throw new Error('Usage: node scripts/verify-deployment.mjs <http(s) URL>');
const output=path.resolve('artifacts');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=> {if(m.type()==='error') errors.push(m.text());});
  const response=await page.goto(url,{waitUntil:'networkidle',timeout:60000});
  if(response?.status()!==200) throw new Error(`HTTP ${response?.status()}`);
  await page.locator('#start:enabled').waitFor({timeout:60000});
  if(await page.locator('#unsupported').isVisible()) throw new Error('WebGL initialization failed');
  await page.screenshot({path:path.join(output,'oceanfpv-golden.png')});
  await page.locator('#open-settings').click();await page.locator('#light').selectOption('day');
  await page.locator('#quality').selectOption('balanced');await page.locator('[data-close="settings-dialog"]').last().click();
  await page.screenshot({path:path.join(output,'oceanfpv-day.png')});
  await page.locator('#start').click();await page.keyboard.down('Space');
  await page.waitForFunction(()=>Number(document.getElementById('altitude')?.textContent)>8,{},{timeout:30000});
  await page.keyboard.up('Space');await page.screenshot({path:path.join(output,'oceanfpv-flight.png')});
  await page.keyboard.press('Escape');await page.locator('#pause-dialog[open]').waitFor();
  await page.locator('#resume').click();await page.keyboard.press('KeyR');
  if(await page.locator('#hud').isHidden()) throw new Error('Flight reset failed');
  const gpu=await page.evaluate(()=> {
    const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');
    return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';
  });
  if(errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({url:page.url(),status:response.status(),title:await page.title(),gpu,checks:['render','settings','daylight','keyboard climb','pause','resume','reset'],screenshots:output,errors},null,2));
} finally {await browser.close();}
