import{HDRLoader}from'three/addons/loaders/HDRLoader.js';import{loadPhotographicSky}from'../../../src/sky.ts';
const preset=new URLSearchParams(location.search).get('preset')??'day';if(!['day','golden'].includes(preset))throw new Error('Unknown photographic sky preset');
const file=preset==='golden'?'kloppenheim_06_puresky_4k.hdr':'kloofendal_48d_partly_cloudy_puresky_4k.hdr';
let release,received,parseCalls=0,settled=false;const ready=new Promise(resolve=>release=resolve),bodyReady=new Promise(resolve=>received=resolve),parse=HDRLoader.prototype.parse,arrayBuffer=Response.prototype.arrayBuffer;
HDRLoader.prototype.parse=function(buffer){parseCalls++;return parse.call(this,buffer);};
Response.prototype.arrayBuffer=async function(){const buffer=await arrayBuffer.call(this);if(this.url.endsWith(file))received();return buffer;};
try{
 const loading=loadPhotographicSky(ready,preset).then(sky=>{settled=true;return sky;});
 await bodyReady;await new Promise(resolve=>setTimeout(resolve,0));const before={parseCalls,settled};release();
 const sky=await loading;if(!sky)throw new Error('Photographic sky missing');const {data,width,height}=sky.texture.image;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data.buffer)),byte=>byte.toString(16).padStart(2,'0')).join('');
 window.__SKY_DECODE_PROBE__={preset,file,before,parseCalls,settled,width,height,bytes:data.byteLength,hash,sun:sky.sun.toArray()};sky.texture.dispose();
}finally{HDRLoader.prototype.parse=parse;Response.prototype.arrayBuffer=arrayBuffer;}
