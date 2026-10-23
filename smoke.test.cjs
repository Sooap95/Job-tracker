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

test('imported submitted records open for editing and retain legacy occupation values', () => {
  const app = createApp([
    {id:'submitted',role:'Submitted position',co:'Example',status:'Soumis',taux:'80-100%',orp:'Oui',date:'2026-10-10',fit_score:87}
  ]);
  assert.doesNotThrow(() => app.run("openModal('submitted')"));
  assert.equal(app.elements.get('f-role').value,'Submitted position');
  assert.equal(app.elements.get('f-status').value,'Soumis');
  assert.doesNotThrow(() => app.run('save()'));
  assert.equal(app.run('jobs[0].taux'),'80-100%');
  assert.equal(app.run('jobs[0].status'),'Soumis');
  assert.equal(app.run('jobs[0].orp'),'Oui');
  assert.equal(app.run('jobs[0].fit_score'),87);
});

test('historical submitted variants are searchable and appear on the board', () => {
  const app = createApp([
    {id:'a',role:'Submitted A',co:'Example',status:'Soumis',taux:'80-100%'},
    {id:'b',role:'Submitted B',co:'Example',status:'Soumise',taux:'80-100%'},
    {id:'c',role:'Submitted C',co:'Example',status:'Soumis (RAV quota octobre)',taux:'A plein temps'}
  ]);
  app.elements.get('fStatus').value='Soumis';
  app.run('render()');
  const filtered=app.elements.get('tbody').innerHTML;
  assert.match(filtered,/Submitted A/);
  assert.match(filtered,/Submitted B/);
  assert.match(filtered,/Submitted C/);
  app.run('renderBoard(jobs)');
  const board=app.elements.get('kanban-view').innerHTML;
  assert.match(board,/Submitted A/);
  assert.match(board,/Submitted B/);
  assert.match(board,/Submitted C/);
  assert.equal(app.run('isSubmittedStatus("Soumise")'),true);
});

test('form exposes legacy submitted statuses and 80-100 percent occupation', () => {
  const html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  assert.match(html,/value="Soumise"/);
  assert.match(html,/value="Soumis \(RAV quota octobre\)"/);
  assert.match(html,/name="taux"[^>]+value="80-100%"/);
});
