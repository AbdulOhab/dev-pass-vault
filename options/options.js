// Inlined: no ES module imports needed for extension page compatibility
function generateId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

const MATCH_TYPES = [
  { value: 'domain',   label: 'Domain',    hint: 'e.g. localhost:3000 or example.com' },
  { value: 'exact',    label: 'Exact URL', hint: 'e.g. http://localhost:3000/login' },
  { value: 'prefix',   label: 'URL Prefix',hint: 'e.g. https://staging.example.com' },
  { value: 'contains', label: 'Contains',  hint: 'e.g. internal.company' },
  { value: 'wildcard', label: 'Wildcard',  hint: 'e.g. *.example.com/admin/**' },
];

const msg = (payload) => chrome.runtime.sendMessage(payload);

// ── State ──────────────────────────────────────────────────────────────────
let allCreds = [];
let activeCred = null;
let searchQuery = '';
let currentSettings = { savePromptPosition: 'top-right', theme: 'dark', autoDetectLogin: true };

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function init() {
  // Load settings first so theme applies immediately
  currentSettings = await msg({ type: 'GET_SETTINGS' });
  applyTheme(currentSettings.theme);
  initSettingsUI(currentSettings);

  allCreds = await msg({ type: 'GET_ALL' });
  renderList();
  updateStats();

  // Check if opened with ?edit=<id>
  const params = new URLSearchParams(location.search);
  const editId = params.get('edit');
  if (editId) {
    const cred = allCreds.find(c => c.id === editId);
    if (cred) openEditor(cred);
    else openEditor(null);
  }

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
      document.getElementById(`tab-${tab}`).classList.remove('hidden');
    });
  });

  document.getElementById('search').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderList();
  });

  document.getElementById('new-btn').addEventListener('click', () => openEditor(null));
  document.getElementById('export-btn').addEventListener('click', doExport);
  document.getElementById('import-input').addEventListener('change', doImport);
}

