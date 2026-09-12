const assert = require('node:assert/strict');
const {gzipSync}=require('node:zlib');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const buildDir=resolve(process.argv[2]);
async function create(side) { return require(buildDir+'/fmt-probe-'+side+'.cjs')({wasmBinary:readFileSync(buildDir+'/fmt-probe-'+side+'.wasm')}); }
(async()=>{
 const modules=await Promise.all(['baseline','candidate'].map(create));
 const source=Buffer.from('Format bytes: '.repeat(800));
 const gzip=gzipSync(source);const damaged=Buffer.from(gzip);damaged[damaged.length-5]^=1;
 const ptrs=modules.map(m=>m._malloc(20000)); let cases=0;
 function files(bytes,path='/probe.fmt') {for(const m of modules)m.FS.writeFile(path,bytes);}
 function open(path='/probe.fmt'){return modules.map(m=>m.ccall('probe_open','number',['string'],[path]));}
 function read(handles,n){const results=modules.map((m,i)=>{const got=m._probe_read(handles[i],ptrs[i],n);return {got,bytes:got>0?Array.from(m.HEAPU8.subarray(ptrs[i],ptrs[i]+got)):[]};});assert.deepEqual(results[1],results[0]);cases++;}
 function close(handles){assert.equal(modules[0]._probe_close(handles[0]),modules[1]._probe_close(handles[1]));}
 function sequence(sizes){const f=open();for(const n of sizes)read(f,n);close(f);}
 files(gzip); sequence([8,16,40]);sequence([8,16,40]);assert(modules[1].fmtDecodeCache.hits>0);
 // Mirror a failed TeX load: no gzclose, worker closes FDs and restores C memory.
 // The new gzFile can reuse the same pointer, but must start at byte zero.
 const snapshots=modules.map(m=>m.HEAPU8.slice());const abandoned=open();read(abandoned,8);
 for(let i=0;i<modules.length;i++) {
   const m=modules[i];
   for(const stream of m.FS.streams.slice())if(stream&&stream.fd>2)m.FS.close(stream);
   m.HEAPU8.set(snapshots[i]);
 }
 const restarted=open();read(restarted,8);close(restarted);
 // Fall back to the same native uncompressed position after a cached prefix.
 sequence([8,16,11,90,15000]);sequence([8,3,15000]);
 // A second descriptor must not discard the first cached descriptor's position.
 files(gzip);sequence([8,16,40]);const a=open();read(a,8);const b=open();read(b,8);read(a,16);close(b);read(a,40);close(a);
 for(const bytes of [damaged,gzip.subarray(0,12),Buffer.from('plain transparent data'),gzip]) {files(bytes);sequence([8,16,40,15000]);sequence([8,16,40,15000]);}
 // Equal length replacements do not reuse old data; returning to the old file is safe.
 for(let j=0;j<6;j++){const bytes=Buffer.from(gzip);bytes[12]^=j;files(bytes);sequence([8,16,40,15000]);}
 // Handles and pointers change after memory growth; only JS byte arrays are retained.
 files(gzip);sequence([8,16,40]);for(const m of modules) assert(m._malloc(40*1024*1024));sequence([8,16,40]);
 // The bounded cache abandons too many short reads without changing the stream.
 files(gzipSync(Buffer.alloc(70000,11)));const f=open();for(let j=0;j<65538;j++)read(f,1);close(f);
 // Non-format streams remain ordinary zlib streams.
 files(gzip,'/other.gz');const g=open('/other.gz');read(g,100);close(g);
 console.log(JSON.stringify({comparisons:cases,hits:modules[1].fmtDecodeCache.hits,success:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
