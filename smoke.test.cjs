const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createApp(initialJobs = []) {
  const memory = new Map([['jobtracker_v3',JSON.stringify(initialJobs)]]);
  const session = new Map();
  const storage = map => ({
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key,value) => map.set(key,String(value)),
    removeItem: key => map.delete(key)
  });
  const elements = new Map();
  const document = {
    getElementById(id) {
      if(!elements.has(id)) {
        elements.set(id,{
          value:'',innerHTML:'',textContent:'',hidden:false,style:{},
          classList:{toggle(){},remove(){},add(){}},
          setAttribute(){},focus(){}
        });
      }
      return elements.get(id);
    },
    querySelectorAll(){return [];},
    querySelector(){return {setAttribute(){},classList:{toggle(){}}};}
  };
  const context = vm.createContext({
    document,localStorage:storage(memory),sessionStorage:storage(session),
    navigator:{},location:{protocol:'file:',hostname:''},
    window:{scrollTo(){}},console,Intl,Date,URL,confirm:()=>true,alert(){},
    setTimeout:fn=>fn()
  });
  const source = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  vm.runInContext(source,context);
  return {context,memory,session,elements,run:expression=>vm.runInContext(expression,context)};
}

test('legacy job records remain readable without data migration', () => {
  const app = createApp([{id:'old',role:'Scientist',co:'Company',status:'En cours',date:'2026-09-03'}]);
  assert.match(app.elements.get('tbody').innerHTML,/Scientist/);
  assert.equal(app.run('jobs[0].id'),'old');
});

test('an offer not yet applied to cannot enter the RAV report', () => {
  const month = new Date().toISOString().slice(0,7);
  const app = createApp([
    {id:'plan',role:'Plan',co:'A',date:month+'-08',status:'A postuler',m_email:true},
    {id:'sent',role:'Sent',co:'B',date:month+'-09',status:'Attente de retour',m_email:true}
  ]);
  assert.equal(app.run('currentMonthJobs().length'),1);
  assert.equal(app.run('currentMonthJobs()[0].id'),'sent');
  assert.equal(app.run('ravComplete(jobs[0])'),false);
  assert.equal(app.run('ravComplete(jobs[1])'),true);
});

test('priority sorting puts dream jobs before backups', () => {
  const app = createApp([
    {id:'a',role:'Backup role',co:'A',status:'A postuler',priorite:'Backup'},
    {id:'b',role:'Dream role',co:'B',status:'A postuler',priorite:'Job de rêve'}
  ]);
  app.elements.get('fSort').value = 'priorite';
  app.run('render()');
  const html = app.elements.get('tbody').innerHTML;
  assert.ok(html.indexOf('Dream role') < html.indexOf('Backup role'));
});

test('safe remote merge preserves local changes without a newer timestamp', () => {
  const app = createApp([{id:'a',role:'Local',co:'A',updatedAt:'2026-10-23T10:00:00Z'}]);
  const result = app.run('mergeData([{id:"a",role:"Remote older",co:"A"}], true)');
  assert.equal(result.conflicts,1);
  assert.equal(app.run('jobs[0].role'),'Local');
});

test('legacy GitHub token is migrated from persistent to session storage', () => {
  const app = createApp();
  app.memory.set('jobtracker_gh_config',JSON.stringify({owner:'me',repo:'private',token:'example-token'}));
  app.run('ghLoadConfig()');
  assert.equal(app.session.get('jobtracker_gh_session_token'),'example-token');
  assert.equal(JSON.parse(app.memory.get('jobtracker_gh_config')).token,undefined);
});
