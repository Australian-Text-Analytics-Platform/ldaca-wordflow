/** Smoke-test the extracted archive from a directory outside the checkout. */
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { prepareTestCache } from '../frontend/scripts/test-cache.mjs';
const target=process.argv[2];
const version=JSON.parse(await readFile('frontend/package.json','utf8')).version;
const name=`wordflow-server-${target}`;
const windows=target.endsWith('windows-msvc');
const archive=path.resolve('target/server-packages',`${name}.${windows?'zip':'tar.gz'}`);
let directory;
let child;
let testCache;
try {
  testCache=await prepareTestCache();
  await mkdir(testCache.directories.temporary,{recursive:true});
  directory=await mkdtemp(path.join(testCache.directories.temporary,'wordflow-relocation-'));
  if(windows) execFileSync('powershell',['-NoProfile','-Command',`Expand-Archive -Path '${archive}' -DestinationPath '${directory}'`]);
  else execFileSync('tar',['-xzf',archive,'-C',directory]);
  const executable=path.join(directory,name,`wordflow-server${windows?'.exe':''}`);
  assert.match(execFileSync(executable,['--version'],{encoding:'utf8',cwd:directory}),new RegExp(version.replaceAll('.','\\.')));
  const data=path.join(directory,'state');
  const environment={...process.env,...testCache.env,RUST_LOG:'info'};
  child=spawn(executable,['--identity','au.edu.ldaca.wordflow.test','--bind','127.0.0.1:0','--data-dir',data],{cwd:directory,env:environment,stdio:['ignore','ignore','pipe']});
  let logs=''; child.stderr.on('data',chunk=>{logs+=chunk;});
  const stopped=new Promise(resolve=>child.once('exit',resolve));
  const deadline=Date.now()+60_000;
  let base;
  while(Date.now()<deadline) {
    if(child.exitCode!==null) throw new Error(`Server exited: ${logs}`);
    const address=/address=(127\.0\.0\.1:\d+)/.exec(logs)?.[1];
    if(address){base=`http://${address}`;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(base,`No readiness address: ${logs}`);
  const packagedFiles = await readdir(path.join(directory,name), {recursive:true});
  assert.ok(!packagedFiles.some(file => /\.(duckdb_extension|tflite|wasm)$/.test(file)), 'Optional resources excluded from archive');
  assert.equal((await readdir(path.join(data,'admin/cache'))).length,0,'Startup must not download optional assets');
  const status=await (await fetch(`${base}/api/server`)).json();
  assert.equal(status.public_base_path,'/');
  const html=await (await fetch(`${base}/`)).text();
  assert.match(html,/<base href="\/">/);
  const asset=/src="\.\/(assets\/[^\"]+)"/.exec(html)?.[1];
  assert.ok(asset,'Production module asset'); assert.equal((await fetch(`${base}/${asset}`)).status,200);
  const opened=await (await fetch(`${base}/api/server/project`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:null})})).json();
  const zonesResponse=await fetch(`${base}/project/${opened.project_id}/api/project/timezones`);
  assert.equal(zonesResponse.status,200,await zonesResponse.clone().text());
  assert.ok((await zonesResponse.json()).includes('Australia/Sydney'), 'Signed ICU downloads on first use');
  const save=await fetch(`${base}/api/server/project/save`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project_id:opened.project_id,name:'relocated.wfpj'})});
  assert.equal(save.status,200,await save.text());
  assert.ok((await readdir(path.join(data,'admin/projects'))).includes('relocated.wfpj'));
  child.kill('SIGTERM'); await stopped; child=undefined;
  console.log(`Relocation, embedded assets, on-demand ICU and project persistence passed: ${target}`);
} finally {
  try {if(child) {child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}if(directory)await rm(directory,{recursive:true,force:true});}
  finally {await testCache?.cleanup();}
}
