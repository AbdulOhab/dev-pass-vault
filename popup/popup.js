const msg = (payload) => chrome.runtime.sendMessage(payload);

let allCreds = [];
let currentUrl = '';
let currentTheme = 'dark';
let editingCredId = null; // null = add mode, string = edit mode

const PINS_KEY = 'dpv_pins';
let pinnedByUrl = {}; // { hostname: Set<credId> }

async function loadPins() {
  const result = await chrome.storage.local.get(PINS_KEY);
  const raw = result[PINS_KEY] || {};
  pinnedByUrl = {};
  for (const [h, ids] of Object.entries(raw)) {
    pinnedByUrl[h] = new Set(ids);
  }
}

async function savePins() {
  const raw = {};
  for (const [h, set] of Object.entries(pinnedByUrl)) {
    if (set.size > 0) raw[h] = [...set];
  }
  await chrome.storage.local.set({ [PINS_KEY]: raw });
}

function currentHostname() {
  if (!currentUrl) return null;
  try {
    const u = new URL(currentUrl);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch { return null; }
}

function isPinned(credId) {
  const host = currentHostname();
  return host ? (pinnedByUrl[host]?.has(credId) || false) : false;
}

async function togglePin(credId) {
  const host = currentHostname();
  if (!host) return;
  if (!pinnedByUrl[host]) pinnedByUrl[host] = new Set();
  if (pinnedByUrl[host].has(credId)) {
    pinnedByUrl[host].delete(credId);
  } else {
    pinnedByUrl[host].add(credId);
  }
  await savePins();
  const q = document.getElementById('search').value.toLowerCase();
  const filtered = q
    ? allCreds.filter(c =>
        c.label?.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        c.tags?.some(t => t.toLowerCase().includes(q)) ||
        c.urlRules?.some(r => r.pattern?.toLowerCase().includes(q))
      )
    : allCreds;
  render(filtered);
}

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('icon-moon').classList.toggle('hidden', theme === 'dark');
  document.getElementById('icon-sun').classList.toggle('hidden', theme === 'light');
}

async function toggleTheme() {
  const next = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  const settings = await msg({ type: 'GET_SETTINGS' });
  await msg({ type: 'SAVE_SETTINGS', settings: { ...settings, theme: next } });
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  const settings = await msg({ type: 'GET_SETTINGS' });
  applyTheme(settings.theme || 'dark');

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') + '#settings' });
  });

  allCreds = await msg({ type: 'GET_ALL' });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    currentUrl = tab.url;
    const urlEl = document.getElementById('current-url');
    const row   = document.getElementById('current-url-row');
    try {
      const u = new URL(tab.url);
      urlEl.textContent = u.hostname + (u.port ? `:${u.port}` : '');
    } catch { urlEl.textContent = tab.url; }
    row.classList.remove('hidden');
  }

  await loadPins();
  render(allCreds);

  document.getElementById('search').addEventListener('input', onSearch);
  document.getElementById('add-btn').addEventListener('click', openAddForm);

  initAddForm();
}

// ── Add / Edit form ────────────────────────────────────────────────────────
const RULE_TYPES = [
  { value: 'domain',   label: 'Domain' },
  { value: 'exact',    label: 'Exact' },
  { value: 'prefix',   label: 'Prefix' },
  { value: 'contains', label: 'Contains' },
  { value: 'wildcard', label: 'Wildcard' },
];

