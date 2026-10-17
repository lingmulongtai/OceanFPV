// Yield between polls: a blocking GPU drain can consume the wall-clock budget
// of fetches even when their responses have already reached the browser.
export async function waitForGpu(gl:WebGL2RenderingContext):Promise<boolean> {
  if(gl.isContextLost())return false;
  const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
  if(!sync){if(gl.isContextLost())return false;throw new Error('Unable to fence initial GPU work');}
  try {
    gl.flush();
    return await new Promise<boolean>((resolve,reject)=> {
      const poll=()=> {
        if(gl.isContextLost()){resolve(false);return;}
        const status=gl.clientWaitSync(sync,0,0);
        if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)resolve(true);
        else if(status===gl.TIMEOUT_EXPIRED)setTimeout(poll,16);
        else if(gl.isContextLost())resolve(false);
        else reject(new Error('Initial GPU fence failed'));
      };
      // WebGL sync status can only advance after returning to the event loop.
      setTimeout(poll,0);
    });
  } finally {gl.deleteSync(sync);}
}
