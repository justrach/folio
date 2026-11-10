import test from 'node:test';
import assert from 'node:assert/strict';
// The scanner is also a read-only agent/CLI entrypoint.
import {inspectStateSource} from '../scripts/state-machine-audit.mjs';

test('inventory distinguishes boolean regions, typed state domains and plain data',()=>{
 const report=inspectStateSource('src/example.tsx',`function Editor(){const [open,setOpen]=useState(false);const [phase,setPhase]=useState<'idle'|'loading'|'failed'>('idle');const [query,setQuery]=useState('');const requestPending=useRef(false);}`);
 assert.equal(report.state.length,3);assert.equal(report.state[0].kind,'boolean-region');
 assert.deepEqual(report.state[1].domain,['idle','loading','failed']);
 assert.equal(report.state[2].kind,'data-or-selection');assert.equal(report.state[0].owner,'Editor');
 assert.equal(report.imperative[0].name,'requestPending');
});
test('inventory finds tagged async states and concurrency guards without treating ordinary strings as secrets',()=>{
 const report=inspectStateSource('src/store.ts',`type Snapshot={status:'ready'|'error';data:unknown};type RunStatus='queued'|'completed';function save(){return db.prepare(\`UPDATE runs SET status=? WHERE revision=?\`);}`);
 assert.deepEqual(report.contracts.find((c:{name:string})=>c.name==='Snapshot.status').values,['ready','error']);
 assert.deepEqual(report.contracts.find((c:{name:string})=>c.name==='RunStatus').values,['queued','completed']);
 assert.equal(report.guards[0].owner,'save');assert.ok(!JSON.stringify(report).includes('UPDATE runs'));
});

test('inventory locates URL/session subscriptions and native or library controls',()=>{
 const report=inspectStateSource('src/example.tsx',`function Page(){const query=useSearchParams();const session=authClient.useSession();return <><details/><UiSelect/><dialog/></>;}`);
 assert.deepEqual(report.external.map((entry:{hook:string})=>entry.hook),['useSearchParams','useSession']);
 assert.deepEqual(report.native.map((entry:{component:string})=>entry.component),['details','UiSelect','dialog']);
 assert.equal(report.native[0].owner,'Page');assert.equal(report.native[0].line,1);
});
