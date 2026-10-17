import {test,expect} from '@playwright/test';

test('ocean haze follows background direction, rotation, radiance and distance',async({page})=> {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/tests/browser/fixtures/ocean-haze-probe.html');
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__OCEAN_HAZE_PROBE__);},{timeout:60000}).toBe(true);
  const probe=await page.evaluate(()=>(window as any).__OCEAN_HAZE_PROBE__);console.log(`Ocean aerial perspective: ${JSON.stringify(probe)}`);
  expect(probe.count).toBe(129);expect(probe.analyticalError).toBeLessThan(.00001);expect(probe.constantError).toBeLessThan(.0003);expect(probe.glError).toBe(0);expect(errors).toEqual([]);
});
