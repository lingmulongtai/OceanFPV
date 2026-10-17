import {open,writeFile} from 'node:fs/promises';
import type {Page,TestInfo} from '@playwright/test';

/** Keep process/network timing, without copying response bodies or image pixels. */
export async function recordStartupTiming(page:Page,info:TestInfo) {
  if(!(process.env.CI||process.env.OCEANFPV_STARTUP_TRACE==='1')||
    !/^(renders the sea|one expired rock response|expired rock response and peer)/.test(info.title))return null;
  // Page-scoped tracing excludes the separate NetworkService process.
  const session=await page.context().browser()!.newBrowserCDPSession();
  await session.send('Tracing.start',{transferMode:'ReturnAsStream',streamFormat:'json',streamCompression:'gzip',
    traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:32768,
      includedCategories:['toplevel','loading','netlog','devtools.timeline','v8','gpu']}});
  await page.addInitScript(()=> {
    performance.setResourceTimingBufferSize(2000);
    const tasks:{start:number;duration:number}[]=[];
    (window as any).__STARTUP_LONG_TASKS__=tasks;
    new PerformanceObserver(list=>{for(const entry of list.getEntries())tasks.push({start:entry.startTime,duration:entry.duration});})
      .observe({type:'longtask',buffered:true});
  });
  return async()=> {
    let stream:string|undefined;
    try {
      const state=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,now:performance.now(),
        longTasks:(window as any).__STARTUP_LONG_TASKS__??[],resources:performance.getEntriesByType('resource').map(entry=>entry.toJSON())}));
      const timingPath=info.outputPath('startup-resource-timing.json');
      await writeFile(timingPath,JSON.stringify(state,null,2));
      await info.attach('startup-resource-timing',{path:timingPath,contentType:'application/json'});
    } catch(error) {console.warn('Startup resource timing unavailable',error);}
    try {
      const complete=new Promise<{stream?:string;dataLossOccurred:boolean}>(resolve=>session.once('Tracing.tracingComplete',resolve));
      await session.send('Tracing.end');const completion=await complete;stream=completion.stream;
      const completionPath=info.outputPath('startup-trace-completion.json');await writeFile(completionPath,JSON.stringify(completion,null,2));
      await info.attach('startup-trace-completion',{path:completionPath,contentType:'application/json'});
      if(!stream)throw new Error('Chromium did not return a startup trace stream');
      const tracePath=info.outputPath('startup-process-timing.json.gz'),file=await open(tracePath,'w');
      try {
        for(;;) {
          const chunk=await session.send('IO.read',{handle:stream,size:1048576});
          await file.write(Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8'));
          if(chunk.eof)break;
        }
      } finally {await file.close();}
      await info.attach('startup-process-timing',{path:tracePath,contentType:'application/gzip'});
    } catch(error) {console.warn('Startup process timing unavailable',error);}
    finally {
      if(stream)await session.send('IO.close',{handle:stream}).catch(error=>console.warn('Startup trace stream cleanup failed',error));
      await session.detach().catch(error=>console.warn('Startup trace session cleanup failed',error));
    }
  };
}
