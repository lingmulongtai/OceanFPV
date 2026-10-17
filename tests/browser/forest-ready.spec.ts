import {test,expect} from '@playwright/test';

test('forest publication precedes a queued lighting change after its initial bake',async({page})=> {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/tests/browser/fixtures/forest-ready-probe.html');
  await expect.poll(async()=>{expect(errors).toEqual([]);return page.evaluate(()=>!!(window as any).__FOREST_READY_PROBE__);},{timeout:60000}).toBe(true);
  const actual=await page.evaluate(()=>(window as any).__FOREST_READY_PROBE__);console.log(`Forest publication ordering: ${JSON.stringify(actual)}`);
  expect(actual).toEqual({publications:1,publishedBeforeChange:true,same:true,intensity:2,colour:0xffcf8e,direction:0,glError:0});expect(errors).toEqual([]);
});