function initAddForm() {
  document.getElementById('add-form-close').addEventListener('click', closeAddForm);
  document.getElementById('f-cancel').addEventListener('click', closeAddForm);
  document.getElementById('f-save').addEventListener('click', saveForm);
  document.getElementById('f-delete').addEventListener('click', deleteCred);
  document.getElementById('f-add-rule').addEventListener('click', () => addRuleRow());

  document.querySelector('.pw-eye').addEventListener('click', () => {
    const pw = document.getElementById('f-password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });
}

function openAddForm() {
  editingCredId = null;
  document.getElementById('form-title').textContent = 'New Credential';
  document.getElementById('f-delete').classList.add('hidden');
  clearFormFields();

  // pre-fill first URL rule with current tab's domain
  if (currentUrl) {
    try {
      const u = new URL(currentUrl);
      addRuleRow({ type: 'domain', pattern: u.hostname + (u.port ? `:${u.port}` : '') });
    } catch (_) { addRuleRow(); }
  } else {
    addRuleRow();
  }

  showForm();
}

function openEditForm(credId) {
  const cred = allCreds.find(c => c.id === credId);
  if (!cred) return;

  editingCredId = credId;
  document.getElementById('form-title').textContent = 'Edit Credential';
  document.getElementById('f-delete').classList.remove('hidden');
  clearFormFields();

  document.getElementById('f-label').value    = cred.label || '';
  document.getElementById('f-username').value = cred.username || '';
  document.getElementById('f-password').value = cred.password || '';
  document.getElementById('f-tags').value     = (cred.tags || []).join(', ');
  document.getElementById('f-notes').value    = cred.notes || '';

  if (cred.urlRules?.length) {
    cred.urlRules.forEach(r => addRuleRow(r));
  } else {
    addRuleRow();
  }

  showForm();
}

function showForm() {
  document.getElementById('add-form').classList.remove('hidden');
  document.getElementById('add-btn').classList.add('hidden');
  document.getElementById('f-username').focus();
}

function closeAddForm() {
  document.getElementById('add-form').classList.add('hidden');
  document.getElementById('add-btn').classList.remove('hidden');
  clearFormFields();
  editingCredId = null;
}

function clearFormFields() {
  ['f-label','f-username','f-password','f-tags','f-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('f-rules-list').innerHTML = '';
  const err = document.getElementById('f-error');
  err.classList.add('hidden');
  err.textContent = '';
  const pw = document.getElementById('f-password');
  if (pw) pw.type = 'password';
}

function addRuleRow(rule = { type: 'domain', pattern: '' }) {
  const list = document.getElementById('f-rules-list');
  const row  = document.createElement('div');
  row.className = 'url-rule-row';

  const typeOptions = RULE_TYPES.map(t =>
    `<option value="${t.value}"${t.value === rule.type ? ' selected' : ''}>${t.label}</option>`
  ).join('');

  row.innerHTML = `
    <select class="field-select rule-type">${typeOptions}</select>
    <input class="field-input rule-pattern" type="text" value="${esc(rule.pattern)}" placeholder="e.g. localhost:3000" />
    <button class="icon-btn-sm rule-remove" title="Remove">✕</button>`;

  row.querySelector('.rule-remove').addEventListener('click', () => {
    row.remove();
    if (!document.getElementById('f-rules-list').children.length) addRuleRow();
  });

  list.appendChild(row);
}

function collectRules() {
  return Array.from(document.querySelectorAll('#f-rules-list .url-rule-row'))
    .map(row => ({
      type:    row.querySelector('.rule-type').value,
      pattern: row.querySelector('.rule-pattern').value.trim(),
    }))
    .filter(r => r.pattern);
}

async function saveForm() {
  const username = document.getElementById('f-username').value.trim();
  const password = document.getElementById('f-password').value.trim();
  const errEl    = document.getElementById('f-error');

  if (!username || !password) {
    errEl.textContent = 'Username and password are required.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  const label  = document.getElementById('f-label').value.trim() || username;
  const tags   = document.getElementById('f-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const notes  = document.getElementById('f-notes').value.trim();
  const urlRules = collectRules();

  const id = editingCredId || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

  allCreds = await msg({ type: 'SAVE', credential: {
    id, label, username, password, notes, tags, urlRules, autoSubmit: false,
  }});

  closeAddForm();
  render(allCreds);
}

async function deleteCred() {
  if (!editingCredId) return;
  const cred = allCreds.find(c => c.id === editingCredId);
  if (!confirm(`Delete "${cred?.label || cred?.username}"?`)) return;
  allCreds = await msg({ type: 'DELETE', id: editingCredId });
  closeAddForm();
  render(allCreds);
}

// ── Search & list ──────────────────────────────────────────────────────────
function onSearch(e) {
  const q = e.target.value.toLowerCase();
  const filtered = q
    ? allCreds.filter(c =>
        c.label?.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        c.tags?.some(t => t.toLowerCase().includes(q)) ||
        c.urlRules?.some(r => r.pattern?.toLowerCase().includes(q))
      )
    : allCreds;
  render(filtered);
}

function render(creds) {
  const list = document.getElementById('list');
  list.innerHTML = '';

  if (!creds.length) {
    list.innerHTML = '<div class="empty">No credentials found.</div>';
    return;
  }

  const host = currentHostname();
  const pinnedSet = host ? (pinnedByUrl[host] || new Set()) : new Set();

  const pinned   = creds.filter(c => pinnedSet.has(c.id));
  const pinnedIds = new Set(pinned.map(c => c.id));

  const matching = currentUrl
    ? creds.filter(c => !pinnedIds.has(c.id) && c.urlRules?.some(r => matchesRule(currentUrl, r)))
    : [];
  const matchingIds = new Set(matching.map(c => c.id));

  const rest = creds.filter(c => !pinnedIds.has(c.id) && !matchingIds.has(c.id));

  if (pinned.length) {
    list.appendChild(groupHeader('⊛ Pinned'));
    pinned.forEach(c => list.appendChild(credItem(c, currentUrl ? (c.urlRules?.some(r => matchesRule(currentUrl, r)) || false) : false)));
    const others = [...matching, ...rest];
    if (others.length) {
      list.appendChild(groupHeader('Others'));
      others.forEach(c => list.appendChild(credItem(c, matchingIds.has(c.id))));
    }
  } else if (matching.length && rest.length) {
    list.appendChild(groupHeader(`This page (${matching.length})`));
    matching.forEach(c => list.appendChild(credItem(c, true)));
    list.appendChild(groupHeader(`All (${rest.length})`));
    rest.forEach(c => list.appendChild(credItem(c, false)));
  } else {
    [...matching, ...rest].forEach(c => list.appendChild(credItem(c, matchingIds.has(c.id))));
  }
}

function credItem(cred, isMatch) {
  const div = document.createElement('div');
  const pinned = isPinned(cred.id);
  div.className = `cred-item${isMatch ? ' cred-match' : ''}${pinned ? ' cred-pinned' : ''}`;

  const tags = cred.tags?.length
    ? cred.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')
    : '';

  const noteIcon = cred.notes
    ? `<span class="note-dot" title="${esc(cred.notes)}">📝</span>`
    : '';

  const hasHost = !!currentHostname();
  const pinBtn = hasHost
    ? `<button class="btn-pin${pinned ? ' active' : ''}" title="${pinned ? 'Unpin' : 'Pin to top for this site'}"><svg viewBox="0 0 24 24" width="12" height="12" fill="${pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>`
    : '';

  div.innerHTML = `
    <div class="cred-info">
      <div class="cred-label">${esc(cred.label || cred.username)} ${noteIcon}</div>
      <div class="cred-user">${esc(cred.username)}</div>
      ${tags ? `<div class="cred-tags">${tags}</div>` : ''}
    </div>
    <div class="cred-actions">
      ${pinBtn}
      ${isMatch ? `<button class="btn btn-fill">Fill</button>` : ''}
      <button class="btn btn-edit">Edit</button>
    </div>`;

  div.querySelector('.btn-edit').addEventListener('click', () => openEditForm(cred.id));
  div.querySelector('.btn-fill')?.addEventListener('click', () => fillInTab(cred));
  div.querySelector('.btn-pin')?.addEventListener('click', () => togglePin(cred.id));

  return div;
}

function groupHeader(text) {
  const h = document.createElement('div');
  h.className = 'group-header';
  h.textContent = text;
  return h;
}

async function fillInTab(cred) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'FILL', credential: cred, autoSubmit: false });
    window.close();
  }
}

function openOptions(credId) {
  const url = chrome.runtime.getURL('options/options.html') + (credId ? `?edit=${credId}` : '');
  chrome.tabs.create({ url });
}

// ── URL matcher ────────────────────────────────────────────────────────────
function matchesRule(url, rule) {
  const { pattern, type } = rule;
  try {
    const u = new URL(url);
    const normalized = url.replace(/#.*$/, '').replace(/\/$/, '');
    switch (type) {
      case 'domain': {
        const cur = u.port ? `${u.hostname}:${u.port}` : u.hostname;
        const pat = (() => {
          try {
            const pu = new URL(pattern.startsWith('http') ? pattern : `http://${pattern}`);
            return pu.port ? `${pu.hostname}:${pu.port}` : pu.hostname;
          } catch { return pattern; }
        })();
        return cur.toLowerCase() === pat.toLowerCase();
      }
      case 'exact':    return normalized.toLowerCase() === pattern.toLowerCase().replace(/\/$/, '');
      case 'prefix':   return normalized.toLowerCase().startsWith(pattern.toLowerCase());
      case 'contains': return normalized.toLowerCase().includes(pattern.toLowerCase());
      case 'wildcard': {
        const rx = new RegExp('^' + pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$', 'i');
        return rx.test(normalized);
      }
    }
  } catch {}
  return false;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init();
