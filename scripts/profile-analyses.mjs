import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import os from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const worker = 'project::runtime::performance_tests::external_file_profile_worker';

export function options(args) {
  const { values } = parseArgs({ args, options: {
    input: { type: 'string' }, output: { type: 'string' }, analysis: { type: 'string', default: 'both' },
    sizes: { type: 'string', default: '100,1000,5000' }, repeats: { type: 'string' }, seed: { type: 'string', default: '7' },
    table: { type: 'string' }, column: { type: 'string' }, profile: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) return values;
  if (!values.input || !values.output) throw new Error('--input and --output are required');
  if (!['topic', 'quotation', 'both'].includes(values.analysis)) throw new Error('Invalid --analysis');
  if (values.profile && !['cpu', 'allocations'].includes(values.profile)) throw new Error('Invalid --profile');
  const integer = (value, minimum, name) => {
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum) throw new Error(`Invalid ${name}`);
    return number;
  };
  const sizes = values.sizes.split(',').map(value => value === 'all' ? null : integer(value, 1, '--sizes'));
  if (new Set(sizes).size !== sizes.length) throw new Error('--sizes must not contain duplicates');
  return { ...values, sizes, repeats: integer(values.repeats ?? (values.profile ? '1' : '3'), 1, '--repeats'), seed: integer(values.seed, 0, '--seed') };
}

async function canonical(path) {
  try { return await realpath(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await canonical(parent), relative(parent, path));
  }
}

export async function privateOutput(path, checkout = root) {
  const destination = await canonical(resolve(path));
  const repository = await realpath(checkout);
  const suffix = relative(repository, destination);
  if (!suffix || (!suffix.startsWith(`..${sep}`) && suffix !== '..' && !suffix.startsWith(sep))) {
    throw new Error('--output must be outside the Git checkout, including through symlinks');
  }
  return destination;
}

export async function checksum(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function resources(text) {
  const cpu = text.match(/([\d.]+) real\s+([\d.]+) user\s+([\d.]+) sys/);
  const memory = text.match(/(\d+)\s+maximum resident set size/);
  if (!cpu || !memory) throw new Error('macOS resource timer did not produce complete measurements');
  return { scope: 'whole process including import, setup, analysis and validation', elapsed_seconds: Number(cpu[1]), user_seconds: Number(cpu[2]), system_seconds: Number(cpu[3]), peak_rss_bytes: Number(memory[1]) };
}

export function successfulCases(cases) {
  return cases.filter(item => item.status === 'succeeded' && !item.profile);
}

function median(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function report(manifest) {
  const groups = Map.groupBy(successfulCases(manifest.cases), item => `${item.analysis}/${item.size ?? 'all'}/${item.cache}`);
  const lines = ['# External-corpus performance measurements', '', `Input SHA-256: ${manifest.input_sha256}`, '',
    'Analysis elapsed times exclude import and build/download setup. CPU and peak RSS cover the entire worker process. Profiled runs are excluded from baseline statistics.', '',
    '| Analysis / requested rows / cache | Imported / selected / skipped files | Runs | Median seconds | Range seconds | Peak process RSS GiB |',
    '| --- | --- | ---: | ---: | ---: | ---: |'];
  for (const [key, cases] of groups) {
    const times = cases.map(item => item.result.analysis_seconds);
    const rss = cases.map(item => item.resources?.peak_rss_bytes).filter(value => value !== undefined);
    const first = cases[0].result;
    lines.push(`| ${key} | ${first.imported_rows ?? '?'} / ${first.input?.rows ?? '?'} / ${first.skipped_files ?? '?'} | ${times.length}${times.length === 1 ? ' (single observation)' : ''} | ${median(times).toFixed(3)} | ${Math.min(...times).toFixed(3)}–${Math.max(...times).toFixed(3)} | ${rss.length ? (Math.max(...rss) / 2 ** 30).toFixed(3) : 'unavailable'} |`);
  }
  lines.push('', '## Stage measurements', '');
  for (const [key, cases] of groups) {
    const stages = Map.groupBy(cases.flatMap(item => item.result.stages), item => item.stage);
    lines.push(`### ${key}`, '');
    for (const [stage, entries] of stages) lines.push(`- ${stage}: ${median(entries.map(item => item.seconds)).toFixed(3)} seconds median`);
    lines.push('');
  }
  lines.push('## Run outcomes', '');
  for (const item of manifest.cases) lines.push(`- ${item.id}: ${item.status}${item.profile ? ` (${item.profile} profile)` : ''}`);
  if (manifest.error) lines.push('', `Campaign incomplete: ${manifest.error}`);
  return `${lines.join('\n')}\n`;
}

// Argument arrays keep corpus paths out of shell interpolation.
export async function runChild(command, args, { env = process.env, directory, stem = 'worker', signal } = {}) {
  const stdout = createWriteStream(join(directory, `${stem}.stdout.log`));
  const stderr = createWriteStream(join(directory, `${stem}.stderr.log`));
  const child = spawn(command, args, { cwd: root, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  const interrupt = () => {
    try { if (process.platform === 'win32') child.kill('SIGINT'); else process.kill(-child.pid, 'SIGINT'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  signal?.addEventListener('abort', interrupt, { once: true });
  if (signal?.aborted) interrupt();
  try {
    return await new Promise((resolveResult, reject) => {
      child.once('error', reject);
      child.once('close', (code, terminatedBy) => resolveResult({ code, signal: terminatedBy }));
    });
  } finally {
    signal?.removeEventListener('abort', interrupt);
    await Promise.all([new Promise(done => stdout.end(done)), new Promise(done => stderr.end(done))]);
  }
}

async function build(directory, signal) {
  console.log('Building optimized backend worker with Rust and native debug symbols…');
  const outcome = await runChild('cargo', ['test', '-p', 'wordflow-backend', '--lib', '--release', '--locked', '--no-run', '--message-format=json'], {
    directory, stem: 'build', signal, env: { ...process.env, CARGO_PROFILE_RELEASE_DEBUG: '1', CXXFLAGS: [process.env.CXXFLAGS, '-g'].filter(Boolean).join(' ') },
  });
  if (outcome.code !== 0) throw new Error('Backend worker build failed; see private build logs');
  const messages = (await readFile(join(directory, 'build.stdout.log'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const artifact = messages.find(item => item.reason === 'compiler-artifact' && item.target?.name === 'wordflow_backend' && item.profile?.test && item.executable);
  if (!artifact) throw new Error('Cargo did not report the backend test executable');
  return artifact.executable;
}

// Allocations injects before main and requires a debuggable target.
export async function allocationWorker(executable, directory, signal) {
  const original = await checksum(executable);
  const path = join(directory, 'allocation-worker');
  const entitlements = join(directory, 'allocation-worker.entitlements');
  await copyFile(executable, path);
  await chmod(path, 0o700);
  await writeFile(entitlements, '<?xml version="1.0"?><plist version="1.0"><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>', { mode: 0o600 });
  const signed = await runChild('codesign', ['--force', '--sign', '-', '--entitlements', entitlements, path], { directory, stem: 'codesign', signal });
  if (signed.code !== 0) throw new Error('Allocations worker signing failed; see private codesign logs');
  const uuid = file => execFileSync('xcrun', ['dwarfdump', '--uuid', file], { encoding: 'utf8' }).match(/^UUID:\s+(\S+)/m)?.[1];
  const macho_uuid = uuid(executable);
  if (!macho_uuid || uuid(path) !== macho_uuid || await checksum(executable) !== original) throw new Error('Allocations worker must preserve the original executable and Mach-O UUID');
  return { path, sha256: await checksum(path), macho_uuid };
}

async function execute(executable, config, profile, signal) {
  await mkdir(config.output, { recursive: true, mode: 0o700 });
  const configPath = join(config.output, 'case.json');
  await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  const args = ['--exact', worker, '--ignored', '--nocapture', '--test-threads=1'];
  let command = executable;
  let launched = args;
  if (profile) {
    command = 'xcrun';
    launched = ['xctrace', 'record', '--template', profile === 'cpu' ? 'CPU Profiler' : 'Allocations', '--output', join(config.output, 'recording.trace'),
      '--env', `WORDFLOW_PROFILE_CASE=${configPath}`, '--target-stdout', join(config.output, 'target.stdout.log'), '--launch', '--', executable, ...args];
  } else if (process.platform === 'darwin' && !config.provision) {
    command = '/usr/bin/time';
    launched = ['-l', '-o', join(config.output, 'resources.txt'), executable, ...args];
  }
  const outcome = await runChild(command, launched, { directory: config.output, signal, env: { ...process.env, WORDFLOW_PROFILE_CASE: configPath, LC_ALL: 'C' } });
  let result;
  try { result = JSON.parse(await readFile(join(config.output, 'result.json'), 'utf8')); }
  catch { result = { status: 'failed', error: 'Worker exited without a complete result' }; }
  const status = outcome.code === 0 && ['succeeded', 'provisioned'].includes(result.status) ? result.status : 'failed';
  let usage;
  if (status === 'succeeded' && !profile && process.platform === 'darwin') usage = resources(await readFile(join(config.output, 'resources.txt'), 'utf8'));
  return { status, result, resources: usage, process: outcome };
}

export async function main(args = process.argv.slice(2)) {
  const opts = options(args);
  if (opts.help) {
    console.log('node scripts/profile-analyses.mjs --input FILE --output PRIVATE_DIR [--analysis topic|quotation|both] [--sizes 100,1000,5000,all] [--repeats 3] [--seed 7] [--table NAME] [--column NAME] [--profile cpu|allocations]');
    return;
  }
  if (opts.profile && process.platform !== 'darwin') throw new Error('Instruments profiling requires macOS');
  const output = await privateOutput(opts.output);
  // The shared importer must still see and reject selected symbolic links.
  const input = resolve(opts.input);
  if (!(await stat(input)).isFile()) throw new Error('--input must be a file');
  const directory = join(output, 'sessions', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const metadata = command => execFileSync(command[0], command.slice(1), { cwd: root, encoding: 'utf8' }).trim();
  const manifest = { schema_version: 1, started_at: new Date().toISOString(), input, input_sha256: await checksum(input), options: opts,
    commit: metadata(['git', 'rev-parse', 'HEAD']), dirty: metadata(['git', 'status', '--porcelain']),
    hardware: { platform: os.platform(), release: os.release(), arch: os.arch(), cpus: os.cpus().length, cpu_model: os.cpus()[0]?.model, memory_bytes: os.totalmem() },
    tools: { node: process.version, rust: metadata(['rustc', '--version']), cargo: metadata(['cargo', '--version']) }, cases: [] };
  const save = async () => {
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await writeFile(join(directory, 'report.md'), report(manifest));
  };
  const analyses = opts.analysis === 'both' ? ['topic', 'quotation'] : [opts.analysis];
  const base = { input, model_root: join(output, 'models'), seed: opts.seed, table: opts.table ?? null, column: opts.column ?? null };
  try {
    await save();
    const executable = await build(directory, controller.signal);
    manifest.executable = executable;
    manifest.executable_sha256 = await checksum(executable);
    if (opts.profile === 'allocations') manifest.profile_worker = await allocationWorker(executable, directory, controller.signal);
    const measurementExecutable = manifest.profile_worker?.path ?? executable;
    for (const analysis of analyses) {
      const provision = await execute(executable, { ...base, output: join(directory, `provision-${analysis}`), embedding_cache: join(directory, 'provision-embeddings.duckdb'), analysis, size: null, provision: true }, undefined, controller.signal);
      if (provision.status !== 'provisioned') throw new Error(`Model provisioning failed for ${analysis}; see private logs`);
    }
    for (const size of opts.sizes) for (let repetition = 1; repetition <= opts.repeats; repetition++) for (const analysis of analyses) {
      const embedding_cache = join(directory, `embeddings-${size ?? 'all'}-${repetition}.duckdb`);
      for (const cache of analysis === 'topic' && !opts.profile ? ['empty', 'populated'] : ['fresh']) {
        if (controller.signal.aborted) throw new Error('Interrupted');
        const id = `${analysis}-${size ?? 'all'}-${repetition}-${cache}`;
        console.log(`${id}${opts.profile ? ` (${opts.profile} profiler)` : ''}`);
        const item = { id, analysis, size, repetition, cache, profile: opts.profile ?? null, status: 'running' };
        manifest.cases.push(item);
        await save();
        Object.assign(item, await execute(measurementExecutable, { ...base, output: join(directory, id), embedding_cache, analysis, size, provision: false }, opts.profile, controller.signal));
        await save();
        if (item.status !== 'succeeded') throw new Error(`${id} failed; see private case logs`);
        console.log(`  ${item.result.input.rows} rows, ${item.result.analysis_seconds.toFixed(3)} seconds, ${item.resources ? (item.resources.peak_rss_bytes / 2 ** 30).toFixed(2) + ' GiB peak process RSS' : 'RSS unavailable'}`);
      }
    }
  } catch (error) {
    for (const item of manifest.cases) if (item.status === 'running') item.status = 'failed';
    manifest.error = error.message;
    throw error;
  } finally {
    try { manifest.source_unchanged = manifest.input_sha256 === await checksum(input); }
    catch (error) { manifest.source_unchanged = false; manifest.error ??= `Source verification failed: ${error.message}`; }
    manifest.finished_at = new Date().toISOString();
    await save();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    console.log(`Private report: ${join(directory, 'report.md')}`);
  }
  if (!manifest.source_unchanged) throw new Error('Source checksum changed during the campaign');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
