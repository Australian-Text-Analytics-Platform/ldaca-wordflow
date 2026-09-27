import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { SevereServiceError } from 'webdriverio';
import { assertGuiTestEnvironment } from './gui-test-environment.mjs';
export default class ServerHost {
  async onPrepare() {
    try {
      assertGuiTestEnvironment();
      this.directory=await mkdtemp(join(tmpdir(),'wordflow-server-e2e-'));
      const executable=process.env.WORDFLOW_SERVER_BINARY ?? resolve('../target/debug/wordflow-server');
      this.child=spawn(executable,['--bind','127.0.0.1:3237','--data-dir',this.directory],{env:{...process.env,RUST_LOG:'info'},stdio:['ignore','ignore','pipe']});
      this.log='';this.child.stderr.on('data',data=>{this.log+=data;});
      this.stopped=new Promise((resolve,reject)=>{this.child.once('exit',resolve);this.child.once('error',reject);});this.stopped.catch(()=>{});
      const deadline=Date.now()+60_000;
      while(Date.now()<deadline) {
        if(this.child.exitCode!==null)throw new Error(this.log);
        const address=/address=(127\.0\.0\.1:\d+)/.exec(this.log)?.[1];
        if(address){this.address=address;break;}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(!this.address)throw new Error(`Server startup failed: ${this.log}`);
      await mkdir(resolve('.tmp/wdio/server/downloads'),{recursive:true});
    } catch(error){await this.onComplete();throw new SevereServiceError(String(error));}
  }
  async onComplete() {
    if(this.child && this.child.exitCode===null)this.child.kill('SIGTERM');
    await this.stopped;
    await mkdir(resolve('.tmp/wdio/server'),{recursive:true});
    await writeFile(resolve('.tmp/wdio/server/native.log'),this.log??'');
    if(this.directory)await rm(this.directory,{recursive:true,force:true});
  }
}
