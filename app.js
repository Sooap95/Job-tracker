const STORAGE_KEY = 'jobtracker_v3';
const GH_CONFIG_KEY = 'jobtracker_gh_config';
let jobs = [];
let editId = null;
let ravYear = new Date().getFullYear();
let ravMonth = new Date().getMonth(); // 0-indexed

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
  } catch(e) { jobs = []; }
  render(); renderRAV(); renderStats();
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function fmtDate(d) {
  if (!d) return '—';
  const p = d.split('-');
  return p[2] + '.' + p[1] + '.' + p[0].slice(2);
}

function ravComplete(j) {
  return !!(j.date && j.co && j.role && (j.m_email || j.m_lettre || j.m_contact || j.m_tel));
}

// ===== SWITCH TABS =====
function switchTab(tab) {
  ['dashboard','rav','dossier'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-tab').forEach((el, i) => {
    const tabs = ['dashboard','rav','dossier'];
    el.classList.toggle('active', tabs[i] === tab);
  });
  if (tab === 'rav') renderRAV();
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
  else if (so === 'priorite') data.sort((a,b) => (PRIO_ORDER[a.priorite||'']||3) - (PRIO_ORDER[b.priorite||'']||3));

  const tb = document.getElementById('tbody');
  if (!data.length) {
    tb.innerHTML = `<tr><td colspan="10"><div class="empty"><div class="empty-icon">📋</div>Aucune candidature trouvée.<br><small>Cliquez sur "+ Nouvelle candidature" pour commencer.</small></div></td></tr>`;
    renderStats();
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
          <button class="btn btn-sm btn-icon" onclick="openModal('${j.id}')" title="Modifier">✏</button>
          <button class="btn btn-sm btn-icon btn-danger" onclick="delJob('${j.id}')" title="Supprimer">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  renderStats();
}

function renderStats() {
  const total = jobs.length;
  const counts = {'A postuler':0,'En cours':0,'Attente de retour':0,'Refusé':0,'Accepté':0};
  jobs.forEach(j => { if (counts[j.status] !== undefined) counts[j.status]++; });
  const ravOK = jobs.filter(ravComplete).length;
  const thisMonth = new Date().toISOString().slice(0,7);
  const thisMonthN = jobs.filter(j => j.date && j.date.slice(0,7) === thisMonth).length;

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card"><div class="stat-n">${total}</div><div class="stat-l">Total</div></div>
    <div class="stat-card blue"><div class="stat-n">${counts['A postuler']}</div><div class="stat-l">A postuler</div></div>
    <div class="stat-card amber"><div class="stat-n">${counts['En cours'] + counts['Attente de retour']}</div><div class="stat-l">En cours</div></div>
    <div class="stat-card green"><div class="stat-n">${counts['Accepté']}</div><div class="stat-l">Accepté</div></div>
    <div class="stat-card purple"><div class="stat-n">${thisMonthN}</div><div class="stat-l">Ce mois-ci</div></div>
    <div class="stat-card"><div class="stat-n">${ravOK}/${total}</div><div class="stat-l">RAV complets</div></div>
  `;
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
  return jobs.filter(j => j.date && j.date.slice(0,7) === monthKey);
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
        <button class="btn btn-sm" onclick="openModal('${j.id}')">✏ Compléter</button>
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
  document.getElementById('f-date').value = j.date || new Date().toISOString().slice(0,10);
  document.getElementById('f-status').value = j.status || 'A postuler';
  document.getElementById('f-prior').value = j.priorite || '';
  document.getElementById('f-sal').value = j.salaire || '';
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

  const j = {
    id: editId || genId(),
    role, co, date,
    status: document.getElementById('f-status').value,
    priorite: document.getElementById('f-prior').value,
    salaire: document.getElementById('f-sal').value.trim(),
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
  };

  if (editId) {
    const idx = jobs.findIndex(x => x.id === editId);
    if (idx > -1) jobs[idx] = j;
  } else {
    jobs.unshift(j);
  }

  persist();
  closeModal();
  render();
  renderRAV();
}

function delJob(id) {
  if (!confirm('Supprimer cette candidature ? Cette action est irréversible.')) return;
  jobs = jobs.filter(j => j.id !== id);
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
      if (!confirm(`Importer ${data.length} candidature(s) ? Les données actuelles seront remplacées.`)) return;
      jobs = data;
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
function mergeData(incoming) {
  if (!Array.isArray(incoming)) throw new Error('Format invalide : un tableau JSON est attendu.');

  let added = 0, updated = 0;
  const byId = new Map(jobs.map(j => [j.id, j]));
  const sig = j => `${(j.co||'').toLowerCase().trim()}|${(j.role||'').toLowerCase().trim()}|${j.date||''}`;
  const bySig = new Map(jobs.map(j => [sig(j), j]));

  for (const inc of incoming) {
    let target = inc.id ? byId.get(inc.id) : null;
    if (!target) target = bySig.get(sig(inc));

    if (target) {
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
  return { added, updated };
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
// Stocke la config (dont le token) dans une clé localStorage séparée,
// jamais incluse dans l'export JSON des candidatures.
function ghLoadConfig() {
  try { return JSON.parse(localStorage.getItem(GH_CONFIG_KEY) || '{}'); }
  catch { return {}; }
}
function ghSaveConfig(cfg) {
  localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg));
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

    const { added, updated } = mergeData(remote.content);
    if (!confirm(`Fusionner les données distantes ?\n  • ${added} ajout(s)\n  • ${updated} mise(s) à jour\nVos candidatures locales sont préservées.`)) {
      load();
      ghSetStatus('Récupération annulée.', '');
      return;
    }
    persist();
    render(); renderRAV(); renderStats();
    ghSetStatus(`✓ Reçu : ${added} ajoutée(s), ${updated} mise(s) à jour — ${new Date().toLocaleTimeString('fr-CH')}`, 'ok');
  } catch (err) {
    ghSetStatus('✗ Échec récupération : ' + err.message, 'err');
  }
}

// ===== INIT =====
load();
