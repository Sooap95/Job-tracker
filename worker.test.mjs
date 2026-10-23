import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {applyOperations} from './worker/index.js';

const env={
  GITHUB_OAUTH_CLIENT_ID:'test-client',GITHUB_OAUTH_CLIENT_SECRET:'test-secret',
  SESSION_SIGNING_KEY:'test-signing-key-with-enough-randomness-not-production',
  ALLOWED_GITHUB_USER_ID:'152836698',DATA_REPO_TOKEN:'private-test-token',
  DATA_REPO:'owner/private-data',DATA_BRANCH:'main',DATA_PATH:'data/jobs.json',
  ASSETS:{fetch:async()=>new Response('public asset')}
};
const origin='https://job-tracker-private.example';
const newer='2026-10-23T12:00:00.000Z';
const older='2026-10-22T12:00:00.000Z';
const record=(role,updatedAt=newer)=>({id:'a',role,co:'Company',updatedAt});

test('preserves unrelated records when several devices send changes',()=>{
  const remote={records:[record('Original',older)],tombstones:[]};
  const result=applyOperations(remote,[{type:'upsert',id:'b',job:{id:'b',role:'Second device',updatedAt:newer}}]);
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.data.records.length,2);
  assert.equal(result.data.records.find(x=>x.id==='a').role,'Original');
});

test('a stale edit cannot overwrite a newer update',()=>{
  const result=applyOperations({records:[record('Remote')],tombstones:[]},[
    {type:'upsert',id:'a',job:record('Local stale',older)}
  ]);
  assert.deepEqual(result.conflicts,['a']);
  assert.equal(result.data.records[0].role,'Remote');
});

test('deleted applications do not reappear when an old device reconnects',()=>{
  const first=applyOperations({records:[record('Original',older)],tombstones:[]},[
    {type:'delete',id:'a',at:newer}
  ]);
  assert.equal(first.data.records.length,0);
  assert.equal(first.data.tombstones[0].id,'a');
  const stale=applyOperations(first.data,[{type:'upsert',id:'a',job:record('Stale',older)}]);
  assert.deepEqual(stale.conflicts,['a']);
  assert.equal(stale.data.records.length,0);
});

test('legacy JSON arrays can be read and normalized',()=>{
  const result=applyOperations([record('Legacy',older)],[]);
  assert.equal(result.data.version,2);
  assert.equal(result.data.records[0].role,'Legacy');
});

test('private data API requires a valid login',async()=>{
  const response=await worker.fetch(new Request(origin+'/api/jobs'),env);
  assert.equal(response.status,401);
  assert.equal((await response.text()).includes('private-test-token'),false);
});

test('OAuth start has CSRF state, PKCE challenge, and secure HttpOnly cookie',async()=>{
  const response=await worker.fetch(new Request(origin+'/auth/github/start'),env);
  assert.equal(response.status,302);
  const target=new URL(response.headers.get('Location'));
  assert.equal(target.host,'github.com');
  assert.equal(target.searchParams.get('code_challenge_method'),'S256');
  assert.ok(target.searchParams.get('state'));
  assert.ok(target.searchParams.get('code_challenge'));
  assert.equal(target.searchParams.has('scope'),false);
  const cookies=response.headers.get('Set-Cookie');
  assert.match(cookies,/__Host-jt_oauth=/);
  assert.match(cookies,/HttpOnly/);
  assert.match(cookies,/Secure/);
});

test('callback rejects mismatched state before exchanging tokens',async()=>{
  const start=await worker.fetch(new Request(origin+'/auth/github/start'),env);
  const cookieValue=start.headers.get('Set-Cookie').split(';')[0];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw new Error('Should never contact GitHub');};
  try {
    const callback=await worker.fetch(new Request(origin+'/auth/github/callback?state=attacker&code=fake',{
      headers:{Cookie:cookieValue}
    }),env);
    assert.equal(callback.status,400);
  } finally {globalThis.fetch=originalFetch;}
});

test('callback refuses another GitHub identity',async()=>{
  const start=await worker.fetch(new Request(origin+'/auth/github/start'),env);
  const cookieValue=start.headers.get('Set-Cookie').split(';')[0];
  const state=new URL(start.headers.get('Location')).searchParams.get('state');
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>{
    if (String(url).includes('/access_token')) {
      assert.equal(JSON.parse(opts.body).code_verifier?.length>20,true);
      return Response.json({access_token:'fake-short-lived-login-token'});
    }
    if (String(url).includes('/user')) return Response.json({id:999,login:'other-user'});
    throw new Error('Unexpected request');
  };
  try {
    const response=await worker.fetch(new Request(origin+'/auth/github/callback?state='+state+'&code=test',{
      headers:{Cookie:cookieValue}
    }),env);
    assert.equal(response.status,403);
    assert.equal(response.headers.get('Set-Cookie').includes('__Host-jt_session'),false);
  } finally {globalThis.fetch=originalFetch;}
});