// ── Settings UI ────────────────────────────────────────────────────────────
function initSettingsUI(s) {
  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    if (btn.dataset.theme === s.theme) btn.classList.add('active');
    else btn.classList.remove('active');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(btn.dataset.theme);
    });
  });

  // Save prompt position buttons
  document.querySelectorAll('.pos-btn').forEach(btn => {
    if (btn.dataset.pos === s.savePromptPosition) btn.classList.add('active');
    else btn.classList.remove('active');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // FAB position buttons
  document.querySelectorAll('.fab-pos-btn').forEach(btn => {
    if (btn.dataset.fab === (s.fabPosition || 'right-center')) btn.classList.add('active');
    else btn.classList.remove('active');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fab-pos-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Auto-detect toggle
  const autoCheck = document.getElementById('s-autodetect');
  const autoLabel = document.getElementById('s-autodetect-label');
  autoCheck.checked = s.autoDetectLogin;
  autoLabel.textContent = s.autoDetectLogin ? 'Enabled' : 'Disabled';
  autoCheck.addEventListener('change', () => {
    autoLabel.textContent = autoCheck.checked ? 'Enabled' : 'Disabled';
  });

  // Save settings button
  document.getElementById('save-settings-btn').addEventListener('click', async () => {
    const theme       = document.querySelector('.theme-btn.active')?.dataset.theme || 'dark';
    const position    = document.querySelector('.pos-btn.active')?.dataset.pos || 'top-right';
    const fabPosition = document.querySelector('.fab-pos-btn.active')?.dataset.fab || 'right-center';
    const auto        = document.getElementById('s-autodetect').checked;

    currentSettings = { theme, savePromptPosition: position, fabPosition, autoDetectLogin: auto };
    await msg({ type: 'SAVE_SETTINGS', settings: currentSettings });
    applyTheme(theme);

    const saved = document.getElementById('settings-saved');
    saved.classList.remove('hidden');
    setTimeout(() => saved.classList.add('hidden'), 2000);
  });
}

// ── List ───────────────────────────────────────────────────────────────────
function renderList() {
  const container = document.getElementById('cred-list');
  container.innerHTML = '';

  const filtered = searchQuery
    ? allCreds.filter(c =>
        c.label?.toLowerCase().includes(searchQuery) ||
        c.username?.toLowerCase().includes(searchQuery) ||
        c.tags?.some(t => t.toLowerCase().includes(searchQuery)) ||
        c.urlRules?.some(r => r.pattern?.toLowerCase().includes(searchQuery))
      )
    : allCreds;

  if (!filtered.length) {
    container.innerHTML = `<div class="list-empty">${searchQuery ? 'No matches' : 'No credentials yet'}</div>`;
    return;
  }

  filtered.forEach(cred => {
    const el = document.createElement('div');
    el.className = 'list-item' + (activeCred?.id === cred.id ? ' active' : '');
    el.innerHTML = `
      <div class="list-item-label">${esc(cred.label || cred.username)}</div>
      <div class="list-item-user">${esc(cred.username)}</div>
      ${cred.urlRules?.length ? `<div class="list-item-urls">${cred.urlRules.slice(0,2).map(r => `<span>${esc(r.pattern)}</span>`).join('')}${cred.urlRules.length > 2 ? `<span>+${cred.urlRules.length - 2}</span>` : ''}</div>` : ''}`;
    el.addEventListener('click', () => openEditor(cred));
    container.appendChild(el);
  });
}

function updateStats() {
  document.getElementById('stats').textContent =
    `${allCreds.length} credential${allCreds.length !== 1 ? 's' : ''}`;
}

// ── Editor ─────────────────────────────────────────────────────────────────
function openEditor(cred) {
  activeCred = cred ? { ...cred } : null;
  renderList(); // re-highlight active item

  const tpl = document.getElementById('editor-tpl');
  const editor = document.getElementById('editor');
  editor.innerHTML = '';
  const clone = tpl.content.cloneNode(true);
  editor.appendChild(clone);

  // Wire up fields
  const title  = editor.querySelector('#editor-title');
  const label  = editor.querySelector('#f-label');
  const user   = editor.querySelector('#f-username');
  const pass   = editor.querySelector('#f-password');
  const notes  = editor.querySelector('#f-notes');
  const tags   = editor.querySelector('#f-tags');
  const auto   = editor.querySelector('#f-autosubmit');
  const delBtn = editor.querySelector('#delete-btn');
  const saveBtn = editor.querySelector('#save-btn');
  const addRule = editor.querySelector('#add-rule-btn');
  const rulesEl = editor.querySelector('#url-rules');

  if (cred) {
    title.textContent = cred.label || cred.username;
    label.value  = cred.label  || '';
    user.value   = cred.username || '';
    pass.value   = cred.password || '';
    notes.value  = cred.notes  || '';
    tags.value   = (cred.tags || []).join(', ');
    auto.checked = !!cred.autoSubmit;
    delBtn.classList.remove('hidden');
    (cred.urlRules || []).forEach(rule => addRuleRow(rulesEl, rule));
  } else {
    title.textContent = 'New Credential';
    addRuleRow(rulesEl, { type: 'domain', pattern: '' });
  }

  // Password toggle
  editor.querySelector('.pw-toggle').addEventListener('click', () => {
    pass.type = pass.type === 'password' ? 'text' : 'password';
  });

  addRule.addEventListener('click', () => addRuleRow(rulesEl, { type: 'domain', pattern: '' }));

  saveBtn.addEventListener('click', async () => {
    const username = user.value.trim();
    const password = pass.value.trim();
    if (!username || !password) {
      alert('Username and password are required.');
      return;
    }

    const urlRules = collectRules(rulesEl);
    const tagsArr = tags.value.split(',').map(t => t.trim()).filter(Boolean);

    const updated = {
      id: cred?.id || generateId(),
      label: label.value.trim() || username,
      username,
      password,
      notes: notes.value.trim(),
      tags: tagsArr,
      urlRules,
      autoSubmit: auto.checked,
    };

    allCreds = await msg({ type: 'SAVE', credential: updated });
    activeCred = updated;
    renderList();
    updateStats();
    title.textContent = updated.label;
  });

  delBtn.addEventListener('click', async () => {
    if (!confirm(`Delete "${cred.label || cred.username}"?`)) return;
    allCreds = await msg({ type: 'DELETE', id: cred.id });
    activeCred = null;
    renderList();
    updateStats();
    editor.innerHTML = '<div class="editor-empty"><p>Deleted.</p></div>';
  });
}

// ── URL Rule rows ─────────────────────────────────────────────────────────
function addRuleRow(container, rule) {
  const row = document.createElement('div');
  row.className = 'rule-row';

  const typeSelect = document.createElement('select');
  typeSelect.className = 'rule-type';
  MATCH_TYPES.forEach(mt => {
    const opt = document.createElement('option');
    opt.value = mt.value;
    opt.textContent = mt.label;
    if (mt.value === rule.type) opt.selected = true;
    typeSelect.appendChild(opt);
  });

  const patInput = document.createElement('input');
  patInput.className = 'rule-pattern';
  patInput.type = 'text';
  patInput.value = rule.pattern || '';
  patInput.placeholder = getHint(rule.type);

  typeSelect.addEventListener('change', () => {
    patInput.placeholder = getHint(typeSelect.value);
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-sm btn-danger-ghost';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(typeSelect);
  row.appendChild(patInput);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function collectRules(container) {
  return Array.from(container.querySelectorAll('.rule-row'))
    .map(row => ({
      type: row.querySelector('.rule-type').value,
      pattern: row.querySelector('.rule-pattern').value.trim(),
    }))
    .filter(r => r.pattern);
}

function getHint(type) {
  return MATCH_TYPES.find(m => m.value === type)?.hint || '';
}

// ── Export / Import ───────────────────────────────────────────────────────
async function doExport() {
  const json = await msg({ type: 'EXPORT' });
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dev-pass-vault-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function doImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const result = await msg({ type: 'IMPORT', json: text });
    alert(`Imported ${result.added} new credentials. Total: ${result.total}`);
    allCreds = await msg({ type: 'GET_ALL' });
    renderList();
    updateStats();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
  e.target.value = '';
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
