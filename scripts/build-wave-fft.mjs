import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url)),source=join(root,'scripts/wave-fft.rs');
const manifest=JSON.parse(await readFile(join(root,'src/generated/wave-fft.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const compiler=execFileSync('rustc',['--version'],{encoding:'utf8',windowsHide:true}).trim();
assert.equal(compiler,manifest.compiler,'Use the recorded Rust toolchain to reproduce this binary');
assert.equal(sha(await readFile(source)),manifest.sourceSHA256,'Update source provenance after intentional kernel changes');
const directory=await mkdtemp(join(tmpdir(),'oceanfpv-wave-fft-')),output=join(directory,'wave-fft.wasm');
try {
  execFileSync('rustc',[source,'--edition','2021','--target','wasm32-unknown-unknown','--crate-type','cdylib','--crate-name','oceanfpv_wave_fft','-C','opt-level=3','-C','lto=yes','-C','codegen-units=1','-C','panic=abort','-C','target-feature=-simd128','-C','strip=symbols','-C','link-arg=--initial-memory=2097152','-C','link-arg=--max-memory=2097152','-o',output],{stdio:'inherit',windowsHide:true});
  const bytes=await readFile(output);
  assert.equal(bytes.length,manifest.byteLength);assert.equal(sha(bytes),manifest.sha256);
  const destination=join(root,'src/generated/wave-fft.wasm');
  if(process.argv.includes('--check'))assert.deepEqual(bytes,await readFile(destination));
  else await writeFile(destination,bytes);
  console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',compiler,byteLength:bytes.length,sha256:sha(bytes)}));
}finally{
  await unlink(output).catch(error=>{if(error.code!=='ENOENT')throw error;});
  await rmdir(directory);
}
