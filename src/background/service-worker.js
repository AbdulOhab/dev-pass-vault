// ── Settings ───────────────────────────────────────────────────────────────
const SETTINGS_KEY = 'dpv_settings';
const DEFAULT_SETTINGS = {
  savePromptPosition: 'top-right',
  fabPosition: 'right-center',
  theme: 'dark',
  autoDetectLogin: true,
};

async function getSettings() {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(r[SETTINGS_KEY] || {}) };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

// ── Storage utils ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'dpv_credentials';

async function getAllCredentials() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function saveCredential(cred) {
  const all = await getAllCredentials();
  const idx = all.findIndex(c => c.id === cred.id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...cred, updatedAt: Date.now() };
  } else {
    all.push({ ...cred, createdAt: Date.now(), updatedAt: Date.now() });
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
  return all;
}

async function deleteCredential(id) {
  const all = await getAllCredentials();
  const filtered = all.filter(c => c.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  return filtered;
}

async function exportData() {
  const all = await getAllCredentials();
  return JSON.stringify({ version: 1, credentials: all, exportedAt: Date.now() }, null, 2);
}

async function importData(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data.credentials || !Array.isArray(data.credentials)) throw new Error('Invalid format');
  const existing = await getAllCredentials();
  const existingIds = new Set(existing.map(c => c.id));
  const toAdd = data.credentials.filter(c => !existingIds.has(c.id));
  const merged = [...existing, ...toAdd];
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  return { added: toAdd.length, total: merged.length };
}

// ── URL matcher ────────────────────────────────────────────────────────────
function normalizeUrl(url) {
  try { return new URL(url).href.replace(/#.*$/, '').replace(/\/$/, ''); }
  catch { return url.replace(/#.*$/, '').replace(/\/$/, ''); }
}

function getDomainKey(url) {
  try { const u = new URL(url); return u.port ? `${u.hostname}:${u.port}` : u.hostname; }
  catch { return url; }
}

function wildcardToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§')
    .replace(/\*/g, '[^/]*')
    .replace(/§/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesRule(currentUrl, rule) {
  const { pattern, type } = rule;
  const normalized = normalizeUrl(currentUrl);
  switch (type) {
    case 'domain': {
      const cur = getDomainKey(currentUrl);
      const pat = getDomainKey(pattern.startsWith('http') ? pattern : `http://${pattern}`);
      return cur.toLowerCase() === pat.toLowerCase();
    }
    case 'exact':    return normalizeUrl(pattern).toLowerCase() === normalized.toLowerCase();
    case 'prefix':   return normalized.toLowerCase().startsWith(pattern.toLowerCase());
    case 'contains': return normalized.toLowerCase().includes(pattern.toLowerCase());
    case 'wildcard': return wildcardToRegex(pattern).test(normalized);
    default:         return false;
  }
}

function getMatchingCredentials(credentials, currentUrl) {
  return credentials.filter(c =>
    c.urlRules && c.urlRules.some(rule => matchesRule(currentUrl, rule))
  );
}

// ── Context menu ──────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'dpv-save',
    title: 'Save to Dev Pass Vault',
    contexts: ['page', 'frame'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'dpv-save' && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SAVE_DIALOG', url: info.pageUrl });
  }
});

// ── Message router ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

async function handle(msg) {
  switch (msg.type) {
    case '__OPEN_OPTIONS__':
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
      return;
    case 'GET_SETTINGS':  return getSettings();
    case 'SAVE_SETTINGS': return saveSettings(msg.settings);
    case 'GET_MATCHING': {
      const all = await getAllCredentials();
      return getMatchingCredentials(all, msg.url);
    }
    case 'GET_ALL':
      return getAllCredentials();
    case 'SAVE':
      return saveCredential(msg.credential);
    case 'DELETE':
      return deleteCredential(msg.id);
    case 'EXPORT':
      return exportData();
    case 'IMPORT':
      return importData(msg.json);
    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}
