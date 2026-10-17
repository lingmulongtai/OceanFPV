import {test,expect,type Route} from '@playwright/test';
import {readFile} from 'node:fs/promises';

for(const mode of ['healthy','missing','corrupt','timeout','csp','unsupported']as const)test(`optional wave FFT preserves fields and contacts with ${mode} loading`,async({page})=> {
  const errors:string[]=[],violations:string[]=[],requests:string[]=[],failed:string[]=[];let held:Route|undefined;
  const kernel=/\/src\/generated\/wave-fft\.wasm(?:\?|$)/;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=> {
    if(message.type()!=='error')return;
    if(mode==='missing'&&kernel.test(message.location().url)&&/404/.test(message.text()))return;
    errors.push(message.text());
  });
  page.on('request',request=>{if(kernel.test(request.url()))requests.push(request.url());});
  page.on('requestfailed',request=>{if(kernel.test(request.url()))failed.push(request.failure()?.errorText??'');});
  if(mode==='unsupported')await page.addInitScript(()=>Reflect.set(window,'WebAssembly',undefined));
  if(mode==='csp') {
    await page.exposeFunction('waveCspViolation',(blocked:string)=>violations.push(blocked));
    await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{void(window as any).waveCspViolation(event.blockedURI);}));
    const html=await readFile(new URL('./fixtures/wave-fft-probe.html',import.meta.url),'utf8');
    await page.route('**/wave-fft-probe.html',route=>route.fulfill({body:html,contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'"}}));
  }
  await page.route(kernel,async route=> {
    if(mode==='missing')await route.fulfill({status:404,body:''});
    else if(mode==='corrupt')await route.fulfill({status:200,body:'invalid WASM',contentType:'application/wasm'});
    else if(mode==='timeout')held=route;
    else if(mode==='healthy'){const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'content-type':'application/octet-stream'}});}
    else await route.continue();
  });
  try {
    await page.goto('/tests/browser/fixtures/wave-fft-probe.html');
    await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__WAVE_FFT_PROBE__);},{timeout:20000}).toBe(true);
    const probe=await page.evaluate(()=>(window as any).__WAVE_FFT_PROBE__);console.log(`Optional wave FFT ${mode}: ${JSON.stringify(probe)}`);
    expect(probe.loaded).toBe(mode==='healthy');expect(probe.installed).toBe(mode==='healthy');expect(probe.active).toBe(mode==='healthy');
    expect(probe.fields).toBe(5308416);expect(probe.contacts).toBe(45);expect(requests).toHaveLength(mode==='unsupported'?0:1);
    if(mode==='timeout'){expect(probe.loadMs).toBeGreaterThanOrEqual(4900);expect(probe.loadMs).toBeLessThan(15000);expect(failed).toEqual(['net::ERR_ABORTED']);}
    if(mode==='csp')await expect.poll(()=>violations).toContain('wasm-eval');
    expect(errors).toEqual([]);
  }finally {await held?.abort().catch(()=>{});}
});
