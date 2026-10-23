// OAuth GitHub identifie l'utilisateur, un token distinct côté serveur accède aux données privées.
const HEADERS = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const EMPTY = {version:2,records:[],tombstones:[]};
const OLD = '1970-01-01T00:00:00.000Z';
const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{...HEADERS,...headers}});
const cookie = (name,value,age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const readCookie = (req,name) => (req.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
const b64 = data => {
  let binary='';
  for (let i=0;i<data.length;i+=32768) binary+=String.fromCharCode(...data.subarray(i,i+32768));
  return btoa(binary);
};
const un64 = data => Uint8Array.from(atob(data),c=>c.charCodeAt(0));
const u64 = data => b64(data).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const from64 = s => un64(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));
const bytes = str => new TextEncoder().encode(str);
const rand = () => u64(crypto.getRandomValues(new Uint8Array(32)));
const seconds = () => Math.floor(Date.now()/1000);
const date = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : OLD;

async function key(secret) { return crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']); }
async function signed(payload,secret) {
  const body=u64(bytes(JSON.stringify(payload)));
  const signature=await crypto.subtle.sign('HMAC',await key(secret),bytes(body));
  return body+'.'+u64(new Uint8Array(signature));
}
async function verified(token,secret) {
  if (!token || !/^[\w-]+\.[\w-]+$/.test(token)) return null;
  const [body,sig]=token.split('.');
  try {
    if (!await crypto.subtle.verify('HMAC',await key(secret),from64(sig),bytes(body))) return null;
    return JSON.parse(new TextDecoder().decode(from64(body)));
  } catch { return null; }
}
async function account(req,env) {
  const session=await verified(readCookie(req,'__Host-jt_session'),env.SESSION_SIGNING_KEY);
  return session?.exp > seconds() && String(session.id)===String(env.ALLOWED_GITHUB_USER_ID) ? session : null;
}
function configured(env) {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET && env.SESSION_SIGNING_KEY &&
    env.ALLOWED_GITHUB_USER_ID && env.DATA_REPO_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(env.DATA_REPO||'') &&
    /^[\w./-]+\.json$/.test(env.DATA_PATH||'') && !env.DATA_PATH.includes('..'));
}
async function login(req,env) {
  const state=rand(), verifier=rand();
  const challenge=u64(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(verifier))));
  const callback=new URL('/auth/github/callback',req.url).href;
  const destination=new URL('https://github.com/login/oauth/authorize');
  destination.searchParams.set('client_id',env.GITHUB_OAUTH_CLIENT_ID);
  destination.searchParams.set('redirect_uri',callback);
  destination.searchParams.set('state',state);
  destination.searchParams.set('code_challenge',challenge);
  destination.searchParams.set('code_challenge_method','S256');
  // Aucun scope "repo" : cette autorisation ne sert qu'à identifier le compte.
  const flow=await signed({state,verifier,iat:seconds()},env.SESSION_SIGNING_KEY);
  return new Response(null,{status:302,headers:{Location:destination.href,'Set-Cookie':cookie('__Host-jt_oauth',flow,600),'Cache-Control':'no-store'}});
}
async function callback(req,env) {
  const url=new URL(req.url);
  const flow=await verified(readCookie(req,'__Host-jt_oauth'),env.SESSION_SIGNING_KEY);
  const cleared=cookie('__Host-jt_oauth','',0);
  if (!flow || seconds()-flow.iat > 600 || flow.state!==url.searchParams.get('state') || !url.searchParams.get('code'))
    return json({error:'Connexion expirée ou invalide.'},400,{'Set-Cookie':cleared});
  const callbackUrl=new URL('/auth/github/callback',req.url).href;
  const response=await fetch('https://github.com/login/oauth/access_token',{
    method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify({client_id:env.GITHUB_OAUTH_CLIENT_ID,client_secret:env.GITHUB_OAUTH_CLIENT_SECRET,
      code:url.searchParams.get('code'),redirect_uri:callbackUrl,code_verifier:flow.verifier})
  });
  const token=await response.json().catch(()=>({}));
  if (!response.ok || !token.access_token) {
    // Ne jamais renvoyer de token, code OAuth ou valeur de secret au navigateur.
    const knownErrors={
      incorrect_client_credentials:'Client ID ou Client Secret GitHub incorrect.',
      redirect_uri_mismatch:'URL de retour OAuth différente de celle enregistrée dans GitHub.',
      bad_verification_code:'Code de connexion expiré ou déjà utilisé. Recommencez la connexion.',
      unverified_user_email:'Adresse e-mail du compte GitHub non vérifiée.',
      invalid_grant:'Autorisation OAuth expirée ou invalide.'
    };
    const detail=knownErrors[token.error] || 'Échange du code OAuth impossible.';
    return json({error:'Connexion GitHub refusée : '+detail},401,{'Set-Cookie':cleared});
  }
  const userRes=await fetch('https://api.github.com/user',{
    headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/vnd.github+json','User-Agent':'JobTrackerPrivate'}
  });
  const user=await userRes.json().catch(()=>({}));
  if (!userRes.ok || String(user.id)!==String(env.ALLOWED_GITHUB_USER_ID))
    return json({error:'Compte GitHub non autorisé.'},403,{'Set-Cookie':cleared});
  const session=await signed({id:user.id,login:user.login,exp:seconds()+604800},env.SESSION_SIGNING_KEY);
  const result=new Response(null,{status:302,headers:{Location:'/','Set-Cookie':cookie('__Host-jt_session',session,604800),'Cache-Control':'no-store'}});
  result.headers.append('Set-Cookie',cleared);
  return result;
}
function repoUrl(env) {
  const [owner,repo]=env.DATA_REPO.split('/');
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${env.DATA_PATH.split('/').map(encodeURIComponent).join('/')}`;
}
async function gh(env,method,body) {
  const url=method==='GET' ? repoUrl(env)+'?ref='+encodeURIComponent(env.DATA_BRANCH||'main') : repoUrl(env);
  return fetch(url,{method,headers:{Authorization:`Bearer ${env.DATA_REPO_TOKEN}`,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28','User-Agent':'JobTrackerPrivate','Content-Type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {})});
}
function normalize(raw) {
  const data=Array.isArray(raw) ? {version:2,records:raw,tombstones:[]} : raw;
  if (!data || !Array.isArray(data.records) || !Array.isArray(data.tombstones)) throw new Error('Format distant invalide.');
  if (data.records.some(r=>!r || typeof r.id!=='string' || !r.id) ||
      data.tombstones.some(t=>!t || typeof t.id!=='string' || !t.id))
    throw new Error('Identifiant manquant dans la sauvegarde distante.');
  if (new Set(data.records.map(r=>r.id)).size!==data.records.length ||
      new Set(data.tombstones.map(t=>t.id)).size!==data.tombstones.length)
    throw new Error('Identifiants en double dans la sauvegarde distante.');
  return {version:2,
    records:data.records.map(r=>({...r,updatedAt:date(r.updatedAt)})),
    tombstones:data.tombstones.map(t=>({id:t.id,deletedAt:date(t.deletedAt)}))};
}
async function getRemote(env) {
  const response=await gh(env,'GET');
  if (response.status===404) return {sha:null,data:{...EMPTY}};
  if (!response.ok) throw new Error('Lecture privée impossible ('+response.status+').');
  const blob=await response.json();
  return {sha:blob.sha,data:normalize(JSON.parse(new TextDecoder().decode(un64(blob.content.replace(/\s/g,'')))))};
}

// Versions et tombstones évitent la perte silencieuse de modifications concurrentes.
export function applyOperations(raw,ops) {
  const data=normalize(raw), records=new Map(data.records.map(r=>[r.id,r]));
  const tombs=new Map(data.tombstones.map(t=>[t.id,t]));
  const conflicts=[];
  for (const op of ops) {
    if (!op || !['upsert','delete'].includes(op.type) || typeof op.id!=='string' || !op.id || op.id.length>200)
      throw new Error('Opération invalide.');
    const old=records.get(op.id), tomb=tombs.get(op.id);
    if (op.type==='delete') {
      const at=date(op.at);
      if (at===OLD) throw new Error('Date de suppression manquante.');
      if (at>date(old?.updatedAt) && at>date(tomb?.deletedAt)) {
        records.delete(op.id);tombs.set(op.id,{id:op.id,deletedAt:at});
      } else if (old && at<=date(old.updatedAt)) conflicts.push(op.id);
    } else {
      if (!op.job || op.job.id!==op.id || typeof op.job.role!=='string') throw new Error('Candidature invalide.');
      const at=date(op.job.updatedAt);
      if (at>date(tomb?.deletedAt) && (!old || at>date(old.updatedAt))) {
        records.set(op.id,{...op.job,updatedAt:at});tombs.delete(op.id);
      } else if (old && at===date(old.updatedAt) && JSON.stringify({...op.job,updatedAt:at})===JSON.stringify(old)) {
        continue;
      } else if (old || tomb) conflicts.push(op.id);
    }
  }
  return {data:{version:2,records:[...records.values()],tombstones:[...tombs.values()]},conflicts};
}
async function saveRemote(env,operations) {
  for (let attempt=0;attempt<4;attempt++) {
    const {sha,data}=await getRemote(env);
    const result=applyOperations(data,operations);
    if (result.conflicts.length || JSON.stringify(result.data)===JSON.stringify(data)) return {...result,sha};
    const payload={message:'Sauvegarde Job Tracker '+new Date().toISOString(),branch:env.DATA_BRANCH||'main',
      content:b64(bytes(JSON.stringify(result.data,null,2))),...(sha?{sha}:{})};
    const response=await gh(env,'PUT',payload);
    if ([409,422].includes(response.status)) continue;
    if (!response.ok) throw new Error('Écriture privée impossible ('+response.status+').');
    const saved=await response.json();
    return {...result,sha:saved.content?.sha||null};
  }
  throw new Error('Concurrence GitHub, réessayer.');
}

export default {async fetch(req,env) {
  const url=new URL(req.url);
  if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/')) return env.ASSETS.fetch(req);
  if (!configured(env)) return json({error:'Synchronisation non configurée sur le serveur.'},503);
  try {
    if (req.method==='GET' && url.pathname==='/auth/github/start') return login(req,env);
    if (req.method==='GET' && url.pathname==='/auth/github/callback') return callback(req,env);
    const user=await account(req,env);
    if (req.method==='GET' && url.pathname==='/api/me') return json({enabled:true,authenticated:!!user,login:user?.login||null});
    if (!user) return json({error:'Connexion GitHub nécessaire.'},401);
    if (req.method==='POST' && url.pathname==='/api/logout') {
      if (req.headers.get('Origin')!==url.origin) return json({error:'Origine refusée.'},403);
      return json({ok:true},200,{'Set-Cookie':cookie('__Host-jt_session','',0)});
    }
    if (req.method==='GET' && url.pathname==='/api/jobs') {
      const {data,sha}=await getRemote(env);return json({...data,sha});
    }
    if (req.method==='PUT' && url.pathname==='/api/jobs') {
      if (req.headers.get('Origin')!==url.origin) return json({error:'Origine refusée.'},403);
      if (Number(req.headers.get('Content-Length')||0)>1048576) return json({error:'Fichier trop volumineux.'},413);
      const raw=await req.text();
      if (raw.length>1048576) return json({error:'Fichier trop volumineux.'},413);
      let body;try {body=JSON.parse(raw);}catch{return json({error:'JSON invalide.'},400);}
      if (!Array.isArray(body.operations) || body.operations.length>500) return json({error:'Opérations invalides.'},400);
      let result;
      try {result=await saveRemote(env,body.operations);}catch(e){
        if (/invalide|manquante/.test(e.message)) return json({error:e.message},400);
        throw e;
      }
      return result.conflicts.length ? json({error:'Versions incompatibles.',ids:result.conflicts},409) : json({...result.data,sha:result.sha});
    }
    return json({error:'Route inconnue.'},404);
  } catch(err) {
    console.error('JobTracker sync:',err.message);
    return json({error:'Synchronisation temporairement indisponible.'},502);
  }
}};
