/** Stage a relocatable native package. Compilation and frontend generation are explicit prerequisites. */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const target = process.argv[2];
const supported = ['aarch64-apple-darwin', 'x86_64-unknown-linux-gnu', 'x86_64-pc-windows-msvc'];
if (!supported.includes(target)) throw new Error(`Specify a supported target: ${supported.join(', ')}`);
const version = JSON.parse(await readFile('frontend/package.json', 'utf8')).version;
const name = `wordflow-server-${target}`;
const root = path.resolve('target/server-packages');
const stage = path.join(root, name);
const windows = target.endsWith('windows-msvc');
const exe = `wordflow-server${windows ? '.exe' : ''}`;
await mkdir(root, { recursive: true });
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: false });
await cp(path.join('target', target, 'release', exe), path.join(stage, exe));
await mkdir(path.join(stage, 'licenses'));
for (const [source, name] of [['frontend/src-tauri/resources/icu/LICENSE-ICU.txt','ICU.txt'], ['frontend/src-tauri/resources/icu/LICENSE-DuckDB.txt','DuckDB.txt'], ['ldaca-rs/LICENSE','Wordflow.txt'], ['ldaca-rs/vendor/udpipe/LICENSE','UDPipe.txt'], ['ldaca-rs/src/quotation/LICENSE','Quotation.txt'], ['frontend/public/models/LICENSE.language-detector.txt','Language-detector.txt']]) await cp(source,path.join(stage,'licenses',name));
// Audit actual linkage. Unexpected non-system libraries fail packaging instead of shipping a runner-only dependency.
if (target.endsWith('apple-darwin')) {
  const listing = execFileSync('otool',['-L',path.join(stage,exe)],{encoding:'utf8'});
  await writeFile(path.join(stage,'native-dependencies.txt'),listing.replaceAll(stage,'.'));
  for (const line of listing.split('\n').slice(1)) {
    const dependency = line.trim().split(' ')[0];
    if (dependency && !dependency.startsWith('/usr/lib/') && !dependency.startsWith('/System/Library/') && dependency !== '@rpath/libswift_Concurrency.dylib') throw new Error(`Unbundled native library: ${dependency}`);
  }
  const identity = process.env.APPLE_SIGNING_IDENTITY ?? '-';
  execFileSync('codesign',['--force', '--options', 'runtime', '--entitlements', 'frontend/src-tauri/entitlements.plist', ...(identity === '-' ? [] : ['--timestamp']), '--sign',identity,path.join(stage,exe)],{stdio:'inherit'});
  execFileSync('codesign',['--verify','--strict',path.join(stage,exe)],{stdio:'inherit'});
} else if (!windows) {
  const listing=execFileSync('ldd',[path.join(stage,exe)],{encoding:'utf8'});
  await writeFile(path.join(stage,'native-dependencies.txt'),listing);
  for(const line of listing.split('\n')) {
    const dependency=line.trim().split(/\s/)[0];
    if(dependency && !/^(linux-vdso|lib(c|m|pthread|dl|rt|gcc_s|stdc\+\+)\.|\/.*ld-linux)/.test(dependency)) throw new Error(`Unbundled native library: ${line.trim()}`);
    if(line.includes('not found')) throw new Error(`Missing native library: ${line}`);
  }
} else {
  // ORT can be supplied dynamically by its build; retain runtime DLLs when present.
  for (const entry of await readdir(path.join('target',target,'release'))) if(entry.toLowerCase().endsWith('.dll')) await cp(path.join('target',target,'release',entry),path.join(stage,entry));
  const listing=execFileSync('dumpbin',['/dependents',path.join(stage,exe)],{encoding:'utf8'});
  await writeFile(path.join(stage,'native-dependencies.txt'),listing.replaceAll(stage,'.'));
}
await writeFile(path.join(stage,'README.txt'),`Wordflow ${version}\nRun ./${exe} and open http://127.0.0.1:8002/\nUse --help for DATA_DIR, public prefix and origin options.\nOptional ICU and language/model assets download only when first requested. Cached resources work offline.\n`);
const checksums=[];
async function checksum(dir,relative='') { for(const entry of await readdir(dir,{withFileTypes:true})) {const file=path.join(dir,entry.name); const key=relative+entry.name;if(entry.isDirectory())await checksum(file,key+'/');else checksums.push(`${createHash('sha256').update(await readFile(file)).digest('hex')}  ${key}`);}}
await checksum(stage); await writeFile(path.join(stage,'SHA256SUMS'),checksums.sort().join('\n')+'\n');
const archive=path.join(root,`${name}.${windows?'zip':'tar.gz'}`);
await rm(archive,{force:true});
if(windows) execFileSync('powershell',['-NoProfile','-Command',`Compress-Archive -Path '${stage.replaceAll("'","''")}' -DestinationPath '${archive.replaceAll("'","''")}'`],{stdio:'inherit'});
else execFileSync('tar',['-czf',archive,'-C',root,name],{stdio:'inherit'});
await writeFile(`${archive}.sha256`,`${createHash('sha256').update(await readFile(archive)).digest('hex')}  ${path.basename(archive)}\n`);
console.log(archive);
