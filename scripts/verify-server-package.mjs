/** Smoke-test the extracted archive from a directory outside the checkout. */
import { execFileSync, spawn } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const target=process.argv[2];
const version=JSON.parse(await readFile('frontend/package.json','utf8')).version;
const name=`wordflow-server-${target}`;
const windows=target.endsWith('windows-msvc');
const archive=path.resolve('target/server-packages',`${name}.${windows?'zip':'tar.gz'}`);
const directory=await mkdtemp(path.join(tmpdir(),'wordflow-relocation-'));
let child;
try {
  if(windows) execFileSync('powershell',['-NoProfile','-Command',`Expand-Archive -Path '${archive}' -DestinationPath '${directory}'`]);
  else execFileSync('tar',['-xzf',archive,'-C',directory]);
  const executable=path.join(directory,name,`wordflow-server${windows?'.exe':''}`);
  assert.match(execFileSync(executable,['--version'],{encoding:'utf8',cwd:directory}),new RegExp(version.replaceAll('.','\\.')));
  const data=path.join(directory,'state');
  const environment={...process.env,RUST_LOG:'info'}; delete environment.WORDFLOW_ICU_PATH;
  child=spawn(executable,['--bind','127.0.0.1:0','--data-dir',data],{cwd:directory,env:environment,stdio:['ignore','ignore','pipe']});
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
  await assert.rejects(access(path.join(data,'cache')), {code:'ENOENT'}, 'Startup must not download optional assets');
  const status=await (await fetch(`${base}/api/server`)).json();
  assert.equal(status.public_base_path,'/');
  const html=await (await fetch(`${base}/`)).text();
  assert.match(html,/<base href="\/">/);
  const asset=/src="\.\/(assets\/[^\"]+)"/.exec(html)?.[1];
  assert.ok(asset,'Production module asset'); assert.equal((await fetch(`${base}/${asset}`)).status,200);
  const zonesResponse=await fetch(`${base}/session/${status.session_id}/api/project/timezones`);
  assert.equal(zonesResponse.status,200,await zonesResponse.clone().text());
  assert.ok((await zonesResponse.json()).includes('Australia/Sydney'), 'Signed ICU downloads on first use');
  const save=await fetch(`${base}/api/server/project/save`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_id:status.session_id,name:'relocated.wfpj'})});
  assert.equal(save.status,200,await save.text());
  assert.ok((await readdir(path.join(data,'projects'))).includes('relocated.wfpj'));
  child.kill('SIGTERM'); await stopped; child=undefined;
  console.log(`Relocation, embedded assets, on-demand ICU and project persistence passed: ${target}`);
} finally {if(child) {child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}await rm(directory,{recursive:true,force:true});}
