// Disposable operator-run rehearsal. Requires Docker and a freshly built drill image.
// Never mount customer history, keys, Docker socket, or production credentials here.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { preserveCandidate } from './candidate-artifact.mjs';

const repo = process.cwd();
const id = `boundary-drill-${Date.now()}`;
const out = resolve(process.argv[2] ?? `docs/evidence/${id}`);
mkdirSync(out, { recursive: true });
const image = 'aletheia-custody-drill:local';
const net = `${id}-net`, db = `${id}-db`, state = `${id}-state`, custody = `${id}-custody`;
const rows = [], calls = [];
const sha = createHash('sha256').update(readFileSync('policies/example.yaml')).digest('hex');
function command(args, expected = 0) {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 60000, maxBuffer: 4e6 });
  const item = { command: ['docker', ...args].join(' ').replace(/postgres:\/\/[^ ]+/g, 'postgres://[disposable-fixture]'), exit: r.status, stdout: r.stdout, stderr: r.stderr, error: r.error?.message };
  writeFileSync(resolve(out, `command-${String(calls.length + 1).padStart(3, '0')}.json`), JSON.stringify(item, null, 2));
  calls.push(item);
  if (expected !== null && r.status !== expected) throw new Error(`Docker command failed: ${args.slice(0, 3).join(' ')}; exit ${r.status}; ${r.stderr}`);
  return r;
}
function check(name, passed, evidence) {
  rows.push({ name, verdict: passed ? 'PASS' : 'FAIL', evidence });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${evidence}`);
  if (!passed) throw new Error(name);
}
const mounts = ['-v', `${state}:/state`, '-v', `${custody}:/custody`];
function operator(code) {
  return command(['run', '--rm', '--network', 'none', '--user', '0:0', ...mounts, '--entrypoint', 'node', image, '--input-type=module', '-e', code]);
}
const baseEnv = {
  NODE_ENV: 'production', DATABASE_URL: `postgres://readonly:readonly@${db}:5432/boundary`,
  BOUNDARY_POLICY: '/app/policies/example.yaml', BOUNDARY_KEY_PATH: '/state/key.ed25519',
  BOUNDARY_LOG_PATH: '/state/receipts.jsonl', BOUNDARY_CHECKPOINT_PATH: '/custody/test-anchor.json',
  BOUNDARY_TRUSTED_CALLER: 'host-drill-reader', BOUNDARY_SKIP_READONLY_PROBE: '0',
};
function serverArgs(name, overrides = {}) {
  const env = { ...baseEnv, ...overrides };
  return ['run', '--rm', '-i', '--name', name, '--network', net, '--user', '10001:10001', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--pids-limit=64', '--memory=256m', '--cpus=1', '-v', `${state}:/state`, '-v', `${custody}:/custody:ro`, ...Object.entries(env).flatMap(([k,v]) => ['-e', `${k}=${v}`]), image];
}
async function connect(name, overrides) {
  const transport = new StdioClientTransport({ command: 'docker', args: serverArgs(name, overrides), stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', c => { stderr += c.toString(); });
  const client = new Client({ name: 'operator-custody-drill', version: '1' });
  await client.connect(transport);
  return { client, close: async () => { await client.close(); writeFileSync(resolve(out, `${name}.stderr.txt`), stderr); } };
}
async function tool(client, args) {
  const response = await client.callTool({ name: 'boundary_request', arguments: args });
  const body = JSON.parse(response.content.find(c => c.type === 'text').text);
  writeFileSync(resolve(out, `tool-${Date.now()}.json`), JSON.stringify({ args, body }, null, 2));
  return body;
}
function cli(extra = []) {
  return command(['run', '--rm', '--network', 'none', '--user', '10001:10001', ...mounts, '--entrypoint', 'node', image, 'dist/receipt/verify-cli.js', '--log', '/state/receipts.jsonl', '--pub', '/state/key.pub.pem', ...extra], null);
}
function refuse(name, overrides, pattern) {
  const r = command(serverArgs(`${id}-${name}`, overrides), null);
  check(name, r.status === 1 && pattern.test(r.stderr), `exit=${r.status}; ${r.stderr.split('\n').filter(l => /fatal|FATAL/.test(l)).join(' ').slice(0, 350)}`);
}
let failure;
try {
  command(['network', 'create', '--internal', net]);
  command(['volume', 'create', state]); command(['volume', 'create', custody]);
  operator(`import fs from 'node:fs'; fs.chownSync('/state',10001,10001); fs.chmodSync('/state',0o700); fs.chmodSync('/custody',0o755);`);
  command(['run', '-d', '--name', db, '--network', net, '-e', 'POSTGRES_USER=admin', '-e', 'POSTGRES_PASSWORD=admin', '-e', 'POSTGRES_DB=boundary', '-v', `${resolve(repo,'scripts/init-readonly.sql')}:/docker-entrypoint-initdb.d/01-init.sql:ro`, '--health-cmd', 'pg_isready -U admin -d boundary', '--health-interval', '1s', '--health-retries', '30', 'postgres:16-alpine']);
  for (let i=0;i<30;i++) {
    const health = command(['inspect', '--format', '{{.State.Health.Status}}', db]).stdout.trim();
    if (health === 'healthy') break;
    await new Promise(r => setTimeout(r,1000));
    if (i === 29) throw new Error('Disposable DB did not become healthy');
  }
  check('DB has no published host ports', command(['port', db]).stdout.trim() === '', 'dedicated internal Docker network; no host port');
  const boot = await connect(`${id}-bootstrap`, {NODE_ENV:'test', BOUNDARY_CHECKPOINT_PATH:''});
  try {
    check('MCP tool discovery', (await boot.client.listTools()).tools.some(t=>t.name==='boundary_request'), 'boundary_request');
    for (let i=0;i<2;i++) {
      const body = await tool(boot.client,{action:'query',resource:'public.analytics_daily',params:{columns:['date','metric','value'],limit:1},caller:'admin',purpose:'custody rehearsal'});
      check(`bootstrap live receipt ${i+1}`, body.ok && body.dataSource==='postgres', 'real disposable Postgres; constrained data');
      if(i===0) operator(`import fs from 'node:fs';fs.copyFileSync('/state/receipts.jsonl','/state/older-prefix.jsonl');`);
    }
  } finally { await boot.close(); }
  operator(`import fs from 'node:fs';fs.copyFileSync('/state/receipts.jsonl','/state/full.jsonl');`);
  check('export candidate after offline verify', cli(['--export-checkpoint','/state/candidate-2.json']).status===0, 'CLI exit 0');
  const before = operator(`import fs from 'node:fs';import {createHash} from 'node:crypto';console.log(createHash('sha256').update(fs.readFileSync('/state/candidate-2.json')).digest('hex'));`).stdout.trim();
  check('candidate overwrite refused',cli(['--export-checkpoint','/state/candidate-2.json']).status===1,'CLI exit 1');
  const after = operator(`import fs from 'node:fs';import {createHash} from 'node:crypto';console.log(createHash('sha256').update(fs.readFileSync('/state/candidate-2.json')).digest('hex'));`).stdout.trim();
  check('candidate unchanged after overwrite attempt',before===after,before);
  operator(`import fs from 'node:fs';fs.copyFileSync('/state/candidate-2.json','/custody/test-anchor.json');fs.copyFileSync('/state/candidate-2.json','/custody/retained-2.json');fs.chmodSync('/custody/test-anchor.json',0o444);fs.chmodSync('/custody/retained-2.json',0o444);console.log(fs.readFileSync('/custody/test-anchor.json','utf8'));`);
  const exportedBytes=Buffer.from(operator(`import fs from 'node:fs';console.log(fs.readFileSync('/custody/test-anchor.json').toString('base64'));`).stdout.trim(),'base64');
  const artifactSha256=preserveCandidate(resolve(out,'candidate-for-human-review.json'),exportedBytes,before);
  check('review artifact preserves exported bytes',artifactSha256===before,`artifact SHA-256=${artifactSha256}`);
  rows.push({name:'Human checkpoint approval',verdict:'PENDING',evidence:'Test anchor copied by operator harness solely for rehearsal; not an approved production anchor.'});
  const liveName=`${id}-writer`;
  const live=await connect(liveName,{});
  try {
    check('anchored production-mode MCP startup', (await tool(live.client,{action:'schema',resource:'*',caller:'admin'})).ok, 'production mode against disposable DB');
    const duplicate=command(serverArgs(liveName),null);
    check('supervisor duplicate container name refused',duplicate.status===125 && /already in use|Conflict/.test(duplicate.stderr),'Docker name reservation; alternative container names remain operator-controlled');
    const protection=command(['exec',liveName,'node','--input-type=module','-e',`import fs from 'node:fs';const paths=['/custody/test-anchor.json','/custody/retained-2.json'];for(const p of paths){let denied=false;try{fs.writeFileSync(p,'tamper')}catch(e){denied=['EROFS','EACCES'].includes(e.code)}if(!denied)process.exit(2)}let denied=false;try{fs.unlinkSync('/custody/test-anchor.json')}catch(e){denied=['EROFS','EACCES'].includes(e.code)}if(!denied)process.exit(3);console.log('checkpoint replacement and deletion refused');`]);
    check('writer cannot replace or delete retained checkpoints',protection.status===0,protection.stdout.trim());
    const receipt=JSON.parse(operator(`import fs from 'node:fs';console.log(fs.readFileSync('/state/receipts.jsonl','utf8').trim().split(String.fromCharCode(10)).at(-1));`).stdout);
    check('caller is host controlled',receipt.request?.caller==='host-drill-reader',`receipt caller=${receipt.request?.caller}; client supplied admin`);
    command(['exec',liveName,'node','--input-type=module','-e',`import fs from 'node:fs';for(const p of ['/state','/state/key.ed25519','/state/receipts.jsonl']){const s=fs.statSync(p);if(s.uid!==10001 || (s.mode&0o077)!==0)process.exit(1);console.log(p+' uid='+s.uid+' mode='+(s.mode&0o777).toString(8))}`]);
    check('writer key/log permissions',true,'UID 10001; state 0700, private key/log 0600 verified inside Linux volume');
    const other=await connect(`${id}-other-writer`,{});
    try {
      check('second differently named writer can start', (await other.client.listTools()).tools.some(t=>t.name==='boundary_request'), 'expected host-control gap; container name alone is not a volume lock');
      check('second writer appends on disposable shared log', (await tool(other.client,{action:'schema',resource:'*'})).ok, 'controlled sequential overlap; never use this deployment pattern');
      const stale=await tool(live.client,{action:'schema',resource:'*'});
      check('stale first writer refuses after external append',stale.ok===false && stale.data===null,'no data released after external log change; simultaneous-write race remains untested');
      rows.push({name:'Global single-writer enforcement',verdict:'NOT ENFORCED',evidence:'Different container name can mount same log. Operator must control Docker/volume access or add an external exclusive supervisor lock.'});
    } finally {await other.close();}
  } finally {await live.close();}
  // Separate restricted agent has no DB network, state/custody mounts or Docker socket.
  const dbIp=command(['inspect','--format',`{{(index .NetworkSettings.Networks "${net}").IPAddress}}`,db]).stdout.trim();
  const agent=command(['run','--rm','--network','none','--user','10002:10002','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--entrypoint','node',image,'--input-type=module','-e',`import fs from 'node:fs';import net from 'node:net';for(const p of ['/state/key.ed25519','/custody/test-anchor.json','/var/run/docker.sock'])if(fs.existsSync(p))process.exit(2);await new Promise((resolve,reject)=>{const s=net.connect({host:'${dbIp}',port:5432});s.setTimeout(1500);s.on('connect',()=>{s.destroy();reject(Error('bypass connected'))});s.on('error',()=>resolve());s.on('timeout',()=>{s.destroy();resolve()})});console.log('No DB route, key, checkpoint mount, or Docker socket');`]);
  check('restricted agent cannot bypass DB or read custody',agent.status===0,agent.stdout.trim());
  // A separate unprivileged UID with a state mount still cannot read the private key.
  command(['run','--rm','--network','none','--user','10002:10002','-v',`${state}:/state:ro`,'--entrypoint','node',image,'-e',`const fs=require('fs');try{fs.readFileSync('/state/key.ed25519');process.exit(2)}catch(e){if(e.code!=='EACCES')throw e;console.log('EACCES')}`]);
  check('other UID cannot read signing key',true,'EACCES with even a read-only state mount');
  refuse('missing-checkpoint',{BOUNDARY_CHECKPOINT_PATH:''},/Production requires BOUNDARY_CHECKPOINT_PATH/);
  refuse('writable-role',{DATABASE_URL:`postgres://writable:writable@${db}:5432/boundary`},/Postgres provider failed/);
  operator(`import fs from 'node:fs';fs.copyFileSync('/state/older-prefix.jsonl','/state/receipts.jsonl');`);
  refuse('valid-prefix-rollback',{},/shorter than trusted checkpoint/);
  operator(`import fs from 'node:fs';fs.copyFileSync('/state/full.jsonl','/state/receipts.jsonl');fs.writeFileSync('/custody/corrupt.json','{');const a=JSON.parse(fs.readFileSync('/custody/test-anchor.json'));a.publicKeySha256='0'.repeat(64);fs.writeFileSync('/custody/wrong-key.json',JSON.stringify(a));`);
  refuse('corrupt-anchor',{BOUNDARY_CHECKPOINT_PATH:'/custody/corrupt.json'},/checkpoint unavailable or invalid/);
  refuse('wrong-key-anchor',{BOUNDARY_CHECKPOINT_PATH:'/custody/wrong-key.json'},/signing key mismatch/);
  // Advance history, export a new immutable candidate, and show the freshness limit.
  const extension=await connect(`${id}-extension`,{});
  try {await tool(extension.client,{action:'schema',resource:'*'});}finally{await extension.close();}
  check('advanced candidate export',cli(['--checkpoint','/custody/test-anchor.json','--export-checkpoint','/state/candidate-3.json']).status===0,'verified anchored extension');
  operator(`import fs from 'node:fs';fs.copyFileSync('/state/candidate-3.json','/custody/retained-3.json');fs.chmodSync('/custody/retained-3.json',0o444);fs.copyFileSync('/state/full.jsonl','/state/receipts.jsonl');`);
  check('stale anchor permits unanchored suffix loss',cli(['--checkpoint','/custody/retained-2.json']).status===0,'expected limitation: two-receipt anchor accepts two-receipt prefix');
  refuse('advanced-anchor-detects-suffix-loss',{BOUNDARY_CHECKPOINT_PATH:'/custody/retained-3.json'},/shorter than trusted checkpoint/);
  operator(`import fs from 'node:fs';console.log(JSON.stringify({retained:fs.readdirSync('/custody'),anchor2:JSON.parse(fs.readFileSync('/custody/retained-2.json')),anchor3:JSON.parse(fs.readFileSync('/custody/retained-3.json'))}));`);
  const canary=command(['exec',db,'psql','-U','admin','-d','boundary','-tAc','SELECT count(*) FROM public.write_canary']).stdout.trim();
  check('DB write canary unchanged',canary==='0',`rows=${canary}`);
  rows.push({name:'Current desktop host isolation',verdict:'NOT ISOLATED',evidence:'Current agent can run shell/Docker and reach the original published DB. Container rehearsal does not restrict this chat.'});
  rows.push({name:'Cross-host custody / human freshness policy / physical storage recovery / release CI / independent review',verdict:'NOT RUN',evidence:'Same Docker administrator controls both volumes; requires separate custody authority and operator decisions.'});
} catch(e) {failure=String(e);console.error(e);} finally {
  command(['rm','-f',db],null);
  command(['network','rm',net],null);
  // Retain named state/custody volumes for operator review; no private keys copied into evidence.
  const manifest={timestamp:new Date().toISOString(),head:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),policySha256:sha,image:command(['image','inspect','--format','{{.Id}}',image],null).stdout.trim(),resources:{state,custody,db,net},failure,results:rows};
  writeFileSync(resolve(out,'RESULTS.json'),JSON.stringify(manifest,null,2));
  console.log(`Evidence: ${out}`);
  if(failure)process.exitCode=1;
}
