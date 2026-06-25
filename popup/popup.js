const msg = (payload) => chrome.runtime.sendMessage(payload);

let allCreds = [];
let currentUrl = '';
let currentTheme = 'dark';

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

async function init() {
  const settings = await msg({ type: 'GET_SETTINGS' });
  applyTheme(settings.theme || 'dark');

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  allCreds = await msg({ type: 'GET_ALL' });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    currentUrl = tab.url;
    const urlEl = document.getElementById('current-url');
    const row = document.getElementById('current-url-row');
    try {
      const u = new URL(tab.url);
      urlEl.textContent = u.hostname + (u.port ? `:${u.port}` : '');
    } catch { urlEl.textContent = tab.url; }
    row.classList.remove('hidden');
  }

  render(allCreds);
  document.getElementById('search').addEventListener('input', onSearch);
  document.getElementById('add-btn').addEventListener('click', openOptions);
}

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

  // Group: matching current page first
  const matching = currentUrl
    ? creds.filter(c => c.urlRules?.some(r => matchesRule(currentUrl, r)))
    : [];
  const rest = creds.filter(c => !matching.includes(c));

  if (matching.length && rest.length) {
    list.appendChild(groupHeader(`This page (${matching.length})`));
    matching.forEach(c => list.appendChild(credItem(c, true)));
    list.appendChild(groupHeader(`All credentials (${rest.length})`));
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

  div.innerHTML = `
    <div class="cred-info">
      <div class="cred-label">${esc(cred.label || cred.username)}</div>
      <div class="cred-user">${esc(cred.username)}</div>
      ${tags ? `<div class="cred-tags">${tags}</div>` : ''}
    </div>
    <div class="cred-actions">
      ${isMatch ? `<button class="btn btn-fill" data-id="${cred.id}">Fill</button>` : ''}
      <button class="btn btn-edit" data-id="${cred.id}">Edit</button>
    </div>`;

  div.querySelector('.btn-edit')?.addEventListener('click', () => openOptions(cred.id));
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

// Lightweight matcher (mirrors service worker logic)
function matchesRule(url, rule) {
  const { pattern, type } = rule;
  try {
    const u = new URL(url);
    const normalized = url.replace(/#.*$/, '').replace(/\/$/, '');
    switch (type) {
      case 'domain': {
        const cur = u.port ? `${u.hostname}:${u.port}` : u.hostname;
        const pat = (() => {
          try { const pu = new URL(pattern.startsWith('http') ? pattern : `http://${pattern}`);
            return pu.port ? `${pu.hostname}:${pu.port}` : pu.hostname; } catch { return pattern; }
        })();
        return cur.toLowerCase() === pat.toLowerCase();
      }
      case 'exact':   return normalized.toLowerCase() === pattern.toLowerCase().replace(/\/$/, '');
      case 'prefix':  return normalized.toLowerCase().startsWith(pattern.toLowerCase());
      case 'contains':return normalized.toLowerCase().includes(pattern.toLowerCase());
      case 'wildcard':{
        const rx = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'§').replace(/\*/g,'[^/]*').replace(/§/g,'.*') + '$','i');
        return rx.test(normalized);
      }
    }
  } catch {}
  return false;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
