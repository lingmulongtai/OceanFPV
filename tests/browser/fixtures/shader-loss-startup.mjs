// Hold only KHR completion while startup is active, so even a warm compiler
// reaches its polling path. Context loss itself uses the real WebGL extension.
localStorage.setItem('oceanfpv:settings',JSON.stringify({quality:'balanced',light:'blue',sea:'breeze'}));
const witness=window.__SHADER_LOSS_STARTUP__={held:0,scheduled10:0,pending10:0,requested:false,loss:null,gpu:null,parallel:null};
const pending=new Set(),set=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window);
const prototype=WebGL2RenderingContext.prototype,query=prototype.getProgramParameter;
prototype.getProgramParameter=function(program,parameter) {
  const result=query.call(this,program,parameter);
  if(parameter===0x91B1&&performance.getEntriesByName('oceanfpv:scene-shaders-start').length&&!witness.loss) {witness.held++;return false;}
  return result;
};
window.setTimeout=function(callback,delay,...args) {
  if(delay!==10||typeof callback!=='function'||!performance.getEntriesByName('oceanfpv:scene-shaders-start').length)return set(callback,delay,...args);
  const id=set((...values)=>{pending.delete(id);witness.pending10=pending.size;callback(...values);},delay,...args);
  pending.add(id);witness.pending10=pending.size;witness.scheduled10++;
  if(!witness.requested) {
    witness.requested=true;
    set(()=> {
      const gl=document.getElementById('scene').getContext('webgl2'),extension=gl.getExtension('WEBGL_lose_context');
      witness.parallel=performance.getEntriesByName('oceanfpv:parallel-shaders-supported').length>0;
      const debug=gl.getExtension('WEBGL_debug_renderer_info');witness.gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable';
      if(!extension)throw new Error('Missing real context-loss extension');
      extension.loseContext();
    },0);
  }
  return id;
};
window.clearTimeout=function(id){pending.delete(id);witness.pending10=pending.size;return clear(id);};
window.addEventListener('webglcontextlost',event=>{witness.loss={trusted:event.isTrusted,at:performance.now()};},{capture:true,once:true});
