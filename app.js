const STORAGE_KEY = 'jobtracker_v3';
const GH_CONFIG_KEY = 'jobtracker_gh_config';
let jobs = [];
let editId = null;
let ravYear = new Date().getFullYear();
let ravMonth = new Date().getMonth(); // 0-indexed
let currentView = 'list';

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const STATUS_CLASS = {
  'A postuler':'b-postuler','En cours':'b-cours','Attente de retour':'b-attente','Refusé':'b-refuse','Accepté':'b-accepte'
};
const PRIO_CLASS = {
  'Backup':'b-backup','Offre intéressante':'b-interessant','Job de rêve':'b-reve'
};
const PRIO_ORDER = {'Job de rêve':0,'Offre intéressante':1,'Backup':2,'':3};

// ===== SECURITY HELPERS =====
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function jsArg(s) {
  return esc(JSON.stringify(String(s ?? '')));
}
function safeUrl(u) {
  if (!u) return '';
  try {
    const parsed = new URL(u, window.location.href);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
  } catch { return ''; }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) jobs = JSON.parse(raw);
    if (!Array.isArray(jobs)) jobs = [];
    // Compatibilité avec les très anciennes sauvegardes sans identifiant.
    if (jobs.some(j => !j.id)) {
      jobs=jobs.map(j => ({...j,id:j.id || genId()}));
      localStorage.setItem(STORAGE_KEY,JSON.stringify(jobs));
    }
  } catch(e) { jobs = []; }
  render(); renderRAV(); renderStats();
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function fmtDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return '—';
  const p = d.split('-');
  return p[2] + '.' + p[1] + '.' + p[0].slice(2);
}
function niceDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return '';
  const [y,m,day] = d.split('-');
  return day + '.' + m + '.' + y;
}

function ravComplete(j) {
  return !!(j.status !== 'A postuler' && j.date && j.co && j.role && (j.m_email || j.m_lettre || j.m_contact || j.m_tel));
}

