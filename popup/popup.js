const msg = (payload) => chrome.runtime.sendMessage(payload);

let allCreds = [];
let currentUrl = '';
let currentTheme = 'dark';

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

  render(allCreds);

  document.getElementById('search').addEventListener('input', onSearch);
  document.getElementById('add-btn').addEventListener('click', openAddForm);

  initAddForm();
}

// ── Add form ───────────────────────────────────────────────────────────────
function initAddForm() {
  document.getElementById('add-form-close').addEventListener('click', closeAddForm);
  document.getElementById('f-cancel').addEventListener('click', closeAddForm);
  document.getElementById('f-save').addEventListener('click', saveNewCred);

  // password eye toggle
  document.querySelector('.pw-eye').addEventListener('click', () => {
    const pw = document.getElementById('f-password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });
}

function openAddForm() {
  const form = document.getElementById('add-form');
  form.classList.remove('hidden');

  // pre-fill URL rule with current tab's domain
  if (currentUrl) {
    try {
      const u = new URL(currentUrl);
      document.getElementById('f-rule-pattern').value =
        u.hostname + (u.port ? `:${u.port}` : '');
    } catch (_) {}
  }

  document.getElementById('f-username').focus();
  document.getElementById('add-btn').classList.add('hidden');
}

function closeAddForm() {
  document.getElementById('add-form').classList.add('hidden');
  document.getElementById('add-btn').classList.remove('hidden');
  clearAddForm();
}

function clearAddForm() {
  ['f-label','f-username','f-password','f-tags','f-notes','f-rule-pattern'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('f-rule-type').value = 'domain';
  const err = document.getElementById('f-error');
  err.classList.add('hidden');
  err.textContent = '';
  const pw = document.getElementById('f-password');
  if (pw) pw.type = 'password';
}

async function saveNewCred() {
  const username = document.getElementById('f-username').value.trim();
  const password = document.getElementById('f-password').value.trim();
  const errEl    = document.getElementById('f-error');

  if (!username || !password) {
    errEl.textContent = 'Username and password are required.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  const label   = document.getElementById('f-label').value.trim() || username;
  const tags    = document.getElementById('f-tags').value
                    .split(',').map(t => t.trim()).filter(Boolean);
  const notes   = document.getElementById('f-notes').value.trim();
  const rType   = document.getElementById('f-rule-type').value;
  const pattern = document.getElementById('f-rule-pattern').value.trim();

  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

  const cred = {
    id, label, username, password, notes, tags,
    urlRules: pattern ? [{ type: rType, pattern }] : [],
    autoSubmit: false,
  };

  allCreds = await msg({ type: 'SAVE', credential: cred });
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

  const matching = currentUrl
    ? creds.filter(c => c.urlRules?.some(r => matchesRule(currentUrl, r)))
    : [];
  const rest = creds.filter(c => !matching.includes(c));

  if (matching.length && rest.length) {
    list.appendChild(groupHeader(`This page (${matching.length})`));
    matching.forEach(c => list.appendChild(credItem(c, true)));
    list.appendChild(groupHeader(`All (${rest.length})`));
    rest.forEach(c => list.appendChild(credItem(c, false)));
  } else {
    creds.forEach(c => list.appendChild(credItem(c, matching.includes(c))));
  }
}

function credItem(cred, isMatch) {
  const div = document.createElement('div');
  div.className = `cred-item${isMatch ? ' cred-match' : ''}`;

  const tags = cred.tags?.length
    ? cred.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')
    : '';

  const noteIcon = cred.notes
    ? `<span class="note-dot" title="${esc(cred.notes)}">📝</span>`
    : '';

  div.innerHTML = `
    <div class="cred-info">
      <div class="cred-label">${esc(cred.label || cred.username)} ${noteIcon}</div>
      <div class="cred-user">${esc(cred.username)}</div>
      ${tags ? `<div class="cred-tags">${tags}</div>` : ''}
    </div>
    <div class="cred-actions">
      ${isMatch ? `<button class="btn btn-fill">Fill</button>` : ''}
      <button class="btn btn-edit">Edit</button>
    </div>`;

  div.querySelector('.btn-edit').addEventListener('click', () => openOptions(cred.id));
  div.querySelector('.btn-fill')?.addEventListener('click', () => fillInTab(cred));

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