// ===== SWITCH TABS =====
function switchTab(tab) {
  ['dashboard','rav','dossier'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.getElementById('mobile-settings-panel').classList.remove('open');
  document.querySelector('.mobile-menu').setAttribute('aria-expanded','false');
  window.scrollTo({top:0,behavior:'auto'});
  if (tab === 'rav') renderRAV();
}
function toggleMobileSettings() {
  const panel = document.getElementById('mobile-settings-panel');
  const open = panel.classList.toggle('open');
  document.querySelector('.mobile-menu').setAttribute('aria-expanded',String(open));
}
function switchView(view) {
  currentView = view;
  document.getElementById('list-view').hidden = view !== 'list';
  document.getElementById('mobile-cards').hidden = view !== 'list';
  document.getElementById('kanban-view').hidden = view !== 'board';
  for(const [id,active] of [['view-list',view === 'list'],['view-board',view === 'board']]) {
    const b=document.getElementById(id);
    b.classList.toggle('active',active);
    b.setAttribute('aria-pressed',String(active));
  }
}

// ===== DASHBOARD RENDER =====
function render() {
  const search = document.getElementById('search').value.toLowerCase();
  const fs = document.getElementById('fStatus').value;
  const fp = document.getElementById('fPriorite').value;
  const so = document.getElementById('fSort').value;

  let data = [...jobs];
  if (search) data = data.filter(j =>
    (j.role||'').toLowerCase().includes(search) ||
    (j.co||'').toLowerCase().includes(search) ||
    (j.notes||'').toLowerCase().includes(search)
  );
  if (fs) data = data.filter(j => j.status === fs);
  if (fp) data = data.filter(j => j.priorite === fp);

  if (so === 'date_desc') data.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  else if (so === 'date_asc') data.sort((a,b) => (a.date||'').localeCompare(b.date||''));
  else if (so === 'entreprise') data.sort((a,b) => (a.co||'').localeCompare(b.co||''));
  else if (so === 'priorite') data.sort((a,b) => (PRIO_ORDER[a.priorite||''] ?? 3) - (PRIO_ORDER[b.priorite||''] ?? 3));

  const tb = document.getElementById('tbody');
  if (!data.length) {
    tb.innerHTML = `<tr><td colspan="10"><div class="empty"><div class="empty-icon">📋</div>Aucune candidature trouvée.<br><small>Cliquez sur "+ Nouvelle candidature" pour commencer.</small></div></td></tr>`;
    renderStats();
    renderMobileCards([]);
    renderBoard([]);
    renderDashboardPanels();
    switchView(currentView);
    return;
  }

  tb.innerHTML = data.map(j => {
    const rc = ravComplete(j);
    const link = safeUrl(j.link);
    return `<tr>
      <td class="td-role" title="${esc(j.role)}">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;border-bottom:1px dashed var(--border2);" onmouseover="this.style.color='var(--blue)'" onmouseout="this.style.color='inherit'">${esc(j.role)||'—'}</a>` : (esc(j.role)||'—')}</td>
      <td class="td-co" title="${esc(j.co)}">${esc(j.co)||'—'}</td>
      <td style="white-space:nowrap;color:var(--text2)">${fmtDate(j.date)}</td>
      <td><span class="badge ${STATUS_CLASS[j.status]||''}">${esc(j.status)||'—'}</span></td>
      <td>${j.priorite ? `<span class="badge ${PRIO_CLASS[j.priorite]||''}">${esc(j.priorite)}</span>` : '—'}</td>
      <td style="color:var(--text2);white-space:nowrap">${esc(j.salaire)||'—'}</td>
      <td><span class="badge ${rc ? 'b-rav-ok' : 'b-rav-no'}">${rc ? '✓ OK' : '⚠ Incomplet'}</span></td>
      <td>${j.resultat ? `<span style="font-size:12px;color:var(--text2)">${esc(j.resultat)}</span>` : '—'}</td>
      <td class="td-notes" title="${esc(j.notes)}">${esc(j.notes)||'—'}</td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn btn-sm btn-icon" onclick="openModal(${jsArg(j.id)})" title="Modifier">✏</button>
          <button class="btn btn-sm btn-icon btn-danger" onclick="delJob(${jsArg(j.id)})" title="Supprimer">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  renderStats();
  renderMobileCards(data);
  renderBoard(data);
  renderDashboardPanels();
  switchView(currentView);
}

function renderStats() {
  const total = jobs.length;
  const counts = {'A postuler':0,'En cours':0,'Attente de retour':0,'Refusé':0,'Accepté':0};
  jobs.forEach(j => { if (counts[j.status] !== undefined) counts[j.status]++; });
  const thisMonth = localDateKey().slice(0,7);
  const thisMonthJobs = jobs.filter(j => j.status !== 'A postuler' && j.date?.slice(0,7) === thisMonth);
  const followups = jobs.filter(j => j.followup && j.followup <= localDateKey() && !['Refusé','Accepté'].includes(j.status)).length;

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card"><div class="stat-n">${total}</div><div class="stat-l">Candidatures suivies</div></div>
    <div class="stat-card blue"><div class="stat-n">${counts['En cours'] + counts['Attente de retour']}</div><div class="stat-l">Dossiers actifs</div></div>
    <div class="stat-card amber"><div class="stat-n">${followups}</div><div class="stat-l">Relances à traiter</div></div>
    <div class="stat-card green"><div class="stat-n">${thisMonthJobs.length}</div><div class="stat-l">Démarches ce mois</div></div>
  `;
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  return `${y}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function renderDashboardPanels() {
  const today = localDateKey();
  document.getElementById('today-label').textContent = new Intl.DateTimeFormat('fr-CH',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date()).toUpperCase();
  const actions = jobs
    .filter(j => !['Refusé','Accepté'].includes(j.status))
    .filter(j => j.followup || (j.status === 'A postuler' && j.deadline))
    .map(j => ({j,date:j.followup || j.deadline,type:j.followup ? 'Relance / action' : 'Date limite'}))
    .sort((a,b) => a.date.localeCompare(b.date)).slice(0,3);
  const next = document.getElementById('next-actions');
  next.innerHTML = actions.length ? actions.map(({j,date,type}) => `
    <div class="action-row">
      <div class="action-company" aria-hidden="true">${esc((j.co || '?').slice(0,1).toUpperCase())}</div>
      <div class="action-copy"><strong>${esc(j.role)}</strong><small>${esc(j.co)} · ${esc(type)}</small></div>
      <span class="action-date ${date>today?'later':''}">${esc(niceDate(date))}</span>
      <button class="action-edit" onclick="openModal(${jsArg(j.id)})" aria-label="Modifier ${esc(j.role)}">Modifier</button>
    </div>`).join('') : '<div class="quiet">Aucune échéance programmée. Ajoutez une date de relance ou une date limite dans une candidature.</div>';
  const monthKey = today.slice(0,7);
  const monthJobs = jobs.filter(j => j.status !== 'A postuler' && j.date?.slice(0,7) === monthKey);
  const complete = monthJobs.filter(ravComplete).length;
  document.getElementById('overview-month').textContent = new Intl.DateTimeFormat('fr-CH',{month:'long',year:'numeric'}).format(new Date());
  document.getElementById('rav-overview-content').innerHTML = `
    <div class="rav-progress-title"><strong>${complete} / ${monthJobs.length}</strong><div>démarches documentées</div></div>
    <div class="progress-track"><div class="progress-fill" style="width:${monthJobs.length ? Math.round(100*complete/monthJobs.length) : 0}%"></div></div>
    <div class="quiet" style="padding:0">${monthJobs.length-complete} fiche(s) à compléter. Seules les candidatures envoyées sont comptabilisées.</div>
    <button class="rav-link" onclick="switchTab('rav')">Préparer le rapport →</button>`;
}
function renderMobileCards(data) {
  const container = document.getElementById('mobile-cards');
  container.innerHTML = data.length ? data.map(j => `
    <article class="mobile-card">
      <div class="action-company" aria-hidden="true">${esc((j.co||'?').slice(0,1).toUpperCase())}</div>
      <div class="mobile-card-copy"><strong>${esc(j.role)}</strong><span class="co">${esc(j.co)}${j.date?' · '+esc(niceDate(j.date)):''}</span>
        <div class="badges"><span class="badge ${STATUS_CLASS[j.status]||''}">${esc(j.status||'Non défini')}</span>
        ${j.priorite?'<span class="badge '+(PRIO_CLASS[j.priorite]||'')+'">'+esc(j.priorite)+'</span>':''}
        ${j.followup?'<span class="badge b-rav-ok">Action '+esc(niceDate(j.followup))+'</span>':''}</div>
      </div>
      <button class="edit" onclick="openModal(${jsArg(j.id)})" aria-label="Modifier ${esc(j.role)}">✎</button>
    </article>`).join('') : '<div class="empty">Aucune candidature trouvée.</div>';
}
function renderBoard(data) {
  const groups = [
    ['A postuler','À postuler'],['En cours','En cours'],
    ['Attente de retour','En attente'],['Accepté','Accepté'],['Refusé','Refusé']
  ];
  document.getElementById('kanban-view').innerHTML = groups.map(([status,label]) => {
    const col = data.filter(j => j.status === status);
    return `<section class="kanban-column"><div class="kanban-title">${esc(label)} <span class="kanban-count">${col.length}</span></div>
      ${col.length ? col.map(j => `<div class="kanban-card" role="button" tabindex="0" onclick="openModal(${jsArg(j.id)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openModal(${jsArg(j.id)})}">
        <strong>${esc(j.role)}</strong><small>${esc(j.co)}</small>
        ${j.priorite?'<span class="badge '+(PRIO_CLASS[j.priorite]||'')+'">'+esc(j.priorite)+'</span>':''}
      </div>`).join('') : '<div class="quiet">Aucun dossier</div>'}</section>`;
  }).join('');
}

// ===== RAV REPORT =====
function changeMonth(dir) {
  ravMonth += dir;
  if (ravMonth > 11) { ravMonth = 0; ravYear++; }
  if (ravMonth < 0) { ravMonth = 11; ravYear--; }
  renderRAV();
}

function currentMonthJobs() {
  const monthKey = `${ravYear}-${String(ravMonth+1).padStart(2,'0')}`;
  return jobs.filter(j => j.status !== 'A postuler' && j.date && j.date.slice(0,7) === monthKey);
}

function renderRAV() {
  const label = `${MONTHS_FR[ravMonth]} ${ravYear}`;
  document.getElementById('rav-month-label').textContent = label;

  const monthJobs = currentMonthJobs();

  const complete = monthJobs.filter(ravComplete).length;
  document.getElementById('rav-summary').innerHTML = `
    <div class="rav-sum-item"><div class="rav-sum-n">${monthJobs.length}</div>candidature(s) ce mois</div>
    <div class="rav-sum-item"><div class="rav-sum-n">${complete}</div>formulaire(s) RAV complets</div>
    <div class="rav-sum-item"><div class="rav-sum-n">${monthJobs.length - complete}</div>à compléter</div>
  `;

  if (!monthJobs.length) {
    document.getElementById('rav-cards').innerHTML = `<div class="empty"><div class="empty-icon">📅</div>Aucune candidature pour ${esc(label)}.</div>`;
    return;
  }

  document.getElementById('rav-cards').innerHTML = monthJobs.map((j, i) => {
    const rc = ravComplete(j);
    const modes = [];
    if (j.m_email) modes.push('Par voie électronique');
    if (j.m_lettre) modes.push('Par lettre');
    if (j.m_contact) modes.push('Contact personnel');
    if (j.m_tel) modes.push('Par téléphone');

    const v = (val, label) => `<div class="rav-field">
      <div class="rav-field-l">${esc(label)}</div>
      <div class="rav-field-v ${val ? '' : 'rav-missing'}">${esc(val) || '⚠ Non renseigné'}</div>
    </div>`;

    const addr = [j.rue, j.num, j.npa, j.lieu, j.pays].filter(Boolean).join(', ') || '';

    return `<div class="rav-card">
      <div class="rav-card-header">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:12px;color:var(--text2);background:var(--surface2);border-radius:4px;padding:2px 7px">Candidature #${i+1}</span>
            <span class="badge rav-complete-badge ${rc ? 'b-rav-ok' : 'b-rav-no'}">${rc ? '✓ Complet' : '⚠ Incomplet'}</span>
          </div>
          <div class="rav-card-role">${esc(j.role) || '—'}</div>
          <div class="rav-card-co">${esc(j.co) || '—'}</div>
        </div>
        <button class="btn btn-sm" onclick="openModal(${jsArg(j.id)})">✏ Compléter</button>
      </div>
      <div class="rav-fields">
        ${v(fmtDate(j.date), 'Quand avez-vous postulé ?')}
        ${v(modes.length ? modes.join(', ') : '', 'Comment avez-vous postulé ?')}
        ${v(addr, 'Adresse entreprise')}
        ${v(j.contact, 'Personne contactée')}
        ${v(j.email, 'Courriel')}
        ${v(j.tel, 'Téléphone')}
        ${v(j.role, 'Désignation du poste')}
        ${v(j.form_link || j.link, 'Lien annonce / formulaire')}
        ${v(j.orp || 'Non', 'Assignation ORP ?')}
        ${v(j.taux || 'A plein temps', "Taux d'occupation")}
        ${v(j.resultat, "Résultat de l'offre")}
      </div>
      ${j.docs ? `<div style="font-size:12px;color:var(--text2);margin-top:10px;padding-top:8px;border-top:1px solid var(--border)"><strong>Documents :</strong> ${esc(j.docs)}</div>` : ''}
    </div>`;
  }).join('');
}

// ===== CSV EXPORT (rapport RAV du mois affiché) =====
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportRAVCSV() {
  const monthJobs = currentMonthJobs();
  if (!monthJobs.length) { alert('Aucune candidature pour ce mois — rien à exporter.'); return; }

  const headers = ['Date','Poste','Entreprise','Mode(s)','Adresse','Personne contactée','Courriel','Téléphone',
    'Lien annonce/formulaire','Assignation ORP','Taux d\'occupation','Résultat','Documents envoyés'];

  const rows = monthJobs.map(j => {
    const modes = [j.m_email && 'Par voie électronique', j.m_lettre && 'Par lettre', j.m_contact && 'Contact personnel', j.m_tel && 'Par téléphone'].filter(Boolean).join(' / ');
    const addr = [j.rue, j.num, j.npa, j.lieu, j.pays].filter(Boolean).join(', ');
    return [
      fmtDate(j.date), j.role||'', j.co||'', modes, addr, j.contact||'', j.email||'', j.tel||'',
      j.form_link || j.link || '', j.orp || 'Non', j.taux || 'A plein temps', j.resultat||'', j.docs||''
    ];
  });

  const csv = '﻿' + [headers, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rav_${ravYear}-${String(ravMonth+1).padStart(2,'0')}.csv`;
  a.click();
}

// ===== MODAL =====
function openModal(id = null) {
  editId = id;
  document.getElementById('modal-title').textContent = id ? 'Modifier la candidature' : 'Nouvelle candidature';
  const j = id ? (jobs.find(x => x.id === id) || {}) : {};

  document.getElementById('f-role').value = j.role || '';
  document.getElementById('f-co').value = j.co || '';
  document.getElementById('f-date').value = j.date || '';
  document.getElementById('f-status').value = j.status || 'A postuler';
  document.getElementById('f-prior').value = j.priorite || '';
  document.getElementById('f-sal').value = j.salaire || '';
  document.getElementById('f-deadline').value = j.deadline || '';
  document.getElementById('f-followup').value = j.followup || '';
  document.getElementById('f-link').value = j.link || '';
  document.getElementById('f-folder').value = j.folder || '';

  document.getElementById('f-rue').value = j.rue || '';
  document.getElementById('f-num').value = j.num || '';
  document.getElementById('f-npa').value = j.npa || '';
  document.getElementById('f-lieu').value = j.lieu || '';
  document.getElementById('f-pays').value = j.pays || 'Suisse';
  document.getElementById('f-contact').value = j.contact || '';
  document.getElementById('f-email').value = j.email || '';
  document.getElementById('f-tel').value = j.tel || '';

  document.getElementById('f-m-email').checked = !!j.m_email;
  document.getElementById('f-m-lettre').checked = !!j.m_lettre;
  document.getElementById('f-m-contact').checked = !!j.m_contact;
  document.getElementById('f-m-tel').checked = !!j.m_tel;
  document.getElementById('f-form-link').value = j.form_link || '';
  document.querySelector(`input[name=orp][value="${j.orp || 'Non'}"]`).checked = true;
  document.querySelector(`input[name=taux][value="${j.taux || 'A plein temps'}"]`).checked = true;
  document.getElementById('f-resultat').value = j.resultat || '';

  document.getElementById('f-notes').value = j.notes || '';
  document.getElementById('f-docs').value = j.docs || '';

  document.getElementById('extra-details').open = !!id;
  document.getElementById('overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('f-role').focus(), 100);
}

function closeModal() {
  document.getElementById('overlay').style.display = 'none';
  editId = null;
}

function closeIfBg(e) {
  if (e.target.id === 'overlay') closeModal();
}

function save() {
  const role = document.getElementById('f-role').value.trim();
  const co = document.getElementById('f-co').value.trim();
  const date = document.getElementById('f-date').value;
  if (!role) { alert('Le nom du poste est requis.'); return; }
  const status = document.getElementById('f-status').value;
  if (status === 'A postuler' && date && !confirm('Une date d\'envoi est renseignée, mais le statut est « À postuler ». Conserver cette combinaison ? La candidature sera exclue du rapport RAV.')) return;

  const j = {
    id: editId || genId(),
    role, co, date,
    status,
    priorite: document.getElementById('f-prior').value,
    salaire: document.getElementById('f-sal').value.trim(),
    deadline: document.getElementById('f-deadline').value,
    followup: document.getElementById('f-followup').value,
    link: document.getElementById('f-link').value.trim(),
    folder: document.getElementById('f-folder').value.trim(),
    rue: document.getElementById('f-rue').value.trim(),
    num: document.getElementById('f-num').value.trim(),
    npa: document.getElementById('f-npa').value.trim(),
    lieu: document.getElementById('f-lieu').value.trim(),
    pays: document.getElementById('f-pays').value,
    contact: document.getElementById('f-contact').value.trim(),
    email: document.getElementById('f-email').value.trim(),
    tel: document.getElementById('f-tel').value.trim(),
    m_email: document.getElementById('f-m-email').checked,
    m_lettre: document.getElementById('f-m-lettre').checked,
    m_contact: document.getElementById('f-m-contact').checked,
    m_tel: document.getElementById('f-m-tel').checked,
    form_link: document.getElementById('f-form-link').value.trim(),
    orp: document.querySelector('input[name=orp]:checked')?.value || 'Non',
    taux: document.querySelector('input[name=taux]:checked')?.value || 'A plein temps',
    resultat: document.getElementById('f-resultat').value,
    notes: document.getElementById('f-notes').value.trim(),
    docs: document.getElementById('f-docs').value.trim(),
    updatedAt: new Date().toISOString(),
  };

  if (editId) {
    const idx = jobs.findIndex(x => x.id === editId);
    if (idx > -1) jobs[idx] = j;
  } else {
    jobs.unshift(j);
  }

  queueSecureOperation({type:'upsert',id:j.id,job:j});
  persist();
  closeModal();
  render();
  renderRAV();
}

function delJob(id) {
  if (!confirm('Supprimer cette candidature ? Cette action est irréversible.')) return;
  jobs = jobs.filter(j => j.id !== id);
  queueSecureOperation({type:'delete',id,at:new Date().toISOString()});
  persist();
  render();
  renderRAV();
}

// ===== IMPORT / EXPORT (fichier local) =====
function exportJSON() {
  const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup_jobs_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Format invalide');
      if (data.some(j => !j || typeof j !== 'object' || typeof j.role !== 'string')) throw new Error('Certaines candidatures sont invalides.');
      const ids = data.map(j => j.id).filter(Boolean);
      if (new Set(ids).size !== ids.length) throw new Error('Des identifiants de candidature sont en double.');
      if (!confirm(`Importer ${data.length} candidature(s) ? Les données actuelles seront remplacées.`)) return;
      if (secureReady && !confirm('Attention : sur cette version synchronisée, les données importées remplaceront aussi les versions plus anciennes dans le dépôt privé. Avez-vous conservé une sauvegarde ?')) return;
      const importedIds = new Set(data.map(j => j.id));
      jobs.filter(j => !importedIds.has(j.id)).forEach(j => queueSecureOperation({type:'delete',id:j.id,at:new Date().toISOString()}));
      jobs = data.map(j => ({...j,id:j.id || genId(),updatedAt:new Date().toISOString()}));
      jobs.forEach(j => queueSecureOperation({type:'upsert',id:j.id,job:j}));
      persist();
      render();
      renderRAV();
      alert(`✓ ${data.length} candidature(s) importées.`);
    } catch(err) {
      alert('Erreur lors de l\'import : ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ===== MERGE (ajoute / met à jour, sans remplacer) =====
// Clé de déduplication : id stable (préféré), sinon (co + role + date).
// Réutilisée par l'import fichier, le merge fichier, et la sync GitHub.
function mergeData(incoming, preferNewer = false) {
  if (!Array.isArray(incoming)) throw new Error('Format invalide : un tableau JSON est attendu.');

  let added = 0, updated = 0, conflicts = 0;
  const byId = new Map(jobs.map(j => [j.id, j]));
  const sig = j => `${(j.co||'').toLowerCase().trim()}|${(j.role||'').toLowerCase().trim()}|${j.date||''}`;
  const bySig = new Map(jobs.map(j => [sig(j), j]));

  for (const inc of incoming) {
    let target = inc.id ? byId.get(inc.id) : null;
    if (!target) target = bySig.get(sig(inc));

    if (target) {
      if (JSON.stringify(target) === JSON.stringify(inc)) continue;
      // Pendant une récupération GitHub, une version non datée ne doit jamais
      // écraser silencieusement un enregistrement local.
      if (preferNewer && (!inc.updatedAt || (target.updatedAt && inc.updatedAt <= target.updatedAt))) {
        conflicts++;
        continue;
      }
      const keptId = target.id;
      Object.assign(target, inc, { id: keptId });
      updated++;
    } else {
      if (!inc.id) inc.id = genId();
      jobs.unshift(inc);
      byId.set(inc.id, inc);
      bySig.set(sig(inc), inc);
      added++;
    }
  }
  return { added, updated, conflicts };
}

function mergeJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const incoming = JSON.parse(e.target.result);
      const before = JSON.stringify(jobs);
      const { added, updated } = mergeData(incoming);

      if (!confirm(`Fusionner ce fichier ?\n  • ${added} ajout(s)\n  • ${updated} mise(s) à jour\nLes autres candidatures sont préservées.`)) {
        load(); // annule les modifs en mémoire en rechargeant depuis localStorage
        return;
      }

      const oldById = new Map(JSON.parse(before).map(j => [j.id,j]));
      for (const j of jobs) {
        if (JSON.stringify(j) !== JSON.stringify(oldById.get(j.id))) {
          j.updatedAt = new Date().toISOString();
          queueSecureOperation({type:'upsert',id:j.id,job:j});
        }
      }
      persist();
      render();
      renderRAV();
      renderStats();
      alert(`✓ Fusion terminée : ${added} ajoutée(s), ${updated} mise(s) à jour.`);
    } catch(err) {
      alert('Erreur lors de la fusion : ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ===== SYNC GITHUB =====
// Le token est limité à la session du navigateur. Les anciennes configurations
// sont migrées hors du stockage persistant à la première ouverture.
const GH_SESSION_TOKEN = 'jobtracker_gh_session_token';
function ghLoadConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(GH_CONFIG_KEY) || '{}');
    if (cfg.token) {
      sessionStorage.setItem(GH_SESSION_TOKEN, cfg.token);
      delete cfg.token;
      localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg));
    }
    return {...cfg, token:sessionStorage.getItem(GH_SESSION_TOKEN) || ''};
  }
  catch { return {}; }
}
function ghSaveConfig(cfg) {
  const {token,...publicConfig} = cfg;
  localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(publicConfig));
  if(token) sessionStorage.setItem(GH_SESSION_TOKEN,token);
  else sessionStorage.removeItem(GH_SESSION_TOKEN);
}
function ghSyncKey(cfg) {
  return 'jobtracker_last_remote_sha:' + [cfg.owner,cfg.repo,cfg.branch,cfg.path].join('/');
}

function ghConfigOpen() {
  const cfg = ghLoadConfig();
  document.getElementById('gh-owner').value = cfg.owner || '';
  document.getElementById('gh-repo').value = cfg.repo || '';
  document.getElementById('gh-branch').value = cfg.branch || 'main';
  document.getElementById('gh-path').value = cfg.path || 'data/jobs.json';
  document.getElementById('gh-token').value = cfg.token || '';
  document.getElementById('gh-overlay').style.display = 'flex';
}
function ghConfigClose() {
  document.getElementById('gh-overlay').style.display = 'none';
}
function ghConfigCloseIfBg(e) {
  if (e.target.id === 'gh-overlay') ghConfigClose();
}
function ghConfigSave() {
  const cfg = {
    owner: document.getElementById('gh-owner').value.trim(),
    repo: document.getElementById('gh-repo').value.trim(),
    branch: document.getElementById('gh-branch').value.trim() || 'main',
    path: document.getElementById('gh-path').value.trim() || 'data/jobs.json',
    token: document.getElementById('gh-token').value.trim(),
  };
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    alert('Owner, dépôt et token sont requis.');
    return;
  }
  ghSaveConfig(cfg);
  ghConfigClose();
  ghSetStatus('Config enregistrée.', '');
}

function ghSetStatus(msg, cls) {
  const el = document.getElementById('gh-status');
  el.textContent = msg;
  el.className = 'sync-status' + (cls ? ' ' + cls : '');
}

function ghApiUrl(cfg) {
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
}
function b64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

async function ghFetchFile(cfg) {
  const res = await fetch(`${ghApiUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error(`GitHub API ${res.status} : ${(await res.json().catch(()=>({})))?.message || res.statusText}`);
  const data = await res.json();
  const content = JSON.parse(b64DecodeUtf8(data.content.replace(/\n/g, '')));
  return { exists: true, sha: data.sha, content };
}

async function ghPush() {
  const cfg = ghLoadConfig();
  if (!cfg.owner || !cfg.repo || !cfg.token) { ghConfigOpen(); return; }

  ghSetStatus('Envoi en cours…', '');
  try {
    const current = await ghFetchFile(cfg);
    const lastSeen = localStorage.getItem(ghSyncKey(cfg));
    if (current.exists && lastSeen !== current.sha) {
      throw new Error('Le dépôt a changé ou n’a pas encore été récupéré sur cet appareil. Utilisez d’abord « Récupérer », puis vérifiez vos données avant un nouvel envoi.');
    }
    const body = {
      message: `Sync candidatures — ${new Date().toISOString()}`,
      content: b64EncodeUtf8(JSON.stringify(jobs, null, 2)),
      branch: cfg.branch,
    };
    if (current.exists) body.sha = current.sha;

    const res = await fetch(ghApiUrl(cfg), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status} : ${(await res.json().catch(()=>({})))?.message || res.statusText}`);
    const saved = await res.json();
    if (saved.content?.sha) localStorage.setItem(ghSyncKey(cfg),saved.content.sha);
    ghSetStatus(`✓ Envoyé (${jobs.length} candidatures) — ${new Date().toLocaleTimeString('fr-CH')}`, 'ok');
  } catch (err) {
    ghSetStatus('✗ Échec envoi : ' + err.message, 'err');
  }
}

async function ghPull() {
  const cfg = ghLoadConfig();
  if (!cfg.owner || !cfg.repo || !cfg.token) { ghConfigOpen(); return; }

  ghSetStatus('Récupération en cours…', '');
  try {
    const remote = await ghFetchFile(cfg);
    if (!remote.exists) { ghSetStatus('Aucun fichier distant trouvé — faites d\'abord un envoi.', 'err'); return; }

    const { added, updated, conflicts } = mergeData(remote.content, true);
    if (!confirm(`Fusionner les données distantes ?\n  • ${added} ajout(s)\n  • ${updated} mise(s) à jour\n  • ${conflicts} différence(s) conservée(s) localement (version ambiguë ou plus ancienne)\nVérifiez vos candidatures avant un envoi.`)) {
      load();
      ghSetStatus('Récupération annulée.', '');
      return;
    }
    persist();
    localStorage.setItem(ghSyncKey(cfg),remote.sha);
    render(); renderRAV(); renderStats();
    ghSetStatus(`✓ Reçu : ${added} ajoutée(s), ${updated} mise(s) à jour, ${conflicts} différence(s) conservée(s) — ${new Date().toLocaleTimeString('fr-CH')}`, conflicts ? 'err' : 'ok');
  } catch (err) {
    ghSetStatus('✗ Échec récupération : ' + err.message, 'err');
  }
}

// ===== SYNCHRONISATION PRIVÉE AUTOMATIQUE (hébergement Worker uniquement) =====
// La file d'opérations est persistée localement, même sans réseau. Le serveur
// arbitre les modifications concurrentes et conserve les suppressions.
const PRIVATE_QUEUE_KEY = 'jobtracker_secure_operations_v2';
const PRIVATE_INIT_KEY = 'jobtracker_secure_initialized_v2';
let secureReady = false;
let secureAuthenticated = false;
let secureBusy = false;
let secureTimer = null;

function secureOperations() {
  try {
    const operations = JSON.parse(localStorage.getItem(PRIVATE_QUEUE_KEY) || '[]');
    return Array.isArray(operations) ? operations : [];
  } catch { return []; }
}
function queueSecureOperation(op) {
  const queue = secureOperations().filter(existing => existing.id !== op.id);
  queue.push({...op,operationId:genId()});
  localStorage.setItem(PRIVATE_QUEUE_KEY,JSON.stringify(queue));
  if (secureAuthenticated) scheduleSecureSync();
}
function scheduleSecureSync() {
  clearTimeout(secureTimer);
  secureTimer = setTimeout(secureSync,1000);
}
function secureMessage(message,cls='') {
  const el=document.getElementById('secure-status');
  el.textContent=message;
  el.className='sync-status'+(cls?' '+cls:'');
}
function updateSecureControls(login='') {
  document.getElementById('secure-sync-panel').hidden=!secureReady;
  document.getElementById('legacy-sync-panel').hidden=secureReady;
  document.getElementById('secure-login').hidden=secureAuthenticated;
  document.getElementById('secure-account').hidden=!secureAuthenticated;
  document.getElementById('secure-account-name').textContent=login ? '@'+login : 'Compte GitHub';
  document.getElementById('sync-privacy').textContent=secureReady
    ? '🔒 Candidatures conservées sur cet appareil et dans votre dépôt GitHub privé. Synchronisation après connexion.'
    : '🔒 Vos données restent dans ce navigateur, sauf synchronisation volontaire.';
}
async function secureFetch(path,options={}) {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
  let result={};
  try { result=await response.json(); } catch { /* serveur non JSON */ }
  if (!response.ok) {
    const error=new Error(result.error || `Erreur de synchronisation (${response.status}).`);
    error.status=response.status;
    error.ids=result.ids;
    throw error;
  }
  return result;
}
function applySecureSnapshot(snapshot) {
  const live=new Map((snapshot.records || []).map(j => [j.id,j]));
  const deleted=new Map((snapshot.tombstones || []).map(t => [t.id,t.deletedAt]));
  for (const op of secureOperations()) {
    if (op.type==='delete') { live.delete(op.id);continue; }
    if (op.type==='upsert' && op.job) live.set(op.id,op.job);
  }
  jobs=[...live.values()];
  persist();
  render();renderRAV();
}
async function secureSync() {
  if (!secureAuthenticated || secureBusy || !navigator.onLine) return;
  secureBusy=true;
  secureMessage('☁ Synchronisation en cours…');
  try {
    if (!localStorage.getItem(PRIVATE_INIT_KEY)) {
      // Premier passage : les anciennes données locales sont proposées une fois
      // au serveur, sans détruire d'abord la copie locale.
      const pending=new Set(secureOperations().map(op=>op.id));
      for (const j of jobs) if (j.id && !pending.has(j.id)) queueSecureOperation({type:'upsert',id:j.id,job:j});
    }
    let snapshot;
    const sent=secureOperations().slice(0,150);
    if (sent.length) {
      snapshot=await secureFetch('/api/jobs',{
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({operations:sent.map(({operationId,...op})=>op)})
      });
      const acknowledgements=new Set(sent.map(op=>op.operationId));
      localStorage.setItem(PRIVATE_QUEUE_KEY,JSON.stringify(secureOperations().filter(op=>!acknowledgements.has(op.operationId))));
    } else {
      snapshot=await secureFetch('/api/jobs');
    }
    applySecureSnapshot(snapshot);
    if (!secureOperations().length) localStorage.setItem(PRIVATE_INIT_KEY,'1');
    secureMessage(secureOperations().length
      ? `✓ Sauvegarde partielle, ${secureOperations().length} modification(s) en attente.`
      : `✓ Synchronisé à ${new Date().toLocaleTimeString('fr-CH')}`,'ok');
    if (secureOperations().length) scheduleSecureSync();
  } catch(error) {
    if (error.status===401) {
      secureAuthenticated=false;
      updateSecureControls();
      secureMessage('Session expirée. Reconnectez-vous à GitHub.','err');
    } else if (error.status===409) {
      secureMessage(`⚠ Conflit pour ${error.ids?.length || 1} candidature(s). Vos changements restent sur cet appareil. Exportez un JSON avant toute résolution.`, 'err');
    } else {
      secureMessage('⚠ Hors synchronisation : '+error.message+'. Les changements restent sur cet appareil.','err');
    }
  } finally {secureBusy=false;}
}
async function initSecureSync() {
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    const me=await secureFetch('/api/me');
    if (!me.enabled) return;
    secureReady=true;
    // Nettoyer les anciens jetons manuels sur l'hébergement sécurisé.
    try {
      const legacy=JSON.parse(localStorage.getItem(GH_CONFIG_KEY)||'{}');
      if (legacy.token) {delete legacy.token;localStorage.setItem(GH_CONFIG_KEY,JSON.stringify(legacy));}
      sessionStorage.removeItem(GH_SESSION_TOKEN);
    } catch { /* rien à migrer */ }
    secureAuthenticated=Boolean(me.authenticated);
    updateSecureControls(me.login);
    if (secureAuthenticated) secureSync();
    else secureMessage('Connexion GitHub nécessaire pour synchroniser.');
  } catch { /* Fichier local ou hébergement sans backend : mode manuel inchangé. */ }
}
async function secureLogout() {
  if (!confirm('Se déconnecter ? Les candidatures déjà chargées resteront visibles sur cet appareil.')) return;
  try {
    await secureFetch('/api/logout',{method:'POST'});
    secureAuthenticated=false;
    updateSecureControls();
    secureMessage('Déconnecté. Les données locales restent accessibles.');
  } catch(e) {secureMessage('Déconnexion impossible : '+e.message,'err');}
}

// ===== INIT =====
load();
initSecureSync();
window.addEventListener('online',()=>{if(secureAuthenticated) scheduleSecureSync();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden && secureAuthenticated) scheduleSecureSync();});
setInterval(()=>{if(secureAuthenticated) secureSync();},90000);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Mode hors ligne indisponible :',err));
}
